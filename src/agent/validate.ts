import { indexFrontmatter } from "../document/frontmatter.ts";
import {
  resolveDerivedFreshness,
  type DerivedFreshness,
} from "../document/freshness.ts";
import {
  createDocumentPayload,
  decodeMarkdown,
  type YeliDocumentPayload,
  type JsonValue,
  type ValidationFinding,
} from "../document/model.ts";
import {
  resolveFormatBudgets,
  validatePayloadSchema,
  type FormatBudgets,
} from "../document/schema.ts";
import { validateAssets } from "../format/assets.ts";
import { parseYeliArtifact } from "../format/parse.ts";
import { splicePayload, type ShellHashReceipt } from "../format/serialize.ts";
import { sourceDiffRange } from "../editor/source-ranges.ts";

export interface PayloadValidationResult {
  findings: ValidationFinding[];
  freshness?: DerivedFreshness;
  ok: boolean;
  payload?: YeliDocumentPayload;
}

export interface AgentChangeAttribution {
  changeSummary: string;
  updatedAt?: string;
  updatedBy: string;
}

function finding(
  code: string,
  message: string,
  path: string,
  severity: "error" | "warning" = "error",
): ValidationFinding {
  return { code, message, path, severity };
}

const KNOWN_TOP_LEVEL_FIELDS = new Set([
  "format",
  "version",
  "docId",
  "revision",
  "manifest",
  "markdown",
  "agentSummary",
  "settings",
  "assets",
]);

export async function validateYeliPayload(
  input: unknown,
  budgetOverrides: Partial<FormatBudgets> = {},
): Promise<PayloadValidationResult> {
  const budgets = resolveFormatBudgets(budgetOverrides);
  const schema = validatePayloadSchema(input, budgets);
  if (!schema.payload) return { findings: schema.findings, ok: false };
  const payload = schema.payload;
  const freshness = await resolveDerivedFreshness(payload);
  const currentProjection = {
    ...payload,
    manifest: freshness.manifest.value,
  };
  const findings = [
    ...schema.findings,
    ...validateAssets(currentProjection, budgets),
  ];
  const source = decodeMarkdown(payload.markdown);
  const frontmatter = indexFrontmatter(source);
  findings.push(
    ...frontmatter.findings.map((item) => ({
      ...item,
      severity: "warning" as const,
    })),
  );

  const rawHtml = /<\/?[A-Za-z][^>]*>/gu;
  if (rawHtml.test(source)) {
    findings.push(
      finding(
        "RAW_HTML_UNSAFE",
        "Raw HTML is disabled and remains inert source text",
        "$.markdown",
        "warning",
      ),
    );
  }
  const unsafeUrl = /\]\(\s*(?:javascript|vbscript|data):/iu;
  if (unsafeUrl.test(source)) {
    findings.push(
      finding(
        "URL_UNSAFE",
        "Markdown contains a URL protocol that the renderer must block",
        "$.markdown",
        "warning",
      ),
    );
  }

  const anchors = new Set<string>();
  for (
    let index = 0;
    index < freshness.manifest.value.headings.length;
    index += 1
  ) {
    const heading = freshness.manifest.value.headings[index]!;
    if (anchors.has(heading.anchor)) {
      findings.push(
        finding(
          "ANCHOR_DUPLICATE",
          `Manifest anchor ${heading.anchor} appears more than once`,
          `$.manifest.headings[${index}].anchor`,
        ),
      );
    }
    anchors.add(heading.anchor);
  }

  if (freshness.manifest.status === "stale") {
    findings.push(
      finding(
        "MANIFEST_STALE",
        "Persisted manifest is stale and must not be used as current truth",
        "$.manifest",
        "warning",
      ),
    );
  }
  if (freshness.agentSummary.status === "stale") {
    findings.push(
      finding(
        "AGENT_SUMMARY_STALE",
        "External Agent summary is inspectable but stale",
        "$.agentSummary",
        "warning",
      ),
    );
  }
  for (const key of Object.keys(payload)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.has(key)) {
      findings.push(
        finding(
          "UNKNOWN_FIELD_PRESERVED",
          `Unknown safe field ${key} is preserved for additive compatibility`,
          `$.${key}`,
          "warning",
        ),
      );
    }
  }

  return {
    findings,
    freshness,
    ok: !findings.some((item) => item.severity === "error"),
    payload,
  };
}

export async function validateYeliArtifact(
  artifact: string,
  budgetOverrides: Partial<FormatBudgets> = {},
): Promise<PayloadValidationResult> {
  const parsed = await parseYeliArtifact(artifact, budgetOverrides);
  if (!parsed.ok) return { findings: parsed.findings, ok: false };
  return validateYeliPayload(parsed.payload, budgetOverrides);
}

