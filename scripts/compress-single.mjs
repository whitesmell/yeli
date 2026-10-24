#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  compressArtifact,
  DEFAULT_COMPRESSION,
} from "../src/format/compress-artifact.ts";
import { finalizeReleaseArtifact } from "../src/format/finalize-artifact.ts";

const args = process.argv.slice(2);
const inputPath = args[0];
const outputPath = args[1];
const iterations = Number(
  process.env.ZOPFLI_ITERS ?? DEFAULT_COMPRESSION.iterations,
);
const blockSplittingMax = Number(
  process.env.ZOPFLI_MAX_BLOCKS ?? DEFAULT_COMPRESSION.blockSplittingMax,
);

if (!inputPath || !outputPath) {
  process.stderr.write(
    "usage: node scripts/compress-single.mjs <input.html> <output.html>\n",
  );
  process.exit(1);
}

const input = readFileSync(resolve(inputPath), "utf8");
const result = await compressArtifact(input, { iterations, blockSplittingMax });
const artifact =
  result.artifact === input ? input : finalizeReleaseArtifact(result.artifact);
writeFileSync(resolve(outputPath), artifact, "utf8");
process.stdout.write(
  `${JSON.stringify(
    {
      artifact: resolve(outputPath),
      rawBytes: Buffer.byteLength(artifact),
      runtimeSourceBytes: result.runtimeSourceBytes,
      runtimeCompressedBytes: result.compressedRuntimeBytes,
      runtimeCarrierBytes: result.runtimeCarrierBytes,
      styleSourceBytes: result.styleSourceBytes,
      styleCompressedBytes: result.compressedStyleBytes,
      styleCarrierBytes: result.styleCarrierBytes,
      zopfliIterations: iterations,
      zopfliMaxBlocks: blockSplittingMax,
    },
    null,
    2,
  )}\n`,
);
