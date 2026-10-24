#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
  exportStaticDocument,
  extractDocument,
  getDocument,
  inspectDocument,
  patchDocumentLines,
  patchMetadata,
  preReadDocument,
  refreshDocument,
  renderDocument,
  replaceDocument,
  validateDocument,
  type AgentMutationResult,
} from "../src/agent/operations.ts";
import { encodeMarkdown } from "../src/document/model.ts";
import { sha256Fallback } from "../src/document/freshness.ts";
import { parseYeliArtifact } from "../src/format/parse.ts";
import { splicePayload } from "../src/format/serialize.ts";
import { publishNewFile } from "./yeli-files.ts";
import {
  prepareRealAgentEvaluation,
  scoreRealAgentEvaluation,
  touchedByteRegions,
  type ByteRegion,
} from "./real-agent-eval.ts";

const CONTEXT_VARIANTS = ["manifest-bearing", "manifest-free"] as const;
const EVALUATION_OPERATIONS = [
  "inspect",
  "extract",
  "replace",
  "patch-lines",
  "metadata",
  "refresh",
  "validate",
  "render",
  "export-static",
] as const;

type ContextVariant = (typeof CONTEXT_VARIANTS)[number];
type EvaluationOperation = (typeof EVALUATION_OPERATIONS)[number];

interface EvaluationFixture {
  benchmarkVersion: number;
  operations: EvaluationOperation[];
  oracleFaults: OracleFault[];
  variants: ContextVariant[];
}

interface OracleFault {
  kind: "schema-valid-wrong-output";
  operation: "extract";
  variant: ContextVariant;
}

interface EvaluationResult {
  contextBytes: number;
  contextVariant: ContextVariant;
  elapsedMs: number;
  error?: { code: string; message: string };
  freshnessAfter: "fresh" | "stale";
  freshnessBefore: "fresh" | "stale";
  operation: EvaluationOperation;
  oracle: { code: string; evidence: string[]; ok: boolean };
  planning: PlanningEvidence;
  shellDrift: boolean;
  success: boolean;
  touchedByteRegions: ByteRegion[];
  validation: { codes: string[]; ok: boolean };
}

interface MaterializedContext {
  contextDigest: string;
  contextKind: "bounded-pre-read" | "raw-markdown";
  inputArtifactHash: string;
  lineCount: number;
  serialized: string;
  sourceHash: string;
  variant: ContextVariant;
}

interface PlanningEvidence {
  contextDigest: string;
  contextKind: MaterializedContext["contextKind"];
  contextSourceHash: string;
  inputArtifactHash: string;
  planDigest: string;
}

interface BasePlan {
  contextDigest: string;
  expectedSourceHash: string;
  operation: EvaluationOperation;
}

type FakeClientPlan =
  | (BasePlan & {
      operation:
        "inspect" | "extract" | "validate" | "render" | "export-static";
    })
  | (BasePlan & { operation: "replace"; source: string })
  | (BasePlan & {
      insertLines: string[];
      operation: "patch-lines";
      startLine: number;
    })
  | (BasePlan & { operation: "metadata"; value: string })
  | (BasePlan & { operation: "refresh" });

type FakeClientOutcome =
  | { operation: "inspect"; value: Awaited<ReturnType<typeof inspectDocument>> }
  | { operation: "extract"; value: Awaited<ReturnType<typeof extractDocument>> }
  | {
      operation: "replace" | "patch-lines" | "metadata" | "refresh";
      value: AgentMutationResult;
    }
  | {
      operation: "validate";
      value: Awaited<ReturnType<typeof validateDocument>>;
    }
  | { operation: "render"; value: Awaited<ReturnType<typeof renderDocument>> }
  | {
      operation: "export-static";
      value: Awaited<ReturnType<typeof exportStaticDocument>>;
    };

interface FakeClientExecution {
  artifact: string;
  outcome: FakeClientOutcome;
  plan: FakeClientPlan;
  planning: PlanningEvidence;
  shellDrift: boolean;
}

