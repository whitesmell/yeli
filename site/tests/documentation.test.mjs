import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import MarkdownIt from "markdown-it";
import { COMMAND_CATALOG } from "../../src/editor/command-registry.ts";
import {
  extractDocument,
  preReadDocument,
  validateDocument,
} from "../../src/agent/operations.ts";

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "dist/site");
const read = (file) => fs.readFileSync(path.join(out, file), "utf8");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const requiredFeatures =
  `mission open new modes outline title selection blocks slash template tables images remote-media properties search replace save conflict reconnect history restore recovery focus presentation appearance language import export print agent cli skill shortcuts commands advanced safety troubleshooting`.split(
    " ",
  );
const requiredTopics =
  `history dialects agent-context cheatsheet headings paragraphs line-breaks thematic-breaks bold italic strike nesting lists ordered nested blockquotes inline-code fences indented-code language-tags links reference-links images autolinks tables alignment tasks strikethrough footnotes heading-ids definitions emoji highlight subscript superscript math mermaid bare-urls escaping html safety frontmatter yaml metadata practice references`.split(
    " ",
  );
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "site/docs/catalog.json"), "utf8"),
);

test("curriculum has complete bilingual chapters and covers the frozen requirements", () => {
  assert.equal(catalog.chapters.length, 31);
  assert.equal(new Set(catalog.chapters.map((c) => c.id)).size, 31);
  assert.equal(new Set(catalog.sections.map((s) => s.id)).size, 8);
  for (const [key, required] of [
    ["features", requiredFeatures],
    ["topics", requiredTopics],
  ]) {
    const actual = new Set(catalog.chapters.flatMap((c) => c[key] ?? []));
    for (const name of required) assert.ok(actual.has(name), `Missing ${name}`);
  }
  for (const c of catalog.chapters) {
    const section = catalog.sections.find((s) => s.id === c.section);
    assert.equal(
      section?.track,
      c.id.split("/")[0],
      `Invalid section: ${c.id}`,
    );
    for (const locale of catalog.locales) {
      assert.ok(c.title[locale] && c.description[locale]);
      const source = fs.readFileSync(
        path.join(root, `site/docs/content/${c.id}.${locale}.md`),
        "utf8",
      );
      assert.ok(source.startsWith(`# ${c.title[locale]}\n`));
      assert.ok(
        Buffer.byteLength(source) > 650,
        `Thin content: ${c.id} ${locale}`,
      );
    }
  }
});

test("Yeli separates feature discovery, shortcuts, workflows and command reference", () => {
  for (const locale of catalog.locales) {
    const index = new JSDOM(read(`docs/${locale}/index.html`));
    for (const id of [
      "overview",
      "quickstart",
      "shortcuts",
      "best-practices",
    ]) {
      assert.ok(
        index.window.document.querySelector(
          `.routes a[href="yeli/${id}.html"]`,
        ),
        `Missing direct entry: ${id} ${locale}`,
      );
    }
    index.window.close();
    for (const id of ["overview", "shortcuts", "best-practices", "commands"]) {
      const dom = new JSDOM(read(`docs/${locale}/yeli/${id}.html`));
      const doc = dom.window.document;
      assert.ok(doc.querySelectorAll(".sidebar [data-section]").length >= 5);
      assert.equal(
        doc.querySelectorAll('.sidebar a[aria-current="page"]').length,
        1,
      );
      if (id === "overview") {
        const links = new Set(
          [...doc.querySelectorAll("article a[href]")].map((a) =>
            a.getAttribute("href"),
          ),
        );
        for (const chapter of catalog.chapters.filter((c) =>
          c.id.startsWith("yeli/"),
        )) {
          if (chapter.id === "yeli/overview") continue;
          assert.ok(
            links.has(`${chapter.id.split("/")[1]}.html`),
            `Feature overview cannot reach ${chapter.id}`,
          );
        }
      }
      if (id === "shortcuts") {
        const headings = [...doc.querySelectorAll("article th")].map(
          (th) => th.textContent,
        );
        assert.ok(headings.includes("macOS"));
        assert.ok(headings.includes("Windows / Linux"));
        assert.ok(
          !doc.querySelector("article").textContent.includes("view.font-size"),
        );
      }
      dom.window.close();
    }
  }
});

test("built pages keep complete content, language peers, local links and fragments", () => {
  const files = [
    "docs/index.html",
    ...catalog.locales.flatMap((locale) => [
      `docs/${locale}/index.html`,
      ...catalog.chapters.map((c) => `docs/${locale}/${c.id}.html`),
    ]),
  ];
  const fragmentIds = new Map();
  for (const file of files) {
    const dom = new JSDOM(read(file));
    const doc = dom.window.document;
    assert.ok(doc.querySelector("main h1"), file);
    assert.doesNotMatch(
      read(file),
      /@@\w|\{\{(?:command|shortcut)-reference\}\}/,
    );
    const ids = [...doc.querySelectorAll("[id]")].map((el) => el.id);
    assert.equal(new Set(ids).size, ids.length, `Duplicate IDs: ${file}`);
    for (const link of doc.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href");
      assert.notEqual(href, "#", `Empty link: ${file}`);
      if (/^(https:|mailto:)/.test(href)) continue;
      const [urlPath, fragment] = href.split("#");
      const relative = urlPath.split("?")[0];
      const destination = path.resolve(out, path.dirname(file), relative || "");
      const target = relative ? destination : path.join(out, file);
      assert.ok(target.startsWith(out + path.sep), `Escaping link: ${href}`);
      assert.ok(fs.existsSync(target), `${file} -> ${href}`);
      if (
        fragment &&
        target.endsWith(".html") &&
        !target.endsWith(".yeli.html")
      ) {
        if (!fragmentIds.has(target)) {
          const targetDom = new JSDOM(fs.readFileSync(target, "utf8"));
          fragmentIds.set(
            target,
            new Set(
              [...targetDom.window.document.querySelectorAll("[id]")].map(
                (el) => el.id,
              ),
            ),
          );
          targetDom.window.close();
        }
        assert.ok(
          fragmentIds.get(target).has(decodeURIComponent(fragment)),
          `${file} -> ${href}`,
        );
      }
    }
    if (file !== "docs/index.html") {
      const locale = file.split("/")[1];
      assert.equal(doc.documentElement.lang, locale);
      assert.equal(
        doc.querySelector("[data-language-peer]").hreflang,
        locale === "en" ? "zh-CN" : "en",
      );
    }
    dom.window.close();
  }
});

