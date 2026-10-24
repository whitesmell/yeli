import {
  CORE_METADATA_KEYS,
  patchFrontmatter,
  type CoreMetadataKey,
  type CoreMetadataValue,
} from "../document/frontmatter.ts";
import {
  createDocumentPayload,
  normalizeMarkdownLineEndings,
  type YeliDocumentPayload,
  type ValidationFinding,
} from "../document/model.ts";
import {
  createMarkdownExport,
  type MarkdownExport,
} from "../export/markdown.ts";
import {
  createStaticHtmlExport,
  type StaticHtmlExport,
} from "../format/static-preview.ts";
import { createSavedArtifact } from "../format/save.ts";
import {
  parseYeliArtifact,
  type ParseArtifactResult,
} from "../format/parse.ts";
import {
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
  type ShellHashReceipt,
} from "../format/serialize.ts";
import { sha256Fallback } from "../document/freshness.ts";
import {
  configureMarkdownSanitizer,
  renderDocumentMarkdown,
} from "../render/markdown.ts";
import {
  YELI_AGENT_API_VERSION,
  createAgentMutationEvent,
  type AgentMutationEvent,
  type AgentMutationOperation,
} from "./events.ts";
import {
  YeliOperationError,
  patchArtifactLines,
  refreshArtifact,
  replaceArtifactMarkdown,
  validateYeliArtifact,
  validateYeliPayload,
  type LinePatch,
  type AgentChangeAttribution,
  type MutationExpectation,
  type MutationReceipt,
  type MutationResult,
  type PayloadValidationResult,
} from "./validate.ts";

export { YELI_AGENT_API_VERSION };

export class AgentApiError extends YeliOperationError {
  readonly findings: ValidationFinding[] | undefined;

  constructor(code: string, message: string, findings?: ValidationFinding[]) {
    super(code, message);
    this.name = "AgentApiError";
    this.findings = findings;
  }
}

export type AgentApiVersion = typeof YELI_AGENT_API_VERSION;

export interface AgentShellSnapshot {
  markerCount: number;
  prefix: string;
  suffix: string;
}

export interface AgentDocumentSnapshot {
  apiVersion: AgentApiVersion;
  docId: string;
  findings: ValidationFinding[];
  format: YeliDocumentPayload["format"];
  freshness: {
    agentSummary: "absent" | "fresh" | "stale";
    manifest: "fresh" | "stale";
    staticPreview: "absent" | "fresh" | "stale";
  };
  manifest: YeliDocumentPayload["manifest"];
  markdown: string;
  ok: true;
  payload: YeliDocumentPayload;
  ranges: {
    markdown: { endLine: number; startLine: number };
    payload: { end: number; start: number };
  };
  revision: number;
  shell: AgentShellSnapshot;
  sourceHash: string;
  version: YeliDocumentPayload["version"];
}

export interface AgentPreReadSnapshot extends Omit<
  AgentDocumentSnapshot,
  "markdown" | "payload"
> {
  payload?: never;
}

export interface AgentMutationResult extends MutationResult {
  apiVersion: AgentApiVersion;
  document: AgentPreReadSnapshot;
  events: ReadonlyArray<Readonly<AgentMutationEvent>>;
  markdown: string;
}

export interface AgentRenderResult {
  apiVersion: AgentApiVersion;
  findings: ValidationFinding[];
  html: string;
  ok: true;
  revision: number;
  sourceHash: string;
}

interface AgentOutputContext {
  apiVersion: AgentApiVersion;
  findings: ValidationFinding[];
  ok: true;
  revision: number;
  sourceHash: string;
}

function changedLineCount(source: string, range: [number, number]): number {
  return range[0] === range[1]
    ? 0
    : source.slice(range[0], range[1]).split("\n").length -
        (source[range[1] - 1] === "\n" ? 1 : 0);
}

function changedLinesFromCharacters(
  before: string,
  after: string,
  changedCharacters: MutationReceipt["changedCharacters"],
): MutationReceipt["changedLines"] {
  return {
    startLine: before.slice(0, changedCharacters.before[0]).split("\n").length,
    deleteCount: changedLineCount(before, changedCharacters.before),
    insertedCount: changedLineCount(after, changedCharacters.after),
  };
}

export type AgentMarkdownExportResult = AgentOutputContext & MarkdownExport;
export type AgentStaticExportResult = AgentOutputContext & StaticHtmlExport;

