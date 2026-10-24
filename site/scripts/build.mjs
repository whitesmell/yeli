import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { renderYeliLogoSvg } from "../../src/brand/yeli-logo.ts";
import { buildDocs } from "./build-docs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const root = path.resolve(siteRoot, "..");
const require = createRequire(path.join(root, "package.json"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const icons = require("@heroicons/react/24/outline");
const MarkdownIt = require("markdown-it");

const read = (file) => fs.readFileSync(path.join(siteRoot, file), "utf8");
const config = JSON.parse(read("site-config.json"));
for (const value of Object.values(config)) {
  if (value && !/^https:\/\//i.test(value))
    throw new Error("Configured links must use HTTPS.");
}

const outputRoot = path.join(root, "dist/site");
const sitePath = (file) => path.join(siteRoot, file);
const samples = ["zh-CN", "en"].map((locale) => ({
  source: `dist/html/starter.${locale}.yeli.html`,
  output: `sample.${locale}.yeli.html`,
}));
for (const { source } of samples) {
  if (!fs.existsSync(path.join(root, source))) {
    throw new Error(`Missing ${source}; run npm run build:single:all first.`);
  }
}

const documentSpecs = {
  start: ["README.zh-CN.md", "README.md", "快速开始", "Quick start"],
  agent: [
    "docs/agent-quickstart.zh-CN.md",
    "docs/agent-quickstart.md",
    "Agent 指南",
    "Agent guide",
  ],
  cli: [
    "docs/agent-quickstart.zh-CN.md",
    "docs/agent-quickstart.md",
    "CLI 与 Skill",
    "CLI & Skill",
  ],
  format: ["docs/format.md", "docs/format.md", "文件格式", "File format"],
  contribute: [
    "CONTRIBUTING.zh-CN.md",
    "CONTRIBUTING.md",
    "贡献说明",
    "Contributing",
  ],
  status: [
    "docs/project-status.zh-CN.md",
    "docs/project-status.md",
    "项目状态",
    "Project status",
  ],
  agents: [
    "docs/agents.md",
    "docs/agents.md",
    "Agent 操作参考",
    "Agent operation reference",
  ],
  security: ["SECURITY.zh-CN.md", "SECURITY.md", "安全说明", "Security"],
  development: [
    "docs/development.zh-CN.md",
    "docs/development.md",
    "开发说明",
    "Development",
  ],
  scope: [
    "docs/public-scope.zh-CN.md",
    "docs/public-scope.md",
    "公开范围",
    "Public scope",
  ],
  browser: [
    "docs/browser-support.md",
    "docs/browser-support.md",
    "浏览器支持",
    "Browser support",
  ],
  notices: [
    "docs/third-party-notices.md",
    "docs/third-party-notices.md",
    "第三方声明",
    "Third-party notices",
  ],
  architecture: [
    "docs/architecture.md",
    "docs/architecture.md",
    "架构",
    "Architecture",
  ],
  releasing: [
    "docs/releasing.md",
    "docs/releasing.md",
    "发行说明",
    "Releasing",
  ],
  docs: ["docs/README.zh-CN.md", "docs/README.md", "文档索引", "Documentation"],
  skill: [
    "skills/yeli/SKILL.md",
    "skills/yeli/SKILL.md",
    "Yeli Skill",
    "Yeli Skill",
  ],
};
const fileIds = new Map();
const fileLocales = new Map();
fileIds.set("LICENSE", "license");
for (const [id, spec] of Object.entries(documentSpecs)) {
  for (const filename of spec.slice(0, 2))
    if (!fileIds.has(filename)) fileIds.set(filename, id);
  if (spec[0] !== spec[1]) {
    fileLocales.set(spec[0], "zh-CN");
    fileLocales.set(spec[1], "en");
  }
}
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
md.renderer.rules.image = (tokens, idx) =>
  md.utils.escapeHtml(tokens[idx].content || "");
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet("href") || "";
  if (/^https:\/\//i.test(href)) {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  } else if (href.startsWith("#doc:")) {
    // Curated local resource links.
  } else if (href.startsWith("#")) {
    token.attrSet("href", "#");
    token.attrSet("data-local-heading", href.slice(1));
  } else {
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(env.source || ""), href.split("#")[0]),
    );
    const id = fileIds.get(resolved);
    token.attrSet("href", id ? `#doc:${id}` : "#");
    if (id && fileLocales.has(resolved))
      token.attrSet("data-doc-language", fileLocales.get(resolved));
    if (!id) {
      token.tag = "span";
      token.attrs = [
        [
          "title",
          env.locale === "en"
            ? `Source reference: ${resolved}`
            : `源码参考：${resolved}`,
        ],
      ];
      const closing = tokens
        .slice(idx + 1)
        .find((t) => t.type === "link_close");
      if (closing) closing.tag = "span";
    }
  }
  return self.renderToken(tokens, idx, options);
};
const docs = {};
for (const [id, [zhFile, enFile, zhTitle, enTitle]] of Object.entries(
  documentSpecs,
)) {
  docs[id] = {};
  for (const [locale, source, title] of [
    ["zh-CN", zhFile, zhTitle],
    ["en", enFile, enTitle],
  ]) {
    const raw = fs
      .readFileSync(path.join(root, source), "utf8")
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
    docs[id][locale] = { title, html: md.render(raw, { source, locale }) };
  }
}
const repository = {
  "zh-CN": `# GitHub

项目仓库地址尚未公布。你可以先阅读以下文档，了解项目和参与贡献。

项目名：**yeli** · 产品：**页里 / Yeli** · 文档格式：**.yeli.html**

[贡献说明](#doc:contribute) · [开发说明](#doc:development) · [项目状态](#doc:status)`,
  en: `# GitHub

The project repository address has not been published yet. Read the documents below to learn about the project and contributing.

Project: **yeli** · Product: **Yeli / 页里** · Document format: **.yeli.html**

[Contributing](#doc:contribute) · [Development](#doc:development) · [Project status](#doc:status)`,
};
const projectLicense = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
const license = {
  "zh-CN": `# 许可证

Yeli 采用 MIT 许可证。以下为项目许可证全文，分发包同时附带 LICENSE 文件。
第三方组件保留各自的许可证；你创作或导入的文档与资源不适用本项目许可证。

${projectLicense}

[第三方声明](#doc:notices) · [项目状态](#doc:status)`,
  en: `# License

Yeli uses the MIT License. Its full text appears below and is included as LICENSE in the distribution.
Third-party components retain their own licenses; documents and assets you create or import are not covered by the project license.

${projectLicense}

[Third-party notices](#doc:notices) · [Project status](#doc:status)`,
};
for (const [id, texts, titles] of [
  ["repository", repository, ["GitHub", "GitHub"]],
  ["license", license, ["许可证", "License"]],
]) {
  docs[id] = {};
  for (const [i, locale] of ["zh-CN", "en"].entries()) {
    docs[id][locale] = {
      title: titles[i],
      html: md.render(texts[locale], { source: "", locale }),
    };
  }
}
const safeJSON = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const dataImage = (filename) =>
  `data:image/png;base64,${fs.readFileSync(sitePath(filename)).toString("base64")}`;
