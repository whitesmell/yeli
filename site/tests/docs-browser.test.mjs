import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium, firefox, expect } from "@playwright/test";
import { extractDocument } from "../../src/agent/operations.ts";

const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, "dist/site");
const evidence = path.resolve(
  root,
  process.env.YELI_SITE_EVIDENCE_DIR ?? "output/documentation-20261024",
);
const sha = (value) => createHash("sha256").update(value).digest("hex");

test(
  "actual bilingual documentation works over HTTP and file, including offline handbooks",
  { timeout: 180_000 },
  async () => {
    fs.mkdirSync(evidence, { recursive: true });
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const file = path.resolve(
        output,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      if (!file.startsWith(output + path.sep) || !fs.existsSync(file)) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader(
        "Content-Type",
        file.endsWith(".md")
          ? "text/plain; charset=utf-8"
          : "text/html; charset=utf-8",
      );
      response.end(fs.readFileSync(file));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const records = [];
    const errors = [];
    const external = [];
    try {
      for (const [engine, type] of [
        ["chromium", chromium],
        ["firefox", firefox],
      ]) {
        const browser = await type.launch();
        try {
          for (const transport of ["http", "file"]) {
            for (const locale of ["zh-CN", "en"]) {
              for (const width of engine === "chromium"
                ? [1440, 390, 320]
                : [1440]) {
                const context = await browser.newContext({
                  viewport: { width, height: 960 },
                  locale,
                });
                const page = await context.newPage();
                page.on("pageerror", (error) => errors.push(error.message));
                page.on("console", (message) => {
                  if (message.type() === "error") errors.push(message.text());
                });
                page.on("request", (request) => {
                  if (
                    /^https?:/.test(request.url()) &&
                    !request.url().startsWith(base)
                  )
                    external.push(request.url());
                });
                const url = (relative) =>
                  transport === "file"
                    ? pathToFileURL(path.join(output, relative)).href
                    : base + relative;
                await page.goto(url(`docs/${locale}/index.html`));
                await expect(page.locator("article h1")).toBeVisible();
                await expect(page.locator(".chapter-grid a")).toHaveCount(31);
                if (
                  engine === "chromium" &&
                  transport === "http" &&
                  width !== 320
                ) {
                  await page.screenshot({
                    path: path.join(evidence, `index-${locale}-${width}.png`),
                    fullPage: false,
                  });
                }
                const search = page.locator("#docs-search");
                await search.fill(locale === "en" ? "stale" : "过期");
                await expect(
                  page.locator("#search-results a").first(),
                ).toBeVisible();
                assert.ok(
                  await page
                    .locator('#search-results a[href$="yeli/agent.html"]')
                    .count(),
                );
                await search.fill("no-matching-yeli-938475");
                await expect(page.locator("#search-results a")).toHaveCount(0);
                await expect(page.locator("#search-status")).not.toHaveText("");
                await search.press("Escape");
                await expect(search).toHaveValue("");
                await expect(page.locator("#search-results")).toBeHidden();
                const overflow = () =>
                  page.evaluate(
                    () =>
                      globalThis.document.documentElement.scrollWidth >
                      globalThis.innerWidth + 1,
                  );
                assert.equal(
                  await overflow(),
                  false,
                  `Index overflow: ${engine} ${locale} ${width}`,
                );
                await page
                  .locator('.routes a[href="yeli/overview.html"]')
                  .click();
                await expect(page.locator("article")).toContainText(
                  locale === "en" ? "Where and how" : "入口和操作",
                );
                await page
                  .locator('article a[href="best-practices.html"]')
                  .first()
                  .click();
                await expect(page.locator("article")).toContainText(
                  locale === "en" ? "Done when:" : "完成标准",
                );
                await page
                  .locator('.reference-links a[href="../yeli/shortcuts.html"]')
                  .click();
                await expect(page.locator("article")).toContainText(
                  "Windows / Linux",
                );
                await expect(page.locator("article")).not.toContainText(
                  "view.font-size",
                );
                assert.equal(
                  await overflow(),
                  false,
                  `Reference overflow: ${engine} ${locale} ${width}`,
                );
                const peer = page.locator("[data-language-peer]");
                await peer.click();
                assert.ok(
                  page
                    .url()
                    .includes(
                      `/docs/${locale === "en" ? "zh-CN" : "en"}/yeli/shortcuts.html`,
                    ),
                );
                await expect(page.locator("html")).toHaveAttribute(
                  "lang",
                  locale === "en" ? "zh-CN" : "en",
                );
                await page.goto(url(`docs/${locale}/yeli/commands.html`));
                await expect(page.locator("article")).toContainText(
                  "view.font-size",
                );
                if (
                  engine === "chromium" &&
                  transport === "http" &&
                  width !== 390
                ) {
                  for (const id of [
                    "overview",
                    "shortcuts",
                    "best-practices",
                  ]) {
                    await page.goto(url(`docs/${locale}/yeli/${id}.html`));
                    assert.equal(
                      await overflow(),
                      false,
                      `Overflow: ${id} ${locale} ${width}`,
                    );
                    await page.screenshot({
                      path: path.join(
                        evidence,
                        `reorganized-${id}-${locale}-${width}.png`,
                      ),
                      fullPage: false,
                    });
                  }
                }
                await page.goto(url(`docs/${locale}/yeli/save.html`));
                await page.locator(".neighbors a").last().click();
                assert.ok(page.url().endsWith("yeli/history.html"));
                await page
                  .locator(".toc a, .compact-toc a")
                  .first()
                  .evaluate((el) => el.click());
                await expect(page).toHaveURL(/#.+/u);
                if (
                  engine === "chromium" &&
                  transport === "http" &&
                  width === 1440
                ) {
                  const downloadPromise = page.waitForEvent("download");
                  await page
                    .locator('.downloads a[download][href$=".md"]')
                    .click();
                  const download = await downloadPromise;
                  const bytes = fs.readFileSync(await download.path());
                  assert.equal(
                    sha(bytes),
                    sha(
                      fs.readFileSync(
                        path.join(output, `docs/downloads/yeli.${locale}.md`),
                      ),
                    ),
                  );
                }
                await page.screenshot({
                  path: path.join(
                    evidence,
                    `${engine}-${transport}-${locale}-${width}.png`,
                  ),
                  fullPage: false,
                });
                records.push({
                  engine,
                  transport,
                  locale,
                  width,
                  search: true,
                  languagePeer: true,
                  navigation: true,
                  featureOverview: true,
                  bestPractices: true,
                  separateReferences: true,
                  noOverflow: true,
                });
                await context.close();
              }
            }
          }
          for (const locale of ["zh-CN", "en"]) {
            const context = await browser.newContext({
              javaScriptEnabled: false,
            });
            const page = await context.newPage();
            await page.goto(
              pathToFileURL(
                path.join(output, `docs/${locale}/markdown/intro.html`),
              ).href,
            );
            await expect(page.locator("article")).toContainText("2004");
            await expect(page.locator(".search-form")).toBeHidden();
            await page.locator("[data-language-peer]").click();
            await expect(page.locator("article")).toContainText("CommonMark");
            records.push({
              engine,
              locale,
              scriptDisabledReadingAndNavigation: true,
            });
            await context.close();
          }
          if (engine === "chromium") {
            for (const locale of ["zh-CN", "en"]) {
              const homeContext = await browser.newContext({
                locale,
                viewport: { width: 390, height: 844 },
              });
              const home = await homeContext.newPage();
              await home.goto(`${base}index.html?lang=${locale}`);
              await expect(home.locator("html")).toHaveAttribute(
                "lang",
                locale,
              );
              await home.locator("#menu-toggle").click();
              await home
                .locator('#mobile-menu a[data-tutorial="index.html"]')
                .click();
              await expect(home).toHaveURL(
                new RegExp(`/docs/${locale}/index.html$`),
              );
              await home.goto(`${base}index.html?lang=${locale}`);
              await home
                .locator('[data-tutorial="markdown/intro.html"]')
                .click();
              await expect(home).toHaveURL(
                new RegExp(`/docs/${locale}/markdown/intro.html$`),
              );
              records.push({ locale, homepageEntries: true });
              await homeContext.close();
              for (const track of ["yeli", "markdown"]) {
                const context = await browser.newContext({ locale });
                const page = await context.newPage();
                page.on("pageerror", (error) => errors.push(error.message));
                page.on("request", (request) => {
                  if (/^https?:/.test(request.url()))
                    external.push(request.url());
                });
                const file = path.join(
                  output,
                  `docs/downloads/${track}.${locale}.yeli.html`,
                );
                await page.goto(pathToFileURL(file).href);
                await expect(page.locator(".read-document")).toBeVisible();
                await page
                  .getByRole("button", {
                    name: locale === "en" ? "Edit" : "编辑",
                    exact: true,
                  })
                  .click();
                await expect(page.locator(".edit-document")).toBeVisible();
                const first = page
                  .locator('.block-content-editable[contenteditable="true"]')
                  .first();
                await first.fill("Documentation acceptance edit");
                await first.press("Tab");
                await page
                  .getByRole("button", {
                    name:
                      locale === "en" ? /^(?:More|Menu)$/u : /^(?:更多|菜单)$/u,
                    exact: true,
                  })
                  .click();
                const downloadPromise = page.waitForEvent("download");
                await page
                  .getByRole("menuitem", {
                    name: locale === "en" ? "Save a copy" : "保存副本",
                    exact: true,
                  })
                  .click();
                const download = await downloadPromise;
                const savedPath = path.join(
                  evidence,
                  `saved-${track}.${locale}.yeli.html`,
                );
                await download.saveAs(savedPath);
                assert.ok(
                  (
                    await extractDocument(fs.readFileSync(savedPath, "utf8"))
                  ).includes("Documentation acceptance edit"),
                );
                await page.goto(pathToFileURL(savedPath).href);
                await expect(page.locator(".read-document")).toContainText(
                  "Documentation acceptance edit",
                );
                records.push({
                  handbook: `${track}.${locale}`,
                  offlineOpenEditSaveReopen: true,
                });
                await context.close();
              }
            }
          }
        } finally {
          await browser.close();
        }
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      fs.writeFileSync(
        path.join(evidence, "browser-results.json"),
        JSON.stringify({ records, errors, external }, null, 2) + "\n",
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