interface Arguments {
  artifactPath: string;
  confirmAuthorizedRealAgents: boolean;
  mode: "fake" | "prepare" | "score";
  outputPath?: string;
  workDirectory?: string;
}

function parseArguments(values: string[]): Arguments {
  const options = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || !value) {
      throw new Error(
        "Usage: eval-agents --artifact document.yeli.html [--mode fake|prepare|score] [--workdir directory] [--output report.json] [--confirm-authorized-real-agents yes]",
      );
    }
    options.set(name.slice(2), value);
  }
  const artifactPath = options.get("artifact");
  const mode = options.get("mode") ?? "fake";
  if (!artifactPath) throw new Error("--artifact is required");
  if (
    !(["fake", "prepare", "score"] as const).includes(mode as Arguments["mode"])
  ) {
    throw new Error("--mode must be fake, prepare, or score");
  }
  const outputPath = options.get("output");
  const workDirectory = options.get("workdir");
  if (mode !== "fake" && !workDirectory) {
    throw new Error(`--workdir is required for --mode ${mode}`);
  }
  const confirmation = options.get("confirm-authorized-real-agents");
  if (confirmation !== undefined && confirmation !== "yes") {
    throw new Error("--confirm-authorized-real-agents accepts only yes");
  }
  return {
    artifactPath: resolve(artifactPath),
    confirmAuthorizedRealAgents: confirmation === "yes",
    mode: mode as Arguments["mode"],
    ...(outputPath ? { outputPath: resolve(outputPath) } : {}),
    ...(workDirectory ? { workDirectory: resolve(workDirectory) } : {}),
  };
}

function hasExactMembers(
  value: unknown,
  expected: readonly string[],
): value is string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    return false;
  }
  const members = new Set(value);
  return (
    members.size === expected.length &&
    expected.every((item) => members.has(item))
  );
}

function fixture(): EvaluationFixture {
  const value = JSON.parse(
    readFileSync(resolve("tests/fixtures/agent-eval/tasks.json"), "utf8"),
  ) as unknown;
  if (
    typeof value !== "object" ||
    value === null ||
    !("benchmarkVersion" in value) ||
    value.benchmarkVersion !== 1 ||
    !("operations" in value) ||
    !hasExactMembers(value.operations, EVALUATION_OPERATIONS) ||
    !("variants" in value) ||
    !hasExactMembers(value.variants, CONTEXT_VARIANTS) ||
    !("oracleFaults" in value) ||
    !Array.isArray(value.oracleFaults) ||
    !value.oracleFaults.every(isOracleFault)
  ) {
    throw new Error("Agent evaluation fixture is invalid");
  }
  return value as EvaluationFixture;
}

function isOracleFault(value: unknown): value is OracleFault {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === "schema-valid-wrong-output" &&
    candidate.operation === "extract" &&
    typeof candidate.variant === "string" &&
    CONTEXT_VARIANTS.includes(candidate.variant as ContextVariant)
  );
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function staleManifestArtifact(artifact: string): Promise<string> {
  const parsed = await parseYeliArtifact(artifact);
  if (!parsed.ok) throw new Error("Cannot prepare stale evaluation artifact");
  const stalePayload = structuredClone(parsed.payload);
  stalePayload.markdown = encodeMarkdown(`${parsed.markdown}\nStale probe\n`);
  return splicePayload(artifact, stalePayload).artifact;
}

function materializedLineCount(source: string): number {
  if (source.length === 0) return 0;
  const newlineCount = source.match(/\n/gu)?.length ?? 0;
  return source.endsWith("\n") ? newlineCount : newlineCount + 1;
}

async function materializeContext(
  artifact: string,
  variant: ContextVariant,
): Promise<MaterializedContext> {
  const inputArtifactHash = sha256Fallback(artifact);
  if (variant === "manifest-bearing") {
    const snapshot = await preReadDocument(artifact);
    const serialized = JSON.stringify(snapshot);
    return {
      contextDigest: sha256Fallback(serialized),
      contextKind: "bounded-pre-read",
      inputArtifactHash,
      lineCount: snapshot.ranges.markdown.endLine,
      serialized,
      sourceHash: snapshot.sourceHash,
      variant,
    };
  }
  const serialized = await extractDocument(artifact);
  return {
    contextDigest: sha256Fallback(serialized),
    contextKind: "raw-markdown",
    inputArtifactHash,
    lineCount: materializedLineCount(serialized),
    serialized,
    sourceHash: sha256Fallback(serialized),
    variant,
  };
}

