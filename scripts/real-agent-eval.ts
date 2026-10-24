import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join, resolve } from "node:path";

import {
  getDocument,
  preReadDocument,
  validateDocument,
} from "../src/agent/operations.ts";
import { sha256Fallback } from "../src/document/freshness.ts";
import {
  createDocumentPayload,
  encodeMarkdown,
} from "../src/document/model.ts";
import { DEFAULT_FORMAT_BUDGETS } from "../src/document/schema.ts";
import { parseYeliArtifact } from "../src/format/parse.ts";
import { splicePayload } from "../src/format/serialize.ts";

export const REAL_AGENT_BENCHMARK_VERSION = 1;
export const REAL_AGENT_SLOTS = ["agent-1", "agent-2", "agent-3"] as const;
export const REAL_AGENT_OPERATIONS = [
  "inspect",
  "extract",
  "replace",
  "patch-lines",
  "patch-metadata",
  "refresh",
  "validate",
] as const;

const RUNS = [
  {
    contextVariant: "manifest-bearing",
    id: "run-1",
    label: "Aurora",
    seed: "cobalt-lantern",
  },
  {
    contextVariant: "manifest-free",
    id: "run-2",
    label: "Meridian",
    seed: "amber-compass",
  },
] as const;

const TASKS = [
  {
    id: "inspect-summary",
    operations: ["inspect"] as const,
    title: "Inspect and summarize current source",
  },
  {
    id: "extract-replace",
    operations: ["extract", "replace"] as const,
    title: "Extract one fact and replace one exact value",
  },
  {
    id: "heading-metadata-patch",
    operations: ["patch-lines", "patch-metadata"] as const,
    title: "Patch one heading and one metadata value",
  },
  {
    id: "refresh-validate",
    operations: ["refresh", "validate"] as const,
    title: "Refresh stale derived data and validate",
  },
] as const;

const FROZEN_THRESHOLDS = {
  aggregateSuccesses: 22,
  attempts: 24,
  boundaryLocationRate: 1,
  perAgentSuccesses: 7,
  shellDrift: 0,
  staleClaims: 0,
} as const;
const REAL_AGENT_METADATA_MAX_BYTES = 2 * 1024 * 1024;

type AgentSlot = (typeof REAL_AGENT_SLOTS)[number];
type ContextVariant = (typeof RUNS)[number]["contextVariant"];
type EvaluationOperation = (typeof REAL_AGENT_OPERATIONS)[number];
type RunId = (typeof RUNS)[number]["id"];
type TaskId = (typeof TASKS)[number]["id"];

interface AttemptPublicDefinition {
  agentSlot: AgentSlot;
  attemptId: string;
  contextDigest: string;
  contextPath: string;
  contextVariant: ContextVariant;
  inputArtifactHash: string;
  inputPath: string;
  operations: readonly EvaluationOperation[];
  outputArtifactPath: string;
  receiptPath: string;
  receiptTemplatePath: string;
  run: RunId;
  task: TaskId;
  taskPath: string;
}

export interface RealEvaluationAttempt {
  acceptedArtifacts: string[];
  context: string;
  expectedAnswer: Record<string, unknown>;
  inputArtifact: string;
  prompt: string;
  public: AttemptPublicDefinition;
}

interface ExecutionReceipt {
  agentSlot: string;
  kind: "authorized-external-agent" | "deterministic-test";
  model: string;
  provider: string;
  providerReceiptReference: string;
  sessionId: string;
}

interface SubmissionReceipt {
  answer: Record<string, unknown>;
  attemptId: string;
  boundary: { payloadEndBytes: number; payloadStartBytes: number };
  contextDigest: string;
  elapsedMs: number;
  execution: ExecutionReceipt;
  freshness: {
    inputAgentSummary: "absent" | "fresh" | "stale";
    inputManifest: "fresh" | "stale";
    inputStaticPreview: "absent" | "fresh" | "stale";
    outputAgentSummary: "absent" | "fresh" | "stale";
    outputManifest: "fresh" | "stale";
    outputStaticPreview: "absent" | "fresh" | "stale";
    staleDerivedDataClaimedCurrent: boolean;
  };
  inputArtifactHash: string;
  schema: "yeli/real-agent-eval-submission";
  schemaVersion: 1;
  usage: {
    cachedInputTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    source: "provider-reported" | "deterministic-test";
    totalTokens: number;
  };
  validation: { ok: boolean; performed: boolean };
}

export interface ByteRegion {
  after: { end: number; start: number };
  before: { end: number; start: number };
}

interface ScoredAttempt {
  agentSlot: AgentSlot;
  attemptId: string;
  boundary: {
    locationCorrect: boolean;
    payloadEndBytes?: number;
    payloadStartBytes?: number;
  };
  contextVariant: ContextVariant;
  elapsedMs?: number;
  errors: string[];
  execution?: ExecutionReceipt;
  freshness: {
    inputActual: Awaited<ReturnType<typeof getDocument>>["freshness"];
    outputActual?: Awaited<ReturnType<typeof getDocument>>["freshness"];
    reportMatches: boolean;
    staleClaimViolation: boolean;
  };
  operationResults: Record<EvaluationOperation, boolean | null>;
  oracleOk: boolean;
  receiptComplete: boolean;
  run: RunId;
  shellDrift: boolean;
  success: boolean;
  task: TaskId;
  touchedByteRegions: ByteRegion[];
  usage?: SubmissionReceipt["usage"];
  validation: { codes: string[]; ok: boolean; reportMatches: boolean };
}

