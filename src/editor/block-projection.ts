import {
  indexFrontmatter,
  patchFrontmatter,
  type MetadataValue,
} from "../document/frontmatter.ts";
import {
  createSourcePatch,
  sourceHash,
  type SourcePatch,
  type SourceRange,
} from "./source-ranges.ts";
import { setextHeadingLevel } from "./markdown-lines.ts";

export type SourceBlockKind =
  | "blank"
  | "code-fence"
  | "footnote"
  | "frontmatter"
  | "heading"
  | "list-item"
  | "math"
  | "mermaid"
  | "paragraph"
  | "quote"
  | "raw-html"
  | "reference-definition"
  | "table"
  | "task"
  | "thematic-break"
  | "unknown-extension";

export type ProjectionStatus = "blocked" | "degraded" | "pending" | "ready";
export type ProjectionEvent =
  | "advanced-source-close"
  | "advanced-source-open"
  | "blur"
  | "edit"
  | "focus"
  | "open"
  | "read"
  | "save";

export interface SourceBlock {
  editable: boolean;
  expectedText: string;
  id: string;
  kind: SourceBlockKind;
  range: SourceRange;
  reason?: string;
  revision: number;
  sourceHash: string;
}

export interface BlockProjection {
  blocks: SourceBlock[];
  focused: boolean;
  mode: "advanced-source" | "edit" | "read";
  primaryMode: "edit" | "read";
  revision: number;
  source: string;
  sourceHash: string;
  status: ProjectionStatus;
}

export type ReadEditFallbackReason =
  "selection-ambiguous" | "stale-target" | "target-unavailable";

export interface ReadEditSelectionCandidate {
  end: number;
  renderedText: string;
  selectedText: string;
  start: number;
}

export interface ReadEditTarget {
  block: SourceBlock;
  revision: number;
  selection: ReadEditSelectionCandidate | null;
  selectionWasAmbiguous: boolean;
  sourceHash: string;
  viewportTop: number;
}

export interface ResolvedReadEditTarget {
  block: SourceBlock | null;
  fallbackReason?: ReadEditFallbackReason;
  selection?: {
    end: number;
    selectedText: string;
    start: number;
  };
}

export type ConstructTarget =
  | { kind: "block-content" }
  | { kind: "fence-content" }
  | { checked: boolean; kind: "task-marker" }
  | { column: number; kind: "table-cell"; row: number }
  | {
      kind:
        | "image-alt"
        | "image-target"
        | "image-title"
        | "link-label"
        | "link-target";
      occurrence?: number;
    };

interface Line {
  content: string;
  from: number;
  text: string;
  to: number;
}

function linesFrom(source: string, start: number): Line[] {
  if (start === source.length) {
    return [{ content: "", from: start, text: "", to: start }];
  }
  const lines: Line[] = [];
  let from = start;
  while (from < source.length) {
    const newline = source.indexOf("\n", from);
    const to = newline === -1 ? source.length : newline + 1;
    const text = source.slice(from, to);
    lines.push({
      content: text.endsWith("\n") ? text.slice(0, -1) : text,
      from,
      text,
      to,
    });
    from = to;
  }
  return lines;
}

function block(
  source: string,
  kind: SourceBlockKind,
  range: SourceRange,
  revision: number,
  hash: string,
  editable: boolean,
  reason?: string,
): SourceBlock {
  return {
    editable,
    expectedText: source.slice(range.from, range.to),
    id: `${range.from}:${range.to}:${kind}`,
    kind,
    range,
    ...(reason ? { reason } : {}),
    revision,
    sourceHash: hash,
  };
}

function fenceEnd(lines: Line[], start: number, marker: string): number | null {
  const closing = new RegExp(
    `^ {0,3}${marker[0]}{${marker.length},}\\s*$`,
    "u",
  );
  for (let index = start + 1; index < lines.length; index += 1) {
    if (closing.test(lines[index]!.content)) return index;
  }
  return null;
}

function continuationEnd(lines: Line[], start: number): number {
  let end = start;
  while (
    end + 1 < lines.length &&
    /^(?: {2,}|\t)\S/u.test(lines[end + 1]!.content)
  ) {
    end += 1;
  }
  return end;
}

function sourceSafeUntilBlank(lines: Line[], start: number): number {
  let end = start;
  while (end + 1 < lines.length && lines[end + 1]!.content.trim().length > 0) {
    end += 1;
  }
  return end;
}

