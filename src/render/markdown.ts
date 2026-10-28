import DOMPurify from "dompurify";
import type { DOMPurify as DOMPurifyInstance, WindowLike } from "dompurify";
import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

import {
  indexFrontmatter,
  markdownBodyStart,
} from "../document/frontmatter.ts";
import {
  footnoteMeta,
  indexFootnotes,
  installFootnotes,
} from "../editor/footnotes.ts";
import {
  projectMarkdown,
  type SourceBlock,
} from "../editor/block-projection.ts";

export interface MarkdownRenderOptions {
  imageUnavailableLabel?: string;
  revision?: number;
  resolveImage?: (destination: string) => string | null;
  footnoteContext?: InlineFootnoteContext;
  footnoteSourceFrom?: number;
  editorFootnotes?: boolean;
  footnotesSupplementLabel?: string;
}

interface FootnoteEnvironment {
  [key: string | symbol]: unknown;
  footnotes?: {
    refs?: Record<string, number>;
    list?: {
      label?: string;
      content?: string;
      count?: number;
      tokens?: Token[];
    }[];
  };
}

export interface InlineFootnoteContext {
  environment: FootnoteEnvironment;
  source: string;
  inline: Map<number, { content: string; tokens: Token[] }>;
}

export interface MarkdownRenderSegments {
  afterCallout: string;
  beforeCallout: string;
  callout: string | null;
}

let sanitizer: DOMPurifyInstance | null =
  typeof DOMPurify.sanitize === "function" ? DOMPurify : null;

/**
 * Repository-only Node helpers may provide a DOM implementation before
 * rendering. The browser runtime continues to use DOMPurify's native window.
 */
export function configureMarkdownSanitizer(windowLike: WindowLike): void {
  const configured = DOMPurify(windowLike);
  if (!configured.isSupported || typeof configured.sanitize !== "function") {
    throw new Error("DOMPurify is unavailable in this rendering environment");
  }
  sanitizer = configured;
}

function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/gu, "-");
  return slug || "section";
}

