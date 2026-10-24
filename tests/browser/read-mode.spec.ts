import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { importImageFixture } from "./artifact-fixture.ts";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");

async function selectText(
  target: Locator,
  text: string,
  activateEdit?: "keyboard" | "pointer",
) {
  await target.evaluate(
    (element, { activate, needle }) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push(node as Text);
      }
      const absoluteStart = (element.textContent ?? "").indexOf(needle);
      const absoluteEnd = absoluteStart + needle.length;
      const locate = (position: number, preferNextAtBoundary: boolean) => {
        let cursor = 0;
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index]!;
          const next = cursor + node.length;
          if (
            position < next ||
            (position === next &&
              (!preferNextAtBoundary || index === nodes.length - 1))
          ) {
            return { node, offset: position - cursor };
          }
          cursor = next;
        }
        return null;
      };
      const start = locate(absoluteStart, true);
      const end = locate(absoluteEnd, false);
      if (!start || !end) throw new Error(`Could not select ${needle}`);
      const range = document.createRange();
      if (activate === "pointer") {
        range.selectNodeContents(element);
      } else {
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
      }
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      if (!activate) return;
      const edit = document.querySelector<HTMLButtonElement>(
        ".primary-mode-switch button:last-child",
      );
      if (!edit) throw new Error("Missing Edit mode button");
      if (activate === "keyboard") edit.focus();
      else
        edit.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      edit.click();
    },
    { activate: activateEdit, needle: text },
  );
}

async function selectAcrossBlocksAndEnterEdit(page: Page) {
  await expect(
    page.locator('[data-read-block-id][data-source-kind="paragraph"]').filter({
      hasText: "用浏览器打开这份文件",
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    const startText = "用浏览器打开这份文件";
    const endText = "一份文件，随处续写。";
    const blocks = [
      ...document.querySelectorAll<HTMLElement>("[data-read-block-id]"),
    ];
    const startBlock = blocks.find((block) =>
      block.textContent?.includes(startText),
    );
    const endBlock = blocks.find((block) =>
      block.textContent?.includes(endText),
    );
    const position = (root: HTMLElement, needle: string, atEnd: boolean) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const offset = (node.textContent ?? "").indexOf(needle);
        if (offset >= 0) {
          return {
            node,
            offset: offset + (atEnd ? needle.length : 0),
          };
        }
      }
      return null;
    };
    if (!startBlock || !endBlock) throw new Error("Missing cross-block target");
    const start = position(startBlock, startText, false);
    const end = position(endBlock, endText, true);
    if (!start || !end) throw new Error("Missing cross-block text position");
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    const edit = document.querySelector<HTMLButtonElement>(
      ".primary-mode-switch button:last-child",
    );
    if (!edit) throw new Error("Missing Edit mode button");
    edit.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    edit.click();
  });
}

test.beforeAll(() => {
  expect(existsSync(artifactPath), "single-file artifact must be built").toBe(
    true,
  );
});

test("Read centers the content and removes editing chrome", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);

  await expect(page.locator(".document-image")).toHaveCount(0);
  await expect(page.locator(".markdown-document")).toContainText(
    "图片区块示例",
  );
  await expect(page.locator(".markdown-document")).toContainText("核心能力");
  await expect(page.locator(".block-gutter")).toHaveCount(0);
  await expect(page.locator(".inline-toolbar")).toHaveCount(0);
  await expect(page.locator(".inspector")).toHaveCount(0);
  const completedTask = page.locator("input.task-checkbox").first();
  await expect(completedTask).toBeChecked();
  await completedTask.click({ force: true });
  await expect(completedTask).toBeChecked();
  await expect(page.getByRole("button", { name: "历史版本" })).toHaveCount(0);
});

test("opens embedded images at full aspect ratio and restores focus on close", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await importImageFixture(
    page,
    "---\ntitle: Image preview\nlang: zh-CN\n---\n![Image target](yeli-demo:workspace-photo)\n",
  );

  const image = page.locator(".document-image").first();
  await expect(image).toHaveAttribute("role", "button");
  await image.dblclick();
  const preview = page.getByRole("dialog", { name: "图片放大预览" });
  await expect(preview).toBeVisible();
  await expect(preview.locator("img")).toHaveAttribute(
    "src",
    (await image.getAttribute("src")) ?? "",
  );
  await expect(preview.locator("img")).toHaveCSS("object-fit", "contain");

  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(image).toBeFocused();

  await image.press("Enter");
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "关闭" }).click();
  await expect(preview).toHaveCount(0);
  await expect(image).toBeFocused();
});

test("switching to Read closes local history and removes its entry", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("menuitem", { name: "历史版本" }).click();
  await expect(
    page.getByRole("complementary", { name: "历史版本" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "预览" }).click();
  await expect(
    page.getByRole("complementary", { name: "历史版本" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "历史版本" })).toHaveCount(0);
});

