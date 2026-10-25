import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import MarkdownIt from "markdown-it";
import { COMMAND_CATALOG } from "../../src/editor/command-registry.ts";
import { en } from "../../src/i18n/en.ts";
import { zhCN } from "../../src/i18n/zh-CN.ts";
import { importMarkdownDocument } from "../../src/agent/operations.ts";
import { renderYeliLogoSvg } from "../../src/brand/yeli-logo.ts";

const root = path.resolve(import.meta.dirname, "../..");
const sourceRoot = path.join(root, "site/docs");
const output = path.join(root, "dist/site/docs");
export const catalog = JSON.parse(
  fs.readFileSync(path.join(sourceRoot, "catalog.json"), "utf8"),
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const escapeHtml = MarkdownIt().utils.escapeHtml;
const escape = (text) => escapeHtml(String(text));
const json = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const slug = (text) =>
  text
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/gu, "-") || "section";
const tracks = {
  "zh-CN": { yeli: "Yeli 教程", markdown: "Markdown 教程" },
  en: { yeli: "Yeli tutorial", markdown: "Markdown tutorial" },
};
const routeIds = [
  "yeli/overview",
  "yeli/quickstart",
  "yeli/shortcuts",
  "yeli/best-practices",
];
const ui = {
  "zh-CN": {
    home: "文档中心",
    skip: "跳到正文",
    search: "搜索教程全文",
    searchHint: "搜索标题、正文或命令；结果在本机生成。",
    contents: "本页目录",
    navigation: "教程导航",
    previous: "上一篇",
    next: "下一篇",
    download: "带走这套教程",
    editable: "可编辑手册",
    source: "Markdown 原文",
    downloadsNote:
      "可编辑 HTML 包含代码，仅打开可信来源文件。跨教程链接需把两份同语言手册放在一起。",
    releaseNote: `当前版本 · ${catalog.updated} 核对`,
    lead: "Yeli 与 Markdown 文档",
    intro: "先了解功能，再按任务学习；常用操作随时速查。",
    routes: ["功能总览", "快速开始", "快捷键速查", "最佳实践"],
    routeDescriptions: [
      "能做什么、入口在哪、适合什么场景。",
      "完成编辑、保存副本、重新打开的第一轮。",
      "分平台查按键，先看生效条件。",
      "按会议、长文、交付和 Agent 任务串起操作。",
    ],
    backHome: "Yeli 首页",
    noscript: "全文和导航可直接阅读；启用 JavaScript 可使用本地搜索。",
  },
  en: {
    home: "Documentation",
    skip: "Skip to content",
    search: "Search all tutorials",
    searchHint: "Search titles, text or commands. Results stay on this device.",
    contents: "On this page",
    navigation: "Tutorial navigation",
    previous: "Previous",
    next: "Next",
    download: "Take this tutorial with you",
    editable: "Editable handbook",
    source: "Markdown source",
    downloadsNote:
      "Editable HTML contains code. Open files only from trusted sources. Keep both handbooks of the same language together for cross-course links.",
    releaseNote: `Current version · Checked ${catalog.updated}`,
    lead: "Yeli and Markdown documentation",
    intro: "Explore features, learn by task and look up everyday actions.",
    routes: [
      "Feature overview",
      "Quick start",
      "Keyboard shortcuts",
      "Best practices",
    ],
    routeDescriptions: [
      "What Yeli does, where to find it and when to use it.",
      "Complete your first edit, save a copy and reopen it.",
      "Find keys for your platform and check when they apply.",
      "Connect actions for meetings, long documents, delivery and Agents.",
    ],
    backHome: "Yeli home",
    noscript:
      "Read the text and navigate without scripts. Enable JavaScript for local search.",
  },
};

