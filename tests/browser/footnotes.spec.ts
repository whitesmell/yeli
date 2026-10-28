import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseYeliArtifact } from "../../src/format/parse.ts";
import { projectShell } from "../../src/integrity/shell-projection.ts";

test.use({ locale: "zh-CN" });

const site = path.resolve("dist/site");
let server: Server;
let origin: string;

const source = [
  "---",
  "title: Footnote fidelity",
  "custom-safe: keep",
  "---",
  "",
  "正文[^note]，再次引用[^note]。另一个[^second]。",
  "",
  "[^note]: **加粗脚注**与 [来源](https://example.test/source)。",
  "    第二行保持两个  空格。",
  "",
  "[^second]: 第二条脚注。",
  "",
  "尾部原文 &amp; \\*literal\\*。",
  "",
].join("\r\n");

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
    const file = path.resolve(
      site,
      `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`,
    );
    if (!file.startsWith(`${site}${path.sep}`) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    });
    response.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Missing footnote test origin");
  }
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function open(page: Page, markdown = source) {
  await page.goto(`${origin}/editor/`);
  await expect(
    page.getByRole("dialog", { name: "本机文档", exact: true }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "footnotes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown),
  });
  await expect(page.locator(".block-canvas")).toBeVisible();
  await expect(page.locator(".document-title-input")).toBeFocused();
}

async function menu(page: Page) {
  const trigger = page.locator("[data-more-trigger]");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(page.locator(".more-popover")).toBeVisible();
}

async function historyControl(page: Page, command: "undo" | "redo") {
  const toolbarControl = page.locator(
    `.topbar-tools [data-command-id="document.${command}"]`,
  );
  if (await toolbarControl.isVisible()) return toolbarControl;
  await menu(page);
  return page.locator(`.more-popover [data-command-id="document.${command}"]`);
}

async function savedMarkdown(page: Page) {
  await menu(page);
  const pending = page.waitForEvent("download");
  await page.locator('[data-menu-action="save"]').click();
  const download = await pending;
  const file = await download.path();
  if (!file) throw new Error("Missing Markdown download");
  return readFileSync(file, "utf8");
}

for (const host of ["web", "artifact"] as const) {
  for (const locale of ["zh-CN", "en"] as const) {
    test(`narrow ${host} toolbar retains editable title and keyboard menu in ${locale}`, async ({
      page,
    }) => {
      if (host === "web") {
        await open(page);
        if (locale === "en") {
          await menu(page);
          await page.getByRole("menuitem", { name: "English" }).click();
        }
      } else {
        await page.goto(
          pathToFileURL(path.resolve(`dist/html/starter.${locale}.yeli.html`))
            .href,
        );
        await page
          .getByRole("button", {
            name: locale === "en" ? "Edit" : "编辑",
            exact: true,
          })
          .click();
      }
      const trigger = page.getByRole("button", {
        name: locale === "en" ? "Menu" : "菜单",
        exact: true,
      });
      for (const width of [320, 360, 361, 390, 420, 421]) {
        await page.setViewportSize({ width, height: 720 });
        const title = page.locator(".topbar-title-input");
        await expect(title).toBeVisible();
        const textWidth = await title.evaluate((input) => {
          const style = getComputedStyle(input);
          return (
            input.clientWidth -
            Number.parseFloat(style.paddingLeft) -
            Number.parseFloat(style.paddingRight)
          );
        });
        expect(
          textWidth,
          `${host} ${locale} at ${width}px`,
        ).toBeGreaterThanOrEqual(36);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          ),
        ).toBeLessThanOrEqual(1);
        await expect(trigger).toBeVisible();
        expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(
          44,
        );
        await trigger.focus();
        await expect(trigger).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(page.locator(".more-popover")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
      }
    });
  }
}