test("the optional outline contains headings, never history, and navigates", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.locator('input[type="file"]').setInputFiles({
    name: "outline.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Outline fixture\n\n## 核心能力\n\nBody\n"),
  });
  await page.getByRole("button", { name: "目录" }).click();

  const outline = page.getByRole("complementary", { name: "文档大纲" });
  await expect(outline).toBeVisible();
  await expect(outline).not.toContainText("历史");
  await expect(outline.locator(".heading-level")).toHaveCount(0);
  await expect(outline.getByRole("treeitem").first()).toHaveAttribute(
    "aria-level",
    /\d/u,
  );
  const collapse = outline.locator(".outline-expander").first();
  const collapsibleRow = collapse.locator("..");
  const firstItem = outline
    .locator(":scope > nav > ul > li > .outline-row > .outline-item")
    .first();
  const nestedItem = outline.locator("nav ul ul .outline-item").first();
  await expect(firstItem).toHaveAttribute("title", /\S/u);
  expect(
    await firstItem.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    }),
  ).toEqual({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  await expect(nestedItem).toBeVisible();
  const [outlineBox, firstItemBox] = await Promise.all([
    outline.boundingBox(),
    firstItem.boundingBox(),
  ]);
  expect(firstItemBox!.x - outlineBox!.x).toBeLessThanOrEqual(32);
  expect(
    await collapse.locator("svg").evaluate((element) => {
      const style = getComputedStyle(element);
      return { height: style.height, width: style.width };
    }),
  ).toEqual({ height: "10px", width: "10px" });
  await expect(collapse).toHaveCSS("opacity", "0");
  await collapsibleRow.hover();
  await expect(collapse).toHaveCSS("opacity", "1");
  await collapse.focus();
  await collapse.press("ArrowLeft");
  await expect(collapse).toHaveAttribute("aria-expanded", "false");
  await collapse.evaluate((element) => element.blur());
  await outline.getByRole("heading", { name: "目录" }).hover();
  await expect(collapse).toHaveCSS("opacity", "1");
  await collapse.focus();
  await collapse.press("ArrowRight");
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  const coreSection = outline.getByRole("button", { name: /核心能力/u });
  await coreSection.click();
  await expect(coreSection).toHaveAttribute("aria-current", "location");
  await expect(page.locator("#核心能力")).toBeVisible();
});

test("keeps canvas, toolbar, and browser titles on one fallback chain", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  const toolbarTitle = page.locator(".topbar-document-name");
  const canvasTitle = page.locator(".read-heading h1");
  await expect(toolbarTitle).toHaveText(await canvasTitle.innerText());
  await expect(page).toHaveTitle(`${await canvasTitle.innerText()} · Yeli`);

  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from("Plain body without headings.\n"),
    mimeType: "text/markdown",
    name: "public-notes.md",
  });
  await expect(toolbarTitle).toHaveText("public-notes");
  await expect(canvasTitle).toHaveText("public-notes");
  await expect(page).toHaveTitle("public-notes · Yeli");
});

test("preserves a safe reading selection, block position, focus, and source on Edit", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  const readTarget = page
    .locator('[data-read-block-id][data-source-kind="quote"]')
    .filter({ hasText: "仅打开可信来源的 .yeli.html 文件" });
  await readTarget.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  const readTop = await readTarget.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  await selectText(readTarget, "可信来源的 .yeli.html", "keyboard");

  const editable = page
    .locator('[data-block-kind="quote"] [contenteditable="true"]')
    .filter({ hasText: "仅打开可信来源的 .yeli.html 文件" });
  await expect(editable).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("可信来源的 .yeli.html");
  const editTop = await editable.evaluate(
    (element) => element.parentElement!.getBoundingClientRect().top,
  );
  expect(Math.abs(editTop - readTop)).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "更多" }).click();
  await expect(page.locator("#more-save-state-description")).toHaveText(
    "已保存",
  );
  await page.keyboard.press("Escape");
});

test("announces a block fallback for an ambiguous cross-block selection", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await selectAcrossBlocksAndEnterEdit(page);

  const editable = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .filter({ hasText: "用浏览器打开这份文件" });
  await expect(editable).toBeFocused();
  await expect(page.getByRole("status")).toContainText(
    "已打开所选文字所在的段落",
  );
  expect(
    await page.evaluate(() => window.getSelection()?.toString()),
  ).not.toContain("一份文件，随处续写。");
  await page.getByRole("button", { name: "更多" }).click();
  await expect(page.locator("#more-save-state-description")).toHaveText(
    "已保存",
  );
  await page.keyboard.press("Escape");
});

test("uses documented Edit focus targets for every supported Read block family", async ({
  page,
}) => {
  const source = `---
title: 交接测试
lang: zh-CN
---
# Heading target

Plain target

> Quote target

| Name | Value |
| --- | --- |
| Alpha | One |

- [ ] Task target

![Image target](yeli-demo:workspace-photo)

\`\`\`text
Code target
\`\`\`

<div>Source safe target</div>
`;
  await page.goto(pathToFileURL(artifactPath).href);
  const sourceBefore = await importImageFixture(page, source);

  const cases = [
    {
      focus: '[data-block-kind="heading"] [contenteditable="true"]',
      read: "Heading target",
      selection: "Heading target",
    },
    {
      focus: '[data-block-kind="quote"] [contenteditable="true"]',
      read: "Quote target",
      selection: "Quote target",
    },
    {
      focus: '[data-block-kind="table"] textarea',
      read: "Alpha",
      selection: "Alpha",
    },
    {
      focus: '[data-block-kind="task"] [contenteditable="true"]',
      read: "Task target",
      selection: "Task target",
    },
    {
      focus: '[data-block-kind="code-fence"] textarea',
      read: "Code target",
      selection: "Code target",
    },
    {
      focus: '[data-block-kind="raw-html"] button',
      read: "Source safe target",
      selection: "Source safe target",
    },
  ] as const;

  for (const item of cases) {
    const readBlock = page
      .locator("[data-read-block-id]")
      .filter({ hasText: item.read })
      .last();
    await readBlock.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await selectText(readBlock, item.selection);
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await expect(page.locator(item.focus).first()).toBeFocused();
    await page.getByRole("button", { name: "预览" }).click();
  }

  const image = page.locator("[data-read-block-id]:has(.document-image)");
  await image.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator(".image-selection-button")).toBeFocused();

  await expect(page.locator(".cm-editor")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("menuitem", { name: "导出 Markdown" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(readFileSync(downloadPath, "utf8")).toBe(sourceBefore);
});