function commandReference(locale, shortcutsOnly = false) {
  const zh = locale === "zh-CN";
  const labels = zh ? zhCN : en;
  const surfaces = zh
    ? {
        "block-menu": "区块菜单",
        "empty-block-menu": "空白区块",
        keyboard: "键盘",
        "line-insert": "区块间插入",
        "selection-toolbar": "选区工具",
        slash: "斜杠菜单",
        "table-toolbar": "表格工具",
        "template-menu": "模板",
        "top-insert": "顶部插入",
      }
    : {
        "block-menu": "Block menu",
        "empty-block-menu": "Empty block",
        keyboard: "Keyboard",
        "line-insert": "Between blocks",
        "selection-toolbar": "Selection tools",
        slash: "Slash menu",
        "table-toolbar": "Table tools",
        "template-menu": "Templates",
        "top-insert": "Top insertion",
      };
  const condition = (c) => {
    if (c.scope === "selection")
      return zh ? "编辑；已选中可编辑文字" : "Edit; editable text selected";
    if (c.id.startsWith("table."))
      return zh ? "编辑；焦点在表格单元格内" : "Edit; a table cell has focus";
    if (c.id === "document.undo")
      return zh ? "编辑；存在可撤销操作" : "Edit; an undo step is available";
    if (c.id === "document.redo")
      return zh ? "编辑；刚执行过撤销" : "Edit; an undo step can be redone";
    if (c.id.startsWith("block.convert."))
      return zh
        ? "编辑；目标区块可安全转换"
        : "Edit; target block supports conversion";
    if (c.scope === "block")
      return zh
        ? "编辑；已定位可编辑区块"
        : "Edit; an editable block is targeted";
    if (c.id === "view.presentation")
      return zh
        ? "预览 / 编辑；满足演示标题规则"
        : "Preview / Edit; headings allow presentation";
    return c.modes.includes("read")
      ? zh
        ? "预览 / 编辑"
        : "Preview / Edit"
      : zh
        ? "编辑"
        : "Edit";
  };
  const entries = {
    "document.undo": zh ? "顶部撤销按钮；快捷键" : "Top Undo button; shortcut",
    "document.redo": zh ? "顶部重做按钮；快捷键" : "Top Redo button; shortcut",
    "document.save": zh
      ? "更多 → 保存或下载更新副本；快捷键"
      : "More → Save or Download updated copy; shortcut",
    "view.search": zh ? "顶部搜索；快捷键" : "Top Search; shortcut",
    "view.outline": zh
      ? "左上角 Yeli 标志；快捷键"
      : "Top-left Yeli logo; shortcut",
    "view.font-size": zh
      ? "更多 → 字体大小；快捷键"
      : "More → Font size; shortcut",
    "view.page-width": zh
      ? "更多 → 页面宽度；快捷键"
      : "More → Page width; shortcut",
    "view.presentation": zh
      ? "更多 → 演示；快捷键"
      : "More → Present; shortcut",
    "view.command-guide": zh
      ? "更多 → 快捷键；快捷键"
      : "More → Shortcuts; shortcut",
  };
  const groups = shortcutsOnly
    ? [
        { title: zh ? "保存与撤销" : "Save and undo", ids: ["document."] },
        {
          title: zh ? "查找、导航与视图" : "Find, navigate and adjust views",
          ids: ["view."],
        },
        {
          title: zh ? "选中文字后设置格式" : "Format selected text",
          ids: ["selection."],
        },
      ]
    : [
        {
          title: zh ? "保存与撤销命令" : "Save and undo commands",
          ids: ["document."],
        },
        {
          title: zh ? "导航与视图命令" : "Navigation and view commands",
          ids: ["view."],
        },
        {
          title: zh ? "插入与模板命令" : "Insertion and template commands",
          ids: ["insert.", "template."],
        },
        { title: zh ? "区块操作命令" : "Block commands", ids: ["block."] },
        {
          title: zh ? "表格结构命令" : "Table structure commands",
          ids: ["table."],
        },
        {
          title: zh ? "选区格式命令" : "Selection formatting commands",
          ids: ["selection."],
        },
      ];
  const cell = (text) =>
    String(text).replaceAll("|", "\\|").replaceAll("\n", " ");
  const key = (shortcut, platform) =>
    shortcut.aria
      .split(" ")
      .find((s) => s.startsWith(`${platform}+`))
      ?.replace("Meta", "⌘")
      .replace("Control", "Ctrl")
      .replaceAll("+", " + ") ?? "—";
  return groups
    .map((group) => {
      const commands = COMMAND_CATALOG.filter(
        (c) =>
          group.ids.some((prefix) => c.id.startsWith(prefix)) &&
          (!shortcutsOnly || c.shortcuts?.length),
      );
      const header = shortcutsOnly
        ? zh
          ? "| 操作 | macOS | Windows / Linux | 生效条件 |"
          : "| Action | macOS | Windows / Linux | When it works |"
        : zh
          ? "| 操作 | 操作入口 | 生效条件 | 命令 ID |"
          : "| Action | Entry point | When it works | Command ID |";
      const rows = commands.flatMap((c) =>
        shortcutsOnly
          ? c.shortcuts.map((s) => [
              labels[c.label],
              key(s, "Meta"),
              key(s, "Control"),
              condition(c),
            ])
          : [
              [
                labels[c.label],
                entries[c.id] ??
                  c.surfaces
                    .filter((s) => s !== "efficiency-guide")
                    .map((s) => surfaces[s])
                    .join(" / "),
                condition(c),
                `\`${c.id}\``,
              ],
            ],
      );
      return `## ${group.title}\n\n${header}\n| --- | --- | --- | --- |\n${rows.map((r) => `| ${r.map(cell).join(" | ")} |`).join("\n")}`;
    })
    .join("\n\n");
}