for (const host of ["web", "artifact"] as const) {
  test(`continuous undo and redo preserve exact source across body and note edits in ${host}`, async ({
    page,
    browserName,
  }, testInfo) => {
    await open(page);
    let initial = source;
    let originalArtifact = "";
    const offlineRequests: string[] = [];
    if (host === "artifact") {
      await menu(page);
      const pending = page.waitForEvent("download");
      await page.locator('[data-menu-action="export-yeli"]').click();
      const target = testInfo.outputPath("undo.yeli.html");
      await (await pending).saveAs(target);
      originalArtifact = readFileSync(target, "utf8");
      initial = source.replaceAll("\r\n", "\n");
      page.on("request", (request) => {
        if (/^https?:/u.test(request.url())) {
          offlineRequests.push(request.url());
        }
      });
      if (browserName === "webkit") {
        await page.context().route(/^https?:/u, (route) => route.abort());
      } else {
        await page.context().setOffline(true);
      }
      await page.goto(pathToFileURL(target).href);
      await page.getByRole("button", { name: "编辑", exact: true }).click();
    }
    const body = () =>
      page
        .locator(
          '.block-canvas > [data-block-kind="paragraph"] .block-content-editable',
        )
        .first();
    const note = () =>
      page
        .locator(
          '.footnote-block[data-footnote-label="note"] .block-content-editable',
        )
        .first();
    const append = async (editable: ReturnType<typeof body>, text: string) => {
      await editable.click();
      await editable.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
      await page.keyboard.type(text);
      await editable.blur();
    };
    const savedSource = async () => {
      const saved = await savedMarkdown(page);
      if (host === "web") return saved;
      const parsed = await parseYeliArtifact(saved);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error("Invalid undo saved artifact");
      expect(projectShell(saved).hash).toBe(
        projectShell(originalArtifact).hash,
      );
      expect(parsed.freshness.manifest.status).toBe("fresh");
      return parsed.markdown;
    };
    const assertHistoryDisabled = async (command: "undo" | "redo") => {
      const control = await historyControl(page, command);
      await expect(control).toBeVisible();
      await expect(control).toBeDisabled();
      if (await page.locator(".more-popover").isVisible()) {
        await page.keyboard.press("Escape");
      }
    };
    const first = initial.replace("另一个[^second]。", "另一个[^second]。 A");
    const second = first.replace(
      "第二行保持两个  空格。",
      "第二行保持两个  空格。 B",
    );
    const third = second.replace(
      "另一个[^second]。 A",
      "另一个[^second]。 A C",
    );
    await append(body(), " A");
    expect(await savedSource()).toBe(first);
    await append(note(), " B");
    expect(await savedSource()).toBe(second);
    await append(body(), " C");
    expect(await savedSource()).toBe(third);
    for (const expected of [second, first, initial]) {
      await (await historyControl(page, "undo")).click();
      expect(await savedSource()).toBe(expected);
    }
    await assertHistoryDisabled("undo");
    for (const [index, expected] of [first, second, third].entries()) {
      if (index === 0 && !(await page.locator(".topbar-tools").isVisible())) {
        await (await historyControl(page, "redo")).click();
      } else {
        await page.locator("[data-more-trigger]").focus();
        await page.keyboard.press("ControlOrMeta+Shift+z");
      }
      expect(await savedSource()).toBe(expected);
    }
    await assertHistoryDisabled("redo");
    await (await historyControl(page, "undo")).click();
    await append(body(), " Branch");
    expect(await savedSource()).toBe(
      second.replace("另一个[^second]。 A", "另一个[^second]。 A Branch"),
    );
    await assertHistoryDisabled("redo");
    expect(offlineRequests).toEqual([]);
  });
}

test("approved labelled menu remains usable at 390px in both languages", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const trigger = page.locator("[data-more-trigger]");
  await expect(trigger).toContainText("菜单");
  await menu(page);
  await expect(
    page.locator('[data-menu-action="local-documents"]'),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await menu(page);
  await page.locator('[data-menu-action="language"]').click();
  await expect(trigger).toContainText("Menu");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  const bounds = await trigger.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(36);
  await page.screenshot({
    path: testInfo.outputPath("labelled-menu-mobile.png"),
  });
});

