import { sha256Fallback } from "../document/freshness.ts";
import type { YeliDocumentPayload, JsonValue } from "../document/model.ts";
import { validatePayloadSchema } from "../document/schema.ts";
import { locatePayloadBlock } from "./parse.ts";

export const YELI_AGENT_PREAMBLE = `<!-- YELI_AGENT v1
Edit only the unique #yeli-doc JSON body whose type is application/yeli+json; every byte outside its script element is immutable runtime shell.
The payload discriminator is format:"yeli/document", version:1. markdown.lines stores LF-separated source without one recorded final LF; markdown.finalNewline restores it.
Serialize JSON with two-space indentation and escape every literal "<" as \\u003c. Treat manifest and agentSummary as current only when sourceHash matches materialized Markdown. For helper mutations, pair --updated-by with --change-summary to record self-reported provenance.
After mutation validate schema/budgets, expected revision or sourceHash, unique marker count, and separate SHA-256 hashes of the immutable prefix and suffix.
-->`;

export const PAYLOAD_OPENING_TAG =
  '<script id="yeli-doc" type="application/yeli+json">';
function htmlComment(label: string): string {
  return `${String.fromCharCode(60, 33, 45, 45)} ${label} ${String.fromCharCode(45, 45, 62)}`;
}

// Construct these at runtime so the executable bundle cannot be mistaken for
// a second document boundary by byte-oriented helpers.
export const STATIC_PREVIEW_OPEN = htmlComment(
  ["YELI_STATIC", "_PREVIEW_START"].join(""),
);
export const STATIC_PREVIEW_CLOSE = htmlComment(
  ["YELI_STATIC", "_PREVIEW_END"].join(""),
);

const TOP_LEVEL_ORDER = [
  "format",
  "version",
  "docId",
  "revision",
  "manifest",
  "markdown",
  "agentSummary",
  "settings",
  "assets",
] as const;

const MANIFEST_ORDER = [
  "sourceHash",
  "docId",
  "revision",
  "metadata",
  "headings",
  "links",
  "tasks",
  "codeLanguages",
  "assetReferences",
  "stats",
] as const;

function orderedObject(
  input: Record<string, JsonValue>,
  priority: readonly string[] = [],
): Record<string, JsonValue> {
  const output = Object.create(null) as Record<string, JsonValue>;
  const prioritySet = new Set(priority);
  const keys = [
    ...priority.filter((key) => Object.hasOwn(input, key)),
    ...Object.keys(input)
      .filter((key) => !prioritySet.has(key))
      .sort(),
  ];
  for (const key of keys) {
    const value = input[key]!;
    if (Array.isArray(value)) {
      output[key] = value.map((item) =>
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? orderedObject(item)
          : item,
      );
    } else if (typeof value === "object" && value !== null) {
      output[key] = orderedObject(
        value,
        key === "manifest" ? MANIFEST_ORDER : [],
      );
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function serializePayload(payload: YeliDocumentPayload): string {
  const schema = validatePayloadSchema(payload);
  if (!schema.ok || !schema.payload) {
    throw new Error(
      `Cannot serialize invalid YELI payload: ${schema.findings
        .map((item) => item.code)
        .join(", ")}`,
    );
  }
  const ordered = orderedObject(
    schema.payload as unknown as Record<string, JsonValue>,
    TOP_LEVEL_ORDER,
  );
  return JSON.stringify(ordered, null, 2).replaceAll("<", "\\u003c");
}

export function serializePayloadBlock(payload: YeliDocumentPayload): string {
  return `${PAYLOAD_OPENING_TAG}\n${serializePayload(payload)}\n</script>`;
}

export interface ShellHashReceipt {
  markerCount: number;
  prefix: { after: string; before: string };
  shellStable: boolean;
  suffix: { after: string; before: string };
}

export function splicePayload(
  artifact: string,
  payload: YeliDocumentPayload,
): { artifact: string; receipt: ShellHashReceipt } {
  const located = locatePayloadBlock(artifact);
  if (!located.ok) {
    throw new Error(located.findings.map((item) => item.message).join("; "));
  }
  const replacement = serializePayload(payload);
  const updated = `${located.boundary.prefix}${replacement}${located.boundary.suffix}`;
  const after = locatePayloadBlock(updated);
  if (!after.ok)
    throw new Error("Serialized artifact lost its payload boundary");
  const prefixBefore = sha256Fallback(located.boundary.prefix);
  const suffixBefore = sha256Fallback(located.boundary.suffix);
  const prefixAfter = sha256Fallback(after.boundary.prefix);
  const suffixAfter = sha256Fallback(after.boundary.suffix);
  return {
    artifact: updated,
    receipt: {
      markerCount: after.boundary.markerCount,
      prefix: { before: prefixBefore, after: prefixAfter },
      suffix: { before: suffixBefore, after: suffixAfter },
      shellStable: prefixBefore === prefixAfter && suffixBefore === suffixAfter,
    },
  };
}

function escapePreview(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function spliceStaticPreview(
  artifact: string,
  previewText: string,
): string {
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
  return `${artifact.slice(0, contentStart)}\n<pre>${escapePreview(previewText)}</pre>\n${artifact.slice(contentEnd)}`;
}