function isTableDelimiter(content: string): boolean {
  const cells = content
    .trim()
    .replace(/^\||\|$/gu, "")
    .split("|");
  return (
    cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/u.test(cell))
  );
}

interface TableCellSlice extends SourceRange {
  text: string;
}

function tableCellSlices(content: string): TableCellSlice[] {
  const pipes: number[] = [];
  let escaped = false;
  let activeTickRun = 0;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "`") {
      let runLength = 1;
      while (content[index + runLength] === "`") runLength += 1;
      if (activeTickRun === 0) activeTickRun = runLength;
      else if (activeTickRun === runLength) activeTickRun = 0;
      index += runLength - 1;
      continue;
    }
    if (character === "|" && activeTickRun === 0) pipes.push(index);
  }
  const boundaries = [
    content.trimStart().startsWith("|") ? pipes.shift()! : -1,
    ...pipes,
  ];
  if (!content.trimEnd().endsWith("|")) boundaries.push(content.length);
  if (boundaries.length < 2) return [];
  return boundaries.slice(0, -1).map((boundary, index) => {
    let from = boundary + 1;
    let to = boundaries[index + 1]!;
    while (from < to && /\s/u.test(content[from]!)) from += 1;
    while (to > from && /\s/u.test(content[to - 1]!)) to -= 1;
    return { from, text: content.slice(from, to), to };
  });
}

export function projectTableRows(markdown: string): string[][] {
  return linesFrom(markdown, 0)
    .filter((line) => line.content.trim().length > 0)
    .filter((line) => !isTableDelimiter(line.content))
    .map((line) =>
      tableCellSlices(line.content).map((cell) =>
        cell.text.trim().replaceAll("\\|", "|").replaceAll("\\\\", "\\"),
      ),
    );
}