test("footnotes render with repeated-reference backlinks without changing Markdown", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  expect(await savedMarkdown(page)).toBe(source);
  await page.getByRole("button", { name: "阅读", exact: true }).click();
  const document = page.locator(".read-document");
  await expect(document.locator(".footnote-ref")).toHaveCount(3);
  await expect(document.locator(".footnote-item")).toHaveCount(2);
  await expect(document.locator(".footnote-item strong")).toHaveText(
    "加粗脚注",
  );
  await expect(document.locator(".footnote-backref")).toHaveCount(3);
  await document.locator(".footnote-ref a").first().click();
  const firstReference = document.locator(".footnote-ref a").first();
  const destination = await firstReference.getAttribute("href");
  expect(destination).toMatch(/^#/u);
  expect(
    await document.evaluate((root, href) => {
      const target = root.ownerDocument.getElementById(href!.slice(1));
      return target !== null && root.contains(target);
    }, destination),
  ).toBe(true);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  expect(await savedMarkdown(page)).toBe(source);
  expect(errors).toEqual([]);
});

test("editing around footnote references preserves their Markdown and undo restores exact bytes", async ({
  page,
}) => {
  await open(page);
  const paragraph = page
    .locator('[data-block-kind="paragraph"] .block-content-editable')
    .first();
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type(" 补充");
  await paragraph.blur();
  expect(await savedMarkdown(page)).toBe(
    source.replace("另一个[^second]。", "另一个[^second]。 补充"),
  );
  await (await historyControl(page, "undo")).click();
  expect(await savedMarkdown(page)).toBe(source);
});

test("visual footnote edits commit into an immediate export and undo preserves source formatting", async ({
  page,
}, testInfo) => {
  await open(page);
  const note = page.locator('.footnote-block[data-footnote-label="note"]');
  await expect(note).toBeVisible();
  await expect(note.locator(".source-safe-block")).toHaveCount(0);
  await expect(note.locator("strong")).toHaveText("加粗脚注");
  await expect(
    note.locator('a[href="https://example.test/source"]'),
  ).toHaveText("来源");
  const body = note.locator(".block-content-editable").first();
  await body.click();
  await body.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type(" 新增内容");
  // Opening the export must commit the currently focused editor first.
  await menu(page);
  await page.locator('[data-menu-action="export-html"]').click();
  const preview = page.getByRole("dialog", { name: "导出预览" });
  await expect(
    preview.frameLocator("iframe").locator(".footnote-item").first(),
  ).toContainText("新增内容");
  await preview.getByRole("button", { name: "关闭", exact: true }).click();
  expect(await savedMarkdown(page)).toBe(
    source.replace("第二行保持两个  空格。", "第二行保持两个  空格。 新增内容"),
  );
  await (await historyControl(page, "undo")).click();
  expect(await savedMarkdown(page)).toBe(source);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("visual-footnotes-desktop.png"),
  });
});

test("formatting text after a reference keeps its label and surrounding Markdown exact", async ({
  page,
}) => {
  const markdown = "Before[^note] **keep** After.\n\n[^note]: A note.\n";
  await open(page, markdown);
  const paragraph = page
    .locator('[data-block-kind="paragraph"] .block-content-editable')
    .first();
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const text = element.lastChild!;
    const start = text.textContent!.indexOf("After");
    const range = element.ownerDocument.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + "After".length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "After",
  );
  await page
    .locator('.inline-toolbar [data-command-id="selection.bold"]')
    .click();
  await expect(paragraph.locator("strong, b")).toHaveCount(2);
  await paragraph.blur();
  expect(await savedMarkdown(page)).toBe(
    markdown.replace(" After.", " **After**."),
  );
});