export interface AgentImportResult {
  apiVersion: AgentApiVersion;
  artifact: string;
  document: AgentPreReadSnapshot;
  ok: true;
  receipt: {
    bytes: number;
    canonicalMarkdownBytes: number;
    inputMarkdownBytes: number;
    lineEndingsNormalized: boolean;
    revision: number;
    shell: ShellHashReceipt;
    sourceHash: string;
  };
}

type ParsedYeliArtifact = Extract<ParseArtifactResult, { ok: true }>;

let nodeSanitizerConfigured = false;

function assertApiVersion(
  apiVersion: number,
): asserts apiVersion is AgentApiVersion {
  if (apiVersion !== YELI_AGENT_API_VERSION) {
    throw new AgentApiError(
      "API_VERSION_UNSUPPORTED",
      `Agent API version ${apiVersion} is unsupported; expected ${YELI_AGENT_API_VERSION}`,
    );
  }
}

export function requireAgentApiVersion(apiVersion: number): AgentApiVersion {
  assertApiVersion(apiVersion);
  return apiVersion;
}

function clonePayload(payload: YeliDocumentPayload): YeliDocumentPayload {
  return structuredClone(payload);
}

function staticPreviewFreshness(
  artifact: string,
  sourceHash: string,
): "absent" | "fresh" | "stale" {
  const opening = artifact.indexOf(STATIC_PREVIEW_OPEN);
  const closing = artifact.indexOf(STATIC_PREVIEW_CLOSE);
  if (opening === -1 && closing === -1) return "absent";
  if (
    opening === -1 ||
    closing === -1 ||
    artifact.indexOf(
      STATIC_PREVIEW_OPEN,
      opening + STATIC_PREVIEW_OPEN.length,
    ) !== -1 ||
    artifact.indexOf(
      STATIC_PREVIEW_CLOSE,
      closing + STATIC_PREVIEW_CLOSE.length,
    ) !== -1
  ) {
    return "stale";
  }
  const contentStart = opening + STATIC_PREVIEW_OPEN.length;
  const contentEnd = artifact.indexOf(STATIC_PREVIEW_CLOSE, contentStart);
  if (contentEnd < contentStart) return "stale";
  const preview = artifact.slice(contentStart, contentEnd);
  const articlePattern =
    /<article\b[^>]*\bid=["']yeli-static-preview["'][^>]*>/giu;
  const match = articlePattern.exec(preview);
  if (!match || articlePattern.exec(preview)) return "stale";
  const hash = /\bdata-source-hash=["']([a-f0-9]{64})["']/iu.exec(
    match[0],
  )?.[1];
  return hash === sourceHash ? "fresh" : "stale";
}

async function validParsedArtifact(
  artifact: string,
): Promise<ParsedYeliArtifact> {
  const parsed = await parseYeliArtifact(artifact);
  if (!parsed.ok) {
    throw new AgentApiError(
      "ARTIFACT_INVALID",
      parsed.findings.map((finding) => finding.message).join("; "),
      parsed.findings,
    );
  }
  return parsed;
}

async function documentContext(
  artifact: string,
  parsed: ParsedYeliArtifact,
  apiVersion: AgentApiVersion,
): Promise<AgentPreReadSnapshot> {
  const validation = await validateYeliPayload(parsed.payload);
  const manifest = structuredClone(parsed.freshness.manifest.value);
  const lines = manifest.stats.lines;
  return {
    apiVersion,
    docId: parsed.payload.docId,
    findings: validation.findings,
    format: parsed.payload.format,
    freshness: {
      agentSummary: parsed.freshness.agentSummary.status,
      manifest: parsed.freshness.manifest.status,
      staticPreview: staticPreviewFreshness(
        artifact,
        parsed.freshness.sourceHash,
      ),
    },
    manifest,
    ok: true,
    ranges: {
      markdown: { startLine: lines === 0 ? 0 : 1, endLine: lines },
      payload: {
        start: parsed.boundary.payloadStart,
        end: parsed.boundary.payloadEnd,
      },
    },
    revision: parsed.payload.revision,
    shell: {
      markerCount: parsed.boundary.markerCount,
      prefix: sha256Fallback(parsed.boundary.prefix),
      suffix: sha256Fallback(parsed.boundary.suffix),
    },
    sourceHash: parsed.freshness.sourceHash,
    version: parsed.payload.version,
  };
}

async function ensureNodeSanitizer(): Promise<void> {
  if (typeof document !== "undefined" || nodeSanitizerConfigured) return;
  const packageName = "jsdom";
  const module = (await import(packageName)) as {
    JSDOM: new (html?: string) => { window: unknown };
  };
  const dom = new module.JSDOM("<!doctype html><html><body></body></html>");
  configureMarkdownSanitizer(
    dom.window as Parameters<typeof configureMarkdownSanitizer>[0],
  );
  nodeSanitizerConfigured = true;
}

export async function getDocument(
  artifact: string,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<AgentDocumentSnapshot> {
  assertApiVersion(apiVersion);
  const parsed = await validParsedArtifact(artifact);
  const context = await documentContext(artifact, parsed, apiVersion);
  return {
    ...context,
    markdown: parsed.markdown,
    payload: clonePayload(parsed.payload),
  };
}

export async function preReadDocument(
  artifact: string,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<AgentPreReadSnapshot> {
  assertApiVersion(apiVersion);
  const parsed = await validParsedArtifact(artifact);
  return documentContext(artifact, parsed, apiVersion);
}

export async function inspectDocument(
  artifact: string,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<AgentDocumentSnapshot> {
  return getDocument(artifact, apiVersion);
}

export async function extractDocument(
  artifact: string,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<string> {
  assertApiVersion(apiVersion);
  return (await validParsedArtifact(artifact)).markdown;
}

export async function importMarkdownDocument(
  markdown: string,
  trustedTemplate: string,
  docId: string,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<AgentImportResult> {
  assertApiVersion(apiVersion);
  if (docId.trim().length === 0 || docId.length > 256) {
    throw new AgentApiError(
      "DOCUMENT_ID_INVALID",
      "Imported documents require a non-empty docId of at most 256 characters",
    );
  }

  try {
    await validParsedArtifact(trustedTemplate);
  } catch (error) {
    if (error instanceof AgentApiError) {
      throw new AgentApiError(
        "TEMPLATE_INVALID",
        `The trusted YELI template is invalid: ${error.message}`,
        error.findings,
      );
    }
    throw error;
  }

  const canonicalMarkdown = normalizeMarkdownLineEndings(markdown);
  const initialPayload = await createDocumentPayload(canonicalMarkdown, {
    docId,
    revision: 1,
    subtle: null,
  });
  let saved;
  try {
    saved = await createSavedArtifact({
      payload: initialPayload,
      releaseTemplate: trustedTemplate,
      revision: 1,
      source: canonicalMarkdown,
    });
  } catch (error) {
    throw new AgentApiError(
      "TEMPLATE_INVALID",
      `The trusted YELI template cannot create a new document: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const validation = await validateYeliArtifact(saved.artifact);
  if (!validation.ok) {
    throw new AgentApiError(
      "IMPORT_RESULT_INVALID",
      "The imported YELI artifact failed validation",
      validation.findings,
    );
  }
  const parsed = await validParsedArtifact(saved.artifact);
  const document = await documentContext(saved.artifact, parsed, apiVersion);
  const encoder = new TextEncoder();
  return {
    apiVersion,
    artifact: saved.artifact,
    document,
    ok: true,
    receipt: {
      bytes: saved.bytes,
      canonicalMarkdownBytes: encoder.encode(canonicalMarkdown).byteLength,
      inputMarkdownBytes: encoder.encode(markdown).byteLength,
      lineEndingsNormalized: canonicalMarkdown !== markdown,
      revision: document.revision,
      shell: saved.shell,
      sourceHash: document.sourceHash,
    },
  };
}

async function mutationResult(
  result: MutationResult,
  operation: AgentMutationOperation,
  apiVersion: AgentApiVersion,
): Promise<AgentMutationResult> {
  const parsed = await validParsedArtifact(result.artifact);
  return {
    ...result,
    apiVersion,
    document: await documentContext(result.artifact, parsed, apiVersion),
    events: [createAgentMutationEvent(operation, result.receipt)],
    markdown: parsed.markdown,
  };
}

export async function replaceDocument(
  artifact: string,
  source: string,
  expectation: MutationExpectation,
  apiVersion: number = YELI_AGENT_API_VERSION,
  attribution?: AgentChangeAttribution,
): Promise<AgentMutationResult> {
  assertApiVersion(apiVersion);
  return mutationResult(
    await replaceArtifactMarkdown(artifact, source, expectation, attribution),
    "replace",
    apiVersion,
  );
}

export async function patchDocumentLines(
  artifact: string,
  patch: LinePatch,
  expectation: MutationExpectation,
  apiVersion: number = YELI_AGENT_API_VERSION,
  attribution?: AgentChangeAttribution,
): Promise<AgentMutationResult> {
  assertApiVersion(apiVersion);
  return mutationResult(
    await patchArtifactLines(artifact, patch, expectation, attribution),
    "patch-lines",
    apiVersion,
  );
}

export async function patchMetadata(
  artifact: string,
  key: CoreMetadataKey,
  value: CoreMetadataValue,
  expectation: MutationExpectation,
  apiVersion: number = YELI_AGENT_API_VERSION,
  attribution?: AgentChangeAttribution,
): Promise<AgentMutationResult> {
  assertApiVersion(apiVersion);
  const listKey = key === "tags" || key === "authors" || key === "aliases";
  const validKey = CORE_METADATA_KEYS.includes(key);
  const validValue = listKey
    ? Array.isArray(value) && value.every((item) => typeof item === "string")
    : typeof value === "string";
  if (!validKey || !validValue) {
    throw new AgentApiError(
      "METADATA_INPUT_INVALID",
      "Metadata requires a core key and its documented string or string-array value",
    );
  }
  const parsed = await validParsedArtifact(artifact);
  const patched = patchFrontmatter(parsed.markdown, key, value);
  if (!patched.ok) {
    throw new AgentApiError(
      "METADATA_PATCH_UNSAFE",
      "Metadata patch is ambiguous or unsafe; use Advanced Source",
      patched.findings,
    );
  }
  const result = await replaceArtifactMarkdown(
    artifact,
    patched.source,
    expectation,
    attribution,
  );
  result.receipt.changedCharacters = patched.changedRange;
  result.receipt.changedLines = changedLinesFromCharacters(
    parsed.markdown,
    patched.source,
    patched.changedRange,
  );
  return mutationResult(result, "patch-metadata", apiVersion);
}

export async function refreshDocument(
  artifact: string,
  expectation: MutationExpectation,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<AgentMutationResult> {
  assertApiVersion(apiVersion);
  return mutationResult(
    await refreshArtifact(artifact, expectation),
    "refresh",
    apiVersion,
  );
}

export async function validateDocument(
  artifact: string,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<PayloadValidationResult & { apiVersion: AgentApiVersion }> {
  assertApiVersion(apiVersion);
  return { apiVersion, ...(await validateYeliArtifact(artifact)) };
}

export async function renderDocument(
  artifact: string,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<AgentRenderResult> {
  assertApiVersion(apiVersion);
  const parsed = await validParsedArtifact(artifact);
  const context = await documentContext(artifact, parsed, apiVersion);
  await ensureNodeSanitizer();
  return {
    apiVersion,
    findings: context.findings,
    html: renderDocumentMarkdown(parsed.markdown),
    ok: true,
    revision: context.revision,
    sourceHash: context.sourceHash,
  };
}

export async function exportMarkdownDocument(
  artifact: string,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<AgentMarkdownExportResult> {
  assertApiVersion(apiVersion);
  const parsed = await validParsedArtifact(artifact);
  const context = await documentContext(artifact, parsed, apiVersion);
  return {
    apiVersion,
    findings: context.findings,
    ok: true,
    revision: context.revision,
    sourceHash: context.sourceHash,
    ...createMarkdownExport(parsed.markdown, context.manifest.metadata.title),
  };
}

export async function exportStaticDocument(
  artifact: string,
  apiVersion: number = YELI_AGENT_API_VERSION,
): Promise<AgentStaticExportResult> {
  assertApiVersion(apiVersion);
  const parsed = await validParsedArtifact(artifact);
  const context = await documentContext(artifact, parsed, apiVersion);
  await ensureNodeSanitizer();
  return {
    apiVersion,
    findings: context.findings,
    ok: true,
    revision: context.revision,
    sourceHash: context.sourceHash,
    ...createStaticHtmlExport(
      { ...parsed.payload, manifest: context.manifest },
      parsed.markdown,
    ),
  };
}

export type {
  CoreMetadataKey,
  CoreMetadataValue,
  LinePatch,
  MutationExpectation,
  MutationReceipt,
};
