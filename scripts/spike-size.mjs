import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build as viteBuild } from "vite";

const candidates = [
  {
    name: "minimal source-mapped block projection",
    packages: ["yaml"],
    source: `
      export {
        createConstructPatch,
        createFrontmatterPropertyPatch,
        projectMarkdown,
      } from "/src/editor/block-projection.ts";
      export { applySourcePatch } from "/src/editor/source-ranges.ts";
    `,
  },
  {
    name: "markdown-it + DOMPurify",
    packages: ["markdown-it", "dompurify"],
    source: `
      import MarkdownIt from "markdown-it";
      import DOMPurify from "dompurify";
      export function render(source) {
        return DOMPurify.sanitize(new MarkdownIt({ html: false }).render(source));
      }
    `,
  },
  {
    name: "baseline + selected highlight.js languages",
    packages: ["markdown-it", "dompurify", "highlight.js"],
    source: `
      import MarkdownIt from "markdown-it";
      import DOMPurify from "dompurify";
      import highlight from "highlight.js/lib/core";
      import javascript from "highlight.js/lib/languages/javascript";
      import typescript from "highlight.js/lib/languages/typescript";
      import json from "highlight.js/lib/languages/json";
      import bash from "highlight.js/lib/languages/bash";
      import css from "highlight.js/lib/languages/css";
      import xml from "highlight.js/lib/languages/xml";
      import markdownLanguage from "highlight.js/lib/languages/markdown";
      for (const [name, language] of Object.entries({ javascript, typescript, json, bash, css, xml, markdown: markdownLanguage })) {
        highlight.registerLanguage(name, language);
      }
      const renderer = new MarkdownIt({ html: false, highlight: (source, language) => language && highlight.getLanguage(language) ? highlight.highlight(source, { language }).value : "" });
      export function render(source) { return DOMPurify.sanitize(renderer.render(source)); }
    `,
  },
  {
    name: "baseline + KaTeX",
    packages: ["markdown-it", "dompurify", "katex"],
    source: `
      import MarkdownIt from "markdown-it";
      import DOMPurify from "dompurify";
      import katex from "katex";
      import "katex/dist/katex.min.css";
      const renderer = new MarkdownIt({ html: false });
      export function render(source) { return DOMPurify.sanitize(renderer.render(source)); }
      export function renderMath(source) { return katex.renderToString(source, { strict: "error", throwOnError: true }); }
    `,
  },
  {
    name: "baseline + Mermaid",
    packages: ["markdown-it", "dompurify", "mermaid"],
    source: `
      import MarkdownIt from "markdown-it";
      import DOMPurify from "dompurify";
      import mermaid from "mermaid";
      const renderer = new MarkdownIt({ html: false });
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      export function render(source) { return DOMPurify.sanitize(renderer.render(source)); }
      export async function renderDiagram(id, source) { return mermaid.render(id, source); }
    `,
  },
];

function compressedSizes(source) {
  return {
    rawBytes: source.byteLength,
    gzipBytes: gzipSync(source, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(source, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
}

function packageAvailable(packageName) {
  try {
    import.meta.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

async function measureCandidate(candidate) {
  const missing = candidate.packages.filter(
    (packageName) => !packageAvailable(packageName),
  );
  if (missing.length > 0) {
    return { name: candidate.name, status: "skipped", missing };
  }

  const virtualId = `\0yeli-size-spike:${candidate.name}`;
  const output = await viteBuild({
    configFile: false,
    logLevel: "silent",
    plugins: [
      {
        name: "yeli-size-spike-entry",
        resolveId(id) {
          return id === "virtual:yeli-size-spike" ? virtualId : null;
        },
        load(id) {
          return id === virtualId ? candidate.source : null;
        },
      },
    ],
    build: {
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      minify: true,
      target: "es2022",
      write: false,
      rollupOptions: { input: "virtual:yeli-size-spike" },
    },
  });

  const outputs = Array.isArray(output)
    ? output.flatMap((item) => item.output)
    : output.output;
  const bytes = Buffer.concat(
    outputs.map((item) =>
      Buffer.from(item.type === "asset" ? item.source : item.code),
    ),
  );
  return {
    name: candidate.name,
    status: "measured",
    ...compressedSizes(bytes),
  };
}

function deterministicBytes(length) {
  const bytes = Buffer.allocUnsafe(length);
  let state = 0x1a2b3c4d;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[index] = state >>> 24;
  }
  return bytes;
}

function materializePrototype(shell, markdown, assetBytes) {
  const sourceWithoutFinalLineFeed = markdown.endsWith("\n")
    ? markdown.slice(0, -1)
    : markdown;
  const payload = {
    format: "yeli/document",
    version: 1,
    revision: 0,
    manifest: { status: "u1-prototype-not-frozen" },
    markdown: {
      lines:
        sourceWithoutFinalLineFeed.length === 0
          ? []
          : sourceWithoutFinalLineFeed.split("\n"),
      finalNewline: markdown.endsWith("\n"),
    },
    settings: {},
    assets:
      assetBytes === 0
        ? []
        : [
            {
              id: "synthetic-random-asset",
              mime: "application/octet-stream",
              base64: deterministicBytes(assetBytes).toString("base64"),
            },
          ],
  };
  const block = `<script id="yeli-doc" type="application/yeli+json">\n${JSON.stringify(payload, null, 2).replaceAll("<", "\\u003c")}\n</script>\n`;
  return Buffer.from(shell.replace("</body>", `${block}</body>`));
}

const shell = readFileSync(resolve("dist/html/starter.zh-CN.yeli.html"));
const corpus = readFileSync(
  resolve("tests/fixtures/fidelity/representative.md"),
  "utf8",
);
const artifactFixtures = [
  { name: "representative-markdown", markdown: corpus, assetBytes: 0 },
  {
    name: "200-KiB-markdown",
    markdown: corpus.repeat(Math.ceil((200 * 1024) / corpus.length)),
    assetBytes: 0,
  },
  {
    name: "representative-plus-1-MiB-asset",
    markdown: corpus,
    assetBytes: 1024 * 1024,
  },
  {
    name: "representative-plus-5-MiB-asset",
    markdown: corpus,
    assetBytes: 5 * 1024 * 1024,
  },
];

const result = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  productionShell: compressedSizes(shell),
  rendererCandidates: [],
  representativeArtifacts: artifactFixtures.map((fixture) => ({
    name: fixture.name,
    assetSourceBytes: fixture.assetBytes,
    ...compressedSizes(
      materializePrototype(
        shell.toString("utf8"),
        fixture.markdown,
        fixture.assetBytes,
      ),
    ),
  })),
  note: "Candidate bundle bytes are isolated renderer deltas, not full artifact totals. The prototype payload is evidence only; U2 owns the frozen format.",
};

for (const candidate of candidates) {
  result.rendererCandidates.push(await measureCandidate(candidate));
}

console.log(JSON.stringify(result, null, 2));