export function chapterSource(chapter, locale) {
  return fs
    .readFileSync(
      path.join(sourceRoot, `content/${chapter.id}.${locale}.md`),
      "utf8",
    )
    .replace("{{command-reference}}", () => commandReference(locale))
    .replace("{{shortcut-reference}}", () => commandReference(locale, true));
}

function renderer() {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
  });
  md.renderer.rules.image = (tokens, i) =>
    `<span class="image-note">[${escape(tokens[i].content)}]</span>`;
  md.renderer.rules.link_open = (tokens, i, options, env, self) => {
    const href = tokens[i].attrGet("href") ?? "";
    if (/^https:/.test(href)) tokens[i].attrSet("rel", "noopener noreferrer");
    return self.renderToken(tokens, i, options);
  };
  return md;
}

function prepareArticle(md, source) {
  const tokens = md.parse(source, {});
  const headings = [];
  const seen = new Map();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "heading_open") continue;
    const title = tokens[i + 1].children?.map((c) => c.content).join("") ?? "";
    const base = slug(title);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;
    tokens[i].attrSet("id", id);
    if (tokens[i].tag === "h2") headings.push({ title, id });
  }
  return { tokens, headings };
}

function article(source) {
  const md = renderer();
  const parsed = prepareArticle(md, source);
  return {
    ...parsed,
    html: md.renderer.render(parsed.tokens, md.options, {}),
  };
}

function write(file, data) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}

