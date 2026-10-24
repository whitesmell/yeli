import DOMPurify from "dompurify";
import type { DOMPurify as DOMPurifyInstance, WindowLike } from "dompurify";
import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

import { indexFrontmatter } from "../document/frontmatter.ts";
import {
  projectMarkdown,
  type SourceBlock,
} from "../editor/block-projection.ts";

export interface MarkdownRenderOptions {
  imageUnavailableLabel?: string;
  revision?: number;
  resolveImage?: (destination: string) => string | null;
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
  });
  const seenHeadings = new Map<string, number>();

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
    ],
  });
}

function documentBodyRange(source: string): {
  body: string;
  bodyStart: number;
} {
  const frontmatter = indexFrontmatter(source);
  const bodyStart = frontmatter.status === "safe" ? frontmatter.bodyStart : 0;
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
  for (const token of tokens) {
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
    token.attrSet("data-read-block-id", block.id);
    token.attrSet("data-source-from", String(block.range.from));
    token.attrSet("data-source-to", String(block.range.to));
    token.attrSet("data-source-kind", block.kind);
    token.attrSet("data-source-revision", String(revision));
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
  return sanitize(rendererFor(options).renderInline(source));
}
