import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { parseYeliArtifact } from "../../src/format/parse.ts";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");

test.beforeAll(() => {
  expect(existsSync(artifactPath), "single-file artifact must be built").toBe(
    true,
  );
});

test("boots the immersive document offline without remote requests", async ({
  browserName,
  context,
  page,
}) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) remoteRequests.push(request.url());
  });

  if (browserName === "webkit") {
    await context.route(/^https?:/u, async (route) => route.abort());
  } else {
    await context.setOffline(true);
  }
  await page.goto(pathToFileURL(artifactPath).href);

  await expect(page.getByRole("button", { name: "展开目录" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "让知识成为可以携带的文件" }),
  ).toBeVisible();
  await expect(page.getByText("离线编辑", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cm-editor")).toHaveCount(0);
  expect(remoteRequests).toEqual([]);
});

test("keeps Advanced View out of the default release", async ({ page }) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator(".edit-document")).toBeVisible();
  await expect(page.locator(".cm-editor")).toHaveCount(0);

  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await expect(page.getByRole("menuitem", { name: "高级视图" })).toHaveCount(0);
  await expect(page.locator('[data-command-id="view.advanced"]')).toHaveCount(
    0,
  );
});

test("groups the brand and document title without a persistent version badge", async ({
  isMobile,
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  const toggle = page.getByRole("button", { name: "目录" });
  await expect(page.locator(".topbar-leading > *")).toHaveCount(2);
  await expect(page.locator(".topbar-document-name")).toHaveText(
    "让知识成为可以携带的文件",
  );
  await expect(page.locator(".yeli-logo")).toBeVisible();
  await expect(page.locator(".topbar-brand")).toHaveRole("button");
  await expect(page.locator(".topbar-brand button")).toHaveCount(0);
  await expect(page.locator(".topbar-version")).toHaveCount(0);

  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveAttribute("aria-label", "Yeli · 展开目录");
  await expect(toggle).toHaveCSS("color", "rgb(9, 19, 54)");
  await expect(toggle.locator("svg")).toHaveCount(1);
  const monogram = toggle.locator("[data-yeli-monogram]");
  const wordmark = toggle.locator("[data-yeli-wordmark]");
  const wordmarkBefore = await wordmark.innerHTML();
  await expect(monogram).not.toHaveAttribute("transform");
  await expect(monogram.locator("path")).toHaveCount(2);
  await expect(monogram.locator("[data-yeli-accent]")).toHaveCSS(
    "fill",
    "rgb(255, 91, 69)",
  );
  await expect(wordmark.locator("circle")).toHaveAttribute("r", "3.004");
  await expect(wordmark.locator("circle")).toHaveCSS(
    "fill",
    "rgb(255, 91, 69)",
  );
  const controlBefore = (await toggle.boundingBox())!;
  const compact = page.viewportSize()!.width <= 420;
  expect(controlBefore.width).toBeGreaterThanOrEqual(compact ? 90 : 98);
  await expect(toggle).toHaveCSS("height", "36px");
  if (compact) {
    const logoWidth = await toggle
      .locator(".yeli-logo")
      .evaluate((logo) => Number.parseFloat(getComputedStyle(logo).width));
    expect(Math.abs(logoWidth - 82.92)).toBeLessThanOrEqual(0.1);
  } else {
    await expect(toggle.locator(".yeli-logo")).toHaveCSS("width", "98px");
  }
  await expect(toggle.locator(".yeli-logo")).toHaveCSS(
    "height",
    compact ? "22px" : "26px",
  );
  expect(
    await page.locator(".topbar-leading").evaluate((leading) => {
      const brand = leading.querySelector(".topbar-brand");
      return (
        brand?.classList.contains("rail-toggle") &&
        brand?.querySelectorAll("svg").length === 1 &&
        brand?.nextElementSibling?.classList.contains("topbar-document-name")
      );
    }),
  ).toBe(true);
  const markBounds = await toggle.boundingBox();
  const titleBounds = await page.locator(".topbar-document-name").boundingBox();
  expect(markBounds).not.toBeNull();
  expect(titleBounds).not.toBeNull();
  expect(markBounds!.x + markBounds!.width).toBeLessThanOrEqual(titleBounds!.x);

  await wordmark.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAttribute("aria-label", "Yeli · 收起目录");
  await expect(toggle).toHaveCSS("color", "rgb(9, 19, 54)");
  await expect(toggle.locator("svg")).toHaveCount(1);
  await expect(monogram).toHaveAttribute(
    "transform",
    "translate(29 0) scale(-1 1)",
  );
  expect(await wordmark.innerHTML()).toBe(wordmarkBefore);
  expect((await toggle.boundingBox())!.width).toBeCloseTo(controlBefore.width);
  await monogram.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(monogram).not.toHaveAttribute("transform");
  await monogram.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator(".edit-document")).toBeVisible();
  await expect(page.locator(".topbar-leading > *")).toHaveCount(2);
  expect(
    await page.locator(".topbar-leading").evaluate((leading) => {
      const brand = leading.querySelector(".topbar-brand");
      const title = leading.querySelector(".topbar-document-name");
      return brand?.nextElementSibling === title;
    }),
  ).toBe(true);

  const outline = page.getByRole("complementary", { name: "文档大纲" });
  if (isMobile) {
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
  }
  await expect(outline).toBeVisible();
  await expect(page.getByRole("dialog", { name: "关于 页里" })).toHaveCount(0);
  await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(outline).toHaveCount(0);
  await expect(monogram).not.toHaveAttribute("transform");
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(outline).toBeVisible();
  await page.keyboard.press("Control+Shift+o");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(outline).toHaveCount(0);
});

