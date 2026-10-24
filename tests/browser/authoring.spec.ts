import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");
const syntheticGif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);

test.beforeAll(() => {
  expect(existsSync(artifactPath), "single-file artifact must be built").toBe(
    true,
  );
});

async function expectSaveState(
  page: import("@playwright/test").Page,
  label: string,
) {
  await page.getByRole("button", { name: "更多" }).click();
  await expect(page.locator("#more-save-state-description")).toHaveText(label);
  await page.keyboard.press("Escape");
}

async function documentShortcut(
  page: import("@playwright/test").Page,
  shortcut: "Meta+Shift+z" | "Meta+z",
) {
  await page.getByRole("button", { name: "更多" }).focus();
  await page.keyboard.press(shortcut);
}

test("defaults to Read and reveals the source-mapped canvas only in Edit", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);

  await expect(page.locator(".read-document")).toBeVisible();
  await expect(page.locator(".edit-document")).toHaveCount(0);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  await expect(page.locator(".edit-document")).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) > 1180) {
    await expect(
      page.getByRole("complementary", { name: "文档大纲" }),
    ).toBeVisible();
  } else {
    await expect(page.locator(".outline-panel")).toHaveCount(0);
  }
  await expect(page.locator(".inspector")).toHaveCount(0);
  await expect(page.locator(".cm-editor")).toHaveCount(0);
});

test("keeps document measure and structural density stable across Read and Edit", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);

  const readWidth = await page
    .locator(".read-document")
    .evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const editWidth = await page
    .locator(".edit-document")
    .evaluate((element) => element.getBoundingClientRect().width);

  expect(Math.abs(readWidth - editWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator(".block-blank").first()).toHaveCSS(
    "min-height",
    "8px",
  );

  const firstTable = page.locator(".table-shell table").first();
  await expect(firstTable).toBeVisible();
  const tableHeight = await firstTable.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(tableHeight).toBeLessThan(180);
  await expect(firstTable.locator("textarea").first()).toHaveAttribute(
    "rows",
    "1",
  );
});

test("keeps ordinary and heading-table blank lines stable while interacting", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const blanks = page.locator(".block-blank");
  const blankKinds = await blanks.evaluateAll((elements) =>
    elements.map((element, index) => ({
      index,
      structural:
        element.previousElementSibling?.classList.contains("block-heading") ===
          true &&
        element.nextElementSibling?.classList.contains(
          "structured-block-shell",
        ) === true,
    })),
  );
  const ordinaryIndex = blankKinds.find(({ structural }) => !structural)?.index;
  const structuralIndex = blankKinds.find(
    ({ structural }) => structural,
  )?.index;

  expect(
    ordinaryIndex,
    "fixture must contain an ordinary blank line",
  ).toBeDefined();
  expect(
    structuralIndex,
    "fixture must contain a heading/table blank line",
  ).toBeDefined();

  for (const index of [ordinaryIndex, structuralIndex]) {
    const blank = blanks.nth(index!);
    await blank.scrollIntoViewIfNeeded();
    const measure = () =>
      blank.evaluate((element) => {
        const surface = element.closest<HTMLElement>(".edit-surface");
        const rect = element.getBoundingClientRect();
        const nextTop = element.nextElementSibling?.getBoundingClientRect().top;
        return {
          height: rect.height,
          nextTop,
          scrollTop: surface?.scrollTop ?? 0,
        };
      });
    const expectStable = (
      before: Awaited<ReturnType<typeof measure>>,
      after: Awaited<ReturnType<typeof measure>>,
    ) => {
      expect(after.height).toBeCloseTo(before.height, 4);
      expect(after.nextTop).toBeCloseTo(before.nextTop!, 4);
      expect(after.scrollTop).toBeCloseTo(before.scrollTop, 4);
    };

    const before = await measure();
    const box = await blank.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    expectStable(before, await measure());

    await blank.locator(".block-content-editable").focus();
    expectStable(before, await measure());

    await expect(blank.locator(".block-menu-trigger")).toHaveCount(0);
    await expect(blank.locator(".block-insert-trigger")).toHaveCount(1);
    await blank.locator(".block-insert-trigger").click();
    await expect(blank.locator(".block-empty-menu")).toBeVisible();
    await expect(
      blank.locator('[data-command-id="insert.heading1"]'),
    ).toBeVisible();
    await expect(blank.locator('[data-command-id="block.delete"]')).toHaveCount(
      0,
    );
    expectStable(before, await measure());
    await page.keyboard.press("Escape");
  }

  await expectSaveState(page, "已保存");
});