export interface MutationExpectation {
  expectedRevision?: number;
  expectedSourceHash?: string;
}

export interface MutationReceipt {
  changedCharacters: {
    after: [number, number];
    before: [number, number];
  };
  changedLines: {
    deleteCount: number;
    insertedCount: number;
    startLine: number;
  };
  ok: true;
  revision: number;
  shell: {
    markerCount: number;
    prefixAfter: string;
    prefixBefore: string;
    stable: boolean;
    suffixAfter: string;
    suffixBefore: string;
  };
  sourceHash: string;
}

export interface MutationResult {
  artifact: string;
  receipt: MutationReceipt;
}

export class YeliOperationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "YeliOperationError";
    this.code = code;
  }
}

function assertExpectation(
  payload: YeliDocumentPayload,
  actualSourceHash: string,
  expectation: MutationExpectation,
): void {
  if (
    expectation.expectedRevision === undefined &&
    expectation.expectedSourceHash === undefined
  ) {
    throw new YeliOperationError(
      "EXPECTATION_REQUIRED",
      "Mutation requires expectedRevision or expectedSourceHash",
    );
  }
  if (
    expectation.expectedRevision !== undefined &&
    expectation.expectedRevision !== payload.revision
  ) {
    throw new YeliOperationError(
      "REVISION_MISMATCH",
      `Expected revision ${expectation.expectedRevision}; found ${payload.revision}`,
    );
  }
  if (
    expectation.expectedSourceHash !== undefined &&
    expectation.expectedSourceHash !== actualSourceHash
  ) {
    throw new YeliOperationError(
      "SOURCE_HASH_MISMATCH",
      `Expected sourceHash ${expectation.expectedSourceHash}; found ${actualSourceHash}`,
    );
  }
}

function copyUnknownFields(
  source: YeliDocumentPayload,
  target: YeliDocumentPayload,
): void {
  const record = source as unknown as Record<string, JsonValue>;
  for (const key of Object.keys(record).sort()) {
    if (KNOWN_TOP_LEVEL_FIELDS.has(key)) continue;
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: record[key],
    });
  }
}

function shellReceipt(receipt: ShellHashReceipt): MutationReceipt["shell"] {
  return {
    markerCount: receipt.markerCount,
    prefixBefore: receipt.prefix.before,
    prefixAfter: receipt.prefix.after,
    suffixBefore: receipt.suffix.before,
    suffixAfter: receipt.suffix.after,
    stable: receipt.shellStable,
  };
}

function materializedLineCount(source: string): number {
  if (source.length === 0) return 0;
  const newlineCount = source.match(/\n/gu)?.length ?? 0;
  return source.endsWith("\n") ? newlineCount : newlineCount + 1;
}

function changedCharacterRange(
  before: string,
  after: string,
): MutationReceipt["changedCharacters"] {
  const changed = sourceDiffRange(before, after);
  if (!changed) {
    return {
      before: [before.length, before.length],
      after: [after.length, after.length],
    };
  }
  return {
    before: [changed.before.from, changed.before.to],
    after: [changed.after.from, changed.after.to],
  };
}

export async function replaceArtifactMarkdown(
  artifact: string,
  source: string,
  expectation: MutationExpectation,
  attribution?: AgentChangeAttribution,
): Promise<MutationResult> {
  const parsed = await parseYeliArtifact(artifact);
  if (!parsed.ok) {
    throw new YeliOperationError(
      "ARTIFACT_INVALID",
      parsed.findings.map((item) => item.message).join("; "),
    );
  }
  assertExpectation(parsed.payload, parsed.freshness.sourceHash, expectation);
  const updated = await createDocumentPayload(source, {
    docId: parsed.payload.docId,
    revision: parsed.payload.revision + 1,
    settings: parsed.payload.settings,
    assets: parsed.payload.assets,
    ...(!attribution && parsed.payload.agentSummary
      ? { agentSummary: parsed.payload.agentSummary }
      : {}),
  });
  if (attribution) {
    updated.agentSummary = {
      changeSummary: attribution.changeSummary,
      content: attribution.changeSummary,
      sourceHash: updated.manifest.sourceHash,
      updatedAt: attribution.updatedAt ?? new Date().toISOString(),
      updatedBy: attribution.updatedBy,
    };
  }
  copyUnknownFields(parsed.payload, updated);
  const spliced = splicePayload(artifact, updated);
  const validation = await validateYeliArtifact(spliced.artifact);
  if (!validation.ok) {
    throw new YeliOperationError(
      "UPDATED_ARTIFACT_INVALID",
      validation.findings
        .filter((item) => item.severity === "error")
        .map((item) => item.code)
        .join(", "),
    );
  }
  const previousLines = materializedLineCount(parsed.markdown);
  const insertedLines = materializedLineCount(decodeMarkdown(updated.markdown));
  return {
    artifact: spliced.artifact,
    receipt: {
      changedCharacters: changedCharacterRange(
        parsed.markdown,
        decodeMarkdown(updated.markdown),
      ),
      changedLines: {
        startLine: 1,
        deleteCount: previousLines,
        insertedCount: insertedLines,
      },
      ok: true,
      revision: updated.revision,
      shell: shellReceipt(spliced.receipt),
      sourceHash: updated.manifest.sourceHash,
    },
  };
}