function rendererFor(options: MarkdownRenderOptions) {
  const renderer = new MarkdownIt({
    breaks: false,
    html: false,
    linkify: false,
    typographer: false,
  }).use(installFootnotes);
  const seenHeadings = new Map<string, number>();
  const supplementaryHeadingIds = new WeakMap<Token, string>();
  let extraDefinitions: { label: string; tokens: Token[] }[] = [];

  renderer.core.ruler.before(
    "footnote_tail",
    "yeli_footnote_definitions",
    (state) => {
      const definitions: typeof extraDefinitions = [];
      for (let index = 0; index < state.tokens.length; index += 1) {
        const token = state.tokens[index]!;
        if (token.type !== "footnote_reference_open") continue;
        const start = index + 1;
        while (
          index < state.tokens.length &&
          state.tokens[index]!.type !== "footnote_reference_close"
        )
          index += 1;
        definitions.push({
          label: footnoteMeta(token).label!,
          tokens: state.tokens.slice(start, index),
        });
      }
      const environment = state.env as FootnoteEnvironment;
      const used = new Set(
        environment.footnotes?.list?.map((item) => item.label),
      );
      extraDefinitions = definitions.filter(
        (definition, index) =>
          !used.has(definition.label) ||
          definitions.some(
            (next, nextIndex) =>
              nextIndex > index && next.label === definition.label,
          ),
      );
    },
  );
  renderer.core.ruler.after(
    "footnote_tail",
    "yeli_footnote_supplement",
    (state) => {
      if (!extraDefinitions.length) return;
      const token = new state.Token("html_block", "", 0);
      const escape = renderer.utils.escapeHtml;
      token.content = `<section class="footnotes footnotes-supplement" aria-label="${escape(options.footnotesSupplementLabel ?? "Additional footnotes")}">${extraDefinitions
        .map((definition, definitionIndex) => {
          let headingIndex = 0;
          for (const token of definition.tokens) {
            if (token.type !== "heading_open") continue;
            // Supplements render during parsing, before the main document.
            // Their IDs must never consume its outline heading counters.
            supplementaryHeadingIds.set(
              token,
              `yeli:fnextra:${definitionIndex + 1}:heading:${++headingIndex}`,
            );
          }
          return `<div class="footnote-extra" data-footnote-label="${escape(definition.label)}"><p class="footnote-label">${escape(`[^${definition.label}]`)}</p>${renderer.renderer.render(definition.tokens, renderer.options, state.env)}</div>`;
        })
        .join("")}</section>\n`;
      state.tokens.push(token);
    },
  );
  renderer.renderer.rules.footnote_ref = (tokens, index) => {
    const meta = footnoteMeta(tokens[index]!);
    const number = (meta.id ?? 0) + 1;
    const occurrence = (meta.subId ?? 0) + 1;
    if (options.editorFootnotes && meta.source) {
      return `<sup class="footnote-ref footnote-atom" contenteditable="false" data-footnote-source="${renderer.utils.escapeHtml(meta.source)}"><span>${number}</span></sup>`;
    }
    return `<sup class="footnote-ref"><a href="#yeli:fn:${number}" id="yeli:fnref:${number}:${occurrence}">[${number}]</a></sup>`;
  };
  renderer.renderer.rules.footnote_open = (
    tokens,
    index,
    rendererOptions,
    _,
    self,
  ) => {
    const token = tokens[index]!;
    token.tag = "li";
    token.attrSet("id", `yeli:fn:${(footnoteMeta(token).id ?? 0) + 1}`);
    token.attrSet("class", "footnote-item");
    return self.renderToken(tokens, index, rendererOptions);
  };
  renderer.renderer.rules.footnote_anchor = (tokens, index) => {
    const meta = footnoteMeta(tokens[index]!);
    return ` <a href="#yeli:fnref:${(meta.id ?? 0) + 1}:${(meta.subId ?? 0) + 1}" class="footnote-backref">\u21a9\uFE0E</a>`;
  };

  renderer.core.ruler.after("inline", "yeli_task_lists", (state) => {
    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index]!;
      if (token.type !== "inline" || !token.children) continue;
      const text = token.children[0];
      if (!text || text.type !== "text") continue;
      const task = /^\[([ xX])\]\s+/u.exec(text.content);
      if (!task) continue;
      text.content = text.content.slice(task[0].length);
      const checkbox = new state.Token("html_inline", "", 0);
      checkbox.content = `<input class="task-checkbox" type="checkbox" tabindex="-1" aria-disabled="true" disabled${task[1]?.toLocaleLowerCase("en-US") === "x" ? " checked" : ""} aria-hidden="true">`;
      token.children.unshift(checkbox);
      for (let parent = index - 1; parent >= 0; parent -= 1) {
        if (state.tokens[parent]!.type !== "list_item_open") continue;
        state.tokens[parent]!.attrJoin("class", "task-list-item");
        break;
      }
    }
  });

  renderer.renderer.rules.heading_open = (
    tokens,
    index,
    rendererOptions,
    _,
    self,
  ) => {
    const supplementaryId = supplementaryHeadingIds.get(tokens[index]!);
    if (supplementaryId) {
      tokens[index]!.attrSet("id", supplementaryId);
      return self.renderToken(tokens, index, rendererOptions);
    }
    const inline = tokens[index + 1];
    const base = slugify(inline?.content ?? "section");
    const count = (seenHeadings.get(base) ?? 0) + 1;
    seenHeadings.set(base, count);
    tokens[index]!.attrSet("id", count === 1 ? base : `${base}-${count}`);
    return self.renderToken(tokens, index, rendererOptions);
  };

  renderer.renderer.rules.image = (tokens, index) => {
    const token = tokens[index]!;
    const alternative = renderer.utils.escapeHtml(
      String(token.content || "image"),
    );
    const destination = String(token.attrGet("src") ?? "");
    const resolved = options.resolveImage?.(destination) ?? null;
    if (!resolved) {
      const notice = renderer.utils.escapeHtml(
        options.imageUnavailableLabel ?? "Image not loaded",
      );
      return `<span class="blocked-media" role="note">[${alternative}: ${notice}]</span>`;
    }
    return `<img class="document-image" src="${renderer.utils.escapeHtml(resolved)}" alt="${alternative}" loading="lazy">`;
  };
  renderer.renderer.rules.link_open = (
    tokens,
    index,
    rendererOptions,
    _environment,
    self,
  ) => {
    const token = tokens[index]!;
    const destination = String(token.attrGet("href") ?? "").trim();
    const allowed =
      /^(?:https?:|mailto:|#|\.\.\/|\.\/|\/)/iu.test(destination) &&
      !destination.startsWith("//");
    if (!allowed) {
      token.attrs = (token.attrs ?? []).filter(([name]) => name !== "href");
      token.attrJoin("class", "blocked-link");
      token.attrSet("aria-disabled", "true");
    } else if (/^https?:/iu.test(destination)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return self.renderToken(tokens, index, rendererOptions);
  };
  return renderer;
}

function sanitize(html: string): string {
  if (!sanitizer) {
    throw new Error(
      "DOMPurify requires a browser DOM or an explicitly configured Node DOM",
    );
  }
  return sanitizer.sanitize(html, {
    FORBID_TAGS: [
      "base",
      "embed",
      "form",
      "iframe",
      "math",
      "object",
      "script",
      "style",
      "svg",
    ],
    FORBID_ATTR: ["style"],
    ADD_ATTR: [
      "disabled",
      "checked",
      "tabindex",
      "aria-disabled",
      "target",
      "rel",
      "contenteditable",
    ],
  });
}

function documentBodyRange(source: string): {
  body: string;
  bodyStart: number;
} {
  const bodyStart = markdownBodyStart(source);
  return { body: source.slice(bodyStart), bodyStart };
}

function tokenTypeForBlock(block: SourceBlock): string {
  if (block.kind === "heading") return "heading_open";
  if (block.kind === "list-item" || block.kind === "task") {
    return "list_item_open";
  }
  if (block.kind === "quote") return "paragraph_open";
  if (block.kind === "table") return "table_open";
  if (
    block.kind === "code-fence" ||
    block.kind === "math" ||
    block.kind === "mermaid"
  ) {
    return "fence";
  }
  return "paragraph_open";
}

function annotateReadBlocks(
  tokens: Token[],
  source: string,
  bodyStart: number,
  revision: number,
): void {
  const projection = projectMarkdown(source, revision);
  const body = source.slice(bodyStart);
  const lineStarts = [bodyStart];
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "\n") lineStarts.push(bodyStart + index + 1);
  }
  const blocksByStart = new Map<number, SourceBlock[]>();
  for (const block of projection.blocks) {
    const candidates = blocksByStart.get(block.range.from);
    if (candidates) candidates.push(block);
    else blocksByStart.set(block.range.from, [block]);
  }
  const used = new Set<string>();
  const definitions = new Map(
    indexFootnotes(source).map((definition) => [definition.label, definition]),
  );
  const bind = (token: Token, block: SourceBlock) => {
    token.attrSet("data-read-block-id", block.id);
    token.attrSet("data-source-from", String(block.range.from));
    token.attrSet("data-source-to", String(block.range.to));
    token.attrSet("data-source-kind", block.kind);
    token.attrSet("data-source-revision", String(revision));
  };
  for (const token of tokens) {
    if (token.type === "footnote_open") {
      const label = footnoteMeta(token).label;
      const definition =
        label === undefined ? undefined : definitions.get(label);
      const block =
        definition &&
        blocksByStart
          .get(definition.from)
          ?.find((block) => block.kind === "footnote");
      if (block) {
        bind(token, block);
        used.add(block.id);
      }
      continue;
    }
    if (!token.map) continue;
    const from = lineStarts[token.map[0]];
    const to = lineStarts[token.map[1]] ?? source.length;
    if (from === undefined) continue;
    const block = blocksByStart
      .get(from)
      ?.find(
        (candidate) =>
          !used.has(candidate.id) &&
          (candidate.kind === "list-item" || candidate.kind === "task"
            ? candidate.range.to <= to
            : candidate.range.to === to) &&
          token.type === tokenTypeForBlock(candidate),
      );
    if (!block) continue;
    used.add(block.id);
    bind(token, block);
  }
}