test("commits one rendered paragraph and reflects it in Read", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const paragraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  await paragraph.click();
  await paragraph.press("End");
  await paragraph.type("这是一次直接的所见即所得修改。");
  await page.locator(".document-heading").click();

  await expectSaveState(page, "未保存");
  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.locator(".markdown-document")).toContainText(
    "这是一次直接的所见即所得修改。",
  );
});

test("normalizes rich paste through the production WYSIWYG surface", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const paragraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  await paragraph.click();
  await expect(paragraph).toBeFocused();
  const pasteReceipt = await paragraph.evaluate((editor) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const values = new Map([
      ["text/plain", "first\nsecond"],
      ["text/html", '<img src="https://example.test/x"><b>unsafe</b>'],
    ]);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: (type: string) => values.get(type) ?? "" },
    });
    editor.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented,
      plain: event.clipboardData?.getData("text/plain"),
    };
  });
  expect(pasteReceipt).toEqual({
    defaultPrevented: true,
    plain: "first\nsecond",
  });
  await expect(paragraph).toContainText("first");
  await paragraph.blur();

  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.locator(".markdown-document")).toContainText("first");
  await expect(page.locator(".markdown-document")).toContainText("second");
  await expect(
    page.locator('.markdown-document img[src="https://example.test/x"]'),
  ).toHaveCount(0);
});

test("metadata edits persist across the mapped metadata surfaces", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const title = page.locator(".document-title-input");
  await title.fill("YELI 便携知识文档");
  await title.blur();
  await expect(page.locator(".inspector")).toHaveCount(0);
  await page.getByLabel("添加标签").fill("Agent");
  await page.getByLabel("添加标签").press("Enter");
  await page.getByRole("button", { name: "移除标签 单文件" }).click();
  await page.getByLabel("作者").fill("YELI, Ada");
  await page.getByLabel("作者").blur();
  await page.getByLabel("语言").selectOption("en");

  await expect(page.locator(".inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "添加文档属性" }).click();
  const inspector = page.getByRole("complementary", { name: "属性面板" });
  await inspector.locator(".properties-disclosure > summary").click();
  await expect(inspector.getByLabel("作者", { exact: true })).toHaveValue(
    "YELI\nAda",
  );
  await expect(inspector.getByLabel("语言", { exact: true })).toHaveValue("en");
  await expect(inspector.getByLabel("添加标签")).toHaveCount(0);
  await inspector.getByLabel("摘要").fill("面向人和 Agent 的便携文档");
  await inspector.getByLabel("摘要").blur();
  await page.getByLabel("别名").fill("便携知识\nPortable Knowledge");
  await page.getByLabel("别名").blur();
  await inspector.getByRole("button", { name: "收起属性面板" }).click();
  await expect(title).toHaveValue("YELI 便携知识文档");
  await expect(page.getByText("Agent", { exact: true })).toBeVisible();
  await expect(page.getByLabel("作者")).toHaveValue("YELI, Ada");
  await expect(page.getByLabel("语言")).toHaveValue("en");
  await page.getByRole("button", { name: "添加文档属性" }).click();
  await inspector.locator(".properties-disclosure > summary").click();
  await expect(page.getByLabel("摘要")).toHaveValue(
    "面向人和 Agent 的便携文档",
  );
  await expect(page.getByLabel("别名")).toHaveValue(
    "便携知识\nPortable Knowledge",
  );
});

test("declarative templates insert plain Markdown", async ({ page }) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  if ((page.viewportSize()?.width ?? 0) <= 820) {
    await page.getByRole("button", { name: "更多" }).click();
  } else {
    await page.getByRole("button", { name: "插入", exact: true }).click();
  }
  await page
    .locator('[data-command-id="template.meeting-notes"]:visible')
    .click();
  await expect(
    page
      .locator('.block-heading > [contenteditable="true"]')
      .filter({ hasText: /^会议记录$/u }),
  ).toBeVisible();
  await expect(page.locator(".cm-editor")).toHaveCount(0);
});

