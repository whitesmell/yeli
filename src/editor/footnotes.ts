import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import type { Token } from "markdown-it";

import { markdownBodyStart } from "../document/frontmatter.ts";
import {
  createSourcePatch,
  type SourcePatch,
  type SourceRange,
} from "./source-ranges.ts";

export interface FootnoteMeta {
  id?: number;
  label?: string;
  subId?: number;
  source?: string;
}

/** Capture source boundaries at the upstream parser, before it moves notes. */
export function installFootnotes(
  renderer: InstanceType<typeof MarkdownIt>,
): void {
  const blockRules = new Set(renderer.block.ruler.getRules(""));
  const inlineRules = new Set(renderer.inline.ruler.getRules(""));
  renderer.use(footnote);
  const definition = renderer.block.ruler
    .getRules("")
    .find((rule) => !blockRules.has(rule))!;
  renderer.block.ruler.at(
    "footnote_def",
    (state, start, end, silent) => {
      const before = state.tokens.length;
      const accepted = definition(state, start, end, silent);
      if (accepted && !silent) state.tokens[before]!.map = [start, state.line];
      return accepted;
    },
    { alt: ["paragraph", "reference"] },
  );
  const addedInlineRules = renderer.inline.ruler
    .getRules("")
    .filter((rule) => !inlineRules.has(rule));
  for (const [index, name] of ["footnote_inline", "footnote_ref"].entries()) {
    const original = addedInlineRules[index]!;
    renderer.inline.ruler.at(name, (state, silent) => {
      const start = state.pos;
      const before = state.tokens.length;
      const accepted = original(state, silent);
      if (accepted && !silent) {
        const token = state.tokens
          .slice(before)
          .find((item) => item.type === "footnote_ref");
        if (token)
          (token.meta as FootnoteMeta).source = state.src.slice(
            start,
            state.pos,
          );
      }
      return accepted;
    });
  }
}

interface SourceLine {
  from: number;
  content: string;
  eol: string;
  to: number;
}

function sourceLines(source: string, start: number): SourceLine[] {
  const lines: SourceLine[] = [];
  for (let from = start; from < source.length;) {
    const newline = source.indexOf("\n", from);
    const to = newline === -1 ? source.length : newline + 1;
    const eol =
      newline === -1 ? "" : source[newline - 1] === "\r" ? "\r\n" : "\n";
    lines.push({ from, to, eol, content: source.slice(from, to - eol.length) });
    from = to;
  }
  return lines;
}

export interface FootnoteDefinition extends SourceRange {
  label: string;
  body: string;
  bodyRange: SourceRange;
  offsets: number[];
  prefix: string;
  continuationPrefix: string;
  eol: string;
}

function continuationPrefix(content: string): string {
  let width = 0;
  let index = 0;
  while (width < 4 && (content[index] === " " || content[index] === "\t")) {
    width += content[index] === "\t" ? 4 - (width % 4) : 1;
    index += 1;
  }
  return width >= 4 ? content.slice(0, index) : "";
}

let cachedSource: string | undefined;
let cachedDefinitions: FootnoteDefinition[] = [];
export function indexFootnotes(source: string): FootnoteDefinition[] {
  if (!source.includes("[^")) return [];
  if (source === cachedSource) return cachedDefinitions;
  const start = markdownBodyStart(source);
  const lines = sourceLines(source, start);
  const parser = new MarkdownIt({ html: false })
    .use(installFootnotes)
    .disable("footnote_tail");
  const tokens = parser.parse(source.slice(start), {});
  const definitions: FootnoteDefinition[] = [];
  for (const token of tokens) {
    if (
      token.type !== "footnote_reference_open" ||
      token.level !== 0 ||
      !token.map
    )
      continue;
    const first = lines[token.map[0]];
    if (!first) continue;
    let lastIndex = Math.min(token.map[1], lines.length) - 1;
    while (lastIndex > token.map[0] && !lines[lastIndex]!.content.trim())
      lastIndex -= 1;
    const firstPrefix = /^ {0,3}\[\^[^\] ]+\]:[ \t]*/u.exec(first.content)?.[0];
    if (!firstPrefix) continue;
    const label = (token.meta as FootnoteMeta).label!;
    let body = "";
    const offsets: number[] = [];
    let indent = "    ";
    for (let lineIndex = token.map[0]; lineIndex <= lastIndex; lineIndex += 1) {
      const line = lines[lineIndex]!;
      const prefix =
        lineIndex === token.map[0]
          ? firstPrefix
          : continuationPrefix(line.content);
      if (lineIndex > token.map[0] && prefix) indent = prefix;
      const text = line.content.slice(prefix.length);
      for (let offset = 0; offset < text.length; offset += 1)
        offsets.push(line.from + prefix.length + offset);
      body += text;
      if (lineIndex < lastIndex) {
        offsets.push(line.to - line.eol.length);
        body += "\n";
      }
    }
    const last = lines[lastIndex]!;
    offsets.push(last.to - last.eol.length);
    definitions.push({
      label,
      body,
      offsets,
      from: first.from,
      to: last.to,
      bodyRange: {
        from: first.from + firstPrefix.length,
        to: last.to - last.eol.length,
      },
      prefix: firstPrefix,
      continuationPrefix: indent,
      eol: first.eol || "\n",
    });
  }
  cachedSource = source;
  cachedDefinitions = definitions;
  return definitions;
}

export function createFootnoteBodyPatch(
  source: string,
  definition: FootnoteDefinition,
  body: string,
  binding: { revision: number; sourceHash: string },
): SourcePatch | null {
  if (body === definition.body) return null;
  let prefix = 0;
  while (
    prefix < body.length &&
    prefix < definition.body.length &&
    body[prefix] === definition.body[prefix]
  )
    prefix += 1;
  let suffix = 0;
  while (
    suffix < body.length - prefix &&
    suffix < definition.body.length - prefix &&
    body[body.length - suffix - 1] ===
      definition.body[definition.body.length - suffix - 1]
  )
    suffix += 1;
  // Include the preceding newline so insertion before an originally blank
  // line can add its required indentation without changing the blank suffix.
  if (
    prefix > 0 &&
    definition.body[prefix - 1] === "\n" &&
    source[definition.offsets[prefix]! - 1] === "\n"
  )
    prefix -= 1;
  const range = {
    from: definition.offsets[prefix]!,
    to: definition.offsets[definition.body.length - suffix]!,
  };
  const end = body.length - suffix;
  const insert = body
    .slice(prefix, end)
    .replaceAll(
      "\n",
      (_match, offset: number) =>
        definition.eol +
        (body[prefix + offset + 1] && body[prefix + offset + 1] !== "\n"
          ? definition.continuationPrefix
          : ""),
    );
  return createSourcePatch(
    {
      ...binding,
      range: { from: definition.from, to: definition.to },
      id: `footnote:${definition.from}`,
      expectedText: source.slice(definition.from, definition.to),
    },
    insert,
    "footnote:body",
    range,
  );
}

export function footnoteMeta(token: Token): FootnoteMeta {
  return token.meta as FootnoteMeta;
}
