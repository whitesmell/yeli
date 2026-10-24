import { sha256Fallback } from "../document/freshness.ts";
import {
  createDocumentPayload,
  type YeliDocumentPayload,
  type JsonValue,
} from "../document/model.ts";
import { buildStaticPreviewHtml } from "./static-shell-preview.ts";
import {
  splicePayload,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
  type ShellHashReceipt,
} from "./serialize.ts";

const KNOWN_PAYLOAD_KEYS = new Set([
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

function copyUnknownFields(
  source: YeliDocumentPayload,
  target: YeliDocumentPayload,
): void {
  for (const key of Object.keys(source)) {
    if (KNOWN_PAYLOAD_KEYS.has(key)) continue;
    const value = (source as unknown as Record<string, JsonValue>)[key];
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }
}

function spliceStaticPreviewHtml(artifact: string, html: string): string {
  const openCount = artifact.split(STATIC_PREVIEW_OPEN).length - 1;
  const closeCount = artifact.split(STATIC_PREVIEW_CLOSE).length - 1;
  if (openCount !== 1 || closeCount !== 1) {
    throw new Error(
      `Expected one static preview boundary; found opening=${openCount}, closing=${closeCount}`,
    );
  }
  const contentStart =
    artifact.indexOf(STATIC_PREVIEW_OPEN) + STATIC_PREVIEW_OPEN.length;
  const contentEnd = artifact.indexOf(STATIC_PREVIEW_CLOSE, contentStart);
  return `${artifact.slice(0, contentStart)}\n${html}\n${artifact.slice(contentEnd)}`;
}

export function fingerprintArtifact(artifact: string): string {
  return sha256Fallback(artifact);
}

export interface CreateSavedArtifactOptions {
  payload: YeliDocumentPayload;
  releaseTemplate: string;
  revision: number;
  source: string;
}

export interface SavedArtifactResult {
  artifact: string;
  bytes: number;
  fingerprint: string;
  payload: YeliDocumentPayload;
  shell: ShellHashReceipt;
}

export async function createSavedArtifact(
  options: CreateSavedArtifactOptions,
): Promise<SavedArtifactResult> {
  const payload = await createDocumentPayload(options.source, {
    assets: options.payload.assets,
    docId: options.payload.docId,
    revision: options.revision,
    settings: options.payload.settings,
    subtle: null,
    ...(options.payload.agentSummary
      ? { agentSummary: options.payload.agentSummary }
      : {}),
  });
  copyUnknownFields(options.payload, payload);
  const spliced = splicePayload(options.releaseTemplate, payload);
  if (!spliced.receipt.shellStable) {
    throw new Error("Release template payload splice changed shell bytes");
  }
  const artifact = spliceStaticPreviewHtml(
    spliced.artifact,
    buildStaticPreviewHtml(payload, options.source),
  );
  return {
    artifact,
    bytes: new TextEncoder().encode(artifact).byteLength,
    fingerprint: fingerprintArtifact(artifact),
    payload,
    shell: spliced.receipt,
  };
}

export function safeDocumentFilename(
  title: string | undefined,
  extension: ".yeli.html" | ".html" | ".md",
): string {
  const base = (title ?? "document").replace(/[\\/:*?"<>|]/gu, "-").trim();
  return `${base || "document"}${extension}`;
}

export function downloadText(
  content: string,
  filename: string,
  mimeType: string,
  ownerDocument: Document = document,
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  try {
    const anchor = ownerDocument.createElement("a");
    anchor.download = filename;
    anchor.href = url;
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