test("opens About from More and returns focus to More", async ({ page }) => {
  await page.goto(pathToFileURL(artifactPath).href);
  const more = page.getByRole("button", {
    name: /^(?:更多|菜单)$/u,
    exact: true,
  });
  await more.click();
  await page.getByRole("menuitem", { name: "关于 页里", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "关于 页里" });
  await expect(
    dialog.getByRole("heading", { name: "页里 Yeli", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("版本 0.1.0");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
});

test("edits the toolbar title with narrow source changes, cancel and undo", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  const source =
    '---\ntitle: Original title\nlang: zh-CN\ncustom: "keep: this" # untouched\n---\n\n# Body heading\n\nKeep  deliberate spacing.\n';
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(source),
    mimeType: "text/markdown",
    name: "original-file.md",
  });
  const exportSource = async () => {
    await page
      .getByRole("button", { name: /^(?:更多|菜单)$/u, exact: true })
      .click();
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("menuitem", { name: "导出 Markdown", exact: true })
      .click();
    const downloadPath = await (await downloaded).path();
    return readFileSync(downloadPath, "utf8");
  };
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const input = page.getByRole("textbox", {
    name: "顶栏文档标题",
    exact: true,
  });
  await input.focus();
  await input.blur();
  expect(await exportSource()).toBe(source);

  await input.fill("Canceled title");
  await input.press("Escape");
  await expect(input).toHaveValue("Original title");
  await expect(input).toBeFocused();
  await input.fill("");
  await input.blur();
  await expect(input).toHaveValue("Original title");
  expect(await exportSource()).toBe(source);

  await input.fill("Renamed title");
  await input.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        isComposing: true,
      }),
    ),
  );
  await expect(input).toBeFocused();
  await expect(page.locator(".document-title-input")).toHaveValue(
    "Original title",
  );
  await input.press("Enter");
  await expect(input).toHaveValue("Renamed title");
  await expect(input).toBeFocused();
  await expect(page.locator(".document-title-input")).toHaveValue(
    "Renamed title",
  );
  await expect(page).toHaveTitle("Renamed title · Yeli");
  expect(await exportSource()).toBe(
    source.replace("title: Original title", "title: Renamed title"),
  );

  await page
    .getByRole("button", { name: /^(?:更多|菜单)$/u, exact: true })
    .focus();
  await page.keyboard.press("Control+z");
  await expect(input).toHaveValue("Original title");
  expect(await exportSource()).toBe(source);

  await input.fill("Saved title");
  const saved = page.waitForEvent("download");
  await input.press("Control+s");
  const savedPath = await (await saved).path();
  const artifact = await parseYeliArtifact(readFileSync(savedPath, "utf8"));
  expect(artifact.ok).toBe(true);
  if (!artifact.ok) throw new Error("Saved title artifact did not parse");
  expect(artifact.markdown).toBe(
    source.replace("title: Original title", "title: Saved title"),
  );
});

