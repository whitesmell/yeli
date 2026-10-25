import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { chromium, firefox, expect } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, "dist/site");

test("the public Skill is the exact canonical Skill and is discoverable", () => {
  assert.deepEqual(
    fs.readFileSync(path.join(output, "skill.md")),
    fs.readFileSync(path.join(root, "skills/yeli/SKILL.md")),
  );
  const release = JSON.parse(
    fs.readFileSync(path.join(output, "release.json"), "utf8"),
  );
  assert.equal(release.agentSkill, "skill.md");
});

test(
  "hero instruction selects and copies in both languages with an honest manual fallback",
  { timeout: 90_000 },
  async () => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://localhost");
      const relative = url.pathname.replace(/^\/yeli\//, "");
      const file = path.resolve(output, relative || "index.html");
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
    const base = `http://127.0.0.1:${server.address().port}/yeli/`;
    const errors = [];
    try {
      for (const [engine, browserType] of [
        ["chromium", chromium],
        ["firefox", firefox],
      ]) {
        const browser = await browserType.launch();
        try {
          for (const locale of ["zh-CN", "en"]) {
            for (const transport of ["http", "file"]) {
              for (const width of [320, 1440]) {
                const context = await browser.newContext({
                  viewport: { width, height: 1040 },
                });
                await context.addInitScript(() => {
                  Object.defineProperty(navigator, "clipboard", {
                    configurable: true,
                    value: {
                      writeText: async (text) => {
                        globalThis.__copiedInstruction = text;
                      },
                    },
                  });
                });
                const page = await context.newPage();
                page.on("pageerror", (error) => errors.push(error.message));
                const url =
                  transport === "http"
                    ? `${base}?lang=${locale}`
                    : `${pathToFileURL(path.join(output, "index.html")).href}?lang=${locale}`;
                await page.goto(url);
                await expect(page.locator("html")).toHaveAttribute(
                  "lang",
                  locale,
                );
                const instruction =
                  locale === "en"
                    ? "Read https://yeli.zetury.com/skill.md and follow the instructions to create and edit Yeli documents."
                    : "阅读 https://yeli.zetury.com/skill.md，按指引开始创建和编辑 Yeli 文档。";
                const prompt = page.locator("#agent-prompt");
                const copy = page.locator("#copy-agent-prompt");
                const status = page.locator("#agent-copy-status");
                await expect(prompt).toBeVisible();
                await expect(prompt).toHaveValue(instruction);
                await expect(copy).toHaveText(
                  locale === "en" ? "Copy instruction" : "复制指令",
                );
                assert.deepEqual(
                  await page
                    .locator(".hero-actions > *")
                    .evaluateAll((actions) =>
                      actions.map((el) => [
                        el.tagName,
                        el.classList.contains("primary"),
                      ]),
                    ),
                  [
                    ["BUTTON", true],
                    ["A", false],
                  ],
                );
                await expect(
                  page.locator(".hero-actions [data-demo]"),
                ).toHaveAttribute("href", `sample.${locale}.yeli.html`);
                await prompt.click();
                assert.deepEqual(
                  await prompt.evaluate((el) => [
                    el.selectionStart,
                    el.selectionEnd,
                  ]),
                  [0, instruction.length],
                );
                assert.equal(
                  await prompt.evaluate(
                    (el) => el.scrollHeight > el.clientHeight,
                  ),
                  false,
                  "Full instruction is visible",
                );
                if (engine === "chromium" && transport === "http") {
                  const evidence = path.join(
                    root,
                    "output/agent-copy-20261025",
                  );
                  fs.mkdirSync(evidence, { recursive: true });
                  await page.locator("h1").click();
                  await page.screenshot({
                    path: path.join(evidence, `${locale}-${width}.png`),
                  });
                }
                const actionsBeforeCopy = await page
                  .locator(".hero-actions")
                  .boundingBox();
                await copy.click();
                assert.equal(
                  await page.evaluate(() => globalThis.__copiedInstruction),
                  instruction,
                );
                await expect(copy).toHaveText(
                  locale === "en" ? "Copied" : "已复制",
                );
                await expect(status).toHaveText(
                  locale === "en"
                    ? "Copied. Paste it into your Agent's conversation."
                    : "已复制，粘贴到你的 Agent 对话中即可。",
                );
                assert.equal(
                  (await page.locator(".hero-actions").boundingBox()).y,
                  actionsBeforeCopy.y,
                  "Copy feedback does not move the actions",
                );
                const otherLocale = locale === "en" ? "zh-CN" : "en";
                await page.locator("#language").selectOption(otherLocale);
                await expect(status).toHaveText("");
                await expect(prompt).toHaveValue(
                  otherLocale === "en" ? /^Read / : /^阅读 /,
                );
                await page.locator("#language").selectOption(locale);
                await expect(prompt).toHaveValue(instruction);
                await expect(copy).toHaveText(
                  locale === "en" ? "Copy instruction" : "复制指令",
                );
                await page.evaluate(() => {
                  navigator.clipboard.writeText = async () => {
                    throw new Error("denied");
                  };
                });
                await copy.click();
                await expect(prompt).toBeFocused();
                assert.deepEqual(
                  await prompt.evaluate((el) => [
                    el.selectionStart,
                    el.selectionEnd,
                  ]),
                  [0, instruction.length],
                );
                await expect(status).toHaveText(
                  locale === "en"
                    ? "Instruction selected. Copy it and paste it into your Agent's conversation."
                    : "已选中指令，请复制后粘贴到你的 Agent 对话中。",
                );
                await page.setViewportSize({ width, height: 760 });
                await expect(prompt).toBeVisible();
                assert.equal(
                  await prompt.evaluate(
                    (el) => el.scrollHeight > el.clientHeight,
                  ),
                  false,
                );
                assert.equal(
                  await page.evaluate(
                    () =>
                      globalThis.document.documentElement.scrollWidth >
                      globalThis.innerWidth,
                  ),
                  false,
                  `${engine} ${locale} ${transport}: horizontal overflow`,
                );
                if (
                  engine === "chromium" &&
                  transport === "http" &&
                  width === 1440
                ) {
                  await page.evaluate(() => {
                    navigator.clipboard.writeText = () =>
                      new Promise((resolve) => {
                        globalThis.__resolveCopy = resolve;
                      });
                  });
                  await copy.click();
                  await page.locator("#language").selectOption(otherLocale);
                  await page.evaluate(() => globalThis.__resolveCopy());
                  await expect(status).toHaveText("");
                  await expect(copy).toHaveText(
                    otherLocale === "en" ? "Copy instruction" : "复制指令",
                  );
                }
                await context.close();
              }
            }
          }
        } finally {
          await browser.close();
        }
      }
      assert.deepEqual(errors, []);
      const response = await fetch(`${base}skill.md`);
      assert.equal(response.status, 200);
      assert.equal(
        await response.text(),
        fs.readFileSync(path.join(root, "skills/yeli/SKILL.md"), "utf8"),
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
