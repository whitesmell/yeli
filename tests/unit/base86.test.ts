import { inflateRawSync } from "node:zlib";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  BASE86_FORBIDDEN,
  BASE86_LOADER_DECODER,
  decodeBase86,
  encodeBase86,
} from "../../src/format/base86.ts";
import {
  COMPRESSED_RUNTIME_SCRIPT_ID,
  COMPRESSED_RUNTIME_TYPE,
  COMPRESSED_STYLE_SCRIPT_ID,
  compressArtifact,
  inspectCompressedArtifact,
} from "../../src/format/compress-artifact.ts";
import { createDocumentPayload } from "../../src/document/model.ts";
import {
  serializePayloadBlock,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "../../src/format/serialize.ts";
import {
  createArtifactContentPolicy,
  PREVIEW_REMOVAL_BOOT,
} from "../../src/integrity/content-policy.ts";

function carrier(artifact: string, id: string): string {
  const escapedType = COMPRESSED_RUNTIME_TYPE.replaceAll("+", "\\+");
  const pattern = new RegExp(
    `<script id="${id}" type="${escapedType}">([^<]*)</script>`,
    "u",
  );
  const match = pattern.exec(artifact);
  if (!match?.[1]) throw new Error(`Missing carrier ${id}`);
  return match[1];
}

function uncompressedArtifact(
  runtime: string,
  style: string,
  payloadBlock: string,
): string {
  return `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'" />
  <style rel="stylesheet">${style}</style>
</head>
<body>
  ${payloadBlock}
  ${STATIC_PREVIEW_OPEN}
  <div id="yeli-static-preview"><h1>Inert fixture</h1></div>
  ${STATIC_PREVIEW_CLOSE}
  <div id="root"></div>
  <script type="module">${runtime}</script>
  <script data-yeli-boot="preview-removal">${PREVIEW_REMOVAL_BOOT}</script>
</body>
</html>`;
}

describe("Base86", () => {
  it.each([0, 1, 2, 3, 4, 5, 31, 32, 33, 1024])(
    "round-trips %i arbitrary bytes",
    (length) => {
      const bytes = Uint8Array.from(
        { length },
        (_value, index) => (index * 73 + 19) & 0xff,
      );
      expect(decodeBase86(encodeBase86(bytes))).toEqual(bytes);
    },
  );

  it("rejects a trailing single character and all invalid symbols", () => {
    expect(() => decodeBase86("!")).toThrow(/trailing single character/u);
    for (const invalid of [" ", "\n", '"', "'", "<", ">", "&", "\\"]) {
      expect(() => decodeBase86(`!!!!${invalid}`)).toThrow(
        /invalid character/u,
      );
    }
  });

  it("rejects overflowing groups in both decoders instead of wrapping bytes", () => {
    expect(() => decodeBase86("~~~~~")).toThrow(/exceeds four bytes/u);
    expect(() => {
      runInNewContext(`${BASE86_LOADER_DECODER};b86decode("~~~~~")`);
    }).toThrow(/exceeds four bytes/u);
  });

  it("keeps the shipped decoder identical on tails, all byte values, and binary data", () => {
    for (const length of [0, 1, 2, 3, 4, 255, 256, 257, 4095]) {
      const bytes = Uint8Array.from(
        { length },
        (_, index) => (index * 73 + 255) & 255,
      );
      const decoded = runInNewContext(
        `${BASE86_LOADER_DECODER};b86decode(encoded)`,
        { encoded: encodeBase86(bytes) },
      ) as Uint8Array;
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    }
  });

  it("uses an HTML-safe alphabet and never emits hostile sequences", () => {
    const bytes = Uint8Array.from(
      { length: 65_536 },
      (_value, index) => (Math.imul(index + 1, 2_654_435_761) >>> 24) & 0xff,
    );
    const encoded = encodeBase86(bytes);

    expect(encoded).not.toMatch(/[<>&"'\\\s]/u);
    for (const forbidden of BASE86_FORBIDDEN) {
      expect(encoded).not.toContain(forbidden);
    }
  });
});

describe("Zopfli + Base86 artifact carriers", () => {
  it.each([0, 1.5, Number.NaN, 101])(
    "rejects an invalid iteration count %s instead of silently clamping",
    async (iterations) => {
      await expect(compressArtifact("", { iterations })).rejects.toThrow(
        /iterations must be an integer/u,
      );
    },
  );

  it.each([-1, 1.5, Number.NaN, 101])(
    "rejects an invalid block limit %s",
    async (blockSplittingMax) => {
      await expect(compressArtifact("", { blockSplittingMax })).rejects.toThrow(
        /blockSplittingMax must be an integer/u,
      );
    },
  );

  it("decompresses the complete runtime and CSS byte-for-byte", async () => {
    const payload = await createDocumentPayload("# Carrier fixture\n", {
      docId: "base86-carrier",
      subtle: null,
    });
    const runtime = `globalThis.__yeliRuntime = ${JSON.stringify(
      "runtime payload ".repeat(500),
    )};`;
    const style = `.fixture { color: #123456; content: ${JSON.stringify(
      "stylesheet ".repeat(300),
    )}; }`;
    const result = await compressArtifact(
      uncompressedArtifact(runtime, style, serializePayloadBlock(payload)),
      { iterations: 1 },
    );

    expect(
      inflateRawSync(
        Buffer.from(
          decodeBase86(carrier(result.artifact, COMPRESSED_RUNTIME_SCRIPT_ID)),
        ),
      ).toString("utf8"),
    ).toBe(runtime);
    expect(
      inflateRawSync(
        Buffer.from(
          decodeBase86(carrier(result.artifact, COMPRESSED_STYLE_SCRIPT_ID)),
        ),
      ).toString("utf8"),
    ).toBe(style);
    expect(result.compressedRuntimeBytes).toBeGreaterThan(0);
    expect(result.compressedStyleBytes).toBeGreaterThan(0);
    expect(inspectCompressedArtifact(result.artifact)).toMatchObject({
      runtime: { source: runtime, sourceBytes: Buffer.byteLength(runtime) },
      style: { source: style, sourceBytes: Buffer.byteLength(style) },
    });
    const repeated = await compressArtifact(result.artifact);
    expect(repeated.artifact).toBe(result.artifact);
    expect(repeated.compressedRuntimeBytes).toBe(result.compressedRuntimeBytes);
    expect(repeated.styleCarrierBytes).toBe(result.styleCarrierBytes);
    const damaged = result.artifact.replace(
      `>${runtimeCarrier(result.artifact)}`,
      `>!${runtimeCarrier(result.artifact).slice(1)}`,
    );
    expect(() => inspectCompressedArtifact(damaged)).toThrow();

    const wrongLength = result.artifact.replace(
      `inflate("${COMPRESSED_RUNTIME_SCRIPT_ID}",${result.runtimeCarrierBytes},${result.runtimeSourceBytes})`,
      `inflate("${COMPRESSED_RUNTIME_SCRIPT_ID}",${result.runtimeCarrierBytes},${result.runtimeSourceBytes + 1})`,
    );
    expect(() => inspectCompressedArtifact(wrongLength)).toThrow(
      /length mismatch/u,
    );
  });

  it("only authorizes blob loading for the compressed shell", async () => {
    const payload = await createDocumentPayload("# CSP fixture\n", {
      docId: "base86-csp",
      subtle: null,
    });
    const runtime = "globalThis.__yeliRuntime = true;";
    const style = ".fixture { display: block; }";
    const normalPolicy = createArtifactContentPolicy(
      uncompressedArtifact(runtime, style, serializePayloadBlock(payload)),
    );
    const compressed = await compressArtifact(
      uncompressedArtifact(runtime, style, serializePayloadBlock(payload)),
      { iterations: 1 },
    );

    expect(normalPolicy.policy).not.toMatch(/script-src[^;]*\bblob:/u);
    expect(createArtifactContentPolicy(compressed.artifact).policy).toMatch(
      /script-src[^;]*\bblob:/u,
    );
  });
});

function runtimeCarrier(artifact: string): string {
  return carrier(artifact, COMPRESSED_RUNTIME_SCRIPT_ID);
}