test("selects table dimensions and edits rows and columns from the focused table", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const tables = page.locator('[data-block-kind="table"]');
  const initialCount = await tables.count();
  const compact = (page.viewportSize()?.width ?? 0) <= 820;
  if (compact) {
    const emptyBlock = page.locator('[data-block-kind="blank"]').first();
    await emptyBlock.locator(".block-insert-trigger").focus();
    await page.keyboard.press("Enter");
    await emptyBlock
      .getByRole("menuitem", { name: "表格", exact: true })
      .click();
  } else {
    await page.getByRole("button", { name: "插入", exact: true }).hover();
    await page.getByRole("menuitem", { name: "表格", exact: true }).click();
  }
  const picker = page.getByRole("group", { name: "选择表格大小" });
  await expect(picker).toBeVisible();
  await picker
    .getByRole("button", { name: "表格 · 4 行 × 3 列", exact: true })
    .click();

  await expect(tables).toHaveCount(initialCount + 1);
  const table = compact ? tables.first() : tables.last();
  await expect(table.locator("tr")).toHaveCount(4);
  await expect(table.locator("tr").first().locator("th")).toHaveCount(3);

  await table
    .locator('textarea[data-table-row="1"][data-table-column="1"]')
    .focus();
  const tools = page.getByRole("toolbar", { name: "表格结构工具" });
  await expect(tools).toBeVisible();
  await tools.getByRole("button", { name: "在下方插入行" }).click();
  await expect(table.locator("tr")).toHaveCount(5);

  await page
    .getByRole("toolbar", { name: "表格结构工具" })
    .getByRole("button", { name: "在右侧插入列" })
    .click();
  await expect(table.locator("tr").first().locator("th")).toHaveCount(4);

  await page
    .getByRole("toolbar", { name: "表格结构工具" })
    .getByRole("button", { name: "删除当前行" })
    .click();
  await expect(table.locator("tr")).toHaveCount(4);
  await page
    .getByRole("toolbar", { name: "表格结构工具" })
    .getByRole("button", { name: "删除当前列" })
    .click();
  await expect(table.locator("tr").first().locator("th")).toHaveCount(3);

  await page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first()
    .focus();
  await expect(tools).toBeHidden();
});

test("routes top, line-side, and block actions through scoped commands", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const firstParagraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  await firstParagraph.click();
  const activeBlock = firstParagraph.locator("..");
  await activeBlock.getByRole("button", { name: /区块菜单/u }).click();
  await activeBlock
    .getByRole("menuitem", { name: "在下方插入", exact: true })
    .hover();
  await activeBlock
    .getByRole("menuitem", { name: "段落", exact: true })
    .click();

  const blockTexts = await page
    .locator(".block-canvas > [data-source-block-id]")
    .allTextContents();
  const insertedIndex = blockTexts.findIndex((text) => text.includes("新段落"));
  expect(insertedIndex).toBeGreaterThan(
    blockTexts.findIndex((text) => text.includes("页里 · 单文件")),
  );
  expect(insertedIndex).toBeLessThan(
    blockTexts.findIndex((text) => text.includes("一份文件，随处续写。")),
  );

  const inserted = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .filter({ hasText: "新段落" });
  await inserted.click();
  await inserted
    .locator("..")
    .getByRole("button", { name: /区块菜单/u })
    .click();
  await page.getByRole("menuitem", { name: "转换为小节标题" }).click();
  const convertedBlock = page.locator('[data-block-kind="heading"]').filter({
    hasText: "新段落",
  });
  await expect(convertedBlock).toBeVisible();
  await convertedBlock.locator('[contenteditable="true"]').click();
  await convertedBlock.getByRole("button", { name: /区块菜单/u }).click();
  const unavailableConversion = page.getByRole("menuitem", {
    name: "转换为小节标题",
  });
  await expect(unavailableConversion).toHaveAttribute("aria-disabled", "true");
  await expect(unavailableConversion).toHaveAttribute("aria-current", "true");
  await unavailableConversion.focus();
  await page.keyboard.press("Enter");
  await expect(convertedBlock).toBeVisible();
  await expectSaveState(page, "未保存");
});