export interface LinePatch {
  deleteCount: number;
  insertLines: string[];
  startLine: number;
}

export async function patchArtifactLines(
  artifact: string,
  patch: LinePatch,
  expectation: MutationExpectation,
  attribution?: AgentChangeAttribution,
): Promise<MutationResult> {
  const parsed = await parseYeliArtifact(artifact);
  if (!parsed.ok) {
    throw new YeliOperationError(
      "ARTIFACT_INVALID",
      "Cannot patch invalid artifact",
    );
  }
  const encoding = parsed.payload.markdown;
  if (
    !Number.isSafeInteger(patch.startLine) ||
    patch.startLine < 1 ||
    patch.startLine > encoding.lines.length + 1 ||
    !Number.isSafeInteger(patch.deleteCount) ||
    patch.deleteCount < 0 ||
    patch.startLine - 1 + patch.deleteCount > encoding.lines.length ||
    patch.insertLines.some((line) => /[\r\n]/u.test(line))
  ) {
    throw new YeliOperationError(
      "LINE_PATCH_INVALID",
      "Line patch is out of range",
    );
  }
  const lines = [...encoding.lines];
  lines.splice(patch.startLine - 1, patch.deleteCount, ...patch.insertLines);
  const source = `${lines.join("\n")}${encoding.finalNewline ? "\n" : ""}`;
  const result = await replaceArtifactMarkdown(
    artifact,
    source,
    expectation,
    attribution,
  );
  result.receipt.changedLines = {
    startLine: patch.startLine,
    deleteCount: patch.deleteCount,
    insertedCount: patch.insertLines.length,
  };
  return result;
}

export async function refreshArtifact(
  artifact: string,
  expectation: MutationExpectation,
): Promise<MutationResult> {
  const parsed = await parseYeliArtifact(artifact);
  if (!parsed.ok) {
    throw new YeliOperationError(
      "ARTIFACT_INVALID",
      "Cannot refresh invalid artifact",
    );
  }
  assertExpectation(parsed.payload, parsed.freshness.sourceHash, expectation);
  const refreshed = await createDocumentPayload(parsed.markdown, {
    docId: parsed.payload.docId,
    revision: parsed.payload.revision,
    settings: parsed.payload.settings,
    assets: parsed.payload.assets,
    ...(parsed.payload.agentSummary
      ? { agentSummary: parsed.payload.agentSummary }
      : {}),
  });
  copyUnknownFields(parsed.payload, refreshed);
  const spliced = splicePayload(artifact, refreshed);
  const validation = await validateYeliArtifact(spliced.artifact);
  if (!validation.ok) {
    throw new YeliOperationError(
      "UPDATED_ARTIFACT_INVALID",
      validation.findings
        .filter((item) => item.severity === "error")
        .map((item) => item.code)
        .join(", "),
    );
  }
  return {
    artifact: spliced.artifact,
    receipt: {
      changedCharacters: { before: [0, 0], after: [0, 0] },
      changedLines: { startLine: 1, deleteCount: 0, insertedCount: 0 },
      ok: true,
      revision: refreshed.revision,
      shell: shellReceipt(spliced.receipt),
      sourceHash: refreshed.manifest.sourceHash,
    },
  };
}

export async function inspectYeliArtifact(artifact: string): Promise<{
  findings: ValidationFinding[];
  manifest?: YeliDocumentPayload["manifest"];
  markdown?: YeliDocumentPayload["markdown"];
  ok: boolean;
  revision?: number;
  sourceHash?: string;
  summaryStatus?: "absent" | "fresh" | "stale";
}> {
  const parsed = await parseYeliArtifact(artifact);
  if (!parsed.ok) return { findings: parsed.findings, ok: false };
  const validation = await validateYeliPayload(parsed.payload);
  return {
    findings: validation.findings,
    manifest: parsed.freshness.manifest.value,
    markdown: parsed.payload.markdown,
    ok: validation.ok,
    revision: parsed.payload.revision,
    sourceHash: parsed.freshness.sourceHash,
    summaryStatus: parsed.freshness.agentSummary.status,
  };
}
