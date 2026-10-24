import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { deflateAsync } from "@gfx/zopfli";

import { sha256Fallback } from "../document/freshness.ts";
import {
  COMPRESSED_RUNTIME_MARKER,
  COMPRESSED_RUNTIME_SCRIPT_ID,
  COMPRESSED_RUNTIME_TYPE,
  COMPRESSED_STYLE_SCRIPT_ID,
  createArtifactContentPolicy,
  PREVIEW_REMOVAL_BOOT,
  rewriteArtifactContentPolicy,
} from "../integrity/content-policy.ts";
import {
  BASE86_FORBIDDEN,
  BASE86_LOADER_DECODER,
  decodeBase86,
  encodeBase86,
} from "./base86.ts";
import {
  PAYLOAD_OPENING_TAG,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "./serialize.ts";

export {
  COMPRESSED_RUNTIME_MARKER,
  COMPRESSED_RUNTIME_SCRIPT_ID,
  COMPRESSED_RUNTIME_TYPE,
  COMPRESSED_STYLE_SCRIPT_ID,
};

interface ScriptBlock {
  attributes: string;
  body: string;
  end: number;
  start: number;
}

export interface CompressArtifactOptions {
  iterations?: number;
  blockSplittingMax?: number;
}

export const DEFAULT_COMPRESSION = {
  iterations: 15,
  blockSplittingMax: 0,
} as const;

const MAX_RUNTIME_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_STYLE_SOURCE_BYTES = 2 * 1024 * 1024;

export interface CompressedArtifactResult {
  artifact: string;
  compressedRuntimeBytes: number;
  compressedStyleBytes: number;
  runtimeCarrierBytes: number;
  runtimeSourceBytes: number;
  shellHashBeforeCompression: string;
  styleCarrierBytes: number;
  styleSourceBytes: number;
}

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "iu",
  ).exec(attributes);
  return match?.[1] ?? match?.[2];
}

function scriptBlocks(html: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  const opening = /<script\b([^>]*)>/giu;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(html)) !== null) {
    const bodyStart = match.index + match[0].length;
    const closingStart = html.indexOf("</script>", bodyStart);
    if (closingStart === -1) {
      throw new Error("Unclosed script element");
    }
    const end = closingStart + "</script>".length;
    blocks.push({
      attributes: match[1] ?? "",
      body: html.slice(bodyStart, closingStart),
      end,
      start: match.index,
    });
    opening.lastIndex = end;
  }
  return blocks;
}

function replaceExactly(
  html: string,
  start: number,
  end: number,
  replacement: string,
  label: string,
): string {
  if (start < 0 || end < start) {
    throw new Error(`Cannot replace ${label}`);
  }
  return `${html.slice(0, start)}${replacement}${html.slice(end)}`;
}