test("splits list items, deletes blank blocks, and converts a cross-block selection", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const secondItem = page
    .locator('.block-list-item [contenteditable="true"]')
    .filter({ hasText: "直接选择一个段落" });
  await secondItem.evaluate((editable) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    (editable as HTMLElement).focus();
  });
  const listCountBeforeSplit = await page.locator(".block-list-item").count();
  await secondItem.press("Enter");
  await page.keyboard.type("新增列表项");
  await expect(page.locator(".block-list-item")).toHaveCount(
    listCountBeforeSplit + 1,
  );
  await expect(
    page
      .locator('.block-list-item [contenteditable="true"]')
      .filter({ hasText: "新增列表项" }),
  ).toBeFocused();

  const selectedItems = page
    .locator(".block-list-item")
    .filter({ has: page.locator('[contenteditable="true"]') })
    .filter({ hasText: /直接选择一个段落|新增列表项/u });
  await expect(selectedItems).toHaveCount(2);
  const firstSelectedEditable = selectedItems
    .first()
    .locator('[contenteditable="true"]');
  const lastSelectedEditable = selectedItems
    .last()
    .locator('[contenteditable="true"]');
  await lastSelectedEditable.scrollIntoViewIfNeeded();
  const start = await firstSelectedEditable.evaluate((editable) => {
    const text = editable.firstChild;
    if (!(text instanceof Text)) throw new Error("Missing first list text");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + rect.height / 2 };
  });
  const end = await lastSelectedEditable.evaluate((editable) => {
    const text = editable.lastChild;
    if (!(text instanceof Text)) throw new Error("Missing last list text");
    const range = document.createRange();
    range.setStart(text, Math.max(0, text.length - 1));
    range.setEnd(text, text.length);
    const rect = range.getBoundingClientRect();
    return { x: rect.right - 1, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.mouse.up();
  const multiToolbar = page.locator(".multi-block-toolbar");
  await expect(multiToolbar).toBeVisible();
  await multiToolbar.getByRole("button", { name: /区块类型/u }).click();
  await multiToolbar.getByRole("menuitem", { name: "转换为无序列表" }).click();
  await expect(selectedItems.locator(".list-marker")).toHaveText(["-", "-"]);

  const blanks = page.locator('.block-blank [contenteditable="true"]');
  const blankCountBeforeDelete = await blanks.count();
  const blank = blanks.first();
  await blank.focus();
  await blank.press("Backspace");
  await expect(
    page.locator('.block-blank [contenteditable="true"]'),
  ).toHaveCount(blankCountBeforeDelete - 1);
});

test("opens slash commands without consuming a dismissed literal slash", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const emptyBlock = page
    .locator('[data-block-kind="blank"] [contenteditable="true"]')
    .first();
  await emptyBlock.click();
  await expect(emptyBlock).toBeFocused();
  await page.keyboard.type("/");
  await expect(emptyBlock).toHaveText("/");
  const slashMenu = page.locator('.slash-command-menu:visible[role="listbox"]');
  await expect(slashMenu).toBeVisible();
  await emptyBlock.press("Escape");
  await expect(slashMenu).toHaveCount(0);
  await expect(
    page
      .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
      .filter({ hasText: /^\/$/u }),
  ).toBeVisible();

  await documentShortcut(page, "Meta+z");
  const restoredEmptyBlock = page
    .locator('[data-block-kind="blank"] [contenteditable="true"]')
    .first();
  await restoredEmptyBlock.click();
  await expect(restoredEmptyBlock).toBeFocused();
  await restoredEmptyBlock.evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    element.textContent = "/待办";
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "待办",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
  });
  await expect(slashMenu).toHaveCount(0);
  await restoredEmptyBlock.evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "待办",
      }),
    );
  });
  await expect(slashMenu.getByRole("option")).toHaveCount(1);
  await slashMenu.getByRole("option", { name: "待办事项" }).click();
  await expect(
    page
      .locator('.block-task [contenteditable="true"]')
      .filter({ hasText: "新任务" }),
  ).toBeVisible();
});