export interface RealEvaluationReport {
  artifactHash: string;
  benchmarkVersion: number;
  client: "external-file-packet";
  contextComparison: Record<
    ContextVariant,
    {
      accuracy: number;
      attempts: number;
      elapsedMs: number;
      successes: number;
      totalTokens: number;
    }
  >;
  frozenThresholds: typeof FROZEN_THRESHOLDS;
  identityChecks: {
    distinctModels: boolean;
    consistentPerSlot: boolean;
    independentRuns: boolean;
  };
  mode: "score";
  operationCoverage: Record<EvaluationOperation, boolean>;
  releaseScoreClaimed: boolean;
  results: ScoredAttempt[];
  summary: {
    attempts: number;
    boundaryFailures: number;
    metricsComplete: boolean;
    perAgent: Record<AgentSlot, { attempts: number; successes: number }>;
    shellDrift: number;
    staleClaimViolations: number;
    successes: number;
    thresholdPassed: boolean;
  };
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function byteOffset(value: string, characterOffset: number): number {
  return utf8(value.slice(0, characterOffset)).byteLength;
}

export function touchedByteRegions(
  before: string,
  after: string,
): ByteRegion[] {
  const beforeBytes = utf8(before);
  const afterBytes = utf8(after);
  let prefix = 0;
  while (
    prefix < beforeBytes.length &&
    prefix < afterBytes.length &&
    beforeBytes[prefix] === afterBytes[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeBytes.length - prefix &&
    suffix < afterBytes.length - prefix &&
    beforeBytes[beforeBytes.length - 1 - suffix] ===
      afterBytes[afterBytes.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  if (prefix === beforeBytes.length && prefix === afterBytes.length) return [];
  return [
    {
      after: { end: afterBytes.length - suffix, start: prefix },
      before: { end: beforeBytes.length - suffix, start: prefix },
    },
  ];
}

function sourceFor(run: (typeof RUNS)[number], task: TaskId): string {
  const token = `${run.seed}-${task}`;
  return `---
title: "${run.label} Field Brief"
description: "Synthetic non-user release evaluation fixture"
tags: [benchmark, portable]
preserve-note: "preserve-${token}"
---
# ${run.label} Expedition

The verified observation is ${token}.

## Logistics ${run.label}

Handoff code: ${run.seed}-47.

Route state: pending-${token}.

- [ ] Confirm the ${run.label.toLocaleLowerCase("en-US")} window
- [x] Prepare the synthetic packet
`;
}

function replaceExactlyOnce(
  source: string,
  before: string,
  after: string,
): string {
  const first = source.indexOf(before);
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Synthetic benchmark marker is not unique: ${before}`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

async function canonicalArtifact(
  releaseArtifact: string,
  source: string,
  docId: string,
  revision = 7,
): Promise<string> {
  const payload = await createDocumentPayload(source, { docId, revision });
  return splicePayload(releaseArtifact, payload).artifact;
}

async function mutationArtifacts(
  inputArtifact: string,
  expectedSource: string,
): Promise<string[]> {
  const before = await getDocument(inputArtifact);
  const freshPayload = await createDocumentPayload(expectedSource, {
    assets: before.payload.assets,
    docId: before.docId,
    revision: before.revision + 1,
    settings: before.payload.settings,
  });
  const stalePayload = structuredClone(before.payload);
  stalePayload.markdown = encodeMarkdown(expectedSource);
  stalePayload.revision = before.revision + 1;
  return [
    splicePayload(inputArtifact, freshPayload).artifact,
    splicePayload(inputArtifact, stalePayload).artifact,
  ];
}

function attemptId(agentSlot: AgentSlot, run: RunId, task: TaskId): string {
  return `${agentSlot}/${run}/${task}`;
}

function taskPrompt(
  definition: AttemptPublicDefinition,
  title: string,
  details: string,
): string {
  return `# ${title}

This is a held-out synthetic YELI release-evaluation task. Work only from the
provided portable file, this task, and the provided context file. Do not use a
repository checkout, product source, credentials embedded in files, or a prior
task conversation. Never execute the HTML.

Use the supplied context for planning before opening the artifact. Open the
artifact only to locate, copy, or edit its payload after that plan; do not use
its persisted manifest as substitute planning context in the manifest-free run.

Input: \`${definition.inputPath}\`
Context: \`${definition.contextPath}\` (${definition.contextVariant})
Submission directory: \`${definition.receiptPath.slice(0, -"receipt.json".length)}\`
Receipt template: \`${definition.receiptTemplatePath}\`

${details}

For every task, copy or edit the complete artifact to \`result.yeli.html\` in
the submission directory and write \`receipt.json\` matching the supplied
schema. Keep every byte outside the unique YELI payload JSON body unchanged.
Report the output payload body's UTF-8 byte start/end offsets, provider-reported
token use and elapsed time, actual input/output manifest, Agent-summary, and
static-preview freshness, whether any stale derived field was claimed current,
and whether validation was performed.
The scorer independently checks the artifact, semantic result, boundary, shell,
freshness, and receipt. A payload edit must use canonical two-space JSON and
escape literal \`<\` characters as \`\\u003c\`.
`;
}

function detailsFor(
  run: (typeof RUNS)[number],
  task: (typeof TASKS)[number],
): {
  answer: Record<string, unknown>;
  details: string;
  expectedSource?: string;
} {
  const source = sourceFor(run, task.id);
  const token = `${run.seed}-${task.id}`;
  if (task.id === "inspect-summary") {
    return {
      answer: {
        firstHeading: `${run.label} Expedition`,
        openTaskCount: 1,
        summaryFacts: [
          `The verified observation is ${token}.`,
          `Handoff code: ${run.seed}-47.`,
        ],
        title: `${run.label} Field Brief`,
      },
      details: `Inspect current canonical Markdown without changing it. Return
\`answer.title\`, \`answer.firstHeading\`, \`answer.openTaskCount\`, and
\`answer.summaryFacts\` as the two exact source facts that begin with
"The verified observation" and "Handoff code". The result artifact must be
byte-identical to the input.`,
    };
  }
  if (task.id === "extract-replace") {
    const before = `pending-${token}`;
    const after = `approved-${token}`;
    return {
      answer: {
        extractedText: `Handoff code: ${run.seed}-47.`,
        replacementCount: 1,
      },
      details: `Extract the exact complete line beginning "Handoff code:" into
\`answer.extractedText\`. Replace exactly one \`${before}\` value with
\`${after}\`, report \`answer.replacementCount\` as 1, and treat the edit as
one logical mutation with revision incremented exactly once. Do not change any
other canonical source or payload field. You may either refresh the complete
manifest or leave the original manifest intact and accurately report it stale.`,
      expectedSource: replaceExactlyOnce(source, before, after),
    };
  }
  if (task.id === "heading-metadata-patch") {
    const oldHeading = `## Logistics ${run.label}`;
    const newHeading = `## Verified Logistics ${run.label}`;
    const oldTitle = `title: "${run.label} Field Brief"`;
    const newTitle = `title: "${run.label} Verified Brief"`;
    return {
      answer: { headingChanged: true, metadataChanged: true },
      details: `Change only the heading \`${oldHeading}\` to
\`${newHeading}\` and the YAML title to \`${run.label} Verified Brief\`.
Report both answer booleans as true and treat the two narrow patches as one
logical mutation with revision incremented exactly once. Preserve the unknown
\`preserve-note\` key and every other source/payload value. You may either
refresh the complete manifest or leave the original manifest intact and
accurately report it stale.`,
      expectedSource: replaceExactlyOnce(
        replaceExactlyOnce(source, oldHeading, newHeading),
        oldTitle,
        newTitle,
      ),
    };
  }
  return {
    answer: {
      inputManifestFreshness: "stale",
      outputManifestFreshness: "fresh",
      validationOk: true,
    },
    details: `The canonical Markdown was changed after its persisted manifest
was generated. Do not change Markdown, revision, identity, settings, or assets.
Recompute the entire deterministic manifest for the current source, then
validate the result. Report the three exact answer fields shown in the
receipt template: stale input freshness, fresh output freshness, and
\`validationOk: true\`.`,
  };
}

async function buildTaskVariant(
  releaseArtifact: string,
  agentSlot: AgentSlot,
  run: (typeof RUNS)[number],
  task: (typeof TASKS)[number],
): Promise<RealEvaluationAttempt> {
  const source = sourceFor(run, task.id);
  const docId = `yeli-eval-${run.id}-${task.id}`;
  const paths = attemptPaths(agentSlot, run, task);
  let inputArtifact: string;
  if (task.id === "refresh-validate") {
    const priorSource = source;
    const currentSource = replaceExactlyOnce(
      priorSource,
      `Route state: pending-${run.seed}-${task.id}.`,
      `Route state: confirmed-${run.seed}-${task.id}.`,
    );
    const priorPayload = await createDocumentPayload(priorSource, {
      docId,
      revision: 7,
    });
    priorPayload.markdown = encodeMarkdown(currentSource);
    inputArtifact = splicePayload(releaseArtifact, priorPayload).artifact;
  } else {
    inputArtifact = await canonicalArtifact(releaseArtifact, source, docId);
  }
  const input = await getDocument(inputArtifact);
  const context =
    run.contextVariant === "manifest-bearing"
      ? `${JSON.stringify(await preReadDocument(inputArtifact), null, 2)}\n`
      : input.markdown;
  const taskDetails = detailsFor(run, task);
  let acceptedArtifacts: string[];
  if (task.id === "inspect-summary") {
    acceptedArtifacts = [inputArtifact];
  } else if (task.id === "refresh-validate") {
    acceptedArtifacts = [
      await canonicalArtifact(
        releaseArtifact,
        input.markdown,
        input.docId,
        input.revision,
      ),
    ];
  } else {
    acceptedArtifacts = await mutationArtifacts(
      inputArtifact,
      taskDetails.expectedSource!,
    );
  }
  const publicDefinition: AttemptPublicDefinition = {
    agentSlot,
    attemptId: attemptId(agentSlot, run.id, task.id),
    contextDigest: sha256Fallback(context),
    contextPath: paths.contextPath,
    contextVariant: run.contextVariant,
    inputArtifactHash: sha256Fallback(inputArtifact),
    inputPath: paths.inputPath,
    operations: task.operations,
    outputArtifactPath: paths.outputArtifactPath,
    receiptPath: paths.receiptPath,
    receiptTemplatePath: paths.receiptTemplatePath,
    run: run.id,
    task: task.id,
    taskPath: paths.taskPath,
  };
  return {
    acceptedArtifacts,
    context,
    expectedAnswer: taskDetails.answer,
    inputArtifact,
    prompt: taskPrompt(publicDefinition, task.title, taskDetails.details),
    public: publicDefinition,
  };
}

function attemptPaths(
  agentSlot: AgentSlot,
  run: (typeof RUNS)[number],
  task: (typeof TASKS)[number],
): Pick<
  AttemptPublicDefinition,
  | "contextPath"
  | "inputPath"
  | "outputArtifactPath"
  | "receiptPath"
  | "receiptTemplatePath"
  | "taskPath"
> {
  const attemptRoot = `attempts/${agentSlot}/${run.id}/${task.id}`;
  const submissionRoot = `submissions/${agentSlot}/${run.id}/${task.id}`;
  return {
    contextPath: `${attemptRoot}/${
      run.contextVariant === "manifest-bearing" ? "context.json" : "context.md"
    }`,
    inputPath: `${attemptRoot}/input.yeli.html`,
    outputArtifactPath: `${submissionRoot}/result.yeli.html`,
    receiptPath: `${submissionRoot}/receipt.json`,
    receiptTemplatePath: `${attemptRoot}/receipt.template.json`,
    taskPath: `${attemptRoot}/TASK.md`,
  };
}

function copyAttemptForSlot(
  base: RealEvaluationAttempt,
  agentSlot: AgentSlot,
  run: (typeof RUNS)[number],
  task: (typeof TASKS)[number],
): RealEvaluationAttempt {
  const publicDefinition: AttemptPublicDefinition = {
    ...base.public,
    ...attemptPaths(agentSlot, run, task),
    agentSlot,
    attemptId: attemptId(agentSlot, run.id, task.id),
  };
  return {
    ...base,
    prompt: taskPrompt(
      publicDefinition,
      task.title,
      detailsFor(run, task).details,
    ),
    public: publicDefinition,
  };
}

export async function createRealEvaluationAttempts(
  releaseArtifact: string,
): Promise<RealEvaluationAttempt[]> {
  const validation = await validateDocument(releaseArtifact);
  if (!validation.ok)
    throw new Error("Real-Agent benchmark artifact is invalid");
  const attempts: RealEvaluationAttempt[] = [];
  for (const run of RUNS) {
    for (const task of TASKS) {
      const base = await buildTaskVariant(
        releaseArtifact,
        REAL_AGENT_SLOTS[0],
        run,
        task,
      );
      for (const agentSlot of REAL_AGENT_SLOTS) {
        attempts.push(
          agentSlot === base.public.agentSlot
            ? base
            : copyAttemptForSlot(base, agentSlot, run, task),
        );
      }
    }
  }
  if (attempts.length !== FROZEN_THRESHOLDS.attempts) {
    throw new Error("Real-Agent benchmark matrix no longer has 24 attempts");
  }
  return attempts;
}

function packetManifest(
  releaseArtifact: string,
  attempts: RealEvaluationAttempt[],
): Record<string, unknown> {
  return {
    schema: "yeli/real-agent-eval-packet",
    benchmarkVersion: REAL_AGENT_BENCHMARK_VERSION,
    artifactHash: sha256Fallback(releaseArtifact),
    syntheticNonUserData: true,
    invokesExternalModels: false,
    agents: REAL_AGENT_SLOTS.map((id) => ({ id })),
    runs: RUNS,
    advertisedOperations: REAL_AGENT_OPERATIONS,
    frozenThresholds: FROZEN_THRESHOLDS,
    attempts: attempts.map((attempt) => attempt.public),
  };
}

const SUBMISSION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  properties: {
    schema: { const: "yeli/real-agent-eval-submission" },
    schemaVersion: { const: 1 },
    attemptId: { minLength: 1, type: "string" },
    inputArtifactHash: { pattern: "^[a-f0-9]{64}$", type: "string" },
    contextDigest: { pattern: "^[a-f0-9]{64}$", type: "string" },
    elapsedMs: { exclusiveMinimum: 0, type: "number" },
    execution: {
      additionalProperties: false,
      properties: {
        agentSlot: { enum: REAL_AGENT_SLOTS },
        kind: {
          enum: ["authorized-external-agent", "deterministic-test"],
        },
        model: { minLength: 1, type: "string" },
        provider: { minLength: 1, type: "string" },
        providerReceiptReference: { minLength: 1, type: "string" },
        sessionId: { minLength: 1, type: "string" },
      },
      required: [
        "agentSlot",
        "kind",
        "model",
        "provider",
        "providerReceiptReference",
        "sessionId",
      ],
      type: "object",
    },
    usage: {
      additionalProperties: false,
      properties: {
        cachedInputTokens: { minimum: 0, type: "integer" },
        inputTokens: { minimum: 0, type: "integer" },
        outputTokens: { minimum: 0, type: "integer" },
        reasoningTokens: { minimum: 0, type: "integer" },
        source: { enum: ["provider-reported", "deterministic-test"] },
        totalTokens: { minimum: 0, type: "integer" },
      },
      required: ["source", "totalTokens"],
      type: "object",
    },
    boundary: {
      additionalProperties: false,
      properties: {
        payloadEndBytes: { minimum: 0, type: "integer" },
        payloadStartBytes: { minimum: 0, type: "integer" },
      },
      required: ["payloadStartBytes", "payloadEndBytes"],
      type: "object",
    },
    freshness: {
      additionalProperties: false,
      properties: {
        inputAgentSummary: { enum: ["absent", "fresh", "stale"] },
        inputManifest: { enum: ["fresh", "stale"] },
        inputStaticPreview: { enum: ["absent", "fresh", "stale"] },
        outputAgentSummary: { enum: ["absent", "fresh", "stale"] },
        outputManifest: { enum: ["fresh", "stale"] },
        outputStaticPreview: { enum: ["absent", "fresh", "stale"] },
        staleDerivedDataClaimedCurrent: { type: "boolean" },
      },
      required: [
        "inputAgentSummary",
        "inputManifest",
        "inputStaticPreview",
        "outputAgentSummary",
        "outputManifest",
        "outputStaticPreview",
        "staleDerivedDataClaimedCurrent",
      ],
      type: "object",
    },
    validation: {
      additionalProperties: false,
      properties: {
        ok: { type: "boolean" },
        performed: { const: true },
      },
      required: ["ok", "performed"],
      type: "object",
    },
    answer: { additionalProperties: true, type: "object" },
  },
  required: [
    "schema",
    "schemaVersion",
    "attemptId",
    "inputArtifactHash",
    "contextDigest",
    "elapsedMs",
    "execution",
    "usage",
    "boundary",
    "freshness",
    "validation",
    "answer",
  ],
  title: "YELI real-Agent evaluation submission",
  type: "object",
} as const;

function packetReadme(artifactHash: string): string {
  return `# YELI real-Agent evaluation packet

Benchmark version: ${REAL_AGENT_BENCHMARK_VERSION}
Release artifact SHA-256: ${artifactHash}

This directory contains 24 synthetic, non-user, file-only attempts: three Agent
slots, two independent runs per slot, and four task families per run. Assign one
authorized external model/Agent to each slot. Use a fresh provider run/session
for run-1 and run-2. Do not give an Agent the repository, source code, another
slot's results, or the scorer implementation.

The harness never launches a model or reads credentials. The operator supplies
each attempt directory and records the resulting artifact plus receipt under
the matching \`submissions/\` directory. Keep raw provider receipts outside the
repository and reference them from each receipt JSON. Run the score mode only
after all 24 attempts are present.
`;
}

function writeExclusive(path: string, content: string, mode = 0o600): void {
  writeFileSync(path, content, { encoding: "utf8", flag: "wx", mode });
  chmodSync(path, mode);
}

function receiptTemplate(
  attempt: RealEvaluationAttempt,
): Record<string, unknown> {
  return {
    schema: "yeli/real-agent-eval-submission",
    schemaVersion: 1,
    attemptId: attempt.public.attemptId,
    inputArtifactHash: attempt.public.inputArtifactHash,
    contextDigest: attempt.public.contextDigest,
    elapsedMs: null,
    execution: {
      agentSlot: attempt.public.agentSlot,
      kind: "authorized-external-agent",
      model: "",
      provider: "",
      providerReceiptReference: "",
      sessionId: "",
    },
    usage: { source: "provider-reported", totalTokens: null },
    boundary: { payloadStartBytes: null, payloadEndBytes: null },
    freshness: {
      inputAgentSummary: null,
      inputManifest: null,
      inputStaticPreview: null,
      outputAgentSummary: null,
      outputManifest: null,
      outputStaticPreview: null,
      staleDerivedDataClaimedCurrent: null,
    },
    validation: { ok: null, performed: null },
    answer: Object.fromEntries(
      Object.keys(attempt.expectedAnswer).map((key) => [key, null]),
    ),
  };
}

export async function prepareRealAgentEvaluation(
  releaseArtifact: string,
  outputDirectory: string,
): Promise<{
  artifactHash: string;
  attempts: number;
  outputDirectory: string;
}> {
  const root = resolve(outputDirectory);
  try {
    mkdirSync(root, { mode: 0o700, recursive: false });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      throw new Error(
        `Refusing to replace existing evaluation directory ${root}`,
      );
    }
    throw error;
  }
  try {
    const attempts = await createRealEvaluationAttempts(releaseArtifact);
    const manifest = packetManifest(releaseArtifact, attempts);
    const artifactHash = sha256Fallback(releaseArtifact);
    writeExclusive(
      join(root, "benchmark.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      0o400,
    );
    writeExclusive(join(root, "README.md"), packetReadme(artifactHash), 0o400);
    writeExclusive(
      join(root, "submission.schema.json"),
      `${JSON.stringify(SUBMISSION_SCHEMA, null, 2)}\n`,
      0o400,
    );
    for (const attempt of attempts) {
      const attemptDirectory = join(
        root,
        "attempts",
        attempt.public.agentSlot,
        attempt.public.run,
        attempt.public.task,
      );
      const submissionDirectory = join(
        root,
        "submissions",
        attempt.public.agentSlot,
        attempt.public.run,
        attempt.public.task,
      );
      mkdirSync(attemptDirectory, { mode: 0o700, recursive: true });
      mkdirSync(submissionDirectory, { mode: 0o700, recursive: true });
      writeExclusive(
        join(root, attempt.public.inputPath),
        attempt.inputArtifact,
        0o400,
      );
      writeExclusive(
        join(root, attempt.public.contextPath),
        attempt.context,
        0o400,
      );
      writeExclusive(
        join(root, attempt.public.taskPath),
        attempt.prompt,
        0o400,
      );
      writeExclusive(
        join(root, attempt.public.receiptTemplatePath),
        `${JSON.stringify(receiptTemplate(attempt), null, 2)}\n`,
        0o400,
      );
    }
    return { artifactHash, attempts: attempts.length, outputDirectory: root };
  } catch (error) {
    rmSync(root, { force: true, recursive: true });
    throw error;
  }
}

function readRegularFile(path: string, maxBytes: number): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Expected a regular file: ${path}`);
  }
  if (stat.size > maxBytes) {
    throw new Error(`File exceeds the evaluation byte budget: ${path}`);
  }
  return readFileSync(path, "utf8");
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return finiteNonnegative(value) && Number.isInteger(value);
}

function isStringMember<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return typeof value === "string" && values.includes(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const expected = new Set(keys);
  return Object.keys(value).every((key) => expected.has(key));
}

function parseReceipt(value: unknown): SubmissionReceipt | null {
  if (typeof value !== "object" || value === null) return null;
  const receipt = value as Record<string, unknown>;
  const execution = receipt.execution as Record<string, unknown> | undefined;
  const usage = receipt.usage as Record<string, unknown> | undefined;
  const boundary = receipt.boundary as Record<string, unknown> | undefined;
  const freshness = receipt.freshness as Record<string, unknown> | undefined;
  const validation = receipt.validation as Record<string, unknown> | undefined;
  const answer = receipt.answer;
  const optionalUsage = [
    usage?.cachedInputTokens,
    usage?.inputTokens,
    usage?.outputTokens,
    usage?.reasoningTokens,
  ];
  if (
    !hasOnlyKeys(receipt, [
      "schema",
      "schemaVersion",
      "attemptId",
      "inputArtifactHash",
      "contextDigest",
      "elapsedMs",
      "execution",
      "usage",
      "boundary",
      "freshness",
      "validation",
      "answer",
    ]) ||
    receipt.schema !== "yeli/real-agent-eval-submission" ||
    receipt.schemaVersion !== 1 ||
    typeof receipt.attemptId !== "string" ||
    typeof receipt.inputArtifactHash !== "string" ||
    typeof receipt.contextDigest !== "string" ||
    !finiteNonnegative(receipt.elapsedMs) ||
    receipt.elapsedMs === 0 ||
    !execution ||
    !hasOnlyKeys(execution, [
      "agentSlot",
      "kind",
      "model",
      "provider",
      "providerReceiptReference",
      "sessionId",
    ]) ||
    typeof execution.agentSlot !== "string" ||
    !isStringMember(execution.kind, [
      "authorized-external-agent",
      "deterministic-test",
    ]) ||
    typeof execution.model !== "string" ||
    execution.model.trim().length === 0 ||
    typeof execution.provider !== "string" ||
    execution.provider.trim().length === 0 ||
    typeof execution.providerReceiptReference !== "string" ||
    execution.providerReceiptReference.trim().length === 0 ||
    typeof execution.sessionId !== "string" ||
    execution.sessionId.trim().length === 0 ||
    !usage ||
    !hasOnlyKeys(usage, [
      "source",
      "totalTokens",
      "cachedInputTokens",
      "inputTokens",
      "outputTokens",
      "reasoningTokens",
    ]) ||
    !isStringMember(usage.source, [
      "provider-reported",
      "deterministic-test",
    ]) ||
    !nonnegativeInteger(usage.totalTokens) ||
    !optionalUsage.every(
      (item) => item === undefined || nonnegativeInteger(item),
    ) ||
    !boundary ||
    !hasOnlyKeys(boundary, ["payloadStartBytes", "payloadEndBytes"]) ||
    !nonnegativeInteger(boundary.payloadStartBytes) ||
    !nonnegativeInteger(boundary.payloadEndBytes) ||
    !freshness ||
    !hasOnlyKeys(freshness, [
      "inputAgentSummary",
      "inputManifest",
      "inputStaticPreview",
      "outputAgentSummary",
      "outputManifest",
      "outputStaticPreview",
      "staleDerivedDataClaimedCurrent",
    ]) ||
    !isStringMember(freshness.inputAgentSummary, [
      "absent",
      "fresh",
      "stale",
    ]) ||
    !isStringMember(freshness.inputManifest, ["fresh", "stale"]) ||
    !isStringMember(freshness.inputStaticPreview, [
      "absent",
      "fresh",
      "stale",
    ]) ||
    !isStringMember(freshness.outputAgentSummary, [
      "absent",
      "fresh",
      "stale",
    ]) ||
    !isStringMember(freshness.outputManifest, ["fresh", "stale"]) ||
    !isStringMember(freshness.outputStaticPreview, [
      "absent",
      "fresh",
      "stale",
    ]) ||
    typeof freshness.staleDerivedDataClaimedCurrent !== "boolean" ||
    !validation ||
    !hasOnlyKeys(validation, ["ok", "performed"]) ||
    typeof validation.ok !== "boolean" ||
    validation.performed !== true ||
    typeof answer !== "object" ||
    answer === null ||
    Array.isArray(answer)
  ) {
    return null;
  }
  return value as SubmissionReceipt;
}

function emptyOperationResults(): Record<EvaluationOperation, boolean | null> {
  return Object.fromEntries(
    REAL_AGENT_OPERATIONS.map((operation) => [operation, null]),
  ) as Record<EvaluationOperation, boolean | null>;
}

async function scoreAttempt(
  root: string,
  attempt: RealEvaluationAttempt,
): Promise<ScoredAttempt> {
  const input = await getDocument(attempt.inputArtifact);
  const errors: string[] = [];
  let receipt: SubmissionReceipt | null = null;
  let outputArtifact = "";
  try {
    receipt = parseReceipt(
      JSON.parse(
        readRegularFile(
          join(root, attempt.public.receiptPath),
          REAL_AGENT_METADATA_MAX_BYTES,
        ),
      ) as unknown,
    );
    if (!receipt) errors.push("RECEIPT_INVALID");
  } catch {
    errors.push("RECEIPT_UNAVAILABLE");
  }
  try {
    outputArtifact = readRegularFile(
      join(root, attempt.public.outputArtifactPath),
      DEFAULT_FORMAT_BUDGETS.maxFileBytes,
    );
  } catch {
    errors.push("OUTPUT_UNAVAILABLE");
  }

  let output: Awaited<ReturnType<typeof getDocument>> | undefined;
  let parsed:
    | Extract<Awaited<ReturnType<typeof parseYeliArtifact>>, { ok: true }>
    | undefined;
  let validation = { codes: [] as string[], ok: false, reportMatches: false };
  let shellDrift = true;
  let locationCorrect = false;
  let payloadStartBytes: number | undefined;
  let payloadEndBytes: number | undefined;
  if (outputArtifact) {
    const parsedResult = await parseYeliArtifact(outputArtifact);
    if (parsedResult.ok) {
      parsed = parsedResult;
      output = await getDocument(outputArtifact);
      payloadStartBytes = byteOffset(
        outputArtifact,
        parsed.boundary.payloadStart,
      );
      payloadEndBytes = byteOffset(outputArtifact, parsed.boundary.payloadEnd);
      locationCorrect =
        receipt?.boundary.payloadStartBytes === payloadStartBytes &&
        receipt.boundary.payloadEndBytes === payloadEndBytes;
      const original = await parseYeliArtifact(attempt.inputArtifact);
      shellDrift =
        !original.ok ||
        sha256Fallback(original.boundary.prefix) !==
          sha256Fallback(parsed.boundary.prefix) ||
        sha256Fallback(original.boundary.suffix) !==
          sha256Fallback(parsed.boundary.suffix);
      const actualValidation = await validateDocument(outputArtifact);
      validation = {
        codes: actualValidation.findings.map((finding) => finding.code),
        ok: actualValidation.ok,
        reportMatches:
          receipt?.validation.performed === true &&
          receipt.validation.ok === actualValidation.ok,
      };
    } else {
      errors.push("OUTPUT_INVALID");
    }
  }

  const identityMatches =
    receipt?.attemptId === attempt.public.attemptId &&
    receipt.inputArtifactHash === attempt.public.inputArtifactHash &&
    receipt.contextDigest === attempt.public.contextDigest &&
    receipt.execution.agentSlot === attempt.public.agentSlot;
  if (!identityMatches) errors.push("RECEIPT_IDENTITY_MISMATCH");
  if (!locationCorrect) errors.push("BOUNDARY_LOCATION_INCORRECT");
  if (shellDrift) errors.push("SHELL_DRIFT");

  const outputFreshness = output?.freshness;
  const reportMatches =
    receipt?.freshness.inputManifest === input.freshness.manifest &&
    receipt.freshness.inputAgentSummary === input.freshness.agentSummary &&
    receipt.freshness.inputStaticPreview === input.freshness.staticPreview &&
    receipt.freshness.outputManifest === outputFreshness?.manifest &&
    receipt.freshness.outputAgentSummary === outputFreshness?.agentSummary &&
    receipt.freshness.outputStaticPreview === outputFreshness?.staticPreview;
  const staleClaimViolation =
    receipt?.freshness.staleDerivedDataClaimedCurrent === true ||
    (input.freshness.manifest === "stale" &&
      receipt?.freshness.inputManifest !== "stale") ||
    (input.freshness.agentSummary === "stale" &&
      receipt?.freshness.inputAgentSummary !== "stale") ||
    (input.freshness.staticPreview === "stale" &&
      receipt?.freshness.inputStaticPreview !== "stale") ||
    (outputFreshness?.manifest === "stale" &&
      receipt?.freshness.outputManifest !== "stale") ||
    (outputFreshness?.agentSummary === "stale" &&
      receipt?.freshness.outputAgentSummary !== "stale") ||
    (outputFreshness?.staticPreview === "stale" &&
      receipt?.freshness.outputStaticPreview !== "stale");
  if (!reportMatches) errors.push("FRESHNESS_REPORT_MISMATCH");
  if (staleClaimViolation) errors.push("STALE_DATA_CLAIMED_CURRENT");
  if (!validation.reportMatches) errors.push("VALIDATION_RECEIPT_MISMATCH");

  const artifactOracle = attempt.acceptedArtifacts.includes(outputArtifact);
  const answerOracle = isDeepStrictEqual(
    receipt?.answer,
    attempt.expectedAnswer,
  );
  const oracleOk = artifactOracle && answerOracle;
  if (!artifactOracle) errors.push("ARTIFACT_ORACLE_MISMATCH");
  if (!answerOracle) errors.push("ANSWER_ORACLE_MISMATCH");

  const receiptComplete = Boolean(receipt && identityMatches);
  const success =
    receiptComplete &&
    oracleOk &&
    locationCorrect &&
    !shellDrift &&
    reportMatches &&
    !staleClaimViolation &&
    validation.ok &&
    validation.reportMatches;
  const operationResults = emptyOperationResults();
  for (const operation of attempt.public.operations) {
    operationResults[operation] = success;
  }
  return {
    agentSlot: attempt.public.agentSlot,
    attemptId: attempt.public.attemptId,
    boundary: {
      locationCorrect,
      ...(payloadStartBytes === undefined ? {} : { payloadStartBytes }),
      ...(payloadEndBytes === undefined ? {} : { payloadEndBytes }),
    },
    contextVariant: attempt.public.contextVariant,
    ...(receipt
      ? { elapsedMs: receipt.elapsedMs, execution: receipt.execution }
      : {}),
    errors: [...new Set(errors)],
    freshness: {
      inputActual: input.freshness,
      ...(outputFreshness ? { outputActual: outputFreshness } : {}),
      reportMatches,
      staleClaimViolation,
    },
    operationResults,
    oracleOk,
    receiptComplete,
    run: attempt.public.run,
    shellDrift,
    success,
    task: attempt.public.task,
    touchedByteRegions: outputArtifact
      ? touchedByteRegions(attempt.inputArtifact, outputArtifact)
      : [],
    ...(receipt ? { usage: receipt.usage } : {}),
    validation,
  };
}

function identityChecks(
  results: ScoredAttempt[],
): RealEvaluationReport["identityChecks"] {
  let consistentPerSlot = true;
  const identities = new Set<string>();
  let independentRuns = true;
  for (const slot of REAL_AGENT_SLOTS) {
    const slotResults = results.filter((result) => result.agentSlot === slot);
    const slotIdentities = new Set(
      slotResults
        .filter((result) => result.execution)
        .map(
          (result) =>
            `${result.execution!.provider.trim()}\u0000${result.execution!.model.trim()}`,
        ),
    );
    if (slotResults.length !== 8 || slotIdentities.size !== 1) {
      consistentPerSlot = false;
    }
    for (const identity of slotIdentities) identities.add(identity);
    const first = new Set(
      slotResults
        .filter((result) => result.run === "run-1" && result.execution)
        .map((result) => result.execution!.sessionId),
    );
    const second = new Set(
      slotResults
        .filter((result) => result.run === "run-2" && result.execution)
        .map((result) => result.execution!.sessionId),
    );
    if (
      first.size === 0 ||
      second.size === 0 ||
      [...first].some((session) => second.has(session))
    ) {
      independentRuns = false;
    }
  }
  return {
    consistentPerSlot,
    distinctModels: identities.size === REAL_AGENT_SLOTS.length,
    independentRuns,
  };
}

function contextComparison(
  results: ScoredAttempt[],
): RealEvaluationReport["contextComparison"] {
  return Object.fromEntries(
    RUNS.map((run) => {
      const selected = results.filter(
        (result) => result.contextVariant === run.contextVariant,
      );
      const successes = selected.filter((result) => result.success).length;
      return [
        run.contextVariant,
        {
          accuracy: selected.length === 0 ? 0 : successes / selected.length,
          attempts: selected.length,
          elapsedMs: selected.reduce(
            (total, result) => total + (result.elapsedMs ?? 0),
            0,
          ),
          successes,
          totalTokens: selected.reduce(
            (total, result) => total + (result.usage?.totalTokens ?? 0),
            0,
          ),
        },
      ];
    }),
  ) as RealEvaluationReport["contextComparison"];
}

export async function scoreRealAgentEvaluation(
  releaseArtifact: string,
  evaluationDirectory: string,
  confirmAuthorizedRealAgents: boolean,
): Promise<RealEvaluationReport> {
  const root = resolve(evaluationDirectory);
  const attempts = await createRealEvaluationAttempts(releaseArtifact);
  const expectedManifest = packetManifest(releaseArtifact, attempts);
  const actualManifest = JSON.parse(
    readRegularFile(
      join(root, "benchmark.json"),
      REAL_AGENT_METADATA_MAX_BYTES,
    ),
  ) as unknown;
  if (!isDeepStrictEqual(actualManifest, expectedManifest)) {
    throw new Error(
      "Evaluation packet does not match the benchmark definition and release artifact",
    );
  }
  const results: ScoredAttempt[] = [];
  for (const attempt of attempts) {
    results.push(await scoreAttempt(root, attempt));
  }
  const perAgent = Object.fromEntries(
    REAL_AGENT_SLOTS.map((slot) => {
      const selected = results.filter((result) => result.agentSlot === slot);
      return [
        slot,
        {
          attempts: selected.length,
          successes: selected.filter((result) => result.success).length,
        },
      ];
    }),
  ) as RealEvaluationReport["summary"]["perAgent"];
  const operationCoverage = Object.fromEntries(
    REAL_AGENT_OPERATIONS.map((operation) => [
      operation,
      results.some((result) => result.operationResults[operation] === true),
    ]),
  ) as Record<EvaluationOperation, boolean>;
  const identities = identityChecks(results);
  const successes = results.filter((result) => result.success).length;
  const boundaryFailures = results.filter(
    (result) => !result.boundary.locationCorrect,
  ).length;
  const shellDrift = results.filter((result) => result.shellDrift).length;
  const staleClaimViolations = results.filter(
    (result) => result.freshness.staleClaimViolation,
  ).length;
  const metricsComplete = results.every(
    (result) =>
      result.receiptComplete &&
      result.elapsedMs !== undefined &&
      result.elapsedMs > 0 &&
      result.usage !== undefined &&
      result.usage.totalTokens >= 0,
  );
  const thresholdPassed =
    results.length === FROZEN_THRESHOLDS.attempts &&
    successes >= FROZEN_THRESHOLDS.aggregateSuccesses &&
    REAL_AGENT_SLOTS.every(
      (slot) => perAgent[slot].successes >= FROZEN_THRESHOLDS.perAgentSuccesses,
    ) &&
    Object.values(operationCoverage).every(Boolean) &&
    boundaryFailures ===
      results.length * (1 - FROZEN_THRESHOLDS.boundaryLocationRate) &&
    shellDrift === FROZEN_THRESHOLDS.shellDrift &&
    staleClaimViolations === FROZEN_THRESHOLDS.staleClaims &&
    metricsComplete &&
    identities.consistentPerSlot &&
    identities.distinctModels &&
    identities.independentRuns;
  const allAuthorizedExternal = results.every(
    (result) =>
      result.execution?.kind === "authorized-external-agent" &&
      result.usage?.source === "provider-reported",
  );
  return {
    artifactHash: sha256Fallback(releaseArtifact),
    benchmarkVersion: REAL_AGENT_BENCHMARK_VERSION,
    client: "external-file-packet",
    contextComparison: contextComparison(results),
    frozenThresholds: FROZEN_THRESHOLDS,
    identityChecks: identities,
    mode: "score",
    operationCoverage,
    releaseScoreClaimed:
      thresholdPassed && confirmAuthorizedRealAgents && allAuthorizedExternal,
    results,
    summary: {
      attempts: results.length,
      boundaryFailures,
      metricsComplete,
      perAgent,
      shellDrift,
      staleClaimViolations,
      successes,
      thresholdPassed,
    },
  };
}