function scriptSafeHtmlWithoutDataBlocks(html: string): string {
  const removed = scriptBlocks(html)
    .filter((block) => {
      const opening = block.attributes;
      return (
        /(?:^|\s)id\s*=\s*["']yeli-doc["']/iu.test(opening) ||
        /(?:^|\s)type\s*=\s*["']application\/yeli\+(?:json|template)["']/iu.test(
          opening,
        )
      );
    })
    .reverse();
  return removed.reduce(
    (output, block) =>
      `${output.slice(0, block.start)}${output.slice(block.end)}`,
    html,
  );
}

async function deflate(
  bytes: Buffer,
  iterations: number,
  blockSplittingMax: number,
): Promise<Buffer> {
  const packed = Buffer.from(
    await deflateAsync(bytes, {
      numiterations: iterations,
      blocksplittingmax: blockSplittingMax,
    }),
  );
  if (!inflateRawSync(packed).equals(bytes)) {
    throw new Error("Zopfli payload did not round-trip through zlib");
  }
  return packed;
}

function assertCarrier(text: string, label: string): void {
  for (const forbidden of BASE86_FORBIDDEN) {
    if (text.includes(forbidden)) {
      throw new Error(`${label} contains forbidden sequence ${forbidden}`);
    }
  }
}

function buildLoader(
  runtimeLength: number,
  styleLength: number,
  runtimeSourceBytes: number,
  styleSourceBytes: number,
): string {
  const loader = `(async function(){
"use strict";
${BASE86_LOADER_DECODER}
async function inflate(id, expectedBytes, sourceBytes){
  var element=document.getElementById(id);
  if(!element)throw new Error("Missing compressed Yeli payload: "+id);
  var text=element.textContent||"";
  if(text.length!==expectedBytes)throw new Error("Compressed Yeli payload length mismatch: "+id);
  var bytes=b86decode(text);
  var stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  var decoded=await new Response(stream).arrayBuffer();
  if(decoded.byteLength!==sourceBytes)throw new Error("Decompressed Yeli payload length mismatch: "+id);
  return new TextDecoder("utf-8",{fatal:true}).decode(decoded);
}
try{
  var decoded=await Promise.all([
    inflate("${COMPRESSED_STYLE_SCRIPT_ID}",${styleLength},${styleSourceBytes}),
    inflate("${COMPRESSED_RUNTIME_SCRIPT_ID}",${runtimeLength},${runtimeSourceBytes})
  ]);
  var style=document.createElement("style");
  style.id="yeli-runtime-style";
  style.setAttribute("data-yeli-transient","");
  style.textContent=decoded[0];
  document.head.appendChild(style);
  var url=URL.createObjectURL(new Blob([decoded[1]],{type:"text/javascript"}));
  try{
    await import(url);
  }finally{
    URL.revokeObjectURL(url);
  }
}catch(error){
  var message=document.createElement("section");
  message.setAttribute("role","alert");
  message.style.cssText="position:fixed;inset:0;margin:0;padding:32px;background:#fff;color:#111;font:16px/1.6 sans-serif;overflow:auto;z-index:2147483647";
  var chinese=(document.documentElement.lang||"").toLowerCase().startsWith("zh");
  var description=document.createElement("p");
  description.textContent=chinese?"无法启动页里。请尝试使用新版浏览器，或重新获取这份文件。原文件未被修改。":"Yeli could not start. Try a current browser or obtain another copy of this file. Your original file has not been changed.";
  var details=document.createElement("details");
  var summary=document.createElement("summary");
  summary.textContent=chinese?"问题详情":"Details";
  var diagnostic=document.createElement("pre");
  diagnostic.style.whiteSpace="pre-wrap";
  diagnostic.textContent=error instanceof Error?error.message:String(error);
  details.append(summary,diagnostic);
  message.append(description,details);
  document.body.appendChild(message);
}
})()`;
  if (loader.includes("</script")) {
    throw new Error("Compressed loader contains a script terminator");
  }
  return loader;
}

export function compressedCarrierHashes(artifact: string): {
  runtime: string;
  style: string;
} {
  const blocks = scriptBlocks(artifact);
  const find = (id: string): string => {
    const block = blocks.find(
      (candidate) =>
        attribute(candidate.attributes, "id") === id &&
        attribute(candidate.attributes, "type")?.toLowerCase() ===
          COMPRESSED_RUNTIME_TYPE,
    );
    if (!block) throw new Error(`Missing compressed carrier ${id}`);
    return createHash("sha256").update(block.body, "utf8").digest("base64");
  };
  return {
    runtime: find(COMPRESSED_RUNTIME_SCRIPT_ID),
    style: find(COMPRESSED_STYLE_SCRIPT_ID),
  };
}

export function inspectCompressedArtifact(artifact: string) {
  const blocks = scriptBlocks(artifact);
  const carriers = blocks.filter(
    (block) =>
      attribute(block.attributes, "type")?.toLowerCase() ===
      COMPRESSED_RUNTIME_TYPE,
  );
  if (carriers.length === 0) return null;
  createArtifactContentPolicy(artifact);
  function inspect(id: string, maxOutputLength: number) {
    const carrier = carriers.find(
      (block) => attribute(block.attributes, "id") === id,
    );
    if (!carrier) throw new Error(`Missing compressed carrier ${id}`);
    const packed = decodeBase86(carrier.body);
    if (encodeBase86(packed) !== carrier.body) {
      throw new Error(`Non-canonical Base86 carrier: ${id}`);
    }
    const decoded = inflateRawSync(packed, { maxOutputLength });
    const source = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
    const declaredLengths = new RegExp(
      `inflate\\("${id}",(\\d+),(\\d+)\\)`,
      "u",
    ).exec(artifact);
    if (
      declaredLengths &&
      (Number(declaredLengths[1]) !== carrier.body.length ||
        Number(declaredLengths[2]) !== decoded.length)
    ) {
      throw new Error(`Compressed carrier length mismatch: ${id}`);
    }
    return {
      source,
      sourceBytes: decoded.length,
      packedBytes: packed.length,
      carrierBytes: carrier.body.length,
    };
  }
  return {
    runtime: inspect(COMPRESSED_RUNTIME_SCRIPT_ID, MAX_RUNTIME_SOURCE_BYTES),
    style: inspect(COMPRESSED_STYLE_SCRIPT_ID, MAX_STYLE_SOURCE_BYTES),
  };
}

export async function compressArtifact(
  input: string,
  options: CompressArtifactOptions = {},
): Promise<CompressedArtifactResult> {
  if (input.includes(`id="${COMPRESSED_RUNTIME_SCRIPT_ID}"`)) {
    const inspected = inspectCompressedArtifact(input);
    if (!inspected) throw new Error("Missing compressed carriers");
    const policy = createArtifactContentPolicy(input);
    if (!policy.policy.includes("blob:")) {
      throw new Error("Compressed artifact is missing its authorized loader");
    }
    return {
      artifact: input,
      compressedRuntimeBytes: inspected.runtime.packedBytes,
      compressedStyleBytes: inspected.style.packedBytes,
      runtimeCarrierBytes: inspected.runtime.carrierBytes,
      runtimeSourceBytes: inspected.runtime.sourceBytes,
      shellHashBeforeCompression: sha256Fallback(input),
      styleCarrierBytes: inspected.style.carrierBytes,
      styleSourceBytes: inspected.style.sourceBytes,
    };
  }
  const iterations = options.iterations ?? DEFAULT_COMPRESSION.iterations;
  const blockSplittingMax =
    options.blockSplittingMax ?? DEFAULT_COMPRESSION.blockSplittingMax;
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100) {
    throw new Error("Zopfli iterations must be an integer from 1 to 100");
  }
  if (
    !Number.isSafeInteger(blockSplittingMax) ||
    blockSplittingMax < 0 ||
    blockSplittingMax > 100
  ) {
    throw new Error(
      "Zopfli blockSplittingMax must be an integer from 0 to 100",
    );
  }
  const scripts = scriptBlocks(input);
  const runtimes = scripts.filter(
    (block) =>
      attribute(block.attributes, "type")?.toLowerCase() === "module" &&
      attribute(block.attributes, "src") === undefined,
  );
  if (runtimes.length !== 1) {
    throw new Error(
      `Expected one inline runtime module; found ${runtimes.length}`,
    );
  }
  const runtime = runtimes[0]!;
  const initialBlocks = scriptBlocks(input);
  const initialBoot = initialBlocks.find(
    (block) =>
      attribute(block.attributes, "data-yeli-boot") === "preview-removal",
  );
  if (!initialBoot || initialBoot.body !== PREVIEW_REMOVAL_BOOT) {
    throw new Error("Preview-removal boot script does not match the build");
  }
  const styles = [
    ...input.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/giu),
  ].filter((match) =>
    /(?:^|\s)rel\s*=\s*["']stylesheet["']/iu.test(match[1] ?? ""),
  );
  if (styles.length !== 1) {
    throw new Error(
      `Expected one linked Yeli stylesheet; found ${styles.length}`,
    );
  }
  const style = styles[0]!;
  if (style.index === undefined) throw new Error("Missing stylesheet");

  const runtimeBytes = Buffer.from(runtime.body, "utf8");
  const styleBytes = Buffer.from(style[2] ?? "", "utf8");
  if (
    runtimeBytes.length > MAX_RUNTIME_SOURCE_BYTES ||
    styleBytes.length > MAX_STYLE_SOURCE_BYTES
  ) {
    throw new Error(
      "Runtime or CSS exceeds the decompression validation budget",
    );
  }
  const compressedRuntime = await deflate(
    runtimeBytes,
    iterations,
    blockSplittingMax,
  );
  const compressedStyle = await deflate(
    styleBytes,
    iterations,
    blockSplittingMax,
  );
  const runtimeCarrier = encodeBase86(compressedRuntime);
  const styleCarrier = encodeBase86(compressedStyle);
  assertCarrier(runtimeCarrier, "runtime payload");
  assertCarrier(styleCarrier, "style payload");

  if (!Buffer.from(decodeBase86(runtimeCarrier)).equals(compressedRuntime)) {
    throw new Error("Runtime base86 round-trip failed");
  }
  if (!Buffer.from(decodeBase86(styleCarrier)).equals(compressedStyle)) {
    throw new Error("Style base86 round-trip failed");
  }

  const loader = buildLoader(
    runtimeCarrier.length,
    styleCarrier.length,
    runtimeBytes.length,
    styleBytes.length,
  );
  const runtimeBlock = `<script id="${COMPRESSED_RUNTIME_SCRIPT_ID}" type="${COMPRESSED_RUNTIME_TYPE}">${runtimeCarrier}</script>`;
  const styleBlock = `<script id="${COMPRESSED_STYLE_SCRIPT_ID}" type="${COMPRESSED_RUNTIME_TYPE}">${styleCarrier}</script>`;
  const loaderBlock = `<script type="module" data-yeli-runtime="${COMPRESSED_RUNTIME_MARKER}">${loader}</script>`;
  let output = replaceExactly(
    input,
    style.index,
    style.index + style[0].length,
    "",
    "stylesheet",
  );
  const updatedRuntime = scriptBlocks(output).find(
    (block) =>
      attribute(block.attributes, "type")?.toLowerCase() === "module" &&
      attribute(block.attributes, "data-yeli-runtime") === undefined,
  );
  if (!updatedRuntime) throw new Error("Runtime moved unexpectedly");
  output = replaceExactly(
    output,
    updatedRuntime.start,
    updatedRuntime.end,
    "",
    "original runtime module",
  );
  const bootBlock = scriptBlocks(output).find(
    (block) =>
      attribute(block.attributes, "data-yeli-boot") === "preview-removal",
  );
  if (!bootBlock) throw new Error("Missing preview-removal boot script");
  output = replaceExactly(
    output,
    bootBlock.start,
    bootBlock.start,
    `${styleBlock}\n${runtimeBlock}\n${loaderBlock}\n`,
    "compressed runtime insertion",
  );
  const computed = createArtifactContentPolicy(output);
  output = rewriteArtifactContentPolicy(output, computed.policy);

  const finalBlocks = scriptBlocks(output);
  const finalBoot = finalBlocks.find(
    (block) =>
      attribute(block.attributes, "data-yeli-boot") === "preview-removal",
  );
  if (!finalBoot || finalBoot.body !== PREVIEW_REMOVAL_BOOT) {
    throw new Error("Compressed artifact has an unexpected boot script");
  }
  const carriers = finalBlocks.filter(
    (block) =>
      attribute(block.attributes, "type")?.toLowerCase() ===
      COMPRESSED_RUNTIME_TYPE,
  );
  const executable = finalBlocks.filter(
    (block) =>
      attribute(block.attributes, "type")?.toLowerCase() === "module" ||
      block.body === PREVIEW_REMOVAL_BOOT,
  );
  if (carriers.length !== 2 || executable.length !== 2) {
    throw new Error(
      `Compressed artifact has ${carriers.length} carriers and ${executable.length} executable scripts`,
    );
  }
  if (
    computed.executableScriptCount !== 2 ||
    computed.scriptHashes.length !== 2 ||
    !computed.policy.includes("blob:")
  ) {
    throw new Error("Compressed artifact content policy is not exact");
  }
  if (/<style\b/iu.test(scriptSafeHtmlWithoutDataBlocks(output))) {
    throw new Error("Compressed artifact still contains a style element");
  }
  if (!output.includes(PAYLOAD_OPENING_TAG)) {
    throw new Error("Compressed artifact lost the payload boundary");
  }
  const shellHtml = scriptSafeHtmlWithoutDataBlocks(output);
  if (
    shellHtml.split(STATIC_PREVIEW_OPEN).length !== 2 ||
    shellHtml.split(STATIC_PREVIEW_CLOSE).length !== 2
  ) {
    throw new Error("Compressed artifact lost the static-preview boundary");
  }
  if (
    output.indexOf(PAYLOAD_OPENING_TAG) >
    output.indexOf(`id="${COMPRESSED_RUNTIME_SCRIPT_ID}"`)
  ) {
    throw new Error("Compressed runtime must follow the readable payload");
  }
  return {
    artifact: output,
    compressedRuntimeBytes: compressedRuntime.byteLength,
    compressedStyleBytes: compressedStyle.byteLength,
    runtimeCarrierBytes: Buffer.byteLength(runtimeCarrier),
    runtimeSourceBytes: runtimeBytes.byteLength,
    shellHashBeforeCompression: sha256Fallback(input),
    styleCarrierBytes: Buffer.byteLength(styleCarrier),
    styleSourceBytes: styleBytes.byteLength,
  };
}
