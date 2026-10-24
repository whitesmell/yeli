import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");

test.beforeAll(() => {
  expect(existsSync(artifactPath), "single-file artifact must be built").toBe(
    true,
  );
});

async function loadMarkdown(page: Page, source: string, heading: string) {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(source),
    mimeType: "text/markdown",
    name: "search-fixture.md",
  });
  await expect(
    page
      .locator(".markdown-document")
      .getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
}

async function openSearch(page: Page) {
  const edit = page.getByRole("button", { name: "编辑", exact: true });
  await edit.focus();
  await page.keyboard.press("Meta+f");
  const dialog = page.getByRole("dialog", { name: "在文档中查找" });
  await expect(dialog).toBeVisible();
  const query = dialog.getByRole("searchbox", { name: "查找" });
  await expect(query).toBeFocused();
  return { dialog, edit, query };
}

test("finds visible text across supported blocks in source order without mutating Read", async ({
  page,
}) => {
  const source = `---
title: Search map
---
# Needle heading

Needle paragraph

- Needle list
- [ ] Needle task

> Needle quote

| Name | Value |
| --- | --- |
| Needle cell | Other |

\`\`\`text
Needle code
\`\`\`
`;
  await loadMarkdown(page, source, "Needle heading");
  const { dialog, edit, query } = await openSearch(page);
  await query.fill("needle");
  await expect(dialog.getByText("第 1 项，共 7 项")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "替换当前项" })).toHaveCount(
    0,
  );

  const expectedKinds = [
    "heading",
    "paragraph",
    "list-item",
    "task",
    "quote",
    "table",
    "code-fence",
  ];
  for (let index = 0; index < expectedKinds.length; index += 1) {
    await expect(page.locator(".search-current-target")).toHaveAttribute(
      "data-source-kind",
      expectedKinds[index]!,
    );
    if (index < expectedKinds.length - 1) {
      await dialog.getByRole("button", { name: "下一个匹配项" }).click();
    }
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await edit.click();
  await page.getByRole("button", { name: "更多" }).click();
  await expect(page.locator("#more-save-state-description")).toHaveText(
    "已保存",
  );
});

test("preserves query and current target when a Read result enters Edit", async ({
  page,
}) => {
  const source = `---
title: Search handoff
---
# Search handoff

Needle first

Middle

Needle second
`;
  await loadMarkdown(page, source, "Search handoff");
  const { dialog, query } = await openSearch(page);
  await query.fill("needle");
  await dialog.getByRole("button", { name: "下一个匹配项" }).click();
  await expect(dialog.getByText("第 2 项，共 2 项")).toBeVisible();

  await dialog.getByRole("button", { name: "编辑此结果" }).click();
  await expect(query).toHaveValue("needle");
  await expect(dialog.getByText("第 2 项，共 2 项")).toBeVisible();
  await expect(
    page
      .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
      .filter({ hasText: "Needle second" }),
  ).toBeFocused();
  await expect(dialog.getByRole("textbox", { name: "替换为" })).toBeVisible();
});

test("replace-all changes only safe ranges as one undoable action", async ({
  page,
}) => {
  const source = `---
title: Replace safely
---
# Replace safely

Needle plain

**Needle** rich

Needle again
`;
  await loadMarkdown(page, source, "Replace safely");
  const { dialog, query } = await openSearch(page);
  await query.fill("needle");
  await expect(dialog.getByText("第 1 项，共 3 项")).toBeVisible();
  await dialog.getByRole("button", { name: "编辑此结果" }).click();

  await dialog.getByRole("textbox", { name: "替换为" }).fill("Found");
  await dialog.getByRole("button", { name: "全部替换（2）" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "已替换 2 处，可一次撤销。",
  );
  await expect(dialog.getByText("第 1 项，共 1 项")).toBeVisible();
  await dialog.getByRole("button", { name: "关闭文档搜索" }).click();

  await expect(page.getByText("Found plain", { exact: true })).toBeVisible();
  await expect(page.getByText("Needle", { exact: true })).toBeVisible();
  await expect(page.getByText("Found again", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "更多" }).focus();
  await page.keyboard.press("Meta+z");
  await expect(page.getByText("Needle plain", { exact: true })).toBeVisible();
  await expect(page.getByText("Needle again", { exact: true })).toBeVisible();
});

test("explains view-only rendered syntax and keeps outline filtering separate", async ({
  page,
}) => {
  const source = `---
title: Separate search
---
# Heading only

**Needle** rich paragraph
`;
  await loadMarkdown(page, source, "Heading only");
  const { dialog, query } = await openSearch(page);
  await query.fill("needle");
  await dialog.getByRole("button", { name: "编辑此结果" }).click();
  await expect(dialog.getByText("这处文字包含格式标记")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "替换当前项" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "关闭文档搜索" }).click();
  await page.getByRole("button", { name: "预览" }).click();
  await page.getByRole("button", { name: "目录" }).click();
  const outline = page.getByRole("complementary", { name: "文档大纲" });
  const headingFilter = outline.getByRole("textbox", {
    name: "筛选文档大纲",
  });
  await expect(headingFilter).toHaveAttribute("placeholder", "查找章节");
  await expect(outline.getByRole("textbox", { name: "搜索文档" })).toHaveCount(
    0,
  );
});

test("keeps cross-block and source-safe matches navigable but view-only", async ({
  page,
}) => {
  const source = `---
title: View-only search
---
# View-only search

Ends here

Starts there

<div>Needle unsafe</div>
`;
  await loadMarkdown(page, source, "View-only search");
  const { dialog, query } = await openSearch(page);
  await query.fill("here starts");
  await expect(dialog.getByText("第 1 项，共 1 项")).toBeVisible();
  await expect(query).toBeFocused();
  await dialog.getByRole("button", { name: "编辑此结果" }).click();
  await expect(
    dialog.getByText("这处文字跨越多个段落，请进入文档逐段修改。"),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "替换当前项" }),
  ).toBeDisabled();

  await query.fill("needle unsafe");
  await expect(dialog.getByText("第 1 项，共 1 项")).toBeVisible();
  await expect(
    dialog.getByText("请在这个区块的 Markdown 原文中修改。"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "编辑区块原文" }).click();
  const rawEditor = page.getByRole("textbox", {
    name: "这个区块的 Markdown 原文",
  });
  await expect(rawEditor).toBeVisible();
  await rawEditor.fill("<div>Needle changed safely</div>\n");
  await page.getByRole("button", { name: "应用更改" }).click();
  await expect(
    page.getByText("<div>Needle changed safely</div>"),
  ).toBeVisible();
});