export function usesFirstQuoteCallout(source: string): boolean {
  const frontmatter = indexFrontmatter(source);
  if (frontmatter.status !== "safe" || !frontmatter.frontmatterRange)
    return false;
  const [from, to] = frontmatter.frontmatterRange;
  return /^yeli-callout:\s*["']?first-quote["']?\s*$/mu.test(
    source.slice(from, to),
  );
}

export function renderDocumentMarkdownSegments(
  source: string,
  options: MarkdownRenderOptions = {},
): MarkdownRenderSegments {
  const renderer = rendererFor(options);
  const environment = {};
  const { body, bodyStart } = documentBodyRange(source);
  const tokens = renderer.parse(body, environment);
  annotateReadBlocks(tokens, source, bodyStart, options.revision ?? 0);
  const open = usesFirstQuoteCallout(source)
    ? tokens.findIndex(
        (token) => token.type === "blockquote_open" && token.level === 0,
      )
    : -1;
  if (open === -1) {
    return {
      afterCallout: "",
      beforeCallout: sanitize(
        renderer.renderer.render(tokens, renderer.options, environment),
      ),
      callout: null,
    };
  }

  let depth = 0;
  let close = open;
  for (; close < tokens.length; close += 1) {
    if (tokens[close]?.type === "blockquote_open") depth += 1;
    if (tokens[close]?.type === "blockquote_close") depth -= 1;
    if (depth === 0) break;
  }

  const render = (slice: typeof tokens) =>
    sanitize(renderer.renderer.render(slice, renderer.options, environment));
  return {
    afterCallout: render(tokens.slice(close + 1)),
    beforeCallout: render(tokens.slice(0, open)),
    callout: render(tokens.slice(open, close + 1)),
  };
}

