import { execFileSync } from "node:child_process";
import {
  chmodSync,
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

import { createDocumentPayload } from "../../src/document/model";
import {
  patchArtifactLines,
  replaceArtifactMarkdown,
} from "../../src/agent/validate";
import { parseYeliArtifact } from "../../src/format/parse";
import {
  YELI_AGENT_PREAMBLE,
  serializePayloadBlock,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "../../src/format/serialize";
import {
  publishNewFile,
  replaceFileIfUnchanged,
} from "../../scripts/yeli-files";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function shellWith(payloadBlock: string): string {
  return `<!doctype html>\n<html><body>\n${YELI_AGENT_PREAMBLE}\n<script>globalThis.runtime = "immutable";</script>\n${payloadBlock}\n<footer>immutable suffix</footer>\n</body></html>\n`;
}

function trustedTemplateWith(payloadBlock: string): string {
  return `<!doctype html>\n<html><body>\n${YELI_AGENT_PREAMBLE}\n<script>globalThis.runtime = "immutable";</script>\n${payloadBlock}\n${STATIC_PREVIEW_OPEN}\n<article id="yeli-static-preview" data-source-hash="stale">stale</article>\n${STATIC_PREVIEW_CLOSE}\n<footer>immutable suffix</footer>\n</body></html>\n`;
}

describe("file-only Agent lifecycle", () => {
  it("replaces Markdown through the helper with payload-only shell receipts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-agent-edit-"));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, "document.yeli.html");
    const markdownPath = join(directory, "replacement.md");
    const initial = await createDocumentPayload("# Before\n\nBody\n", {
      docId: "doc-agent",
      revision: 5,
    });
    writeFileSync(
      artifactPath,
      shellWith(serializePayloadBlock(initial)),
      "utf8",
    );
    writeFileSync(markdownPath, "# After\n\nBody\n", "utf8");

    const output = execFileSync(
      process.execPath,
      [
        resolve("scripts/yeli.ts"),
        "replace",
        artifactPath,
        markdownPath,
        "--expected-revision",
        "5",
      ],
      { cwd: resolve("."), encoding: "utf8" },
    );
    const receipt = JSON.parse(output) as {
      ok: boolean;
      revision: number;
      shell: { stable: boolean; prefixBefore: string; prefixAfter: string };
    };

    expect(receipt).toMatchObject({
      changedLines: { deleteCount: 3, insertedCount: 3, startLine: 1 },
      ok: true,
      revision: 6,
      shell: { stable: true },
    });
    expect(receipt.shell.prefixAfter).toBe(receipt.shell.prefixBefore);

    const parsed = await parseYeliArtifact(readFileSync(artifactPath, "utf8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.markdown).toBe("# After\n\nBody\n");
    expect(parsed.freshness.manifest.status).toBe("fresh");

    const extractedPath = join(directory, "extracted.md");
    execFileSync(
      process.execPath,
      [resolve("scripts/yeli.ts"), "extract", artifactPath, extractedPath],
      { cwd: resolve("."), encoding: "utf8" },
    );
    expect(readFileSync(extractedPath, "utf8")).toBe("# After\n\nBody\n");

    const inspectOutput = execFileSync(
      process.execPath,
      [resolve("scripts/yeli.ts"), "pre-read", artifactPath],
      { cwd: resolve("."), encoding: "utf8" },
    );
    const preRead = JSON.parse(inspectOutput) as Record<string, unknown>;
    expect(preRead).toMatchObject({
      freshness: { agentSummary: "absent" },
      ok: true,
      revision: 6,
    });
    expect(preRead).toHaveProperty("manifest");
    expect(preRead).not.toHaveProperty("markdown");
  });

  it("writes the helper attribution as the current Agent summary contract", async () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-agent-summary-"));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, "document.yeli.html");
    const markdownPath = join(directory, "replacement.md");
    const initial = await createDocumentPayload("# Before\n", {
      docId: "doc-agent-summary",
      revision: 2,
    });
    initial.agentSummary = {
      changeSummary: "Prior summary",
      content: "Prior summary content",
      sourceHash: initial.manifest.sourceHash,
      updatedAt: "2026-09-02T12:00:00.000Z",
      updatedBy: "codex/prior-task",
    };
    writeFileSync(
      artifactPath,
      shellWith(serializePayloadBlock(initial)),
      "utf8",
    );
    writeFileSync(markdownPath, "# After\n", "utf8");

    execFileSync(
      process.execPath,
      [
        resolve("scripts/yeli.ts"),
        "replace",
        artifactPath,
        markdownPath,
        "--expected-revision",
        "2",
        "--updated-by",
        "codex/current-task",
        "--change-summary",
        "Replaced the document title",
      ],
      { cwd: resolve("."), encoding: "utf8" },
    );

    const parsed = await parseYeliArtifact(readFileSync(artifactPath, "utf8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.agentSummary).toMatchObject({
      changeSummary: "Replaced the document title",
      content: "Replaced the document title",
      sourceHash: parsed.freshness.sourceHash,
      updatedBy: "codex/current-task",
    });
    expect(parsed.payload.agentSummary?.updatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/u,
    );
    expect(parsed.freshness.agentSummary.status).toBe("fresh");
  });

  it("patches asserted lines and changes only the payload boundary", async () => {
    const initial = await createDocumentPayload("# Before\n\nBody\n", {
      docId: "doc-agent-patch",
      revision: 3,
    });
    const artifact = shellWith(serializePayloadBlock(initial));

    const result = await patchArtifactLines(
      artifact,
      { startLine: 1, deleteCount: 1, insertLines: ["# Patched"] },
      { expectedSourceHash: initial.manifest.sourceHash },
    );

    expect(result.receipt).toMatchObject({
      changedLines: { startLine: 1, deleteCount: 1, insertedCount: 1 },
      revision: 4,
      shell: { stable: true },
    });
    const parsed = await parseYeliArtifact(result.artifact);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.markdown).toBe("# Patched\n\nBody\n");
  });

  it("rejects a stale expected revision without changing the artifact", async () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-agent-stale-"));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, "document.yeli.html");
    const markdownPath = join(directory, "replacement.md");
    const initial = await createDocumentPayload("# Before\n", {
      docId: "doc-agent-stale",
      revision: 2,
    });
    const original = shellWith(serializePayloadBlock(initial));
    writeFileSync(artifactPath, original, "utf8");
    writeFileSync(markdownPath, "# Wrong\n", "utf8");

    expect(() =>
      execFileSync(
        process.execPath,
        [
          resolve("scripts/yeli.ts"),
          "replace",
          artifactPath,
          markdownPath,
          "--expected-revision",
          "1",
        ],
        { cwd: resolve("."), encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow();
    expect(readFileSync(artifactPath, "utf8")).toBe(original);
  });

  it("reports line counts from the canonical LF materialization", async () => {
    const initial = await createDocumentPayload("# Before\n", {
      docId: "doc-agent-line-count",
      revision: 1,
    });
    const artifact = shellWith(serializePayloadBlock(initial));

    const result = await replaceArtifactMarkdown(artifact, "one\rtwo\r", {
      expectedRevision: 1,
    });

    expect(result.receipt.changedLines).toEqual({
      startLine: 1,
      deleteCount: 1,
      insertedCount: 2,
    });
  });

  it("refuses a concurrent in-place change and cleans the prepared temp", async () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-agent-conflict-"));
    temporaryDirectories.push(directory);
    const targetPath = join(directory, "document.yeli.html");
    const original = Buffer.from("original", "utf8");
    writeFileSync(targetPath, original);
    writeFileSync(targetPath, "external edit", "utf8");

    await expect(
      replaceFileIfUnchanged(targetPath, "agent edit", original),
    ).rejects.toMatchObject({ code: "INPUT_CHANGED" });
    expect(readFileSync(targetPath, "utf8")).toBe("external edit");
    expect(readdirSync(directory)).toEqual(["document.yeli.html"]);
  });

  it("imports UTF-8 Markdown into a trusted shell without overwriting either input", async () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-agent-import-"));
    temporaryDirectories.push(directory);
    const markdownPath = join(directory, "source.md");
    const templatePath = join(directory, "trusted.yeli.html");
    const outputPath = join(directory, "imported.yeli.html");
    const templatePayload = await createDocumentPayload("# Template\n", {
      docId: "doc-template",
      revision: 4,
    });
    const template = trustedTemplateWith(
      serializePayloadBlock(templatePayload),
    );
    writeFileSync(markdownPath, "# Imported\r\n\r\nBody\r\n", "utf8");
    writeFileSync(templatePath, template, "utf8");

    const stdout = execFileSync(
      process.execPath,
      [
        resolve("scripts/yeli.ts"),
        "import",
        markdownPath,
        "--template",
        templatePath,
        "--output",
        outputPath,
        "--doc-id",
        "doc-cli-import",
      ],
      { cwd: resolve("."), encoding: "utf8" },
    );
    const receipt = JSON.parse(stdout) as Record<string, unknown>;
    const importedBytes = readFileSync(outputPath);
    const parsed = await parseYeliArtifact(importedBytes.toString("utf8"));

    expect(receipt).toMatchObject({
      apiVersion: 1,
      document: { docId: "doc-cli-import", revision: 1 },
      ok: true,
      receipt: { lineEndingsNormalized: true, revision: 1 },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.markdown).toBe("# Imported\n\nBody\n");
    expect(readFileSync(templatePath, "utf8")).toBe(template);
    expect(readFileSync(markdownPath, "utf8")).toBe(
      "# Imported\r\n\r\nBody\r\n",
    );

    expect(() =>
      execFileSync(
        process.execPath,
        [
          resolve("scripts/yeli.ts"),
          "import",
          markdownPath,
          "--template",
          templatePath,
          "--output",
          outputPath,
        ],
        { cwd: resolve("."), encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow();
    expect(readFileSync(outputPath)).toEqual(importedBytes);
  });

  it.skipIf(process.platform === "win32")(
    "preserves input permissions and keeps new outputs private",
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "yeli-agent-mode-"));
      temporaryDirectories.push(directory);
      const artifactPath = join(directory, "document.yeli.html");
      const markdownPath = join(directory, "replacement.md");
      const extractedPath = join(directory, "extracted.md");
      const privateOutputPath = join(directory, "private.md");
      const initial = await createDocumentPayload("# Before\n", {
        docId: "doc-agent-mode",
        revision: 1,
      });
      writeFileSync(
        artifactPath,
        shellWith(serializePayloadBlock(initial)),
        "utf8",
      );
      chmodSync(artifactPath, 0o640);
      writeFileSync(markdownPath, "# After\n", "utf8");

      execFileSync(
        process.execPath,
        [
          resolve("scripts/yeli.ts"),
          "replace",
          artifactPath,
          markdownPath,
          "--expected-revision",
          "1",
        ],
        { cwd: resolve("."), encoding: "utf8" },
      );
      execFileSync(
        process.execPath,
        [resolve("scripts/yeli.ts"), "extract", artifactPath, extractedPath],
        { cwd: resolve("."), encoding: "utf8" },
      );
      await publishNewFile(privateOutputPath, "private", {
        validateTemporary: (temporaryPath) => {
          expect(statSync(temporaryPath).mode & 0o777).toBe(0o600);
        },
      });

      expect(statSync(artifactPath).mode & 0o777).toBe(0o640);
      expect(statSync(extractedPath).mode & 0o777).toBe(0o600);
      expect(statSync(privateOutputPath).mode & 0o777).toBe(0o600);
    },
  );

  it("publishes new outputs atomically without clobbering an existing path", async () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-agent-output-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "existing.md");
    writeFileSync(outputPath, "keep", "utf8");

    await expect(publishNewFile(outputPath, "replace")).rejects.toMatchObject({
      code: "OUTPUT_EXISTS",
    });
    expect(readFileSync(outputPath, "utf8")).toBe("keep");
    expect(readdirSync(directory)).toEqual(["existing.md"]);
  });
});
