#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { deflateAsync } from "@gfx/zopfli";
import { decodeBase86, encodeBase86 } from "../src/format/base86.ts";

const inputPath = resolve(
  process.argv[2] ?? "dist/html/starter.zh-CN.yeli.html",
);
const outputPath = resolve(
  process.argv[3] ?? "output/compression-profiles.json",
);
const html = readFileSync(inputPath, "utf8");
mkdirSync(dirname(outputPath), { recursive: true });
function source(id, pattern) {
  const carrier = html.match(
    new RegExp(
      `<script id="${id}" type="application/yeli\\+deflate-b86">([^<]*)</script>`,
      "u",
    ),
  );
  if (carrier) return inflateRawSync(decodeBase86(carrier[1]));
  const match = html.match(pattern);
  assert(match, `Missing source: ${id}`);
  return Buffer.from(match[1], "utf8");
}
const sources = {
  runtime: source(
    "yeli-runtime",
    /<script type="module"[^>]*>([\s\S]*?)<\/script>/u,
  ),
  css: source(
    "yeli-runtime-css",
    /<style\b[^>]*rel="stylesheet"[^>]*>([\s\S]*?)<\/style>/u,
  ),
};
const profiles = [
  { numiterations: 5, blocksplittingmax: 15 },
  { numiterations: 15, blocksplittingmax: 15 },
  { numiterations: 30, blocksplittingmax: 15 },
  { numiterations: 60, blocksplittingmax: 15 },
  { numiterations: 15, blocksplittingmax: 0 },
  { numiterations: 30, blocksplittingmax: 0 },
];
const report = {
  input: inputPath,
  measuredAt: new Date().toISOString(),
  environment: `${platform()} ${release()} ${arch()}, Node ${process.version}`,
  artifactBytes: Buffer.byteLength(html),
  artifactSha256: createHash("sha256").update(html).digest("hex"),
  sources: Object.fromEntries(
    Object.entries(sources).map(([name, bytes]) => [
      name,
      {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        zlib9Bytes: deflateRawSync(bytes, { level: 9 }).length,
      },
    ]),
  ),
  profiles: [],
};
for (const options of profiles) {
  const row = { options, chunks: {}, carrierBytes: 0, buildMs: 0 };
  for (const [name, bytes] of Object.entries(sources)) {
    const start = performance.now();
    const packed = Buffer.from(await deflateAsync(bytes, options));
    const buildMs = performance.now() - start;
    assert.deepEqual(inflateRawSync(packed), bytes);
    const encoded = encodeBase86(packed);
    assert.deepEqual(Buffer.from(decodeBase86(encoded)), packed);
    row.chunks[name] = {
      packedBytes: packed.length,
      carrierBytes: encoded.length,
      buildMs,
    };
    row.carrierBytes += encoded.length;
    row.buildMs += buildMs;
  }
  report.profiles.push(row);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(row));
}