export async function buildDocs() {
  const css = fs.readFileSync(path.join(sourceRoot, "styles.css"), "utf8");
  const js = fs.readFileSync(path.join(sourceRoot, "app.js"), "utf8");
  const sources = new Map();
  const receipt = {
    version: 1,
    updated: catalog.updated,
    chapters: [],
    handbooks: [],
  };
  for (const locale of catalog.locales) {
    for (const c of catalog.chapters) {
      const source = chapterSource(c, locale);
      sources.set(`${locale}/${c.id}`, source);
      receipt.chapters.push({ id: c.id, locale, sourceHash: sha(source) });
    }
  }
  for (const locale of catalog.locales) {
    const text = ui[locale];
    const other = locale === "en" ? "zh-CN" : "en";
    const prepared = new Map();
    const searchIndex = catalog.chapters.map((c) => ({
      title: c.title[locale],
      description: c.description[locale],
      text: sources.get(`${locale}/${c.id}`),
      id: c.id,
    }));
    function page(chapter) {
      const file = chapter ? `${chapter.id}.html` : "index.html";
      const prefix = chapter ? "../" : "";
      const docsRoot = chapter ? "../../" : "../";
      const to = (id) => `${prefix}${id}.html`;
      const nav = Object.keys(tracks[locale])
        .map(
          (track) =>
            `<details data-track="${track}"${!chapter || chapter.id.startsWith(`${track}/`) ? " open" : ""}><summary>${tracks[locale][track]}</summary>${catalog.sections
              .filter((s) => s.track === track)
              .map(
                (s) =>
                  `<div class="nav-section" data-section="${s.id}"><p>${escape(s.title[locale])}</p><ol>${catalog.chapters
                    .filter((c) => c.section === s.id)
                    .map(
                      (c) =>
                        `<li><a href="${to(c.id)}"${c.id === chapter?.id ? ' aria-current="page"' : ""}>${escape(c.title[locale])}</a></li>`,
                    )
                    .join("")}</ol></div>`,
              )
              .join("")}</details>`,
        )
        .join("");
      if (chapter && !prepared.has(chapter.id)) {
        prepared.set(
          chapter.id,
          article(sources.get(`${locale}/${chapter.id}`)),
        );
      }
      const body = chapter
        ? prepared.get(chapter.id)
        : {
            headings: [],
            html: `<p class="eyebrow">YELI / LEARN</p><h1>${text.lead}</h1><p class="intro">${text.intro}</p>
          <div class="routes">${routeIds.map((id, i) => `<a href="${to(id)}"><span aria-hidden="true">↗</span><strong>${text.routes[i]}</strong><p>${text.routeDescriptions[i]}</p></a>`).join("")}</div>
          ${Object.keys(tracks[locale])
            .map(
              (track) =>
                `<section class="course"><h2 id="course-${track}">${tracks[locale][track]}</h2>${catalog.sections
                  .filter((s) => s.track === track)
                  .map(
                    (s) =>
                      `<section class="course-section"><h3>${escape(s.title[locale])}</h3><p class="section-description">${escape(s.description[locale])}</p><div class="chapter-grid">${catalog.chapters
                        .filter((c) => c.section === s.id)
                        .map(
                          (c) =>
                            `<a href="${to(c.id)}"><h4>${escape(c.title[locale])}</h4><p>${escape(c.description[locale])}</p></a>`,
                        )
                        .join("")}</div></section>`,
                  )
                  .join("")}</section>`,
            )
            .join("")}`,
          };
      const currentTrack = chapter?.id.split("/")[0];
      const sameTrack = catalog.chapters.filter(
        (c) => c.id.split("/")[0] === currentTrack,
      );
      const index = sameTrack.findIndex((c) => c.id === chapter?.id);
      const neighbors = chapter
        ? `<nav class="neighbors" aria-label="${text.previous} / ${text.next}">${[
            [-1, text.previous],
            [1, text.next],
          ]
            .map(([offset, label]) => {
              const c = sameTrack[index + offset];
              return c
                ? `<a href="${to(c.id)}"><small>${label}</small>${escape(c.title[locale])}</a>`
                : "<span></span>";
            })
            .join("")}</nav>`
        : "";
      const downloads = Object.keys(tracks[locale])
        .filter((t) => !currentTrack || t === currentTrack)
        .map(
          (track) =>
            `<div><strong>${tracks[locale][track]}</strong><a download href="${docsRoot}downloads/${track}.${locale}.yeli.html">${text.editable} (.yeli.html)</a><a download href="${docsRoot}downloads/${track}.${locale}.md">${text.source} (.md)</a></div>`,
        )
        .join("");
      const toc = body.headings
        .map((h) => `<li><a href="#${h.id}">${escape(h.title)}</a></li>`)
        .join("");
      return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escape(chapter?.description[locale] ?? text.intro)}"><link rel="icon" href="data:image/svg+xml,${encodeURIComponent(renderYeliLogoSvg({ markOnly: true }))}"><title>${escape(chapter?.title[locale] ?? text.home)} · Yeli</title><style>${css}</style></head>
<body><a class="skip-link" href="#content">${text.skip}</a>
<header class="docs-header"><a class="brand" href="${docsRoot}../index.html?lang=${locale}" aria-label="${text.backHome}">${renderYeliLogoSvg()}</a><a href="${prefix}index.html">${text.home}</a><a class="language-peer" data-language-peer hreflang="${other}" lang="${other}" href="${docsRoot}${other}/${file}">${other === "en" ? "English" : "简体中文"}</a></header>
<div class="docs-layout"><aside class="sidebar"><form hidden class="search-form" role="search"><label for="docs-search">${text.search}</label><input id="docs-search" type="search" autocomplete="off" aria-describedby="search-hint"><p id="search-hint">${text.searchHint}</p></form><p id="search-status" role="status" aria-live="polite"></p><ul id="search-results" hidden></ul><nav aria-label="${text.navigation}">${nav}</nav></aside>
<main id="content" tabindex="-1"><p class="release-note">${text.releaseNote}</p>${chapter?.id.startsWith("yeli/") ? `<nav class="reference-links" aria-label="${text.navigation}">${routeIds.map((id, i) => `<a href="${to(id)}"${id === chapter.id ? ' aria-current="page"' : ""}>${text.routes[i]}</a>`).join("")}</nav>` : ""}${toc ? `<details class="compact-toc"><summary>${text.contents}</summary><ol>${toc}</ol></details>` : ""}<article>${body.html}</article>${neighbors}<section class="downloads"><h2>${text.download}</h2>${downloads}<p>${text.downloadsNote}</p></section><noscript><p>${text.noscript}</p></noscript></main>
<aside class="toc"><nav aria-label="${text.contents}"><p>${text.contents}</p><ol>${toc}</ol></nav></aside></div>
<footer>Yeli · Markdown · ${text.home}</footer><script id="search-data" type="application/json">${json({ locale, prefix, entries: searchIndex })}</script><script>${js}</script></body></html>`;
    }
    write(`${locale}/index.html`, page(null));
    for (const c of catalog.chapters) write(`${locale}/${c.id}.html`, page(c));
    for (const track of Object.keys(tracks[locale])) {
      const title = tracks[locale][track];
      const chapters = catalog.chapters.filter((c) =>
        c.id.startsWith(`${track}/`),
      );
      const chunks = chapters.map((c) => {
        const source = sources.get(`${locale}/${c.id}`);
        const tokens = prepared.get(c.id).tokens;
        const edits = [];
        const lines = source.split("\n");
        let sourceRange;
        for (const token of tokens) {
          if (token.map) sourceRange = token.map;
          if (token.type === "heading_open") {
            const line = token.map[0];
            lines[line] = `#${lines[line]}`;
          }
          if (token.type === "inline") {
            for (const child of token.children ?? []) {
              if (child.type !== "link_open") continue;
              const href = child.attrGet("href") ?? "";
              if (!href.endsWith(".html") || /^[a-z]+:/i.test(href)) continue;
              const target = path.posix
                .normalize(path.posix.join(path.posix.dirname(c.id), href))
                .replace(/\.html$/, "");
              const destination = catalog.chapters.find(
                (item) => item.id === target,
              );
              if (!destination) throw new Error(`Unknown link: ${href}`);
              const targetTrack = target.split("/")[0];
              edits.push([
                // Table-cell inline tokens inherit their row's source range.
                sourceRange[0],
                sourceRange[1],
                href,
                `${targetTrack === track ? "" : `./${targetTrack}.${locale}.yeli.html`}#${slug(destination.title[locale])}`,
              ]);
            }
          }
        }
        for (const [start, end, from, to] of edits) {
          for (let i = start; i < end; i++)
            lines[i] = lines[i].replaceAll(`](${from})`, `](${to})`);
        }
        return lines.join("\n");
      });
      const markdown = `---\ntitle: ${JSON.stringify(title)}\nlang: ${locale}\ndescription: ${JSON.stringify(ui[locale].releaseNote)}\n---\n\n# ${title}\n\n${text.downloadsNote}\n\n${chunks.join("\n\n")}`;
      const templateFile = `dist/html/starter.${locale}.yeli.html`;
      const template = fs.readFileSync(path.join(root, templateFile), "utf8");
      const result = await importMarkdownDocument(
        markdown,
        template,
        `yeli-docs-${track}-${locale}`,
      );
      const file = `${track}.${locale}.yeli.html`;
      const sourceFile = `${track}.${locale}.md`;
      write(`downloads/${file}`, result.artifact);
      write(`downloads/${sourceFile}`, markdown);
      receipt.handbooks.push({
        file,
        markdown: sourceFile,
        bytes: Buffer.byteLength(result.artifact),
        sha256: sha(result.artifact),
        sourceHash: sha(markdown),
        template: templateFile,
        templateHash: sha(template),
      });
    }
  }
  write(
    "index.html",
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Yeli 文档 / Documentation</title></head><body><main><h1>Yeli 文档 / Documentation</h1><p><a href="zh-CN/index.html" lang="zh-CN">简体中文</a> · <a href="en/index.html" lang="en">English</a></p></main></body></html>`,
  );
  write("manifest.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    `Built ${receipt.chapters.length} tutorial pages, 2 language indexes and 4 editable handbooks.`,
  );
  return receipt;
}