test("switches one page-width preference across Read and Edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto(pathToFileURL(artifactPath).href);

  const documentWidth = () =>
    page
      .locator(".read-document, .edit-document")
      .evaluate((element) => element.getBoundingClientRect().width);
  expect(await documentWidth()).toBe(690);

  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  const widthTrigger = page.getByRole("menuitem", { name: /页面宽度/u });
  await widthTrigger.hover();
  const widthMenu = page.getByRole("menu", { name: "页面宽度" });
  await expect(widthMenu.getByRole("menuitemradio")).toHaveCount(3);
  await expect(widthMenu).toHaveCSS("position", "fixed");
  expect(
    await widthMenu.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const target = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return target !== null && element.contains(target);
    }),
  ).toBe(true);
  await expect(
    widthMenu.getByRole("menuitemradio", { name: "默认" }),
  ).toHaveAttribute("aria-checked", "true");

  await widthMenu.getByRole("menuitemradio", { name: "宽屏" }).click();
  await expect(page.locator(".workspace-shell")).toHaveClass(/is-width-wide/u);
  expect(await documentWidth()).toBe(960);

  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: "目录" }).click();
  expect(await documentWidth()).toBe(960);
  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await expect(page.locator("#more-save-state-description")).toHaveText(
    "已保存",
  );

  await page.getByRole("menuitem", { name: /页面宽度/u }).hover();
  await page
    .getByRole("menu", { name: "页面宽度" })
    .getByRole("menuitemradio", { name: "全宽" })
    .click();
  await expect(page.locator(".workspace-shell")).toHaveClass(/is-width-full/u);
  expect(await documentWidth()).toBe(1216);

  await page.keyboard.press("Control+\\");
  await expect(page.locator(".workspace-shell")).toHaveClass(
    /is-width-default/u,
  );
  expect(await documentWidth()).toBe(690);
  await expect(page.locator(".toast")).toContainText("页面宽度：默认");
});

test("persists the reading font size separately from page width", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await page.getByRole("menuitem", { name: "字体大小", exact: true }).hover();

  const fontSizeMenu = page.getByRole("menu", { name: "字体大小" });
  await expect(fontSizeMenu.getByRole("menuitemradio")).toHaveCount(3);
  await expect(
    fontSizeMenu.getByRole("menuitemradio", { name: "标准" }),
  ).toHaveAttribute("aria-checked", "true");

  await fontSizeMenu.getByRole("menuitemradio", { name: "大" }).click();
  await expect(page.locator(".workspace-shell")).toHaveClass(/is-font-large/u);

  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator(".workspace-shell")).toHaveClass(/is-font-large/u);
  await page.reload();
  await expect(page.locator(".workspace-shell")).toHaveClass(/is-font-large/u);
});

test("cycles the reading font size with its view shortcut", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Meta+Shift+\\");
  await expect(page.locator(".workspace-shell")).toHaveClass(/is-font-large/u);
  await expect(page.locator(".toast")).toContainText("字体大小：大");

  await page.keyboard.press("Control+Shift+\\");
  await expect(page.locator(".workspace-shell")).toHaveClass(/is-font-small/u);
  await expect(page.locator(".toast")).toContainText("字体大小：小");
});

