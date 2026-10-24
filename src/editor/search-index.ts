import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

import type { DocumentTransaction } from "../document/transactions.ts";
import {
  createConstructPatch,
  type BlockProjection,
  type SourceBlock,
} from "./block-projection.ts";
import { createSourcePatch, type SourceRange } from "./source-ranges.ts";

export const SEARCH_MAX_MATCHES = 500;
export const SEARCH_MAX_QUERY_LENGTH = 256;
const SEARCH_MAX_RICH_BLOCK_LENGTH = 64 * 1024;

export type SearchLimitReason =
  "large-block" | "query-too-long" | "result-budget" | "time-budget";

export type SearchViewOnlyReason =
  "cross-block" | "inline-mapping-ambiguous" | "source-safe-block";

export interface SearchEntry {
  block: SourceBlock;
  exactSourceMap: boolean;
  id: string;
  sourceRange: SourceRange | null;
  text: string;
  transformReplacement: "literal" | "table-cell";
  viewOnlyReason?: SearchViewOnlyReason;
}

export interface SearchIndex {
  entries: SearchEntry[];
  limitedReasons: SearchLimitReason[];
  revision: number;
  source: string;
  sourceHash: string;
}

export interface SearchMatch {
  block: SourceBlock;
  entryId: string;
  excerpt: string;
  id: string;
  replaceable: boolean;
  sourceRange: SourceRange | null;
  text: string;
  transformReplacement: SearchEntry["transformReplacement"];
  viewOnlyReason?: SearchViewOnlyReason;
  visibleRange: SourceRange;
}

export interface SearchResult {
  limitedReason?: SearchLimitReason;
  matches: SearchMatch[];
  normalizedQuery: string;
  truncated: boolean;
}

export type ReplacementBuildResult =
  | { code: "NO_SAFE_MATCHES" | "UNSAFE_REPLACEMENT"; ok: false }
  | { ok: true; transaction: DocumentTransaction };

interface NormalizedText {
  complete: boolean;
  map: Array<{ from: number; to: number }>;
  text: string;
}

const inlineRenderer = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: false,
  typographer: false,
});

function tokenText(token: Token): string {
  if (token.type === "text" || token.type === "code_inline") {
    return token.content;
  }
  if (token.type === "softbreak" || token.type === "hardbreak") return "\n";
  if (token.type === "image") return token.content;
  return token.children?.map(tokenText).join("") ?? "";
}

function inlineVisibleText(source: string): string {
  if (!/[\\*_~`\[\]!<>]/u.test(source)) return source;
  const withoutDestinations = source
    .replace(/!\[([^\]]*)\]\([^\n)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^\n)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/gu, "$1");
  return inlineRenderer
    .parseInline(withoutDestinations, {})
    .map(tokenText)
    .join("");
}

function blockContentBinding(block: SourceBlock): {
  sourceRange: SourceRange;
  text: string;
} | null {
  try {
    const patch = createConstructPatch(block, { kind: "block-content" }, "");
    return { sourceRange: patch.range, text: patch.expectedText };
  } catch {
    return null;
  }
}

function fencedContent(block: SourceBlock): string {
  const text = block.expectedText;
  const firstNewline = text.indexOf("\n");
  if (firstNewline === -1) return "";
  const closingLineStart = text.endsWith("\n")
    ? text.lastIndexOf("\n", text.length - 2) + 1
    : text.lastIndexOf("\n") + 1;
  return closingLineStart > firstNewline
    ? text.slice(firstNewline + 1, closingLineStart)
    : "";
}

function entryForInlineBlock(
  block: SourceBlock,
  limitedReasons: Set<SearchLimitReason>,
): SearchEntry | null {
  const binding = blockContentBinding(block);
  if (!binding) {
    const text = inlineVisibleText(block.expectedText.replace(/\n$/u, ""));
    return text.length === 0
      ? null
      : {
          block,
          exactSourceMap: false,
          id: block.id,
          sourceRange: null,
          text,
          transformReplacement: "literal",
          viewOnlyReason: "source-safe-block",
        };
  }
  if (
    binding.text.length > SEARCH_MAX_RICH_BLOCK_LENGTH &&
    /[\\*_~`\[\]!<>]/u.test(binding.text)
  ) {
    limitedReasons.add("large-block");
    return null;
  }
  const text = inlineVisibleText(binding.text);
  const exactSourceMap = text === binding.text;
  return text.length === 0
    ? null
    : {
        block,
        exactSourceMap,
        id: block.id,
        sourceRange: binding.sourceRange,
        text,
        transformReplacement: "literal",
        ...(!exactSourceMap
          ? { viewOnlyReason: "inline-mapping-ambiguous" as const }
          : {}),
      };
}