export function renderDocumentMarkdown(
  source: string,
  options: MarkdownRenderOptions = {},
): string {
  const segments = renderDocumentMarkdownSegments(source, options);
  return `${segments.beforeCallout}${segments.callout ?? ""}${segments.afterCallout}`;
}

export function renderSafeInlineMarkdown(
  source: string,
  options: MarkdownRenderOptions = {},
): string {
  const renderer = rendererFor(options);
  const context = options.footnoteContext;
  const position = options.footnoteSourceFrom;
  const content = source.replaceAll("\r\n", "\n");
  const entry =
    context && position !== undefined
      ? context.inline.get(context.source.lastIndexOf("\n", position - 1) + 1)
      : context &&
        [...context.inline.values()].find((entry) => entry.content === content);
  const children = entry?.content === content ? entry.tokens : undefined;
  if (children && context)
    return sanitize(
      renderer.renderer.renderInline(
        children,
        renderer.options,
        context.environment,
      ),
    );
  const environment: FootnoteEnvironment = {
    ...(context?.environment.footnotes
      ? {
          footnotes: {
            refs: { ...context.environment.footnotes.refs },
            list:
              context.environment.footnotes.list?.map((item) => ({
                ...item,
                count: 0,
              })) ?? [],
          },
        }
      : {}),
  };
  const tokens: Token[] = [];
  renderer.inline.parse(source, renderer, environment, tokens);
  return sanitize(
    renderer.renderer.renderInline(tokens, renderer.options, environment),
  );
}

export function createInlineFootnoteContext(
  source: string,
): InlineFootnoteContext | undefined {
  if (!source.includes("[^") && !source.includes("^[")) return undefined;
  const renderer = rendererFor({});
  const environment: FootnoteEnvironment = {};
  const bodyStart = markdownBodyStart(source);
  const tokens = renderer.parse(source.slice(bodyStart), environment);
  const lineStarts = [bodyStart];
  for (let offset = bodyStart; offset < source.length; offset += 1) {
    if (source[offset] === "\n") lineStarts.push(offset + 1);
  }
  const inline: InlineFootnoteContext["inline"] = new Map();
  for (const token of tokens) {
    if (token.type === "inline" && token.children && token.map)
      inline.set(lineStarts[token.map[0]]!, {
        content: token.content,
        tokens: token.children,
      });
  }
  return { environment, source, inline };
}
