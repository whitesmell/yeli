import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  exportMarkdownDocument,
  exportStaticDocument,
  getDocument,
  patchMetadata,
  validateDocument,
} from "../../src/agent/operations";
import { parseYeliArtifact } from "../../src/format/parse";
import { createDocumentPayload } from "../../src/document/model";
import { patchFrontmatter } from "../../src/document/frontmatter";
import { createMarkdownExport } from "../../src/export/markdown";
import { createStaticHtmlExport } from "../../src/format/static-preview";
import {
  YELI_AGENT_PREAMBLE,
  serializePayloadBlock,
} from "../../src/format/serialize";
import {
  createRealEvaluationAttempts,
  prepareRealAgentEvaluation,
  scoreRealAgentEvaluation,
} from "../../scripts/real-agent-eval";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function shellWith(payloadBlock: string): string {
  return `<!doctype html>\n<html><body>\n${YELI_AGENT_PREAMBLE}\n<script>globalThis.runtime = "immutable";</script>\n${payloadBlock}\n<footer>immutable suffix</footer>\n</body></html>\n`;
}

describe("repository helper outcome parity", () => {
  it("matches shared metadata, Markdown export, and static export semantics", async () => {
    const source = '---\ntitle: "Before"\n---\n# Body\n';
    const payload = await createDocumentPayload(source, {
      docId: "doc-agent-parity",
      revision: 8,
    });
    const artifact = shellWith(serializePayloadBlock(payload));

    const helper = await patchMetadata(artifact, "title", "After", {
      expectedRevision: 8,
    });
    const shared = patchFrontmatter(source, "title", "After");

    expect(shared.ok).toBe(true);
    if (!shared.ok) return;
    expect(helper.markdown).toBe(shared.source);
    expect(await exportMarkdownDocument(helper.artifact)).toMatchObject(
      createMarkdownExport(shared.source, "After"),
    );
    expect(await exportStaticDocument(helper.artifact)).toMatchObject(
      createStaticHtmlExport(
        await createDocumentPayload(shared.source, {
          docId: "doc-agent-parity",
          revision: 9,
        }),
        shared.source,
      ),
    );
  });

  it(
    "prepares and independently scores the frozen 24-attempt real-Agent packet",
    { timeout: 60_000 },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "yeli-real-agent-eval-"));
      temporaryDirectories.push(directory);
      const packetDirectory = join(directory, "packet");
      const artifactPath = join(directory, "release.yeli.html");
      const payload = await createDocumentPayload("# Release shell\n", {
        docId: "doc-real-agent-release-shell",
        revision: 1,
      });
      const artifact = shellWith(serializePayloadBlock(payload));
      writeFileSync(artifactPath, artifact, "utf8");

      const prepareOutput = execFileSync(
        process.execPath,
        [
          resolve("scripts/eval-agents.ts"),
          "--artifact",
          artifactPath,
          "--mode",
          "prepare",
          "--workdir",
          packetDirectory,
        ],
        { cwd: resolve("."), encoding: "utf8" },
      );
      const prepared = JSON.parse(prepareOutput) as Record<string, unknown>;
      expect(prepared).toMatchObject({
        attempts: 24,
        mode: "prepare",
        outputDirectory: packetDirectory,
      });
      expect(
        statSync(join(packetDirectory, "benchmark.json")).mode & 0o777,
      ).toBe(0o400);
      const publicManifest = readFileSync(
        join(packetDirectory, "benchmark.json"),
        "utf8",
      );
      expect(publicManifest).not.toContain("expectedAnswer");
      expect(publicManifest).not.toContain("acceptedArtifacts");
      await expect(
        prepareRealAgentEvaluation(artifact, packetDirectory),
      ).rejects.toThrow("Refusing to replace existing evaluation directory");

      const attempts = await createRealEvaluationAttempts(artifact);
      const modelBySlot = {
        "agent-1": ["provider-a", "model-a"],
        "agent-2": ["provider-b", "model-b"],
        "agent-3": ["provider-c", "model-c"],
      } as const;
      for (const attempt of attempts) {
        const resultArtifact = attempt.acceptedArtifacts.at(-1)!;
        const parsed = await parseYeliArtifact(resultArtifact);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) continue;
        const document = await getDocument(resultArtifact);
        const inputDocument = await getDocument(attempt.inputArtifact);
        const validation = await validateDocument(resultArtifact);
        const [provider, model] = modelBySlot[attempt.public.agentSlot];
        const byteOffset = (offset: number) =>
          Buffer.byteLength(resultArtifact.slice(0, offset), "utf8");
        writeFileSync(
          join(packetDirectory, attempt.public.outputArtifactPath),
          resultArtifact,
          "utf8",
        );
        writeFileSync(
          join(packetDirectory, attempt.public.receiptPath),
          `${JSON.stringify(
            {
              schema: "yeli/real-agent-eval-submission",
              schemaVersion: 1,
              attemptId: attempt.public.attemptId,
              inputArtifactHash: attempt.public.inputArtifactHash,
              contextDigest: attempt.public.contextDigest,
              elapsedMs: 100,
              execution: {
                agentSlot: attempt.public.agentSlot,
                kind: "deterministic-test",
                model,
                provider,
                providerReceiptReference: `test://${attempt.public.attemptId}`,
                sessionId: `${attempt.public.agentSlot}-${attempt.public.run}`,
              },
              usage: {
                source: "deterministic-test",
                totalTokens: 1000,
              },
              boundary: {
                payloadStartBytes: byteOffset(parsed.boundary.payloadStart),
                payloadEndBytes: byteOffset(parsed.boundary.payloadEnd),
              },
              freshness: {
                inputAgentSummary: inputDocument.freshness.agentSummary,
                inputManifest: inputDocument.freshness.manifest,
                inputStaticPreview: inputDocument.freshness.staticPreview,
                outputAgentSummary: document.freshness.agentSummary,
                outputManifest: document.freshness.manifest,
                outputStaticPreview: document.freshness.staticPreview,
                staleDerivedDataClaimedCurrent: false,
              },
              validation: { ok: validation.ok, performed: true },
              answer: attempt.expectedAnswer,
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
      }

      const reportPath = join(directory, "score.json");
      const scoreOutput = execFileSync(
        process.execPath,
        [
          resolve("scripts/eval-agents.ts"),
          "--artifact",
          artifactPath,
          "--mode",
          "score",
          "--workdir",
          packetDirectory,
          "--output",
          reportPath,
        ],
        { cwd: resolve("."), encoding: "utf8" },
      );
      expect(readFileSync(reportPath, "utf8")).toBe(scoreOutput);
      const report = JSON.parse(scoreOutput) as Awaited<
        ReturnType<typeof scoreRealAgentEvaluation>
      >;
      expect(report.summary).toMatchObject({
        attempts: 24,
        boundaryFailures: 0,
        metricsComplete: true,
        shellDrift: 0,
        staleClaimViolations: 0,
        successes: 24,
        thresholdPassed: true,
      });
      expect(Object.values(report.operationCoverage).every(Boolean)).toBe(true);
      expect(report.contextComparison["manifest-bearing"].attempts).toBe(12);
      expect(report.contextComparison["manifest-free"].attempts).toBe(12);
      expect(report.releaseScoreClaimed).toBe(false);

      const damaged = attempts[0]!;
      writeFileSync(
        join(packetDirectory, damaged.public.outputArtifactPath),
        `${damaged.acceptedArtifacts[0]!}\n<!-- changed shell -->\n`,
        "utf8",
      );
      const failed = await scoreRealAgentEvaluation(
        artifact,
        packetDirectory,
        true,
      );
      expect(failed.summary.thresholdPassed).toBe(false);
      expect(failed.summary.shellDrift).toBe(1);
      expect(failed.releaseScoreClaimed).toBe(false);

      writeFileSync(
        join(packetDirectory, damaged.public.receiptPath),
        "x".repeat(2 * 1024 * 1024 + 1),
        "utf8",
      );
      const bounded = await scoreRealAgentEvaluation(
        artifact,
        packetDirectory,
        true,
      );
      expect(bounded.results[0]?.errors).toContain("RECEIPT_UNAVAILABLE");
      expect(bounded.releaseScoreClaimed).toBe(false);
    },
  );

  it(
    "supports direct Node render and structured CLI failures without partial writes",
    { timeout: 30_000 },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "yeli-agent-parity-"));
      temporaryDirectories.push(directory);
      const artifactPath = join(directory, "document.yeli.html");
      const payload = await createDocumentPayload("# Before\n", {
        docId: "doc-agent-cli",
        revision: 4,
      });
      const original = shellWith(serializePayloadBlock(payload));
      writeFileSync(artifactPath, original, "utf8");

      const renderOutput = execFileSync(
        process.execPath,
        [resolve("scripts/yeli.ts"), "render", artifactPath],
        { cwd: resolve("."), encoding: "utf8" },
      );
      const rendered = JSON.parse(renderOutput) as {
        apiVersion: number;
        html: string;
        ok: boolean;
      };
      expect(rendered).toMatchObject({ apiVersion: 1, ok: true });
      expect(rendered.html).toContain("<h1");

      const failed = spawnSync(
        process.execPath,
        [
          resolve("scripts/yeli.ts"),
          "metadata",
          artifactPath,
          "--key",
          "title",
          "--value-json",
          '"Never written"',
          "--expected-revision",
          "4",
          "--api-version",
          "2",
        ],
        { cwd: resolve("."), encoding: "utf8" },
      );
      expect(failed.status).toBe(1);
      expect(JSON.parse(failed.stderr)).toMatchObject({
        apiVersion: 1,
        error: { code: "API_VERSION_UNSUPPORTED" },
        ok: false,
      });
      expect(readFileSync(artifactPath, "utf8")).toBe(original);

      const malformed = spawnSync(
        process.execPath,
        [
          resolve("scripts/yeli.ts"),
          "refresh",
          artifactPath,
          "--expected-revision",
          "4x",
        ],
        { cwd: resolve("."), encoding: "utf8" },
      );
      expect(malformed.status).toBe(1);
      expect(JSON.parse(malformed.stderr)).toMatchObject({
        error: { code: "ARGUMENT_INVALID" },
        ok: false,
      });
      expect(readFileSync(artifactPath, "utf8")).toBe(original);

      const insertPath = join(directory, "windows-lines.md");
      writeFileSync(insertPath, "## Windows\r\nBody\r\n", "utf8");
      execFileSync(
        process.execPath,
        [
          resolve("scripts/yeli.ts"),
          "patch",
          artifactPath,
          "--start-line",
          "2",
          "--delete-count",
          "0",
          "--insert-file",
          insertPath,
          "--expected-revision",
          "4",
        ],
        { cwd: resolve("."), encoding: "utf8" },
      );
      const patchedArtifact = readFileSync(artifactPath, "utf8");
      expect(patchedArtifact).not.toContain("\r");
      expect(await exportMarkdownDocument(patchedArtifact)).toMatchObject({
        content: "# Before\n## Windows\nBody\n",
      });

      const invalidRange = spawnSync(
        process.execPath,
        [
          resolve("scripts/yeli.ts"),
          "patch",
          artifactPath,
          "--start-line",
          "99",
          "--delete-count",
          "1",
          "--expected-revision",
          "5",
        ],
        { cwd: resolve("."), encoding: "utf8" },
      );
      expect(invalidRange.status).toBe(1);
      expect(JSON.parse(invalidRange.stderr)).toMatchObject({
        error: { code: "LINE_PATCH_INVALID" },
        ok: false,
      });
      expect(readFileSync(artifactPath, "utf8")).toBe(patchedArtifact);

      const protectedOutput = join(directory, "protected.html");
      writeFileSync(protectedOutput, "do not replace", "utf8");
      for (const command of [
        ["export-static", artifactPath, "--output", protectedOutput],
        ["extract", artifactPath, protectedOutput],
        [
          "refresh",
          artifactPath,
          "--output",
          protectedOutput,
          "--expected-revision",
          "5",
        ],
      ]) {
        const overwrite = spawnSync(
          process.execPath,
          [resolve("scripts/yeli.ts"), ...command],
          { cwd: resolve("."), encoding: "utf8" },
        );
        expect(overwrite.status).toBe(1);
        expect(JSON.parse(overwrite.stderr)).toMatchObject({
          error: { code: "OUTPUT_EXISTS" },
          ok: false,
        });
      }
      expect(readFileSync(protectedOutput, "utf8")).toBe("do not replace");
      expect(readFileSync(artifactPath, "utf8")).toBe(patchedArtifact);
    },
  );

  it(
    "dry-runs every advertised operation across both benchmark context variants",
    { timeout: 30_000 },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "yeli-agent-eval-"));
      temporaryDirectories.push(directory);
      const artifactPath = join(directory, "benchmark.yeli.html");
      const payload = await createDocumentPayload(
        '---\ntitle: "Benchmark"\ntags: [portable]\n---\n# Benchmark\n\n- [ ] Check\n',
        { docId: "doc-agent-eval", revision: 2 },
      );
      writeFileSync(
        artifactPath,
        shellWith(serializePayloadBlock(payload)),
        "utf8",
      );

      const reportPath = join(directory, "benchmark-report.json");
      const benchmarkArguments = [
        resolve("scripts/eval-agents.ts"),
        "--artifact",
        artifactPath,
        "--mode",
        "fake",
        "--output",
        reportPath,
      ];
      const output = execFileSync(process.execPath, benchmarkArguments, {
        cwd: resolve("."),
        encoding: "utf8",
      });
      expect(readFileSync(reportPath, "utf8")).toBe(output);
      expect(statSync(reportPath).mode & 0o777).toBe(0o600);
      const noClobber = spawnSync(process.execPath, benchmarkArguments, {
        cwd: resolve("."),
        encoding: "utf8",
      });
      expect(noClobber.status).toBe(1);
      expect(JSON.parse(noClobber.stderr)).toMatchObject({
        error: { code: "OUTPUT_EXISTS" },
        ok: false,
      });
      expect(readFileSync(reportPath, "utf8")).toBe(output);
      expect(
        readdirSync(directory).filter((name) => name.endsWith(".yeli-tmp")),
      ).toEqual([]);
      const report = JSON.parse(output) as {
        artifactHash: string;
        releaseScoreClaimed: boolean;
        results: Array<{
          contextVariant: string;
          freshnessBefore: string;
          freshnessAfter: string;
          operation: string;
          oracle: { code: string; ok: boolean };
          planning: {
            contextDigest: string;
            contextKind: string;
            contextSourceHash: string;
            inputArtifactHash: string;
            planDigest: string;
          };
          shellDrift: boolean;
          success: boolean;
          touchedByteRegions: unknown[];
        }>;
      };

      expect(report.releaseScoreClaimed).toBe(false);
      expect(
        new Set(report.results.map((result) => result.contextVariant)),
      ).toEqual(new Set(["manifest-bearing", "manifest-free"]));
      for (const operation of [
        "inspect",
        "extract",
        "replace",
        "patch-lines",
        "metadata",
        "refresh",
        "validate",
        "render",
        "export-static",
      ]) {
        expect(
          report.results.filter((result) => result.operation === operation),
        ).toHaveLength(2);
      }
      expect(report.results.every((result) => result.success)).toBe(true);
      expect(report.results.every((result) => result.oracle.ok)).toBe(true);
      expect(report.results.every((result) => !result.shellDrift)).toBe(true);
      for (const operation of [
        "inspect",
        "extract",
        "replace",
        "patch-lines",
        "metadata",
        "refresh",
        "validate",
        "render",
        "export-static",
      ]) {
        const pair = report.results.filter(
          (result) => result.operation === operation,
        );
        expect(
          new Set(pair.map((result) => result.planning.contextKind)),
        ).toEqual(new Set(["bounded-pre-read", "raw-markdown"]));
        expect(
          new Set(pair.map((result) => result.planning.contextDigest)).size,
        ).toBe(2);
        expect(
          new Set(pair.map((result) => result.planning.planDigest)).size,
        ).toBe(2);
      }
      expect(
        report.results.find((result) => result.operation === "refresh"),
      ).toMatchObject({
        freshnessBefore: "stale",
        freshnessAfter: "fresh",
      });
      expect(
        report.results
          .filter((result) => result.operation === "refresh")
          .every(
            (result) =>
              result.planning.inputArtifactHash !== report.artifactHash &&
              result.planning.contextSourceHash.length === 64,
          ),
      ).toBe(true);
      expect(
        report.results
          .filter((result) =>
            ["replace", "patch-lines", "metadata", "refresh"].includes(
              result.operation,
            ),
          )
          .every((result) => result.touchedByteRegions.length > 0),
      ).toBe(true);

      const invalidFixtureRoot = join(directory, "invalid-fixture-root");
      mkdirSync(join(invalidFixtureRoot, "tests/fixtures/agent-eval"), {
        recursive: true,
      });
      writeFileSync(
        join(invalidFixtureRoot, "tests/fixtures/agent-eval/tasks.json"),
        JSON.stringify({
          benchmarkVersion: 1,
          operations: ["unknown-operation"],
          oracleFaults: [],
          variants: ["manifest-bearing", "manifest-free"],
        }),
        "utf8",
      );
      const invalidFixture = spawnSync(
        process.execPath,
        [
          resolve("scripts/eval-agents.ts"),
          "--artifact",
          artifactPath,
          "--mode",
          "fake",
        ],
        { cwd: invalidFixtureRoot, encoding: "utf8" },
      );
      expect(invalidFixture.status).toBe(1);
      expect(JSON.parse(invalidFixture.stderr)).toMatchObject({
        error: {
          code: "EVALUATION_FAILED",
          message: "Agent evaluation fixture is invalid",
        },
        ok: false,
      });

      const wrongOutputRoot = join(directory, "wrong-output-root");
      mkdirSync(join(wrongOutputRoot, "tests/fixtures/agent-eval"), {
        recursive: true,
      });
      writeFileSync(
        join(wrongOutputRoot, "tests/fixtures/agent-eval/tasks.json"),
        readFileSync(
          resolve("tests/fixtures/agent-eval/wrong-output.json"),
          "utf8",
        ),
        "utf8",
      );
      const wrongOutput = execFileSync(
        process.execPath,
        [
          resolve("scripts/eval-agents.ts"),
          "--artifact",
          artifactPath,
          "--mode",
          "fake",
        ],
        { cwd: wrongOutputRoot, encoding: "utf8" },
      );
      const wrongOutputReport = JSON.parse(wrongOutput) as {
        results: Array<{
          contextVariant: string;
          operation: string;
          oracle: { code: string; ok: boolean };
          success: boolean;
        }>;
        summary: { successes: number };
      };
      expect(
        wrongOutputReport.results.find(
          (result) =>
            result.operation === "extract" &&
            result.contextVariant === "manifest-free",
        ),
      ).toMatchObject({
        oracle: { code: "EXTRACT_CONTENT_MATCH", ok: false },
        success: false,
      });
      expect(wrongOutputReport.summary.successes).toBe(17);
    },
  );
});
