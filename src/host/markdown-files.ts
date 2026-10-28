import {
  createDocumentPayload,
  type YeliDocumentPayload,
} from "../document/model.ts";
import { sourceHash } from "../editor/source-ranges.ts";
import { safeDocumentFilename } from "../format/save.ts";
import { createFreshOpenedDocument } from "../format/open.ts";
import type { OpenedYeliDocument } from "./contracts.ts";

export function isMarkdownFilename(name: string): boolean {
  return /\.md$/iu.test(name);
}

export function newLocalDocumentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `yeli-${Date.now()}`;
}

export async function openMarkdownFile(
  source: string,
  releaseTemplate = "",
): Promise<OpenedYeliDocument> {
  const payload = await createDocumentPayload(source, {
    docId: newLocalDocumentId(),
    revision: 1,
    subtle: null,
  });
  return createFreshOpenedDocument({
    artifact: source,
    artifactKind: "markdown",
    fingerprint: markdownFingerprint(source),
    markdown: source,
    payload,
    releaseTemplate,
  });
}

export function markdownFingerprint(source: string): string {
  return sourceHash(source);
}

export function markdownDownloadFilename(
  payload: YeliDocumentPayload | undefined,
): string {
  return safeDocumentFilename(payload?.manifest.metadata.title, ".md");
}

export interface MarkdownSavePlan {
  bytes: number;
  content: string;
  filename: string;
  mode: "direct" | "download";
}

export function markdownSavePlan(
  source: string,
  payload: YeliDocumentPayload | undefined,
  hasDirectHandle: boolean,
): MarkdownSavePlan {
  return {
    bytes: new TextEncoder().encode(source).byteLength,
    content: source,
    filename: markdownDownloadFilename(payload),
    mode: hasDirectHandle ? "direct" : "download",
  };
}

export interface MarkdownSaveDisclosure {
  currentBytes: number;
  documentFingerprint: string;
  projectedBytes: number | null;
  sourceHash: string;
}

export function markdownSaveDisclosure(
  opened: OpenedYeliDocument,
  source: string,
  dirty: boolean,
): MarkdownSaveDisclosure {
  const currentBytes = new TextEncoder().encode(source).byteLength;
  return {
    currentBytes,
    documentFingerprint: opened.fingerprint,
    projectedBytes: dirty ? currentBytes : null,
    sourceHash: sourceHash(source),
  };
}

/**
 * Preserve the UTF-8 BOM and line endings in the editable source. Fatal decoding
 * rejects invalid UTF-8, so re-encoding this string reproduces the physical bytes.
 * Artifact imports intentionally keep their existing File.text() behavior.
 */
export async function readMarkdownFile(
  file: Pick<File, "arrayBuffer">,
): Promise<string> {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    await file.arrayBuffer(),
  );
}