test("presents slides in and out of native fullscreen", async ({
  isMobile,
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await page.getByRole("menuitem", { name: "演示", exact: true }).click();

  const presentation = page.getByRole("dialog", { name: "演示文稿" });
  await expect(presentation).toBeVisible();
  await presentation.getByRole("button", { name: "进入全屏" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement !== null))
    .toBe(true);
  await expect(page.locator(".presentation-backdrop")).toHaveClass(
    /is-fullscreen/u,
  );
  const presentationActions = presentation.locator(".presentation-actions");
  const fullscreenControl = presentationActions.getByRole("button", {
    name: "退出全屏",
  });
  await fullscreenControl.blur();
  if (!isMobile) {
    await presentation.locator(".presentation-page").hover();
    await expect(presentationActions).toHaveCSS("opacity", "0");
    await presentation.locator("header").hover();
  }
  await expect(presentationActions).toHaveCSS("opacity", "1");

  await presentation.press("Escape");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await expect(presentation).toBeVisible();

  await presentation.getByRole("button", { name: "进入全屏" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement !== null))
    .toBe(true);
  await presentation.locator("header").hover();
  await presentation.getByRole("button", { name: "退出全屏" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await presentation.getByRole("button", { name: "关闭演示" }).click();
  await expect(presentation).toHaveCount(0);
});

test("keeps history in Edit and flattens file actions into a prioritized More menu", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "阅读" })).toHaveCount(0);
  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await expect(page.getByRole("menuitem", { name: "历史版本" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "编辑", exact: true }).click();

  await expect(page.getByRole("button", { name: "阅读" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".topbar-action-cluster").getByRole("button", {
      name: "历史版本",
    }),
  ).toHaveCount(0);
  await expect(
    page.locator(".workspace-topbar > .topbar-actions").getByRole("button", {
      name: "文件",
      exact: true,
    }),
  ).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) > 1180) {
    await expect(page.getByRole("toolbar", { name: "编辑工具" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "插入", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "模板" })).toHaveCount(0);
    await page.getByRole("button", { name: "插入", exact: true }).hover();
    await expect(page.getByRole("menu", { name: "插入" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /插入会议记录/u }),
    ).toBeVisible();
    const insertIcons = await page
      .locator('.insert-popover [data-command-id^="insert."] svg')
      .evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
    expect(insertIcons).toHaveLength(9);
    expect(new Set(insertIcons).size).toBeGreaterThanOrEqual(8);
    await page.keyboard.press("Escape");
  } else {
    await expect(page.locator(".topbar-tools")).toBeHidden();
  }

  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await expect(
    page.getByRole("menuitem", { name: "打开文件", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "下载更新副本", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "保存副本", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "文件", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("menu", { name: "文件" })).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "导出 Markdown" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "导出只读 HTML" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "打印 / 存为 PDF" }),
  ).toBeVisible();

  const menuActions = await page
    .locator(".more-popover [data-menu-action]:visible")
    .evaluateAll((actions) =>
      actions.map((action) => action.getAttribute("data-menu-action")),
    );
  expect(menuActions).toEqual([
    "open",
    "save",
    "save-copy",
    "history",
    "export-markdown",
    "export-html",
    "print",
    "font-size",
    "page-width",
    "focus",
    "presentation",
    "language",
    "shortcuts",
    "about",
  ]);
  await expect(page.locator(".more-menu-section-label")).toHaveText([
    "文件",
    "导出",
    "视图",
    "设置与帮助",
  ]);
  await expect(
    page.getByRole("menuitem", { name: "页面宽度", exact: true }),
  ).toHaveAttribute("aria-keyshortcuts", "Meta+\\ Control+\\");
  await expect(
    page
      .getByRole("menuitem", { name: "页面宽度", exact: true })
      .locator("kbd"),
  ).toHaveText("⌘/Ctrl \\");
  await expect(
    page.getByRole("menuitem", { name: "演示", exact: true }),
  ).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+Shift+Enter Control+Shift+Enter",
  );
  await expect(
    page.getByRole("menuitem", { name: "演示", exact: true }).locator("kbd"),
  ).toHaveText("⇧⌘/Ctrl Enter");
  const exportIcons = await page
    .locator(
      '[data-menu-action="export-markdown"] svg, [data-menu-action="export-html"] svg, [data-menu-action="print"] svg',
    )
    .evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
  expect(new Set(exportIcons).size).toBe(3);
  await expect(page.locator(".more-file-disclosure")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".topbar-action-cluster")).toBeVisible();
  await expect(page.locator('.outline-panel:has-text("历史")')).toHaveCount(0);

  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await page.getByRole("menuitem", { name: "历史版本" }).click();
  const history = page.getByRole("complementary", { name: "历史版本" });
  await expect(history).toContainText(
    "历史版本保存在当前浏览器中，不随文件分享。",
  );
  const review = history.getByRole("button", { name: "查看版本" });
  await expect(review).toHaveCount(1);
  await review.click();
  await expect(history.locator(".history-change-summary")).toBeVisible();
  await expect(history.locator(".history-source-preview")).toBeVisible();
  await expect(history.locator(".history-hunk")).toHaveCount(0);
  await expect(history.getByRole("button", { name: "比较更改" })).toHaveCount(
    0,
  );

  await history.getByRole("button", { name: "关闭" }).click();
  await expect(
    page.getByRole("button", { name: /^(?:更多|菜单)$/u }),
  ).toBeFocused();
  await page.getByRole("button", { name: "阅读" }).click();
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "阅读" })).toHaveCount(0);
});

test("keeps inline block controls visible until their menu is dismissed", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const editable = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  const block = editable.locator("..");
  await block.hover();
  await expect(block).toHaveCSS("background-color", "rgb(248, 249, 252)");
  await editable.click();
  const toolbar = block.getByRole("toolbar", { name: "区块菜单" });
  const trigger = toolbar.getByRole("button", { name: /区块菜单 · 段落/u });
  await trigger.hover();
  await expect(block).toHaveClass(/has-block-menu/u);
  const menu = block.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "在下方插入", exact: true }),
  ).toBeVisible();
  await expect(menu.getByRole("group", { name: "区块类型" })).toBeVisible();
  await expect(menu.getByRole("group", { name: "区块操作" })).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "转换为段落" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    menu.getByRole("menuitem", { name: "创建区块副本" }),
  ).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "删除区块" })).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox?.width).toBeGreaterThanOrEqual(300);
  expect(menuBox?.y).toBeGreaterThanOrEqual(64);
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? Infinity)).toBeLessThanOrEqual(
    (page.viewportSize()?.height ?? 0) - 11,
  );
  await expect(block.locator(".block-gutter")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await menu.getByRole("menuitem").first().press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeVisible();
  await page.locator(".document-heading").hover();
  await trigger.hover();
  await expect(menu).toBeVisible();
  await page.locator(".document-heading").click();
  await expect(menu).toHaveCount(0);
  await expect(block).not.toHaveClass(/has-block-menu/u);
});