test("all current commands and every shortcut appear in the separate references", () => {
  for (const locale of catalog.locales) {
    const dom = new JSDOM(read(`docs/${locale}/yeli/commands.html`));
    const text = dom.window.document.querySelector("article").textContent;
    const quick = new JSDOM(read(`docs/${locale}/yeli/shortcuts.html`));
    const rows = [...quick.window.document.querySelectorAll("article tr")];
    for (const c of COMMAND_CATALOG) {
      assert.ok(text.includes(c.id), c.id);
      for (const shortcut of c.shortcuts ?? []) {
        const mac = shortcut.aria.split(" ").find((s) => s.startsWith("Meta+"));
        const windows = shortcut.aria
          .split(" ")
          .find((s) => s.startsWith("Control+"));
        assert.ok(
          rows.some((row) => {
            const cells = [...row.querySelectorAll("td")].map(
              (td) => td.textContent,
            );
            return (
              cells.length === 4 &&
              cells[1] ===
                (mac?.replace("Meta", "⌘").replaceAll("+", " + ") ?? "—") &&
              cells[2] ===
                (windows?.replace("Control", "Ctrl").replaceAll("+", " + ") ??
                  "—")
            );
          }),
          `${c.id} ${shortcut.display}`,
        );
      }
    }
    dom.window.close();
    quick.window.close();
  }
});

test("four complete editable handbooks validate and round-trip to their Markdown downloads", async () => {
  const receipt = JSON.parse(read("docs/manifest.json"));
  assert.equal(receipt.handbooks.length, 4);
  assert.equal(receipt.chapters.length, 62);
  for (const book of receipt.handbooks) {
    const artifact = read(`docs/downloads/${book.file}`);
    const markdown = read(`docs/downloads/${book.markdown}`);
    assert.equal(Buffer.byteLength(artifact), book.bytes);
    assert.equal(sha(artifact), book.sha256);
    assert.equal(sha(markdown), book.sourceHash);
    assert.equal(await extractDocument(artifact), markdown);
    assert.equal((await validateDocument(artifact)).ok, true);
    const pre = await preReadDocument(artifact);
    assert.equal(pre.freshness.staticPreview, "fresh");
    const template = fs.readFileSync(path.join(root, book.template), "utf8");
    for (const id of ["yeli-runtime", "yeli-runtime-css"]) {
      const carrier = (html) =>
        new JSDOM(html).window.document.getElementById(id)?.textContent;
      assert.ok(carrier(template), `Missing carrier ${id}`);
      assert.equal(
        carrier(artifact),
        carrier(template),
        `Runtime drift: ${id}`,
      );
    }
    assert.equal(sha(template), book.templateHash);
    const locale = book.file.includes(".en.") ? "en" : "zh-CN";
    const track = book.file.split(".")[0];
    const parser = new MarkdownIt();
    const fences = (source) =>
      parser
        .parse(source, {})
        .filter((t) => t.type === "fence")
        .map((t) => t.content);
    const expectedFences = catalog.chapters
      .filter((c) => c.id.startsWith(`${track}/`))
      .flatMap((c) =>
        fences(
          fs.readFileSync(
            path.join(root, `site/docs/content/${c.id}.${locale}.md`),
            "utf8",
          ),
        ),
      );
    assert.deepEqual(
      fences(markdown),
      expectedFences,
      "Handbook changed a fenced example",
    );
    const tokens = parser.parse(markdown, {});
    for (const token of tokens) {
      for (const link of token.children ?? []) {
        if (link.type !== "link_open") continue;
        const href = link.attrGet("href") ?? "";
        if (/^[a-z]+:/i.test(href)) continue;
        const [target, fragment] = href.split("#");
        const targetArtifact = target
          ? read(`docs/downloads/${target.replace(/^\.\//, "")}`)
          : artifact;
        const targetPre = target ? await preReadDocument(targetArtifact) : pre;
        const headingSlugs = targetPre.manifest.headings.map((h) =>
          h.text
            .normalize("NFKD")
            .toLocaleLowerCase("en-US")
            .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
            .trim()
            .replace(/[\s-]+/gu, "-"),
        );
        assert.ok(
          headingSlugs.includes(decodeURIComponent(fragment)),
          `Broken handbook heading: ${book.file} -> ${href}`,
        );
      }
    }
  }
});