const mark = renderYeliLogoSvg({ markOnly: true });
const logo = renderYeliLogoSvg();
const favicon = `data:image/svg+xml,${encodeURIComponent(mark.replaceAll("currentColor", "#091336"))}`;
let html = read("index.template.html");
for (const [key, value] of Object.entries({
  FAVICON: favicon,
  CSS: read("styles.css"),
  LOGO: logo,
  HERO: dataImage("assets/hero-neutral-hand-v2.png"),
  EDITOR: dataImage("assets/editor.png"),
  EDITOR_EN: dataImage("assets/editor.en.png"),
  DOCS: safeJSON(docs),
  CONFIG: safeJSON(config),
  JS: read("app.js"),
}))
  html = html.replaceAll(`@@${key}@@`, value);

html = html.replace(/@@ICON:(\w+)@@/g, (_, name) => {
  const Icon = icons[`${name}Icon`];
  if (!Icon) throw new Error(`Missing icon: ${name}`);
  return renderToStaticMarkup(
    React.createElement(Icon, {
      className: "icon",
      "aria-hidden": "true",
      focusable: "false",
    }),
  );
});
if (/@@\w/.test(html)) throw new Error("Unresolved build placeholder");
const tutorialRoutes = {
  start: "yeli/quickstart.html",
  agent: "yeli/agent.html",
  cli: "yeli/agent.html",
  guide: "yeli/writing.html",
  shortcuts: "yeli/shortcuts.html",
  docs: "index.html",
};
html = html.replace(
  /<button([^>]*?)data-doc="(start|agent|cli|guide|shortcuts|docs)"([^>]*)>([\s\S]*?)<\/button>/g,
  (_, before, id, after, content) => {
    const route = /nav-docs|data-i18n="(?:docs|readDocs)"/.test(
      before + after + content,
    )
      ? "index.html"
      : tutorialRoutes[id];
    return `<a${before}data-tutorial="${route}"${after} href="docs/zh-CN/${route}">${content}</a>`;
  },
);
fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
fs.copyFileSync(path.join(root, "LICENSE"), path.join(outputRoot, "LICENSE"));
fs.writeFileSync(path.join(outputRoot, "index.html"), html);
fs.writeFileSync(path.join(outputRoot, "Yeli_首页.html"), html);
fs.rmSync(path.join(outputRoot, "CNAME"), { force: true });
for (const { source, output } of samples) {
  fs.copyFileSync(path.join(root, source), path.join(outputRoot, output));
}
fs.writeFileSync(path.join(outputRoot, ".nojekyll"), "");
fs.writeFileSync(path.join(outputRoot, "404.html"), html);
fs.writeFileSync(
  path.join(outputRoot, "release.json"),
  JSON.stringify(
    {
      format: "yeli-site",
      version: 1,
      generatedAt: new Date().toISOString(),
      locales: ["zh-CN", "en"],
      defaultLocale: "zh-CN",
      samples: samples.map(({ output }) => output),
      documentation: "docs/index.html",
    },
    null,
    2,
  ) + "\n",
);
await buildDocs();
console.log(
  `Built bilingual self-contained homepage: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB, ${Object.keys(docs).length} embedded resources.`,
);