test("keeps Insert reachable while the pointer crosses the gap below its button", async ({
  isMobile,
  page,
}) => {
  test.skip(isMobile, "hover travel requires a desktop pointer");
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.locator(".yeli-logo").hover();

  const trigger = page.getByRole("button", { name: "插入", exact: true });
  const menu = page.getByRole("menu", { name: "插入" });
  await trigger.hover();
  await expect(trigger).not.toBeFocused();
  await expect(menu).toBeVisible();
  const triggerBox = (await trigger.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  const gapStart = triggerBox.y + triggerBox.height;
  expect(menuBox.y).toBeGreaterThan(gapStart);
  const x = triggerBox.x + triggerBox.width / 2;
  for (let y = gapStart + 1; y <= menuBox.y + 2; y += 1) {
    await page.mouse.move(x, y);
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  }

  await menu.getByRole("menuitem").first().hover();
  await expect(menu).toBeVisible();
  await page.mouse.move(x, gapStart + 3);
  await expect(menu).toBeVisible();
  await trigger.hover();
  await expect(menu).toBeVisible();
  await page.locator(".yeli-logo").hover();
  await expect(menu).toHaveCount(0);

  await trigger.hover();
  const command = menu.locator('[data-command-id="insert.divider"]');
  const dividers = page.locator('[data-block-kind="thematic-break"]');
  const dividerCount = await dividers.count();
  const commandBox = (await command.boundingBox())!;
  await page.mouse.move(x, gapStart + 3);
  await page.mouse.move(
    commandBox.x + commandBox.width / 2,
    commandBox.y + commandBox.height / 2,
    { steps: 20 },
  );
  await command.click();
  await expect(menu).toHaveCount(0);
  await expect(dividers).toHaveCount(dividerCount + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(dividers).toHaveCount(dividerCount);
});

test("keeps Insert open while either pointer or keyboard focus remains inside", async ({
  isMobile,
  page,
}) => {
  test.skip(isMobile, "hover and focus overlap requires a desktop pointer");
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.locator(".yeli-logo").hover();

  const trigger = page.getByRole("button", { name: "插入", exact: true });
  const menu = page.getByRole("menu", { name: "插入" });
  const outside = page.getByRole("button", { name: "阅读", exact: true });
  await trigger.focus();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();
  await outside.focus();
  await expect(menu).toHaveCount(0);

  await trigger.hover();
  await trigger.focus();
  await menu.getByRole("menuitem").first().hover();
  await outside.focus();
  await expect(menu).toBeVisible();
  await page.locator(".yeli-logo").hover();
  await expect(menu).toHaveCount(0);

  await trigger.focus();
  await page.locator(".yeli-logo").hover();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await expect(menu).toBeVisible();
  await outside.focus();
  await page.locator(".topbar-leading").click({ position: { x: 1, y: 1 } });
  await expect(menu).toHaveCount(0);
});

test("opens the top table-size picker only after click", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const topInsert = page.getByRole("button", { name: "插入", exact: true });
  await topInsert.click();
  const topInsertMenu = page.getByRole("menu", { name: "插入" });
  const topTableCommand = topInsertMenu.getByRole("menuitem", {
    name: "表格",
    exact: true,
  });
  await topTableCommand.hover();
  await expect(topInsertMenu.locator(".table-size-picker")).toHaveCount(0);
  await topTableCommand.focus();
  await expect(topInsertMenu.locator(".table-size-picker")).toHaveCount(0);
  await topTableCommand.click();
  await expect(topInsertMenu.locator(".table-size-picker")).toBeVisible();
  await topTableCommand.click();
  await expect(topInsertMenu.locator(".table-size-picker")).toHaveCount(0);
});

test("keeps the block submenu compact, hover-stable, and inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const editable = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  const block = editable.locator("..");
  await block.hover();
  await block.getByRole("button", { name: /区块菜单/u }).click();

  const menu = block.locator(".block-command-menu");
  const typeGrid = menu.locator(".block-type-grid");
  await expect(typeGrid.getByRole("menuitem")).toHaveCount(12);
  const typeGridBox = await typeGrid.boundingBox();
  expect(typeGridBox?.height).toBeLessThanOrEqual(92);

  const insertBelow = menu.getByRole("menuitem", {
    name: "在下方插入",
    exact: true,
  });
  await insertBelow.hover();
  const submenu = block.locator(".block-insert-submenu");
  await expect(submenu).toBeVisible();

  const [menuBox, submenuBox] = await Promise.all([
    menu.boundingBox(),
    submenu.boundingBox(),
  ]);
  const horizontalGap = Math.max(
    (submenuBox?.x ?? 0) - ((menuBox?.x ?? 0) + (menuBox?.width ?? 0)),
    (menuBox?.x ?? 0) - ((submenuBox?.x ?? 0) + (submenuBox?.width ?? 0)),
    0,
  );
  expect(horizontalGap).toBeLessThanOrEqual(2);

  await submenu.hover();
  await page.waitForTimeout(250);
  await expect(submenu).toBeVisible();
  const tableCommand = submenu.getByRole("menuitem", {
    name: "表格",
    exact: true,
  });
  await tableCommand.hover();
  await expect(submenu.locator(".table-size-picker")).toHaveCount(0);
  await tableCommand.click();
  await expect(submenu.locator(".table-size-picker")).toBeVisible();
  await menu.locator(".block-command-menu-heading").hover();
  await page.waitForTimeout(250);
  await expect(submenu.locator(".table-size-picker")).toBeVisible();
  await expect
    .poll(async () => {
      const box = await submenu.boundingBox();
      return (box?.y ?? 0) + (box?.height ?? Infinity);
    })
    .toBeLessThanOrEqual(629);

  await page.locator(".document-heading").click();
  await expect(menu).toHaveCount(0);
  await block.hover();
  await block.getByRole("button", { name: /区块菜单/u }).click();
  await menu.getByRole("menuitem", { name: "在下方插入", exact: true }).hover();
  await expect(submenu).toBeVisible();
  await expect(submenu.locator(".table-size-picker")).toHaveCount(0);
});