test("filters slash commands and selects the active result from the keyboard", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const emptyBlock = page
    .locator('[data-block-kind="blank"] [contenteditable="true"]')
    .first();
  await emptyBlock.click();
  await page.keyboard.type("/h");

  const slashMenu = page.locator('.slash-command-menu:visible[role="listbox"]');
  await expect(slashMenu).toBeVisible();
  await expect(emptyBlock).toHaveText("/h");
  await expect(slashMenu.locator(".slash-command-query")).toHaveCount(0);
  await expect(slashMenu.locator('[data-slash-group="basic"]')).toBeVisible();
  await expect(
    slashMenu.locator('[data-slash-group="templates"]'),
  ).toBeHidden();
  await expect(slashMenu.getByRole("option")).toHaveCount(6);
  await expect(slashMenu.getByRole("status")).toHaveCount(0);
  await expect(
    slashMenu.getByRole("option", { name: "一级标题" }),
  ).toHaveAttribute("aria-selected", "true");

  await emptyBlock.press("ArrowDown");
  await expect(
    slashMenu.getByRole("option", { name: "小节标题" }),
  ).toHaveAttribute("aria-selected", "true");
  await emptyBlock.press("Enter");
  await expect(slashMenu).toHaveCount(0);
  await expect(
    page
      .locator('[data-block-kind="heading"] [contenteditable="true"]')
      .filter({ hasText: "新章节" }),
  ).toBeVisible();

  const nextEmptyBlock = page
    .locator('[data-block-kind="blank"] [contenteditable="true"]')
    .first();
  await nextEmptyBlock.click();
  await page.keyboard.type("/not-a-command");
  await expect(slashMenu.getByRole("status")).toHaveText("没有匹配的命令。");
  await expect(slashMenu.getByRole("option")).toHaveCount(0);
});

test("shows searchable shortcuts and Markdown syntax in the right rail", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  const edit = page.getByRole("button", { name: "编辑", exact: true });
  await edit.focus();
  await page.keyboard.press("Meta+/");

  const guide = page.getByRole("complementary", {
    name: "快捷键与 Markdown 指南",
  });
  const search = guide.getByRole("searchbox", { name: "搜索指南" });
  await expect(guide).toBeVisible();
  await expect(page.locator(".workspace-body > .efficiency-guide")).toHaveCount(
    1,
  );
  await expect(search).toBeFocused();
  await page.keyboard.press("Meta+/");
  await expect(guide).toHaveCount(0);
  await expect(edit).toBeFocused();

  await page.keyboard.press("Meta+/");
  await expect(guide).toBeVisible();
  await expect(search).toBeFocused();
  const shortcuts = guide.locator(".efficiency-command-list");
  await expect(shortcuts).toContainText("目录");
  await expect(shortcuts).toContainText("⇧⌘/Ctrl O");
  await expect(shortcuts).not.toContainText("段落");
  await expect(shortcuts).not.toContainText("小节标题");
  await search.fill("目录");
  await expect(shortcuts.getByText("目录", { exact: true })).toBeVisible();
  await search.fill("表格");
  await expect(guide.getByText("Markdown 语法", { exact: true })).toBeVisible();
  await expect(
    guide.getByText("用 | 分隔各列，在表头下面加一行短横线。", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(edit).toBeFocused();

  await edit.click();
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("menuitem", { name: "快捷键", exact: true }).click();
  await expect(guide).toBeVisible();
  await expect(guide.getByText("编辑", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "更多" })).toBeFocused();
});