test("Enter in a note with an identical list keeps focus and typing in that note", async ({
  page,
}) => {
  const markdown =
    "Body[^first] and [^second].\n\n[^first]:\n    - one\n    - two\n\n[^second]:\n    - one\n    - two\n";
  await open(page, markdown);
  const second = page.locator('.footnote-block[data-footnote-label="second"]');
  const item = second
    .locator(".block-list-item .block-content-editable")
    .first();
  await item.click();
  await item.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement
          ?.closest(".footnote-block")
          ?.getAttribute("data-footnote-label"),
      ),
    )
    .toBe("second");
  await page.keyboard.type("third");
  await expect(second).toContainText("third");
  const edited = await savedMarkdown(page);
  expect(edited.slice(0, edited.indexOf("[^second]:"))).toBe(
    markdown.slice(0, markdown.indexOf("[^second]:")),
  );
  expect(edited.slice(edited.indexOf("[^second]:"))).toContain("third");
  expect(edited).toBe(
    markdown.replace(
      "[^second]:\n    - one\n    - two",
      "[^second]:\n    - one\n    - third\n    - two",
    ),
  );
});

test("identical inline note paragraphs keep occurrence-specific numbers in Edit and Read", async ({
  page,
}) => {
  const markdown = "Same ^[inline].\n\nSame ^[inline].\n";
  await open(page, markdown);
  await expect(page.locator(".block-canvas .footnote-atom")).toHaveText([
    "1",
    "2",
  ]);
  await page.getByRole("button", { name: "阅读", exact: true }).click();
  await expect(page.locator(".read-document .footnote-ref")).toHaveText([
    "[1]",
    "[2]",
  ]);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  expect(await savedMarkdown(page)).toBe(markdown);
});

test("table row insertion and subsequent typing stay inside the second footnote", async ({
  page,
}) => {
  const markdown =
    "Body[^first] and [^second].\n\n[^first]:\n    | A |\n    | --- |\n    | one |\n\n[^second]:\n    | A |\n    | --- |\n    | one |\n";
  await open(page, markdown);
  const second = page.locator('.footnote-block[data-footnote-label="second"]');
  await second
    .locator('textarea[data-table-row="0"][data-table-column="0"]')
    .focus();
  await second
    .getByRole("button", { name: "在下方插入行", exact: true })
    .click();
  await expect(second.locator("tr")).toHaveCount(3);
  await expect(
    second.locator('textarea[data-table-row="1"][data-table-column="0"]'),
  ).toBeFocused();
  await page.keyboard.type("third");
  // Cell edits retain the inserted empty cell's two source spaces.
  expect(await savedMarkdown(page)).toBe(
    markdown.replace(
      "[^second]:\n    | A |\n    | --- |\n    | one |",
      "[^second]:\n    | A |\n    | --- |\n    |  third|\n    | one |",
    ),
  );
});

test("selecting a multiline endnote in Read returns to its visual editor", async ({
  page,
}) => {
  const markdown =
    "Text[^rich].\n\n[^rich]: First paragraph.\n\n    Second paragraph.\n";
  await open(page, markdown);
  await page.getByRole("button", { name: "阅读", exact: true }).click();
  const endnote = page.locator(".read-document .footnote-item");
  await expect(endnote).toHaveAttribute("data-read-block-id", /footnote/u);
  await endnote
    .locator("p")
    .nth(1)
    .evaluate((element) => {
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement
          ?.closest(".footnote-block")
          ?.getAttribute("data-footnote-label"),
      ),
    )
    .toBe("rich");
  expect(await savedMarkdown(page)).toBe(markdown);
});