test("keeps open menus above neighboring blocks and syncs image and table menus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const paragraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first()
    .locator("..");
  await paragraph.hover();
  await paragraph.getByRole("button", { name: /区块菜单/u }).click();
  const paragraphMenu = paragraph.locator(".block-command-menu");
  const callout = page.locator(".editable-block.is-callout").first();
  await callout.locator('[contenteditable="true"]').focus();
  expect(
    await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>(".block-command-menu");
      const neighbor = document.querySelector<HTMLElement>(
        ".editable-block.is-callout",
      );
      if (!menu || !neighbor) return false;
      const menuBox = menu.getBoundingClientRect();
      const neighborBox = neighbor.getBoundingClientRect();
      const left = Math.max(menuBox.left, neighborBox.left);
      const right = Math.min(menuBox.right, neighborBox.right);
      const top = Math.max(menuBox.top, neighborBox.top);
      const bottom = Math.min(menuBox.bottom, neighborBox.bottom);
      if (left >= right || top >= bottom) return false;
      const topElement = document.elementFromPoint(
        (left + right) / 2,
        (top + bottom) / 2,
      );
      return topElement !== null && menu.contains(topElement);
    }),
  ).toBe(true);
  await paragraphMenu.getByRole("menuitem").first().press("Escape");

  const image = page.locator(".document-figure").first();
  await image.hover();
  await image.getByRole("button", { name: /区块菜单 · 图片/u }).click();
  await expect(image).toHaveClass(/has-block-menu/u);
  const imageMenu = image.locator(".block-command-menu");
  await imageMenu
    .getByRole("menuitem", { name: "在下方插入", exact: true })
    .hover();
  await expect(
    image.locator(".block-insert-submenu").getByRole("menuitem", {
      name: "插入会议记录",
    }),
  ).toBeVisible();
  await imageMenu.getByRole("menuitem").first().press("Escape");

  const table = page.locator(
    '.structured-block-shell[data-block-kind="table"]',
  );
  await table.hover();
  await table.getByRole("button", { name: /区块菜单 · 表格/u }).click();
  await expect(table).toHaveClass(/has-block-menu/u);
  await expect(table.locator(".block-command-menu")).toBeVisible();
});

test("shows one block toolbar and keeps focus styling on the block surface", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const blocks = page.locator('.editable-block[data-block-kind="paragraph"]');
  const focusedBlock = blocks.first();
  const hoveredBlock = blocks.nth(1);
  const focusedEditable = focusedBlock.locator('[contenteditable="true"]');
  const focusedGutter = focusedBlock.locator(":scope > .block-gutter");
  const hoveredGutter = hoveredBlock.locator(":scope > .block-gutter");

  await focusedEditable.click();
  await expect(focusedBlock).toHaveCSS(
    "background-color",
    "rgb(248, 249, 252)",
  );
  await expect(focusedEditable).toHaveCSS("box-shadow", "none");
  await expect(focusedGutter).toHaveCSS("opacity", "1");

  await hoveredBlock.hover();
  await expect(hoveredGutter).toHaveCSS("opacity", "1");
  await expect(focusedGutter).toHaveCSS("opacity", "0");
  await expect
    .poll(() =>
      page
        .locator(".editable-block > .block-gutter")
        .evaluateAll(
          (gutters) =>
            gutters.filter(
              (gutter) => window.getComputedStyle(gutter).opacity === "1",
            ).length,
        ),
    )
    .toBe(1);

  await page.locator(".document-heading").hover();
  await expect(focusedGutter).toHaveCSS("opacity", "1");
});

