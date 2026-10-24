#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";

import { sha256Fallback } from "../src/document/freshness.ts";
import { decodeMarkdown } from "../src/document/model.ts";
import { inspectCompressedArtifact } from "../src/format/compress-artifact.ts";
import { parseYeliArtifact } from "../src/format/parse.ts";
import {
  YELI_AGENT_PREAMBLE,
  PAYLOAD_OPENING_TAG,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "../src/format/serialize.ts";
import { validateArtifactContentPolicy } from "../src/integrity/content-policy.ts";
import { projectShell } from "../src/integrity/shell-projection.ts";

const args = process.argv.slice(2);
const enforceSizeTarget = args.includes("--enforce-size-target");
const isEmptyRelease = args.includes("--empty");
const starterLocaleIndex = args.indexOf("--locale");
const requestedLocale =
  starterLocaleIndex >= 0 ? args[starterLocaleIndex + 1] : "zh-CN";
const starterLocale =
  requestedLocale === "en" || requestedLocale === "zh-CN"
    ? requestedLocale
    : null;
if (!isEmptyRelease && !starterLocale) {
  throw new Error("--locale must be en or zh-CN");
}
const distributionDirectory = resolve(
  isEmptyRelease ? "dist/empty" : "dist/html",
);
const expectedName = isEmptyRelease
  ? "empty.yeli.html"
  : `starter.${starterLocale}.yeli.html`;
const artifactPath = resolve(distributionDirectory, expectedName);
const files = readdirSync(distributionDirectory);
if (!files.includes(expectedName)) {
  throw new Error(`Expected ${expectedName} in ${distributionDirectory}`);
}
const source = readFileSync(artifactPath);
const text = source.toString("utf8");
const errors: string[] = [];

function requireExactlyOne(marker: string, label: string): void {
  const count = text.split(marker).length - 1;
  if (count !== 1) errors.push(`expected one ${label}; found ${count}`);
}

if (enforceSizeTarget && statSync(artifactPath).size > 100_000) {
  errors.push(
    `release artifact exceeds the hard 100,000-byte raw limit: ${source.byteLength} bytes (${source.byteLength - 100_000} bytes over budget)`,
  );
}
if (!text.includes('<meta name="yeli:format" content="yeli/document"')) {
  errors.push("missing YELI format metadata");
}
if (!text.includes("YELI_THIRD_PARTY_NOTICES")) {
  errors.push("missing embedded third-party license notice");
}
const projectLicense = readFileSync(resolve("LICENSE"), "utf8");
if (!text.includes(`<!-- YELI_PROJECT_LICENSE\n${projectLicense}-->`)) {
  errors.push("missing or stale embedded project license");
}
const starterTitle =
  starterLocale === "en"
    ? "Make knowledge a file you can carry"
    : "让知识成为可以携带的文件";
if (!isEmptyRelease && !text.includes(starterTitle)) {
  errors.push(`missing recoverable ${starterLocale} starter document`);
}
if (isEmptyRelease && text.includes(starterTitle)) {
  errors.push("empty release contains bundled starter document content");
}
if (/<(?:script|link|img|source)[^>]+(?:src|href)=["']https?:/iu.test(text)) {
  errors.push("production artifact contains an external resource URL");
}
let compressed;
try {
  compressed = inspectCompressedArtifact(text);
} catch (error) {
  errors.push(
    `invalid compressed shell: ${error instanceof Error ? error.message : String(error)}`,
  );
}
const runtimeSource = compressed?.runtime.source ?? text;
if (/sourceMappingURL/iu.test(runtimeSource)) {
  errors.push("production artifact contains a source map reference");
}

requireExactlyOne(YELI_AGENT_PREAMBLE, "Agent preamble");
requireExactlyOne(PAYLOAD_OPENING_TAG, "payload boundary");
requireExactlyOne(STATIC_PREVIEW_OPEN, "static preview opening boundary");
requireExactlyOne(STATIC_PREVIEW_CLOSE, "static preview closing boundary");
if (text.includes('id="yeli-release-template"')) {
  errors.push("release artifact duplicates the complete runtime template");
}
if (
  runtimeSource.includes("cm-editor") ||
  runtimeSource.includes("@codemirror")
) {
  errors.push("default release contains the optional Advanced Source plugin");
}

const runtimeIndex = text.search(/<script\b[^>]*type=["']module["'][^>]*>/iu);
const preambleIndex = text.indexOf(YELI_AGENT_PREAMBLE);
const payloadIndex = text.indexOf(PAYLOAD_OPENING_TAG);
if (
  preambleIndex === -1 ||
  payloadIndex <= preambleIndex ||
  runtimeIndex <= payloadIndex
) {
  errors.push(
    "Agent preamble and payload must precede executable runtime bytes",
  );
}

const parsed = await parseYeliArtifact(text);
if (!parsed.ok) {
  errors.push(
    `built artifact is invalid: ${parsed.findings.map((item) => item.code).join(", ")}`,
  );
} else {
  if (isEmptyRelease) {
    if (decodeMarkdown(parsed.payload.markdown) !== "") {
      errors.push("empty release canonical Markdown is not empty");
    }
    if (parsed.payload.assets.length !== 0) {
      errors.push("empty release contains document assets");
    }
    if (parsed.payload.docId !== "yeli-empty") {
      errors.push(`unexpected empty release docId: ${parsed.payload.docId}`);
    }
    if (parsed.payload.manifest.stats.bytes !== 0) {
      errors.push("empty release manifest reports non-empty source bytes");
    }
  }
  const previewStart = text.indexOf(STATIC_PREVIEW_OPEN);
  const previewEnd = text.indexOf(STATIC_PREVIEW_CLOSE, previewStart);
  const preview = text.slice(previewStart, previewEnd);
  if (
    !preview.includes(
      `data-source-hash="${parsed.payload.manifest.sourceHash}"`,
    )
  ) {
    errors.push("static preview source hash does not match the built payload");
  }
}

const contentPolicy = validateArtifactContentPolicy(text);
errors.push(...contentPolicy.findings);
let projection;
try {
  projection = projectShell(text);
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  const result = {
    artifact: expectedName,
    variant: isEmptyRelease ? "empty" : `starter-${starterLocale}`,
    artifactHash: sha256Fallback(text),
    rawBytes: source.byteLength,
    withinOneMegabyteMilestone: source.byteLength <= 1_000_000,
    gzipBytes: gzipSync(source, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(source, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      },
    }).byteLength,
    contentPolicyScriptHashes: contentPolicy.scriptHashes,
    externalResourceUrls: 0,
    filesInDistribution: files.length,
    sizeTarget: {
      bytes: 100_000,
      enforced: enforceSizeTarget,
      status: enforceSizeTarget ? "enforced" : "deferred-by-owner",
      met: source.byteLength <= 100_000,
    },
    compression: compressed
      ? {
          runtime: {
            sourceBytes: compressed.runtime.sourceBytes,
            packedBytes: compressed.runtime.packedBytes,
            carrierBytes: compressed.runtime.carrierBytes,
          },
          style: {
            sourceBytes: compressed.style.sourceBytes,
            packedBytes: compressed.style.packedBytes,
            carrierBytes: compressed.style.carrierBytes,
          },
        }
      : null,
    shellHash: projection?.hash,
    shellProjectionVersion: projection?.version,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