function createPlan(
  operation: EvaluationOperation,
  context: MaterializedContext,
): FakeClientPlan {
  const base: BasePlan = {
    contextDigest: context.contextDigest,
    expectedSourceHash: context.sourceHash,
    operation,
  };
  const token = context.contextDigest.slice(0, 12);
  if (operation === "replace") {
    return {
      ...base,
      operation,
      source: `# Deterministic replacement\n\nContext ${token}\n`,
    };
  }
  if (operation === "patch-lines") {
    return {
      ...base,
      insertLines: [`## Deterministic line patch ${token}`],
      operation,
      startLine: context.lineCount + 1,
    };
  }
  if (operation === "metadata") {
    return { ...base, operation, value: `Deterministic ${token}` };
  }
  return { ...base, operation };
}

async function executeDeterministicFakeClient(
  artifact: string,
  operation: EvaluationOperation,
  context: MaterializedContext,
): Promise<FakeClientExecution> {
  const plan = createPlan(operation, context);
  const planning: PlanningEvidence = {
    contextDigest: context.contextDigest,
    contextKind: context.contextKind,
    contextSourceHash: context.sourceHash,
    inputArtifactHash: context.inputArtifactHash,
    planDigest: sha256Fallback(JSON.stringify(plan)),
  };
  const expectation = { expectedSourceHash: plan.expectedSourceHash };
  if (plan.operation === "inspect") {
    return {
      artifact,
      outcome: {
        operation: plan.operation,
        value: await inspectDocument(artifact),
      },
      plan,
      planning,
      shellDrift: false,
    };
  }
  if (plan.operation === "extract") {
    return {
      artifact,
      outcome: {
        operation: plan.operation,
        value: await extractDocument(artifact),
      },
      plan,
      planning,
      shellDrift: false,
    };
  }
  if (plan.operation === "validate") {
    return {
      artifact,
      outcome: {
        operation: plan.operation,
        value: await validateDocument(artifact),
      },
      plan,
      planning,
      shellDrift: false,
    };
  }
  if (plan.operation === "render") {
    return {
      artifact,
      outcome: {
        operation: plan.operation,
        value: await renderDocument(artifact),
      },
      plan,
      planning,
      shellDrift: false,
    };
  }
  if (plan.operation === "export-static") {
    return {
      artifact,
      outcome: {
        operation: plan.operation,
        value: await exportStaticDocument(artifact),
      },
      plan,
      planning,
      shellDrift: false,
    };
  }
  let mutation: AgentMutationResult;
  if (plan.operation === "replace") {
    mutation = await replaceDocument(artifact, plan.source, expectation);
  } else if (plan.operation === "patch-lines") {
    mutation = await patchDocumentLines(
      artifact,
      {
        deleteCount: 0,
        insertLines: plan.insertLines,
        startLine: plan.startLine,
      },
      expectation,
    );
  } else if (plan.operation === "metadata") {
    mutation = await patchMetadata(artifact, "title", plan.value, expectation);
  } else {
    mutation = await refreshDocument(artifact, expectation);
  }
  return {
    artifact: mutation.artifact,
    outcome: { operation: plan.operation, value: mutation },
    plan,
    planning,
    shellDrift: !mutation.receipt.shell.stable,
  };
}

function injectOracleFault(
  outcome: FakeClientOutcome,
  fault: OracleFault | undefined,
): FakeClientOutcome {
  if (!fault) return outcome;
  if (fault.operation === "extract" && outcome.operation === "extract") {
    return { operation: "extract", value: "# Schema-valid wrong output\n" };
  }
  throw new Error(
    `No schema-valid wrong-output injector for ${fault.operation}`,
  );
}