function startsDistinctBlock(lines: Line[], index: number): boolean {
  const content = lines[index]?.content ?? "";
  const next = lines[index + 1]?.content;
  return (
    content.trim().length === 0 ||
    /^ {0,3}(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s|`{3,}|~{3,}|\[\^[^\]]+\]:|\[[^\]]+\]:|<|\$\$|:::|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/u.test(
      content,
    ) ||
    setextHeadingLevel(content, next) !== null ||
    (content.includes("|") && next !== undefined && isTableDelimiter(next))
  );
}

export function projectMarkdown(
  source: string,
  revision: number,
): BlockProjection {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(
      "Projection revision must be a non-negative safe integer",
    );
  }
  const hash = sourceHash(source);
  const blocks: SourceBlock[] = [];
  const frontmatter = indexFrontmatter(source);
  let start = 0;
  if (frontmatter.frontmatterRange) {
    const [from, to] = frontmatter.frontmatterRange;
    blocks.push(
      block(
        source,
        "frontmatter",
        { from, to },
        revision,
        hash,
        frontmatter.status === "safe",
        frontmatter.status === "safe" ? undefined : "ambiguous-frontmatter",
      ),
    );
    start = frontmatter.bodyStart;
  }

  const lines = linesFrom(source, start);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const content = line.content;

    if (content.trim().length === 0) {
      blocks.push(block(source, "blank", line, revision, hash, true));
      index += 1;
      continue;
    }

    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(content);
    if (fence) {
      const marker = fence[1]!;
      if (marker[0] === "`" && fence[2]!.includes("`")) {
        blocks.push(
          block(
            source,
            "paragraph",
            { from: line.from, to: line.to },
            revision,
            hash,
            true,
          ),
        );
        index += 1;
        continue;
      }
      const closedAt = fenceEnd(lines, index, marker);
      const endIndex = closedAt ?? lines.length - 1;
      const language = fence[2]!.trim().split(/\s+/u)[0]?.toLowerCase() ?? "";
      const sourceSafe =
        closedAt === null ||
        language === "mermaid" ||
        language === "math" ||
        language === "katex";
      const kind: SourceBlockKind =
        closedAt === null
          ? "code-fence"
          : language === "mermaid"
            ? "mermaid"
            : sourceSafe
              ? "math"
              : "code-fence";
      blocks.push(
        block(
          source,
          kind,
          { from: line.from, to: lines[endIndex]!.to },
          revision,
          hash,
          !sourceSafe,
          closedAt === null
            ? "unclosed-fence"
            : sourceSafe
              ? "extension-is-source-safe"
              : undefined,
        ),
      );
      index = endIndex + 1;
      continue;
    }

    if (/^ {0,3}:::/u.test(content)) {
      let endIndex = index;
      while (endIndex + 1 < lines.length) {
        endIndex += 1;
        if (/^ {0,3}:::\s*$/u.test(lines[endIndex]!.content)) break;
      }
      blocks.push(
        block(
          source,
          "unknown-extension",
          { from: line.from, to: lines[endIndex]!.to },
          revision,
          hash,
          false,
          "unknown-extension",
        ),
      );
      index = endIndex + 1;
      continue;
    }

    let kind: SourceBlockKind | undefined;
    let endIndex = index;
    let editable = true;
    let reason: string | undefined;
    if (/^ {0,3}\[\^[^\]]+\]:/u.test(content)) {
      kind = "footnote";
      editable = false;
      reason = "footnote-is-source-safe";
      endIndex = continuationEnd(lines, index);
    } else if (/^ {0,3}\[[^\]]+\]:/u.test(content)) {
      kind = "reference-definition";
      editable = false;
      reason = "reference-definition-is-source-safe";
      endIndex = continuationEnd(lines, index);
    } else if (/^ {0,3}(?:<!--|<\/?[A-Za-z!])/u.test(content)) {
      kind = "raw-html";
      editable = false;
      reason = "raw-html-is-source-safe";
      endIndex = content.includes("-->")
        ? index
        : sourceSafeUntilBlank(lines, index);
    } else if (/^ {0,3}\$\$/u.test(content)) {
      kind = "math";
      editable = false;
      reason = "math-is-source-safe";
      const closesInline = content
        .slice(content.indexOf("$$") + 2)
        .includes("$$");
      if (!closesInline) {
        while (endIndex + 1 < lines.length) {
          endIndex += 1;
          if (lines[endIndex]!.content.includes("$$")) break;
        }
      }
    } else if (/^ {0,3}#{1,6}\s/u.test(content)) {
      kind = "heading";
    } else if (
      setextHeadingLevel(content, lines[index + 1]?.content) !== null
    ) {
      kind = "heading";
      endIndex = index + 1;
    } else if (
      /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u.test(content)
    ) {
      kind = "thematic-break";
    } else if (/^\s*(?:[-+*]|\d+[.)])\s+\[[ xX]\](?:\s|$)/u.test(content)) {
      kind = "task";
    } else if (/^\s*(?:[-+*]|\d+[.)])\s+/u.test(content)) {
      kind = "list-item";
    } else if (/^ {0,3}>/u.test(content)) {
      kind = "quote";
    }

    if (kind) {
      blocks.push(
        block(
          source,
          kind,
          { from: line.from, to: lines[endIndex]!.to },
          revision,
          hash,
          editable,
          reason,
        ),
      );
      index = endIndex + 1;
      continue;
    }

    if (
      content.includes("|") &&
      lines[index + 1] !== undefined &&
      isTableDelimiter(lines[index + 1]!.content)
    ) {
      let endIndex = index + 1;
      while (
        endIndex + 1 < lines.length &&
        lines[endIndex + 1]!.content.includes("|") &&
        lines[endIndex + 1]!.content.trim().length > 0
      ) {
        endIndex += 1;
      }
      blocks.push(
        block(
          source,
          "table",
          { from: line.from, to: lines[endIndex]!.to },
          revision,
          hash,
          true,
        ),
      );
      index = endIndex + 1;
      continue;
    }

    let paragraphEnd = index;
    while (
      paragraphEnd + 1 < lines.length &&
      !startsDistinctBlock(lines, paragraphEnd + 1)
    ) {
      paragraphEnd += 1;
    }
    blocks.push(
      block(
        source,
        "paragraph",
        { from: line.from, to: lines[paragraphEnd]!.to },
        revision,
        hash,
        true,
      ),
    );
    index = paragraphEnd + 1;
  }

  const degraded = blocks.some(
    (item) => !item.editable && item.kind !== "blank",
  );
  return {
    blocks,
    focused: false,
    mode: "read",
    primaryMode: "read",
    revision,
    source,
    sourceHash: hash,
    status: degraded ? "degraded" : "ready",
  };
}

export function transitionProjection(
  projection: BlockProjection,
  event: ProjectionEvent,
): BlockProjection {
  switch (event) {
    case "focus":
      return { ...projection, focused: true };
    case "blur":
      return { ...projection, focused: false };
    case "edit":
      return { ...projection, mode: "edit", primaryMode: "edit" };
    case "read":
      return { ...projection, mode: "read", primaryMode: "read" };
    case "advanced-source-open":
      return { ...projection, mode: "advanced-source" };
    case "advanced-source-close":
      return { ...projection, mode: projection.primaryMode };
    case "open":
    case "save":
      return projection;
  }
}

const INLINE_EDITABLE_BLOCK_KINDS = new Set<SourceBlockKind>([
  "blank",
  "heading",
  "list-item",
  "paragraph",
  "quote",
  "task",
]);

function nearestVisibleBlock(
  projection: BlockProjection,
  from: number,
): SourceBlock | null {
  const visible = projection.blocks.filter(
    (block) => block.kind !== "blank" && block.kind !== "frontmatter",
  );
  return (
    visible.find((block) => block.range.from >= from) ?? visible.at(-1) ?? null
  );
}

export function resolveReadEditTarget(
  projection: BlockProjection,
  target: ReadEditTarget,
): ResolvedReadEditTarget {
  const sameRevision =
    projection.revision === target.revision &&
    projection.sourceHash === target.sourceHash;
  let block = projection.blocks.find(
    (candidate) =>
      candidate.id === target.block.id &&
      candidate.kind === target.block.kind &&
      candidate.range.from === target.block.range.from &&
      candidate.range.to === target.block.range.to &&
      candidate.expectedText === target.block.expectedText,
  );
  let fallbackReason: ReadEditFallbackReason | undefined;

  if (!sameRevision) {
    block = projection.blocks.find(
      (candidate) =>
        candidate.kind === target.block.kind &&
        candidate.range.from === target.block.range.from &&
        candidate.expectedText === target.block.expectedText,
    );
    fallbackReason = "stale-target";
  }
  if (!block) {
    block =
      nearestVisibleBlock(projection, target.block.range.from) ?? undefined;
    fallbackReason = "target-unavailable";
  }
  if (!block) return { block: null, fallbackReason: "target-unavailable" };

  if (target.selectionWasAmbiguous) {
    return { block, fallbackReason: "selection-ambiguous" };
  }
  const selection = target.selection;
  if (!selection)
    return { block, ...(fallbackReason ? { fallbackReason } : {}) };
  if (
    !sameRevision ||
    !block.editable ||
    !INLINE_EDITABLE_BLOCK_KINDS.has(block.kind)
  ) {
    return {
      block,
      fallbackReason: fallbackReason ?? "selection-ambiguous",
    };
  }
  const contentRange = blockContentRange(block);
  const content = projection.source.slice(contentRange.from, contentRange.to);
  if (
    content !== selection.renderedText ||
    selection.start < 0 ||
    selection.end <= selection.start ||
    selection.end > content.length ||
    content.slice(selection.start, selection.end) !== selection.selectedText
  ) {
    return { block, fallbackReason: "selection-ambiguous" };
  }
  return {
    block,
    selection: {
      end: selection.end,
      selectedText: selection.selectedText,
      start: selection.start,
    },
  };
}

export function createBlockReplacementPatch(
  sourceBlock: SourceBlock,
  insert: string,
): SourcePatch {
  if (!sourceBlock.editable) {
    throw new Error(`Block ${sourceBlock.kind} is source-safe`);
  }
  if (!INLINE_EDITABLE_BLOCK_KINDS.has(sourceBlock.kind)) {
    throw new Error(
      `Block ${sourceBlock.kind} requires a construct-specific patch`,
    );
  }
  return createSourcePatch(sourceBlock, insert, `replace:${sourceBlock.kind}`);
}

function absoluteRange(
  sourceBlock: SourceBlock,
  from: number,
  to: number,
): SourceRange {
  return {
    from: sourceBlock.range.from + from,
    to: sourceBlock.range.from + to,
  };
}

function lineContentEnd(text: string): number {
  return text.endsWith("\n") ? text.length - 1 : text.length;
}

function blockContentRange(sourceBlock: SourceBlock): SourceRange {
  const text = sourceBlock.expectedText;
  if (sourceBlock.kind === "heading" && !/^ {0,3}#{1,6}\s/u.test(text)) {
    const firstLineEnd = text.indexOf("\n");
    if (
      firstLineEnd !== -1 &&
      /^ {0,3}(?:=+|-+)\s*$/u.test(text.slice(firstLineEnd + 1).trimEnd())
    ) {
      return absoluteRange(sourceBlock, 0, firstLineEnd);
    }
  }
  const end = lineContentEnd(text);
  const prefixByKind: Partial<Record<SourceBlockKind, RegExp>> = {
    heading: /^ {0,3}#{1,6}\s+/u,
    "list-item": /^\s*(?:[-+*]|\d+[.)])\s+/u,
    task: /^\s*(?:[-+*]|\d+[.)])\s+\[[ xX]\]\s*/u,
    quote: /^ {0,3}>\s?/u,
  };
  const prefix = prefixByKind[sourceBlock.kind]?.exec(text)?.[0].length ?? 0;
  return absoluteRange(sourceBlock, prefix, end);
}

function fenceContentRange(sourceBlock: SourceBlock): SourceRange {
  if (sourceBlock.kind !== "code-fence") {
    throw new Error("Fence content patches require an editable code fence");
  }
  const text = sourceBlock.expectedText;
  const firstNewline = text.indexOf("\n");
  const lastLineStart = text.endsWith("\n")
    ? text.lastIndexOf("\n", text.length - 2) + 1
    : text.lastIndexOf("\n") + 1;
  if (firstNewline === -1 || lastLineStart <= firstNewline) {
    throw new Error("Unclosed code fence is source-safe");
  }
  return absoluteRange(sourceBlock, firstNewline + 1, lastLineStart);
}

function markdownLinks(sourceBlock: SourceBlock): Array<{
  altOrLabel: SourceRange;
  angleTarget: boolean;
  image: boolean;
  linkClose: SourceRange;
  target: SourceRange;
  title?: { closing: string; range: SourceRange };
}> {
  const results: Array<{
    altOrLabel: SourceRange;
    angleTarget: boolean;
    image: boolean;
    linkClose: SourceRange;
    target: SourceRange;
    title?: { closing: string; range: SourceRange };
  }> = [];
  const text = sourceBlock.expectedText;
  for (let index = 0; index < text.length; index += 1) {
    const image = text[index] === "!" && text[index + 1] === "[";
    const labelOpen = image ? index + 1 : index;
    if (text[labelOpen] !== "[") continue;

    let labelClose = labelOpen + 1;
    let labelDepth = 0;
    let escaped = false;
    for (; labelClose < text.length; labelClose += 1) {
      const character = text[labelClose]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === "[") labelDepth += 1;
      else if (character === "]" && labelDepth > 0) labelDepth -= 1;
      else if (character === "]") break;
      if (character === "\n") break;
    }
    if (text[labelClose] !== "]" || text[labelClose + 1] !== "(") continue;

    const parsedTarget = inlineLinkTarget(text, labelClose + 2);
    if (!parsedTarget) continue;
    results.push({
      altOrLabel: absoluteRange(sourceBlock, labelOpen + 1, labelClose),
      angleTarget: parsedTarget.angle,
      image,
      linkClose: absoluteRange(
        sourceBlock,
        parsedTarget.linkClose,
        parsedTarget.linkClose,
      ),
      target: absoluteRange(sourceBlock, parsedTarget.from, parsedTarget.to),
      ...(parsedTarget.title
        ? {
            title: {
              closing: parsedTarget.title.closing,
              range: absoluteRange(
                sourceBlock,
                parsedTarget.title.from,
                parsedTarget.title.to,
              ),
            },
          }
        : {}),
    });
    index = parsedTarget.linkClose;
  }
  return results;
}

function inlineLinkTarget(
  text: string,
  destinationStart: number,
): {
  angle: boolean;
  from: number;
  linkClose: number;
  title?: { closing: string; from: number; to: number };
  to: number;
} | null {
  if (text[destinationStart] === "<") {
    let cursor = destinationStart + 1;
    let escaped = false;
    for (; cursor < text.length; cursor += 1) {
      const character = text[cursor]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === "\n" || character === "<") return null;
      if (character === ">") {
        const closure = linkCloseAfterDestination(text, cursor + 1);
        return closure === null
          ? null
          : {
              angle: true,
              from: destinationStart + 1,
              linkClose: closure.linkClose,
              ...(closure.title ? { title: closure.title } : {}),
              to: cursor,
            };
      }
    }
    return null;
  }

  let cursor = destinationStart;
  let depth = 0;
  let escaped = false;
  for (; cursor < text.length; cursor += 1) {
    const character = text[cursor]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\n") return null;
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      return {
        angle: false,
        from: destinationStart,
        linkClose: cursor,
        to: cursor,
      };
    }
    if (/\s/u.test(character) && depth === 0) {
      const closure = linkCloseAfterDestination(text, cursor);
      return closure === null
        ? null
        : {
            angle: false,
            from: destinationStart,
            linkClose: closure.linkClose,
            ...(closure.title ? { title: closure.title } : {}),
            to: cursor,
          };
    }
  }
  return null;
}

function linkCloseAfterDestination(
  text: string,
  start: number,
): {
  linkClose: number;
  title?: { closing: string; from: number; to: number };
} | null {
  let cursor = start;
  while (text[cursor] === " " || text[cursor] === "\t") cursor += 1;
  if (text[cursor] === ")") return { linkClose: cursor };
  const delimiter = text[cursor];
  if (delimiter !== '"' && delimiter !== "'" && delimiter !== "(") return null;
  const closing = delimiter === "(" ? ")" : delimiter;
  const titleFrom = cursor + 1;
  cursor += 1;
  let escaped = false;
  for (; cursor < text.length; cursor += 1) {
    const character = text[cursor]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\n") return null;
    if (character !== closing) continue;
    const titleTo = cursor;
    cursor += 1;
    while (text[cursor] === " " || text[cursor] === "\t") cursor += 1;
    return text[cursor] === ")"
      ? {
          linkClose: cursor,
          title: { closing, from: titleFrom, to: titleTo },
        }
      : null;
  }
  return null;
}

function tableCellRange(
  sourceBlock: SourceBlock,
  row: number,
  column: number,
): SourceRange {
  if (sourceBlock.kind !== "table") throw new Error("Block is not a table");
  const rowLines = linesFrom(sourceBlock.expectedText, 0).filter(
    (line) => !isTableDelimiter(line.content),
  );
  const line = rowLines[row];
  if (line === undefined) throw new RangeError("Table row is out of range");
  const cells = tableCellSlices(line.content);
  const cell = cells[column];
  if (cell === undefined || column < 0) {
    throw new RangeError("Table column is out of range");
  }
  return absoluteRange(sourceBlock, line.from + cell.from, line.from + cell.to);
}

export function createConstructPatch(
  sourceBlock: SourceBlock,
  target: ConstructTarget,
  insert: string,
): SourcePatch {
  if (!sourceBlock.editable) {
    throw new Error(`Block ${sourceBlock.kind} is source-safe`);
  }
  let range: SourceRange;
  switch (target.kind) {
    case "block-content": {
      if (!INLINE_EDITABLE_BLOCK_KINDS.has(sourceBlock.kind)) {
        throw new Error(
          `Block ${sourceBlock.kind} requires a construct-specific patch`,
        );
      }
      range = blockContentRange(sourceBlock);
      break;
    }
    case "fence-content":
      range = fenceContentRange(sourceBlock);
      if (insert.length > 0 && !insert.endsWith("\n")) {
        throw new Error("Fence content must end before the closing fence line");
      }
      {
        const opening = /^ {0,3}(`{3,}|~{3,})/u.exec(
          sourceBlock.expectedText,
        )?.[1];
        if (!opening) throw new Error("Code fence marker is ambiguous");
        const closing = new RegExp(
          `^ {0,3}${opening[0]}{${opening.length},}\\s*$`,
          "mu",
        );
        if (closing.test(insert)) {
          throw new Error("Fence content would close its own Markdown fence");
        }
      }
      break;
    case "task-marker": {
      if (sourceBlock.kind !== "task") throw new Error("Block is not a task");
      const marker = /\[[ xX]\]/u.exec(sourceBlock.expectedText);
      if (!marker || marker.index === undefined)
        throw new Error("Task marker is ambiguous");
      range = absoluteRange(
        sourceBlock,
        marker.index,
        marker.index + marker[0].length,
      );
      insert = target.checked ? "[x]" : "[ ]";
      break;
    }
    case "table-cell":
      range = tableCellRange(sourceBlock, target.row, target.column);
      if (/[\r\n]/u.test(insert)) {
        throw new Error("Table cell content cannot contain a line break");
      }
      insert = insert.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
      break;
    case "image-alt":
    case "image-target":
    case "image-title":
    case "link-label":
    case "link-target": {
      if (
        !(["heading", "list-item", "paragraph", "quote", "task"] as const).some(
          (kind) => kind === sourceBlock.kind,
        )
      ) {
        throw new Error(
          `Inline links in ${sourceBlock.kind} require a construct-specific patch`,
        );
      }
      const image =
        target.kind === "image-alt" ||
        target.kind === "image-target" ||
        target.kind === "image-title";
      const matches = markdownLinks(sourceBlock).filter(
        (item) => item.image === image,
      );
      const match = matches[target.occurrence ?? 0];
      if (!match)
        throw new RangeError(`${target.kind} occurrence is out of range`);
      if (target.kind === "image-title") {
        if (/[\r\n]/u.test(insert)) {
          throw new Error("Image titles cannot span lines");
        }
        if (match.title) {
          range = match.title.range;
          insert = insert
            .replaceAll("\\", "\\\\")
            .replaceAll(match.title.closing, `\\${match.title.closing}`);
        } else {
          range = match.linkClose;
          insert =
            insert.length === 0
              ? ""
              : ` "${insert.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
        }
        break;
      }
      const destination =
        target.kind === "link-target" || target.kind === "image-target";
      range = destination ? match.target : match.altOrLabel;
      if (destination) {
        if (match.angleTarget) {
          if (/[\r\n<>]/u.test(insert)) {
            throw new Error(
              "Angle-bracket link target cannot contain a line break or angle bracket",
            );
          }
        } else {
          if (/\s/u.test(insert)) {
            throw new Error("Link target cannot contain whitespace");
          }
          insert = insert
            .replaceAll("\\", "\\\\")
            .replaceAll("(", "\\(")
            .replaceAll(")", "\\)");
        }
      } else {
        if (/[\r\n]/u.test(insert)) {
          throw new Error("Link labels and image alt text cannot span lines");
        }
        insert = insert.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
      }
      break;
    }
  }
  return createSourcePatch(
    sourceBlock,
    insert,
    `construct:${target.kind}`,
    range,
  );
}

function nextListPrefix(prefix: string): string {
  const ordered = /^(\s*)(\d+)([.)])(\s+)$/u.exec(prefix);
  if (!ordered) return prefix;
  return `${ordered[1]}${Number(ordered[2]) + 1}${ordered[3]}${ordered[4]}`;
}

export function createSplitInlineBlockPatch(
  sourceBlock: SourceBlock,
  before: string,
  after: string,
): SourcePatch {
  const ending = sourceBlock.expectedText.endsWith("\n") ? "\n" : "";
  if (sourceBlock.kind === "list-item") {
    const prefix = /^(\s*(?:[-+*]|\d+[.)])\s+)/u.exec(
      sourceBlock.expectedText,
    )?.[1];
    if (!prefix) throw new Error("List marker is ambiguous");
    return createSourcePatch(
      sourceBlock,
      `${prefix}${before}\n${nextListPrefix(prefix)}${after}${ending}`,
      "wysiwyg:split-list-item",
    );
  }
  if (sourceBlock.kind === "task") {
    const match = /^(\s*(?:[-+*]|\d+[.)])\s+)(\[[ xX]\]\s*)/u.exec(
      sourceBlock.expectedText,
    );
    if (!match) throw new Error("Task marker is ambiguous");
    return createSourcePatch(
      sourceBlock,
      `${match[1]}${match[2]}${before}\n${nextListPrefix(match[1]!)}[ ] ${after}${ending}`,
      "wysiwyg:split-task",
    );
  }
  throw new Error(
    `Block ${sourceBlock.kind} does not support structural split`,
  );
}

export function createFrontmatterPropertyPatch(
  projection: BlockProjection,
  key: string,
  value: MetadataValue | undefined,
): SourcePatch {
  const result = patchFrontmatter(projection.source, key, value);
  if (!result.ok) throw new Error("Frontmatter property patch is unsafe");
  const before = {
    from: result.changedRange.before[0],
    to: result.changedRange.before[1],
  };
  const insert = result.source.slice(
    result.changedRange.after[0],
    result.changedRange.after[1],
  );
  const existing = projection.blocks.find(
    (item) => item.kind === "frontmatter",
  );
  if (existing && !existing.editable) {
    throw new Error("Frontmatter is unsafe for property editing");
  }
  const binding: SourceBlock =
    existing ??
    block(
      projection.source,
      "frontmatter",
      { from: 0, to: 0 },
      projection.revision,
      projection.sourceHash,
      true,
    );
  return createSourcePatch(binding, insert, `frontmatter:${key}`, before);
}