test("uses explicit rail controls and keeps the canvas primary at medium width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 820 });
  await page.goto(pathToFileURL(artifactPath).href);

  await expect(
    page.locator(".read-outline-label, .read-trust-icon"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const outlineToggle = page.getByRole("button", { name: "目录" });
  const inspectorToggle = page.getByRole("button", {
    name: "文档属性",
    exact: true,
  });
  await expect(outlineToggle).toBeVisible();
  await expect(inspectorToggle).toBeVisible();
  await expect(page.locator(".outline-panel, .inspector")).toHaveCount(0);

  await page.keyboard.press("Control+Shift+O");
  await expect(page.locator(".outline-panel")).toBeVisible();
  await page.keyboard.press("Control+Shift+O");
  await expect(page.locator(".outline-panel")).toHaveCount(0);

  await outlineToggle.click();
  await expect(page.locator(".outline-panel")).toBeVisible();
  await expect(page.locator(".inspector")).toHaveCount(0);
  const outlineClose = page.getByRole("button", {
    name: "收起文档大纲",
  });
  await expect(outlineClose).toBeVisible();
  await expect(
    page.locator(".outline-panel .panel-heading").getByRole("button"),
  ).toBeVisible();
  const outlineCloseBox = await outlineClose.boundingBox();
  expect(outlineCloseBox?.width).toBeLessThanOrEqual(36);
  expect(outlineCloseBox?.height).toBeGreaterThanOrEqual(36);
  await expect(page.locator(".outline-edge-handle")).toHaveCount(0);
  const outlineLayout = await page.evaluate(() => ({
    canvasTop: document.querySelector(".edit-surface")?.getBoundingClientRect()
      .top,
    outlinePosition: getComputedStyle(document.querySelector(".outline-panel")!)
      .position,
  }));
  expect(outlineLayout).toEqual({ canvasTop: 64, outlinePosition: "fixed" });

  await outlineClose.click();
  await expect(page.locator(".outline-panel")).toHaveCount(0);
  await outlineToggle.click();
  await expect(page.locator(".outline-panel")).toBeVisible();

  await page.getByRole("button", { name: "搜索文档" }).click();
  const search = page.getByRole("dialog", { name: "在文档中查找" });
  await expect(search.getByRole("searchbox", { name: "查找" })).toBeFocused();
  await search.getByRole("button", { name: "关闭文档搜索" }).click();
  await expect(page.locator(".outline-panel")).toHaveCount(0);

  await inspectorToggle.click();
  await expect(page.locator(".outline-panel")).toHaveCount(0);
  await expect(page.locator(".inspector")).toBeVisible();
  const inspectorLayout = await page.evaluate(() => ({
    canvasTop: document.querySelector(".edit-surface")?.getBoundingClientRect()
      .top,
    inspectorPosition: getComputedStyle(document.querySelector(".inspector")!)
      .position,
  }));
  expect(inspectorLayout).toEqual({
    canvasTop: 64,
    inspectorPosition: "fixed",
  });
  const inspectorClose = page.getByRole("button", {
    name: "收起属性面板",
  });
  await expect(inspectorClose).toBeVisible();
  await expect(
    page.locator(".inspector-heading").getByRole("button", {
      name: "收起属性面板",
    }),
  ).toBeVisible();
  const inspectorCloseBox = await inspectorClose.boundingBox();
  expect(inspectorCloseBox?.width).toBeLessThanOrEqual(36);
  expect(inspectorCloseBox?.height).toBeGreaterThanOrEqual(36);
  await expect(page.locator(".inspector-edge-handle")).toHaveCount(0);
  await inspectorClose.click();
  await expect(page.locator(".inspector")).toHaveCount(0);
});

test("keeps the contextual inspector closed until a real task opens it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const inspectorToggle = page.getByRole("button", {
    name: "文档属性",
    exact: true,
  });
  const inspector = page.getByRole("complementary", { name: "属性面板" });
  await expect(inspectorToggle).toHaveAttribute("aria-pressed", "false");
  await expect(inspector).toHaveCount(0);
  await expect(page.locator(".metadata-row")).not.toContainText("修订");

  await inspectorToggle.click();
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("tablist")).toHaveCount(0);
  await expect(
    inspector.locator(".document-facts, .validation-card"),
  ).toHaveCount(0);
  await expect(
    inspector.getByRole("heading", { name: "文档说明" }),
  ).toBeVisible();
  await expect(
    inspector.getByRole("heading", { name: "自定义属性" }),
  ).toBeVisible();
  const organization = inspector.locator(".properties-disclosure");
  await expect(organization).not.toHaveAttribute("open");
  await expect(inspector.getByLabel("别名")).toBeHidden();
  await organization.locator("summary").click();
  await expect(organization).toHaveAttribute("open");
  await expect(inspector.getByLabel("别名")).toBeVisible();
});