function expectedLinePatch(
  source: string,
  plan: Extract<FakeClientPlan, { operation: "patch-lines" }>,
): string {
  const encoded = encodeMarkdown(source);
  const lines = [...encoded.lines];
  lines.splice(plan.startLine - 1, 0, ...plan.insertLines);
  return `${lines.join("\n")}${encoded.finalNewline ? "\n" : ""}`;
}

async function evaluateOracle(
  before: Awaited<ReturnType<typeof getDocument>>,
  execution: FakeClientExecution,
): Promise<EvaluationResult["oracle"]> {
  const { outcome, plan } = execution;
  const after = await getDocument(execution.artifact);
  if (plan.operation === "inspect") {
    const ok =
      outcome.operation === "inspect" &&
      outcome.value.markdown === before.markdown &&
      outcome.value.sourceHash === before.sourceHash &&
      outcome.value.revision === before.revision;
    return {
      code: "INSPECT_SNAPSHOT_MATCH",
      evidence: [before.sourceHash],
      ok,
    };
  }
  if (plan.operation === "extract") {
    const ok =
      outcome.operation === "extract" && outcome.value === before.markdown;
    return { code: "EXTRACT_CONTENT_MATCH", evidence: [before.sourceHash], ok };
  }
  if (plan.operation === "replace") {
    const ok =
      outcome.operation === "replace" &&
      outcome.value.markdown === plan.source &&
      after.markdown === plan.source &&
      after.revision === before.revision + 1;
    return { code: "REPLACE_SOURCE_MATCH", evidence: [plan.contextDigest], ok };
  }
  if (plan.operation === "patch-lines") {
    const expected = expectedLinePatch(before.markdown, plan);
    const ok =
      outcome.operation === "patch-lines" &&
      outcome.value.markdown === expected &&
      after.markdown === expected &&
      after.revision === before.revision + 1;
    return { code: "LINE_PATCH_MATCH", evidence: plan.insertLines, ok };
  }
  if (plan.operation === "metadata") {
    const ok =
      outcome.operation === "metadata" &&
      after.manifest.metadata.title === plan.value &&
      outcome.value.document.manifest.metadata.title === plan.value &&
      after.revision === before.revision + 1;
    return { code: "METADATA_VALUE_MATCH", evidence: [plan.value], ok };
  }
  if (plan.operation === "refresh") {
    const ok =
      outcome.operation === "refresh" &&
      before.freshness.manifest === "stale" &&
      after.freshness.manifest === "fresh" &&
      after.markdown === before.markdown &&
      after.revision === before.revision;
    return {
      code: "REFRESH_FRESHNESS_MATCH",
      evidence: [before.sourceHash],
      ok,
    };
  }
  if (plan.operation === "validate") {
    const ok =
      outcome.operation === "validate" &&
      outcome.value.ok &&
      outcome.value.payload?.revision === before.revision &&
      !outcome.value.findings.some((finding) => finding.severity === "error");
    return { code: "VALIDATE_RESULT_MATCH", evidence: [before.sourceHash], ok };
  }
  if (plan.operation === "render") {
    const ok =
      outcome.operation === "render" &&
      outcome.value.sourceHash === before.sourceHash &&
      outcome.value.revision === before.revision &&
      outcome.value.html.trim().length > 0;
    return {
      code: "RENDER_PROVENANCE_MATCH",
      evidence: [before.sourceHash],
      ok,
    };
  }
  const ok =
    outcome.operation === "export-static" &&
    outcome.value.sourceHash === before.sourceHash &&
    outcome.value.revision === before.revision &&
    outcome.value.filename.endsWith(".html") &&
    outcome.value.html.startsWith("<!doctype html>") &&
    outcome.value.html.includes("Content-Security-Policy");
  return { code: "STATIC_EXPORT_MATCH", evidence: [before.sourceHash], ok };
}

