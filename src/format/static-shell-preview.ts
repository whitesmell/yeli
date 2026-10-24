import type { YeliDocumentPayload } from "../document/model.ts";
import type { Locale } from "../i18n/locale.ts";

const GENERATED_PREVIEW_PATTERN =
  /^<article id="yeli-static-preview" data-source-hash="[a-f0-9]{64}">\n  <header><p>(?:Yeli · portable Markdown|页里 · 可携带的 Markdown)<\/p><h1>(?:[^<&]|&(?:amp|lt|gt|quot|#39);)*<\/h1>(?:<p>(?:[^<&]|&(?:amp|lt|gt|quot|#39);)*<\/p>)?<\/header>\n  (?:<nav aria-label="(?:Document outline|文档大纲)"><ol>(?:<li>(?:[^<&]|&(?:amp|lt|gt|quot|#39);)*<\/li>){1,8}<\/ol><\/nav>)?\n  <p>(?:[^<&]|&(?:amp|lt|gt|quot|#39);)*<\/p>\n<\/article>$/u;
const BUILD_NOSCRIPT_PREFIXES = [
  `<noscript>
        Yeli requires JavaScript to edit this active document. Open files only
        from a trusted sender. A static export is required for untrusted
        publication.
      </noscript>
      `,
  `<noscript>
        页里需要一个可运行 JavaScript 的环境来编辑这份活动文档。只打开来自
        可信来源的文件。向不受信任的读者发布时，请改用静态导出。
      </noscript>
      `,
  `<noscript>
        To edit this file, open it in a browser with JavaScript enabled.
        Open .yeli.html files only from trusted sources. For reading,
        ask the sender for a read-only HTML, Markdown, or PDF copy.
      </noscript>
      `,
  `<noscript>
        如需编辑，请用允许 JavaScript 运行的浏览器打开此文件。
        仅打开可信来源的 .yeli.html 文件。如只需阅读，
        可请发送者提供只读 HTML、Markdown 或 PDF 副本。
      </noscript>
      `,
] as const;

export function buildNoscriptNotice(locale: Locale): string {
  return BUILD_NOSCRIPT_PREFIXES[locale === "en" ? 2 : 3];
}

export function escapePublicationHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isGeneratedStaticPreviewHtml(html: string): boolean {
  const trimmed = html.trim();
  const prefix = BUILD_NOSCRIPT_PREFIXES.find((candidate) =>
    trimmed.startsWith(candidate.trimStart()),
  );
  const preview = prefix ? trimmed.slice(prefix.trimStart().length) : trimmed;
  return GENERATED_PREVIEW_PATTERN.test(preview);
}

function plainExcerpt(source: string, limit = 560): string {
  const body = source
    .replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n/u, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gmu, "")
    .replace(/[*_`~]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return body.length <= limit ? body : `${body.slice(0, limit - 1).trimEnd()}…`;
}

export function buildStaticPreviewHtml(
  payload: YeliDocumentPayload,
  source: string,
  locale: Locale = "zh-CN",
): string {
  const isEnglish = locale === "en";
  const title = payload.manifest.metadata.title ?? "Yeli document";
  const description =
    payload.manifest.metadata.description ?? plainExcerpt(source);
  const headings = payload.manifest.headings.slice(0, 8);
  return `<article id="yeli-static-preview" data-source-hash="${payload.manifest.sourceHash}">
  <header><p>${isEnglish ? "Yeli · portable Markdown" : "页里 · 可携带的 Markdown"}</p><h1>${escapePublicationHtml(title)}</h1>${description ? `<p>${escapePublicationHtml(description)}</p>` : ""}</header>
  ${headings.length > 0 ? `<nav aria-label="${isEnglish ? "Document outline" : "文档大纲"}"><ol>${headings.map((heading) => `<li>${escapePublicationHtml(heading.text)}</li>`).join("")}</ol></nav>` : ""}
  <p>${escapePublicationHtml(plainExcerpt(source))}</p>
</article>`;
}