test("keeps Document properties and image inspection as distinct tasks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();

  const documentProperties = page.getByRole("button", {
    name: "文档属性",
    exact: true,
  });
  const imageLocator = () =>
    page.getByRole("button", { name: /选择图片.*图片区块示例/u });
  const image = imageLocator();
  const inspector = page.getByRole("complementary", { name: "属性面板" });

  await image.click();
  await expect(image).toHaveAttribute("aria-pressed", "true");
  await expect(documentProperties).toHaveAttribute("aria-pressed", "false");
  await expect(
    inspector.locator(".inspector-context-heading strong"),
  ).toHaveText("图片");
  await expect(
    inspector.getByRole("button", { name: "图片说明" }),
  ).toHaveAttribute("aria-expanded", "true");
  await inspector.getByRole("button", { name: "图片说明" }).click();
  await expect(
    inspector.getByRole("button", { name: "图片说明" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(inspector.getByLabel("替代文本")).toHaveCount(0);

  await documentProperties.click();
  await expect(inspector).toBeVisible();
  await expect(documentProperties).toHaveAttribute("aria-pressed", "true");
  await expect(image).toHaveAttribute("aria-pressed", "false");
  await expect(
    inspector.locator(".inspector-context-heading strong"),
  ).toHaveText("文档属性");
  await expect(inspector.getByRole("tablist")).toHaveCount(0);
  await page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first()
    .click();
  await expect(inspector).toBeVisible();
  await expect(documentProperties).toHaveAttribute("aria-pressed", "true");

  await image.click();
  await expect(
    inspector.locator(".inspector-context-heading strong"),
  ).toHaveText("图片");
  await expect(
    inspector.getByRole("button", { name: "图片说明" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(inspector.getByLabel("替代文本")).toHaveCount(0);

  await inspector.getByRole("button", { name: "收起属性面板" }).click();
  await expect(inspector).toHaveCount(0);
  await expect(image).toHaveAttribute("aria-pressed", "false");

  await image.click();
  await page.setViewportSize({ width: 1100, height: 820 });
  await expect(inspector).toHaveCount(0);
  await expect(imageLocator()).toHaveAttribute("aria-pressed", "false");

  await page.setViewportSize({ width: 1440, height: 900 });
  await imageLocator().click();
  const restoredInspector = page.getByRole("complementary", {
    name: "属性面板",
  });
  await restoredInspector.getByRole("button", { name: "收起属性面板" }).click();
  await page.getByRole("button", { name: "阅读" }).click();
  await expect(inspector).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
});

test("localizes top navigation without changing the document", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);

  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await page.getByRole("menuitem", { name: "English" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(?:More|Menu)$/u }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Document editor")).toBeVisible();
  await page
    .getByRole("button", { name: "Document properties", exact: true })
    .click();
  await expect(page.getByPlaceholder("Add a short summary")).toBeVisible();
  await page.getByRole("button", { name: /^(?:More|Menu)$/u }).click();
  await expect(page.getByRole("button", { name: "Advanced View" })).toHaveCount(
    0,
  );
  await expect(page.locator(".cm-editor")).toHaveCount(0);
});

test("remembers the selected UI language across reloads", async ({ page }) => {
  await page.goto(pathToFileURL(artifactPath).href);

  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await page.getByRole("menuitem", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});

test("follows the document language before the browser preference", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();

  await page.goto(pathToFileURL(artifactPath).href);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();

  await context.close();
});

test("@quality keeps the primary surface within a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const locale of ["zh-CN", "en"]) {
    await page.goto(
      pathToFileURL(path.resolve(`dist/html/starter.${locale}.yeli.html`)).href,
    );
    await page
      .getByRole("button", {
        name: locale === "en" ? "Edit" : "编辑",
        exact: true,
      })
      .click();
    const title = page.locator(".topbar-title-input");
    await expect(title).toBeVisible();
    const titleTextWidth = await title.evaluate((input) => {
      const style = getComputedStyle(input);
      return (
        input.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight)
      );
    });
    expect(titleTextWidth).toBeGreaterThanOrEqual(36);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    const toggle = page.locator(".topbar-brand");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".outline-panel")).toBeVisible();
  }
});