async function runOperation(
  baseArtifact: string,
  operation: EvaluationOperation,
  variant: ContextVariant,
  oracleFaults: OracleFault[],
): Promise<EvaluationResult> {
  const inputArtifact =
    operation === "refresh"
      ? await staleManifestArtifact(baseArtifact)
      : baseArtifact;
  let artifact = inputArtifact;
  const before = await getDocument(artifact);
  const context = await materializeContext(inputArtifact, variant);
  const started = performance.now();
  let shellDrift = false;
  let execution: FakeClientExecution | undefined;
  let error: EvaluationResult["error"];
  try {
    execution = await executeDeterministicFakeClient(
      inputArtifact,
      operation,
      context,
    );
    const fault = oracleFaults.find(
      (candidate) =>
        candidate.operation === operation && candidate.variant === variant,
    );
    execution.outcome = injectOracleFault(execution.outcome, fault);
    artifact = execution.artifact;
    shellDrift = execution.shellDrift;
  } catch (caught) {
    error = {
      code:
        typeof caught === "object" &&
        caught !== null &&
        "code" in caught &&
        typeof caught.code === "string"
          ? caught.code
          : "UNEXPECTED_ERROR",
      message: caught instanceof Error ? caught.message : String(caught),
    };
  }
  const elapsedMs = performance.now() - started;
  const validation = await validateDocument(artifact);
  const after = await getDocument(artifact);
  const oracle = execution
    ? await evaluateOracle(before, execution)
    : { code: "EXECUTION_COMPLETED", evidence: [], ok: false };
  const planning = execution?.planning ?? {
    contextDigest: context.contextDigest,
    contextKind: context.contextKind,
    contextSourceHash: context.sourceHash,
    inputArtifactHash: context.inputArtifactHash,
    planDigest: "",
  };
  return {
    contextBytes: utf8(context.serialized).byteLength,
    contextVariant: variant,
    elapsedMs,
    ...(error ? { error } : {}),
    freshnessBefore: before.freshness.manifest,
    freshnessAfter: after.freshness.manifest,
    operation,
    oracle,
    planning,
    shellDrift,
    success: !error && oracle.ok && validation.ok && !shellDrift,
    touchedByteRegions: touchedByteRegions(inputArtifact, artifact),
    validation: {
      codes: validation.findings.map((finding) => finding.code),
      ok: validation.ok,
    },
  };
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const artifact = readFileSync(arguments_.artifactPath, "utf8");
  const initialValidation = await validateDocument(artifact);
  if (!initialValidation.ok) throw new Error("Benchmark artifact is invalid");
  if (arguments_.mode === "prepare") {
    const prepared = await prepareRealAgentEvaluation(
      artifact,
      arguments_.workDirectory!,
    );
    process.stdout.write(
      `${JSON.stringify({ mode: "prepare", ...prepared }, null, 2)}\n`,
    );
    return;
  }
  if (arguments_.mode === "score") {
    const report = await scoreRealAgentEvaluation(
      artifact,
      arguments_.workDirectory!,
      arguments_.confirmAuthorizedRealAgents,
    );
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (arguments_.outputPath) {
      await publishNewFile(arguments_.outputPath, serialized);
    }
    process.stdout.write(serialized);
    if (
      !report.summary.thresholdPassed ||
      (arguments_.confirmAuthorizedRealAgents && !report.releaseScoreClaimed)
    ) {
      process.exitCode = 1;
    }
    return;
  }
  const definition = fixture();
  const results: EvaluationResult[] = [];
  for (const variant of definition.variants) {
    for (const operation of definition.operations) {
      results.push(
        await runOperation(
          artifact,
          operation,
          variant,
          definition.oracleFaults,
        ),
      );
    }
  }
  const report = {
    benchmarkVersion: definition.benchmarkVersion,
    client: "deterministic-fake",
    mode: arguments_.mode,
    artifactHash: sha256Fallback(artifact),
    releaseScoreClaimed: false,
    results,
    summary: {
      attempts: results.length,
      successes: results.filter((result) => result.success).length,
      shellDrift: results.filter((result) => result.shellDrift).length,
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (arguments_.outputPath) {
    await publishNewFile(arguments_.outputPath, serialized);
  }
  process.stdout.write(serialized);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        error: {
          code:
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
              ? error.code
              : "EVALUATION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