function entriesForTable(
  block: SourceBlock,
  limitedReasons: Set<SearchLimitReason>,
): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (let row = 0; ; row += 1) {
    let foundRow = false;
    for (let column = 0; ; column += 1) {
      try {
        const patch = createConstructPatch(
          block,
          { kind: "table-cell", row, column },
          "",
        );
        foundRow = true;
        const raw = patch.expectedText;
        const richMappingSkipped =
          raw.length > SEARCH_MAX_RICH_BLOCK_LENGTH &&
          /[\\*_~`\[\]!<>]/u.test(raw);
        if (raw.length > SEARCH_MAX_RICH_BLOCK_LENGTH) {
          limitedReasons.add("large-block");
        }
        if (richMappingSkipped) continue;
        const text = inlineVisibleText(raw);
        const exactSourceMap = raw === text;
        entries.push({
          block,
          exactSourceMap,
          id: `${block.id}:cell:${row}:${column}`,
          sourceRange: patch.range,
          text,
          transformReplacement: "table-cell",
          ...(!exactSourceMap
            ? { viewOnlyReason: "inline-mapping-ambiguous" as const }
            : {}),
        });
      } catch {
        break;
      }
    }
    if (!foundRow) break;
  }
  return entries;
}

function entriesForBlock(
  block: SourceBlock,
  limitedReasons: Set<SearchLimitReason>,
): SearchEntry[] {
  if (block.kind === "blank" || block.kind === "frontmatter") return [];
  if (block.kind === "reference-definition") return [];
  if (block.kind === "table") return entriesForTable(block, limitedReasons);
  if (block.kind === "code-fence") {
    const patch = createConstructPatch(block, { kind: "fence-content" }, "");
    return [
      {
        block,
        exactSourceMap: true,
        id: block.id,
        sourceRange: patch.range,
        text: patch.expectedText,
        transformReplacement: "literal",
      },
    ];
  }
  if (block.kind === "mermaid" || block.kind === "math") {
    return [
      {
        block,
        exactSourceMap: false,
        id: block.id,
        sourceRange: null,
        text: fencedContent(block),
        transformReplacement: "literal",
        viewOnlyReason: "source-safe-block",
      },
    ];
  }
  const entry = entryForInlineBlock(block, limitedReasons);
  return entry ? [entry] : [];
}

function buildIndexFromProjection(
  projection: BlockProjection,
  limitedReasons = new Set<SearchLimitReason>(),
): SearchIndex {
  return {
    entries: projection.blocks.flatMap((block) =>
      entriesForBlock(block, limitedReasons),
    ),
    limitedReasons: [...limitedReasons],
    revision: projection.revision,
    source: projection.source,
    sourceHash: projection.sourceHash,
  };
}

export function buildSearchIndex(projection: BlockProjection): SearchIndex {
  return buildIndexFromProjection(projection);
}

function abortError(): Error {
  const error = new Error("Search indexing was cancelled");
  error.name = "AbortError";
  return error;
}

function yieldToInput(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export async function buildSearchIndexCooperative(
  projection: BlockProjection,
  options: {
    signal?: AbortSignal;
    sliceMs?: number;
    timeBudgetMs?: number;
  } = {},
): Promise<SearchIndex> {
  const limitedReasons = new Set<SearchLimitReason>();
  const entries: SearchEntry[] = [];
  const started = performance.now();
  let sliceStarted = started;
  for (const block of projection.blocks) {
    if (options.signal?.aborted) throw abortError();
    entries.push(...entriesForBlock(block, limitedReasons));
    const now = performance.now();
    if (now - started > (options.timeBudgetMs ?? 350)) {
      limitedReasons.add("time-budget");
      break;
    }
    if (now - sliceStarted >= (options.sliceMs ?? 8)) {
      await yieldToInput();
      sliceStarted = performance.now();
    }
  }
  if (options.signal?.aborted) throw abortError();
  return {
    entries,
    limitedReasons: [...limitedReasons],
    revision: projection.revision,
    source: projection.source,
    sourceHash: projection.sourceHash,
  };
}

interface SearchText {
  combined: string;
  segments: Array<{ entry: SearchEntry; from: number; to: number }>;
}

function combineSearchEntries(entries: readonly SearchEntry[]): SearchText {
  const segments: SearchText["segments"] = [];
  let combined = "";
  for (const entry of entries) {
    if (combined.length > 0) combined += " ";
    const from = combined.length;
    combined += entry.text;
    segments.push({ entry, from, to: combined.length });
  }
  return { combined, segments };
}

function normalizeWithMap(value: string): NormalizedText {
  if (/^[\x00-\x7F]*$/u.test(value)) {
    return { complete: true, map: [], text: value.toLowerCase() };
  }
  const map: NormalizedText["map"] = [];
  let text = "";
  const segments = new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(value);
  for (const segment of segments) {
    const normalized = segment.segment.normalize("NFC").toLocaleLowerCase("en");
    text += normalized;
    for (let index = 0; index < normalized.length; index += 1) {
      map.push({
        from: segment.index,
        to: segment.index + segment.segment.length,
      });
    }
  }
  return { complete: true, map, text };
}

async function normalizeWithMapCooperative(
  value: string,
  options: {
    signal?: AbortSignal;
    sliceMs: number;
    startedAt: number;
    timeBudgetMs: number;
  },
): Promise<NormalizedText> {
  if (options.signal?.aborted) throw abortError();
  if (/^[\x00-\x7F]*$/u.test(value)) {
    return { complete: true, map: [], text: value.toLowerCase() };
  }
  const map: NormalizedText["map"] = [];
  const normalizedParts: string[] = [];
  let sliceStarted = performance.now();
  const segments = new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(value);
  for (const segment of segments) {
    const normalized = segment.segment.normalize("NFC").toLocaleLowerCase("en");
    normalizedParts.push(normalized);
    for (let index = 0; index < normalized.length; index += 1) {
      map.push({
        from: segment.index,
        to: segment.index + segment.segment.length,
      });
    }
    if (performance.now() - sliceStarted >= options.sliceMs) {
      await yieldToInput();
      if (options.signal?.aborted) throw abortError();
      if (performance.now() - options.startedAt > options.timeBudgetMs) {
        return { complete: false, map, text: normalizedParts.join("") };
      }
      sliceStarted = performance.now();
    }
  }
  if (options.signal?.aborted) throw abortError();
  return { complete: true, map, text: normalizedParts.join("") };
}

function excerpt(text: string, from: number, to: number): string {
  const start = Math.max(0, from - 32);
  const end = Math.min(text.length, to + 48);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/gu, " ")}${end < text.length ? "…" : ""}`;
}

export function searchIndex(
  index: SearchIndex,
  query: string,
  maxMatches = SEARCH_MAX_MATCHES,
): SearchResult {
  const normalizedQuery = query.normalize("NFC").toLocaleLowerCase("en");
  if (normalizedQuery.length === 0) {
    return { matches: [], normalizedQuery, truncated: false };
  }
  if (normalizedQuery.length > SEARCH_MAX_QUERY_LENGTH) {
    return {
      limitedReason: "query-too-long",
      matches: [],
      normalizedQuery,
      truncated: true,
    };
  }
  const { combined, segments } = combineSearchEntries(index.entries);
  const normalized = normalizeWithMap(combined);
  return collectSearchMatches(
    combined,
    segments,
    normalized,
    normalizedQuery,
    maxMatches,
  );
}

function collectSearchMatches(
  combined: string,
  segments: SearchText["segments"],
  normalized: NormalizedText,
  normalizedQuery: string,
  maxMatches: number,
): SearchResult {
  const matches: SearchMatch[] = [];
  let cursor = 0;
  while (cursor <= normalized.text.length - normalizedQuery.length) {
    const found = normalized.text.indexOf(normalizedQuery, cursor);
    if (found === -1) break;
    const last = found + normalizedQuery.length - 1;
    const mappedStart =
      normalized.map.length === 0
        ? { from: found, to: found + 1 }
        : normalized.map[found];
    const mappedEnd =
      normalized.map.length === 0
        ? { from: last, to: last + 1 }
        : normalized.map[last];
    if (!mappedStart || !mappedEnd) break;
    const combinedRange = { from: mappedStart.from, to: mappedEnd.to };
    const touched = segments.filter(
      (segment) =>
        segment.to > combinedRange.from && segment.from < combinedRange.to,
    );
    const first = touched[0];
    if (first) {
      const singleEntry =
        touched.length === 1 &&
        combinedRange.from >= first.from &&
        combinedRange.to <= first.to;
      const visibleRange = singleEntry
        ? {
            from: combinedRange.from - first.from,
            to: combinedRange.to - first.from,
          }
        : { from: 0, to: first.entry.text.length };
      const sourceRange =
        singleEntry && first.entry.exactSourceMap && first.entry.sourceRange
          ? {
              from: first.entry.sourceRange.from + visibleRange.from,
              to: first.entry.sourceRange.from + visibleRange.to,
            }
          : null;
      const viewOnlyReason = singleEntry
        ? first.entry.viewOnlyReason
        : ("cross-block" as const);
      matches.push({
        block: first.entry.block,
        entryId: first.entry.id,
        excerpt: excerpt(combined, combinedRange.from, combinedRange.to),
        id: `${first.entry.id}:${combinedRange.from}:${combinedRange.to}`,
        replaceable: sourceRange !== null,
        sourceRange,
        text: combined.slice(combinedRange.from, combinedRange.to),
        transformReplacement: first.entry.transformReplacement,
        ...(viewOnlyReason ? { viewOnlyReason } : {}),
        visibleRange,
      });
    }
    if (matches.length >= maxMatches) {
      return {
        limitedReason: "result-budget",
        matches,
        normalizedQuery,
        truncated: true,
      };
    }
    cursor = found + Math.max(1, normalizedQuery.length);
  }
  return { matches, normalizedQuery, truncated: false };
}

export async function searchIndexCooperative(
  index: SearchIndex,
  query: string,
  options: {
    maxMatches?: number;
    signal?: AbortSignal;
    sliceMs?: number;
    timeBudgetMs?: number;
  } = {},
): Promise<SearchResult> {
  const normalizedQuery = query.normalize("NFC").toLocaleLowerCase("en");
  if (normalizedQuery.length === 0) {
    return { matches: [], normalizedQuery, truncated: false };
  }
  if (normalizedQuery.length > SEARCH_MAX_QUERY_LENGTH) {
    return {
      limitedReason: "query-too-long",
      matches: [],
      normalizedQuery,
      truncated: true,
    };
  }
  if (options.signal?.aborted) throw abortError();
  const started = performance.now();
  const { combined, segments } = combineSearchEntries(index.entries);
  const normalized = await normalizeWithMapCooperative(combined, {
    ...(options.signal ? { signal: options.signal } : {}),
    sliceMs: options.sliceMs ?? 8,
    startedAt: started,
    timeBudgetMs: options.timeBudgetMs ?? 350,
  });
  if (options.signal?.aborted) throw abortError();
  const result = collectSearchMatches(
    combined,
    segments,
    normalized,
    normalizedQuery,
    options.maxMatches ?? SEARCH_MAX_MATCHES,
  );
  if (
    !normalized.complete ||
    performance.now() - started > (options.timeBudgetMs ?? 350)
  ) {
    return {
      ...result,
      limitedReason: result.limitedReason ?? "time-budget",
      truncated: true,
    };
  }
  return result;
}

function replacementText(match: SearchMatch, replacement: string): string {
  return match.transformReplacement === "table-cell"
    ? replacement.replaceAll("\\", "\\\\").replaceAll("|", "\\|")
    : replacement;
}

export function buildSearchReplacement(
  index: SearchIndex,
  matches: readonly SearchMatch[],
  replacement: string,
  operation: "search.replace-all" | "search.replace-one",
): ReplacementBuildResult {
  const safeMatches = matches.filter(
    (match): match is SearchMatch & { sourceRange: SourceRange } =>
      match.replaceable && match.sourceRange !== null,
  );
  if (safeMatches.length === 0) return { code: "NO_SAFE_MATCHES", ok: false };
  if (/\r|\n/u.test(replacement)) {
    return { code: "UNSAFE_REPLACEMENT", ok: false };
  }
  if (
    safeMatches.some(
      (match) => match.block.kind === "code-fence" && /[`~]/u.test(replacement),
    )
  ) {
    return { code: "UNSAFE_REPLACEMENT", ok: false };
  }
  const ordered = [...safeMatches].sort(
    (left, right) => left.sourceRange.from - right.sourceRange.from,
  );
  for (let indexValue = 1; indexValue < ordered.length; indexValue += 1) {
    if (
      ordered[indexValue - 1]!.sourceRange.to >
      ordered[indexValue]!.sourceRange.from
    ) {
      return { code: "UNSAFE_REPLACEMENT", ok: false };
    }
  }
  return {
    ok: true,
    transaction: {
      expectedRevision: index.revision,
      expectedSourceHash: index.sourceHash,
      operation,
      patches: ordered.map((match) =>
        createSourcePatch(
          match.block,
          replacementText(match, replacement),
          operation,
          match.sourceRange,
        ),
      ),
    },
  };
}