test("footnote HTML and print exports share formatted content and preserve the editable copy", async ({
  page,
  browserName,
}, testInfo) => {
  await page.addInitScript(() => {
    const frames: string[] = [];
    const seen = new WeakSet<HTMLIFrameElement>();
    new MutationObserver(() => {
      for (const frame of document.querySelectorAll<HTMLIFrameElement>(
        "iframe.print-frame",
      )) {
        if (seen.has(frame)) continue;
        seen.add(frame);
        frames.push(frame.srcdoc);
      }
    }).observe(document, { childList: true, subtree: true });
    Object.defineProperty(window, "__footnotePrintFrames", { value: frames });
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      "contentWindow",
    );
    if (!descriptor?.get) return;
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      configurable: true,
      get() {
        const target = descriptor.get!.call(this) as Window | null;
        if (target) {
          Object.defineProperty(target, "print", {
            configurable: true,
            value: () => {},
          });
        }
        return target;
      },
    });
  });
  await open(page);
  await menu(page);
  await page.locator('[data-menu-action="export-html"]').click();
  const preview = page.getByRole("dialog", { name: "导出预览" });
  const html = await preview.locator("iframe").getAttribute("srcdoc");
  expect(html).toContain('class="footnote-ref"');
  expect(html).toContain("加粗脚注");
  expect(html).not.toMatch(/<script/iu);
  await expect(
    preview.frameLocator("iframe").locator(".footnote-item"),
  ).toHaveCount(2);
  if (html && browserName === "chromium") {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("footnotes-export.html"), html);
    const printPage = await page.context().newPage();
    await printPage.setContent(html);
    await printPage.pdf({
      path: testInfo.outputPath("footnotes-export.pdf"),
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
    });
    await printPage.close();
  }
  await preview.getByRole("button", { name: "关闭", exact: true }).click();
  await menu(page);
  await page.locator('[data-menu-action="print"]').click();
  const frames = () =>
    page.evaluate(
      () =>
        (
          window as Window & {
            __footnotePrintFrames?: string[];
          }
        ).__footnotePrintFrames ?? [],
    );
  await expect.poll(async () => (await frames()).length).toBe(1);
  expect((await frames())[0]).toBe(html);
  await expect(page.locator("iframe.print-frame")).toHaveCount(0);

  await menu(page);
  const pending = page.waitForEvent("download");
  await page.locator('[data-menu-action="export-yeli"]').click();
  const download = await pending;
  const target = testInfo.outputPath("footnotes.yeli.html");
  await download.saveAs(target);
  const artifact = readFileSync(target, "utf8");
  const parsed = await parseYeliArtifact(artifact);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.markdown).toBe(source.replaceAll("\r\n", "\n"));
  }
  const offlineRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) offlineRequests.push(request.url());
  });
  if (browserName === "webkit") {
    await page.context().route(/^https?:/u, (route) => route.abort());
  } else {
    await page.context().setOffline(true);
  }
  await page.goto(pathToFileURL(target).href);
  await expect(page.locator(".read-document .footnote-item")).toHaveCount(2);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator("[data-more-trigger]")).toContainText("菜单");
  const fileNote = page
    .locator(
      '.footnote-block[data-footnote-label="note"] .block-content-editable',
    )
    .first();
  await fileNote.click();
  await fileNote.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type(" 文件版");
  await menu(page);
  const saved = page.waitForEvent("download");
  await page.locator('[data-menu-action="save"]').click();
  const savedFile = await (await saved).path();
  if (!savedFile) throw new Error("Missing file-host saved artifact");
  const savedArtifact = readFileSync(savedFile, "utf8");
  const reopened = await parseYeliArtifact(savedArtifact);
  expect(reopened.ok).toBe(true);
  if (reopened.ok && parsed.ok) {
    expect(reopened.markdown).toBe(
      parsed.markdown.replace(
        "第二行保持两个  空格。",
        "第二行保持两个  空格。 文件版",
      ),
    );
    expect(reopened.payload.settings).toEqual(parsed.payload.settings);
    expect(reopened.freshness.manifest.status).toBe("fresh");
    expect(savedArtifact).toContain(
      `data-source-hash="${reopened.payload.manifest.sourceHash}"`,
    );
  }
  expect(projectShell(savedArtifact).hash).toBe(projectShell(artifact).hash);
  expect(offlineRequests).toEqual([]);
});
