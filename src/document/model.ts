import { deriveManifest } from "./manifest.ts";

export const YELI_FORMAT = "yeli/document" as const;
export const YELI_VERSION = 1 as const;

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export type FindingSeverity = "error" | "warning";

export interface ValidationFinding {
  code: string;
  message: string;
  path: string;
  severity: FindingSeverity;
}

export interface MarkdownEncoding {
  lines: string[];
  finalNewline: boolean;
}

export interface ManifestMetadata {
  aliases?: string[];
  authors?: string[];
  description?: string;
  lang?: string;
  tags?: string[];
  title?: string;
}

export interface ManifestHeading {
  anchor: string;
  level: number;
  lineEnd: number;
  lineStart: number;
  sectionEndLine: number;
  text: string;
}

export interface ManifestLink {
  destination: string;
  kind: "image" | "link";
  line: number;
  text: string;
}

export interface ManifestTask {
  checked: boolean;
  line: number;
  text: string;
}

export interface ManifestStats {
  assets: number;
  bytes: number;
  characters: number;
  headings: number;
  lines: number;
  links: number;
  tasks: number;
  words: number;
}

export interface YeliManifest {
  assetReferences: string[];
  codeLanguages: string[];
  docId: string;
  headings: ManifestHeading[];
  links: ManifestLink[];
  metadata: ManifestMetadata;
  revision: number;
  sourceHash: string;
  stats: ManifestStats;
  tasks: ManifestTask[];
}

export interface AgentSummary {
  changeSummary?: string;
  content: string;
  sourceHash: string;
  updatedAt: string;
  updatedBy: string;
}

export interface YeliAsset {
  data: string;
  id: string;
  mimeType: string;
}

export interface YeliDocumentPayload {
  agentSummary?: AgentSummary;
  assets: YeliAsset[];
  docId: string;
  format: typeof YELI_FORMAT;
  manifest: YeliManifest;
  markdown: MarkdownEncoding;
  revision: number;
  settings: JsonObject;
  version: typeof YELI_VERSION;
}

export interface CreateDocumentOptions {
  agentSummary?: AgentSummary;
  assets?: YeliAsset[];
  docId: string;
  revision?: number;
  settings?: JsonObject;
  subtle?: SubtleCrypto | null;
}

export function normalizeMarkdownLineEndings(source: string): string {
  return source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

export function encodeMarkdown(source: string): MarkdownEncoding {
  const normalized = normalizeMarkdownLineEndings(source);
  const finalNewline = normalized.endsWith("\n");
  const body = finalNewline ? normalized.slice(0, -1) : normalized;
  return {
    lines: body.length === 0 ? [] : body.split("\n"),
    finalNewline,
  };
}

export function decodeMarkdown(markdown: MarkdownEncoding): string {
  const body = markdown.lines.join("\n");
  return markdown.finalNewline ? `${body}\n` : body;
}

export async function createDocumentPayload(
  source: string,
  options: CreateDocumentOptions,
): Promise<YeliDocumentPayload> {
  if (options.docId.trim().length === 0) {
    throw new Error("docId must not be empty");
  }
  const revision = options.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("revision must be a non-negative safe integer");
  }
  const canonicalSource = normalizeMarkdownLineEndings(source);
  const manifest = await deriveManifest(
    canonicalSource,
    { docId: options.docId, revision },
    options.subtle,
  );

  return {
    format: YELI_FORMAT,
    version: YELI_VERSION,
    docId: options.docId,
    revision,
    manifest,
    markdown: encodeMarkdown(canonicalSource),
    ...(options.agentSummary ? { agentSummary: options.agentSummary } : {}),
    settings: options.settings ?? {},
    assets: options.assets ?? [],
  };
}
