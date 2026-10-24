import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const openingMarker =
  '<script id="yeli-doc" type="application/yeli+json">\n';
export const closingMarker = "\n</script>";

const preamble = `<!-- YELI_AGENT U1 PROTOTYPE — the format is not frozen until U2.
Only the unique #yeli-doc JSON block is editable document data. Every byte before its opening marker and after its closing marker is immutable shell.
markdown.lines is LF-normalized source without the final LF; markdown.finalNewline restores exactly one final LF. Empty source is lines:[]/finalNewline:false.
After a payload-only Markdown edit: increment revision by one, set manifest.freshness to "stale", and retain the old sourceHash as the hash of the derived data. Never claim stale derived data is fresh.
Serialize valid JSON with two-space indentation and escape every literal "<" in the JSON text as \\u003c. Validate both shell boundary hashes after editing.
-->`;

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

export function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function encodeMarkdown(source) {
  const finalNewline = source.endsWith("\n");
  const body = finalNewline ? source.slice(0, -1) : source;
  return {
    lines: body.length === 0 ? [] : body.split("\n"),
    finalNewline,
  };
}

export function decodeMarkdown(markdown) {
  const body = markdown.lines.join("\n");
  return markdown.finalNewline ? `${body}\n` : body;
}

export function serializePayload(payload) {
  return JSON.stringify(payload, null, 2).replaceAll("<", "\\u003c");
}

export function createPrototype(source) {
  const payload = {
    format: "yeli/document",
    version: 1,
    id: "synthetic-agent-format-spike",
    revision: 7,
    manifest: {
      sourceHash: sha256(source),
      freshness: "fresh",
      note: "Derived ranges intentionally omitted from the U1 prototype",
    },
    markdown: encodeMarkdown(source),
    settings: {},
    assets: [],
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="yeli:format" content="yeli/document">
  <title>YELI Agent Format Spike</title>
</head>
<body>
${preamble}
<main>This is a synthetic U1 format fixture. The browser shell is intentionally inert.</main>
${openingMarker}${serializePayload(payload)}${closingMarker}
</body>
</html>
`;
}

export function parseArtifact(artifact) {
  const openingCount = count(artifact, openingMarker);
  const closingCount = count(artifact, closingMarker);
  if (openingCount !== 1 || closingCount !== 1) {
    throw new Error(
      `Expected one payload boundary; found opening=${openingCount}, closing=${closingCount}`,
    );
  }
  const openingAt = artifact.indexOf(openingMarker);
  const payloadAt = openingAt + openingMarker.length;
  const closingAt = artifact.indexOf(closingMarker, payloadAt);
  const prefix = artifact.slice(0, payloadAt);
  const suffix = artifact.slice(closingAt);
  const payloadText = artifact.slice(payloadAt, closingAt);
  const payload = JSON.parse(payloadText);
  return {
    prefix,
    suffix,
    payload,
    payloadText,
    markdown: decodeMarkdown(payload.markdown),
  };
}

export function replaceMarkdown(artifact, source) {
  const parsed = parseArtifact(artifact);
  const payload = {
    ...parsed.payload,
    revision: parsed.payload.revision + 1,
    manifest: { ...parsed.payload.manifest, freshness: "stale" },
    markdown: encodeMarkdown(source),
  };
  return `${parsed.prefix}${serializePayload(payload)}${parsed.suffix}`;
}

export function validateResult(baseline, result, expectedSource) {
  const original = parseArtifact(baseline);
  const edited = parseArtifact(result);
  const expectedPayload = {
    ...original.payload,
    revision: original.payload.revision + 1,
    manifest: { ...original.payload.manifest, freshness: "stale" },
    markdown: encodeMarkdown(expectedSource),
  };
  const sourceMatches = edited.markdown === expectedSource;
  const prefixHash = sha256(edited.prefix);
  const suffixHash = sha256(edited.suffix);
  const expectedPrefixHash = sha256(original.prefix);
  const expectedSuffixHash = sha256(original.suffix);
  const prefixStable = prefixHash === expectedPrefixHash;
  const suffixStable = suffixHash === expectedSuffixHash;
  const revisionValid =
    edited.payload.revision === original.payload.revision + 1;
  const freshnessValid =
    edited.payload.manifest.freshness === "stale" &&
    edited.payload.manifest.sourceHash === original.payload.manifest.sourceHash;
  const formatValid =
    edited.payload.format === "yeli/document" && edited.payload.version === 1;
  const payloadMatchesExpected = isDeepStrictEqual(
    edited.payload,
    expectedPayload,
  );
  const valid =
    sourceMatches &&
    prefixStable &&
    suffixStable &&
    revisionValid &&
    freshnessValid &&
    formatValid &&
    payloadMatchesExpected;

  return {
    valid,
    sourceMatches,
    shellDrift: !(prefixStable && suffixStable),
    prefixHash,
    suffixHash,
    expectedPrefixHash,
    expectedSuffixHash,
    revisionValid,
    freshnessValid,
    formatValid,
    payloadMatchesExpected,
  };
}