test("shows formatting controls only for a real selection and supports inline-code shortcut", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.5";
  });
  const paragraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  await paragraph.click();
  await expect(page.locator(".inline-toolbar")).toHaveCount(0);

  await paragraph.evaluate((element) => {
    const text = element.firstChild;
    if (!text) throw new Error("Expected paragraph text");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(2, text.textContent?.length ?? 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  const toolbar = page.getByRole("toolbar", { name: "文本格式" });
  await expect(toolbar).toBeVisible();
  const toolbarBox = await toolbar.boundingBox();
  const viewport = page.viewportSize();
  expect(toolbarBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(
    (toolbarBox?.x ?? 0) + (toolbarBox?.width ?? Infinity),
  ).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  await expect(toolbar.getByRole("button", { name: "行内代码" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "清除格式" })).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: /区块类型/u }),
  ).toBeVisible();
  await expect(toolbar.locator(".inline-toolbar-group")).toHaveCount(4);
  const selectedBlock = paragraph.locator("xpath=..");
  await expect(selectedBlock.locator(".block-menu-trigger")).toHaveCount(1);
  await expect(selectedBlock.locator(".block-insert-trigger")).toHaveCount(0);
  expect(
    await paragraph.evaluate(() => window.getSelection()?.toString()),
  ).toBe("页里");

  const neighboringParagraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .nth(1);
  const neighboringBlock = neighboringParagraph.locator("xpath=..");
  await neighboringBlock.hover();
  await expect(toolbar).toBeVisible();
  await expect
    .poll(() =>
      selectedBlock
        .locator(":scope > .block-gutter")
        .evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  await expect
    .poll(() =>
      neighboringBlock
        .locator(":scope > .block-gutter")
        .evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("0");
  await expect
    .poll(() =>
      neighboringBlock.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgba(0, 0, 0, 0)");

  await toolbar.getByRole("button", { name: /区块类型/u }).click();
  const blockTypeMenu = page.getByRole("menu", { name: "区块类型" });
  await expect(blockTypeMenu).toBeVisible();
  await expect(
    blockTypeMenu.getByRole("menuitem", { name: "段落" }),
  ).toBeVisible();
  await expect(
    blockTypeMenu.getByRole("menuitem", { name: "无序列表" }),
  ).toBeVisible();
  await toolbar.getByRole("button", { name: /区块类型/u }).click();
  await expect(blockTypeMenu).toHaveCount(0);

  await page.keyboard.press("Meta+Shift+c");
  await expect
    .poll(() => paragraph.evaluate((element) => element.innerHTML))
    .toContain("<code>");
  await expect(paragraph).toBeFocused();
  await paragraph.blur();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1";
  });
  await expect(paragraph.locator("code")).toBeVisible();
});

test("selects an image, links the object inspector, and embeds a replacement", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "属性面板" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /选择图片.*图片区块示例/u }).click();

  const inspector = page.getByRole("complementary", { name: "属性面板" });
  await expect(
    inspector.locator(".inspector-context-heading strong"),
  ).toHaveText("图片");
  await expect(inspector.getByRole("tablist")).toHaveCount(0);
  await expect(
    inspector.getByRole("button", { name: "详细信息" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    inspector.getByText("yeli-demo:workspace-photo", { exact: true }),
  ).toHaveCount(0);
  await inspector.getByRole("button", { name: "详细信息" }).click();
  await expect(
    inspector.getByText("yeli-demo:workspace-photo", { exact: true }),
  ).toBeVisible();

  const title = inspector.getByLabel("图片标题");
  await expect(title).toHaveValue("");
  await title.fill("晨间写作");
  await title.blur();

  const alt = inspector.getByLabel("替代文本");
  await expect(alt).toHaveValue("图片区块示例");
  await alt.fill("合成图片");
  await alt.blur();

  await inspector.getByLabel("替换图片").setInputFiles({
    buffer: syntheticGif,
    mimeType: "image/gif",
    name: "synthetic.gif",
  });
  await expect(page.locator(".document-figure img")).toHaveAttribute(
    "src",
    /^data:image\/gif;base64,/u,
  );
  const embeddedSource = await page
    .locator(".document-figure img")
    .getAttribute("src");
  if ((page.viewportSize()?.width ?? 0) > 1180) {
    await page
      .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
      .first()
      .click();
  } else {
    await inspector.getByRole("button", { name: "收起属性面板" }).click();
    await page
      .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
      .first()
      .click();
  }
  await expect(inspector).toHaveCount(0);
  await documentShortcut(page, "Meta+z");
  await expect(page.locator(".document-figure img")).toHaveCount(0);
  await documentShortcut(page, "Meta+Shift+z");
  await expect(page.locator(".document-figure img")).toHaveAttribute(
    "src",
    embeddedSource ?? "",
  );
});

test("duplicates a selected image through one source-bounded action", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: /选择图片.*图片区块示例/u }).click();

  const inspector = page.getByRole("complementary", { name: "属性面板" });
  await inspector.getByRole("button", { name: "复制图片" }).click();

  await expect(page.locator(".document-figure img")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /选择图片.*图片区块示例/u }),
  ).toHaveCount(2);
  await expect(inspector).toHaveCount(0);
  await page.getByRole("button", { name: "更多" }).click();
  await expect(page.locator("#more-save-state-description")).toHaveText(
    "未保存",
  );
});

test("double-clicking an editable image previews it without changing the document", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const imageButton = page.getByRole("button", {
    name: /选择图片.*图片区块示例/u,
  });
  await imageButton.click();
  const inspector = page.getByRole("complementary", { name: "属性面板" });
  await inspector.getByLabel("替换图片").setInputFiles({
    buffer: syntheticGif,
    mimeType: "image/gif",
    name: "synthetic.gif",
  });
  const image = page.locator(".image-selection-button").first();
  const source = await image.locator("img").getAttribute("src");
  // The narrow-screen inspector overlays the image's center.
  await image.dblclick({ position: { x: 8, y: 8 } });
  const preview = page.getByRole("dialog", { name: "图片放大预览" });
  await expect(preview).toBeVisible();
  await expect(preview.locator("img")).toHaveAttribute("src", source ?? "");
  await preview.getByRole("button", { name: "关闭" }).click();
  await expect(image).toBeFocused();
  await page.getByRole("button", { name: "更多" }).click();
  await expect(page.locator("#more-save-state-description")).toHaveText(
    "未保存",
  );
});

test("keeps the active editor calm without a clipped blue rectangle", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const paragraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  await paragraph.click();

  expect(
    await paragraph.evaluate((element) => {
      const style = getComputedStyle(element);
      const blockStyle = getComputedStyle(element.parentElement!);
      return {
        blockShadow: blockStyle.boxShadow,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    }),
  ).toMatchObject({
    blockShadow: expect.stringMatching(
      /rgba?\(248, 249, 252(?:, [\d.]+)?\) 0px 0px 0px [\d.]+px/u,
    ),
    outlineStyle: "none",
    outlineWidth: "0px",
  });
});

test("supports document undo, redo, and save shortcuts", async ({ page }) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const paragraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const target = element.querySelector("p, div") ?? element;
    const text = [...target.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE,
    ) as Text | undefined;
    if (!text) throw new Error("Expected paragraph text node");
    const range = document.createRange();
    range.setStart(text, text.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.keyboard.type(" 快捷键事务");
  await paragraph.evaluate((element) => element.blur());
  await expect(paragraph).toContainText("快捷键事务");

  await page.keyboard.press("Meta+z");
  await expect(paragraph).not.toContainText("快捷键事务");
  await page.keyboard.press("Meta+Shift+z");
  await expect(paragraph).toContainText("快捷键事务");

  const download = page.waitForEvent("download");
  await page.keyboard.press("Meta+s");
  expect((await download).suggestedFilename()).toMatch(/\.yeli\.html$/u);
});
