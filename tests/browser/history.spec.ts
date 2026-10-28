import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");
const loopbackHttpUrl =
  "http://127.0.0.1:8874/yeli-history-verification.yeli.html";
const syntheticGif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);

async function storedVersionCount(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yeli-local-v1", 1);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("IndexedDB open failed")),
      );
    });
    try {
      const transaction = database.transaction("entries", "readonly");
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = transaction.objectStore("entries").getAllKeys();
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () =>
          reject(request.error ?? new Error("IndexedDB key read failed")),
        );
      });
      return keys.filter(
        (key) => typeof key === "string" && key.startsWith("version:"),
      ).length;
    } finally {
      database.close();
    }
  });
}

async function waitForStoredVersions(page: Page, count: number) {
  await expect.poll(() => storedVersionCount(page)).toBe(count);
}

async function loadHistoryFixture(page: Page) {
  const source = `---
title: History fixture
---
# History fixture

Old one

Shared line

Old two

<script>globalThis.__historyExecuted = true</script>
<img src="https://history.invalid/pixel" onerror="alert(1)">
`;
  await page.goto(pathToFileURL(artifactPath).href);
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(source),
    mimeType: "text/markdown",
    name: "history-fixture.md",
  });
  await expect(
    page
      .locator(".markdown-document")
      .getByRole("heading", { name: "History fixture", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const paragraphs = page.locator(
    '[data-block-kind="paragraph"] [contenteditable="true"]',
  );
  await waitForStoredVersions(page, 2);
  let versionCount = 2;
  for (const [oldText, currentText] of [
    ["Old one", "Current one"],
    ["Old two", "Current two"],
  ] as const) {
    const paragraph = paragraphs.filter({ hasText: oldText });
    await paragraph.click();
    await paragraph.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.keyboard.type(currentText);
    await page.locator(".document-heading").click();
    await expect(paragraphs.filter({ hasText: currentText })).toBeVisible();
    await waitForStoredVersions(page, ++versionCount);
  }
  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).focus();
}

async function openHistoryPanel(page: Page) {
  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  await page.getByRole("menuitem", { name: "历史版本" }).click();
}

for (const transport of ["file", "loopback HTTP"] as const) {
  test(`refreshes open history after edits without losing focus, filter or selection over ${transport}`, async ({
    page,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1280) <= 1180,
      "The narrow History drawer covers the editing canvas.",
    );
    if (transport === "loopback HTTP") {
      await page.route(loopbackHttpUrl, (route) =>
        route.fulfill({
          body: readFileSync(artifactPath),
          contentType: "text/html",
        }),
      );
    }
    await page.goto(
      transport === "file" ? pathToFileURL(artifactPath).href : loopbackHttpUrl,
    );
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await waitForStoredVersions(page, 1);
    await openHistoryPanel(page);
    const panel = page.getByRole("complementary", { name: "历史版本" });
    const reviews = panel.getByRole("button", {
      name: "查看版本",
      exact: true,
    });
    await expect(reviews).toHaveCount(1);
    const paragraph = page
      .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
      .first();

    const editWhileOpen = async (text: string, count: number) => {
      await paragraph.click();
      await page.keyboard.type(text);
      await page.locator(".document-heading").click();
      await expect(paragraph).toContainText(text.trim());
      await paragraph.click();
      await waitForStoredVersions(page, count);
      await expect(panel).toBeVisible();
      await expect(paragraph).toBeFocused();
    };

    await editWhileOpen(" LiveHistoryFirst ", 2);
    await expect(reviews).toHaveCount(2);
    await expect(panel.locator(".history-item").first()).toContainText(
      "· 编辑",
    );
    await reviews.first().click();
    await expect(panel.getByLabel("所选版本", { exact: true })).toContainText(
      "LiveHistoryFirst",
    );
    await panel.getByRole("button", { name: "返回版本列表" }).click();

    const agentFilter = panel.getByRole("button", {
      name: "外部工具修改",
      exact: true,
    });
    await agentFilter.click();
    await expect(reviews).toHaveCount(0);
    await editWhileOpen(" LiveHistorySecond ", 3);
    await expect(agentFilter).toHaveAttribute("aria-pressed", "true");
    await expect(reviews).toHaveCount(0);
    await panel
      .getByRole("button", { name: "在页里编辑", exact: true })
      .click();
    await expect(reviews).toHaveCount(3);

    await reviews.last().click();
    const preview = panel.getByLabel("所选版本", { exact: true });
    const originalPreview = await preview.textContent();
    await editWhileOpen(" LiveHistoryThird ", 4);
    await expect(preview).toHaveText(originalPreview!);
    await panel.getByRole("button", { name: "返回版本列表" }).click();
    await expect(reviews).toHaveCount(4);
  });
}

test("persists history on loopback HTTP but not remote HTTP", async ({
  page,
}) => {
  const artifact = readFileSync(artifactPath);

  await page.route(loopbackHttpUrl, (route) =>
    route.fulfill({ body: artifact, contentType: "text/html" }),
  );
  await page.goto(loopbackHttpUrl);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const paragraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  await paragraph.click();
  await page.keyboard.type(" Loopback history probe ");
  await page.locator(".document-heading").click();
  await expect(page.locator(".edit-document")).toContainText(
    "Loopback history probe",
  );
  await waitForStoredVersions(page, 2);
  await openHistoryPanel(page);
  const panel = page.getByRole("complementary", { name: "历史版本" });
  await expect(
    panel.getByRole("button", { name: "查看版本", exact: true }),
  ).toHaveCount(2);
  await expect(panel).not.toContainText("此页面无法保存历史版本和恢复草稿");

  await page.unroute(loopbackHttpUrl);
  const remoteUrl = "http://remote.example/yeli-history-verification.yeli.html";
  await page.route(remoteUrl, (route) =>
    route.fulfill({ body: artifact, contentType: "text/html" }),
  );
  await page.goto(remoteUrl);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await openHistoryPanel(page);
  const remotePanel = page.getByRole("complementary", { name: "历史版本" });
  await expect(remotePanel.getByRole("alert")).toContainText(
    "此页面无法保存历史版本和恢复草稿",
  );
  await expect(remotePanel).not.toContainText("会自动生成快照");
});

test("explains that history cannot be recorded when storage is denied", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await openHistoryPanel(page);
  const panel = page.getByRole("complementary", { name: "历史版本" });
  await expect(panel.getByRole("alert")).toContainText(
    "此页面无法保存历史版本和恢复草稿",
  );
  await expect(panel).not.toContainText("会自动生成快照");
});

test("history opens from More in the right rail, never the outline", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(
    page.locator(".workspace-topbar").getByRole("button", {
      name: "历史版本",
    }),
  ).toHaveCount(0);
  await openHistoryPanel(page);

  const panel = page.getByRole("complementary", { name: "历史版本" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("本机存储");
  await expect(
    panel.getByRole("group", { name: "筛选历史版本" }).getByRole("button"),
  ).toHaveText(["全部", "在页里编辑", "外部工具修改"]);
  await expect(page.locator(".workspace-body > .history-panel")).toHaveCount(1);
  await expect(page.locator(".overlay-backdrop .history-panel")).toHaveCount(0);
  await panel.getByRole("button", { name: "关闭" }).click();
  await expect(
    page.getByRole("button", { name: /^(?:更多|菜单)$/u }),
  ).toBeFocused();

  const outlineToggle = page.getByRole("button", { name: "目录" });
  if ((await outlineToggle.getAttribute("aria-pressed")) !== "true") {
    await outlineToggle.click();
  }
  await expect(page.locator(".outline-panel")).toBeVisible();
  await expect(page.locator(".outline-panel")).not.toContainText("历史版本");
});

test("explains matching versions and guides back to a restorable older version", async ({
  page,
}) => {
  await loadHistoryFixture(page);
  await openHistoryPanel(page);
  const panel = page.getByRole("complementary", { name: "历史版本" });
  const review = panel.getByRole("button", { name: "查看版本" });
  await review.first().click();
  await expect(panel.locator(".history-no-changes")).toContainText("无需恢复");
  await expect(panel.getByRole("checkbox")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "恢复此版本", exact: true }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "选择其他版本" }).click();
  await expect(review).toHaveCount(3);
  await review.last().click();
  const restore = panel.getByRole("button", { name: "恢复此版本" });
  await expect(restore).toBeDisabled();
  await panel.getByLabel(/恢复将替换当前内容和图片/).check();
  await expect(restore).toBeEnabled();
  await restore.click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".edit-document")).not.toContainText("Current one");
  await expect(page.locator(".edit-document")).toContainText("Old one");
  await page.keyboard.press("Meta+z");
  await expect(page.locator(".edit-document")).toContainText("Current one");
});

test("reviews an inert lightweight summary before one confirmed undoable restore", async ({
  page,
}) => {
  await loadHistoryFixture(page);
  await openHistoryPanel(page);
  const panel = page.getByRole("complementary", { name: "历史版本" });
  const review = panel.getByRole("button", { name: "查看版本" });
  await expect(review).toHaveCount(3);
  await expect(panel).toContainText("在页里编辑");
  await expect(panel).toContainText("编辑了段落内容");
  await expect(panel).not.toContainText("wysiwyg:inline");
  await expect(panel).not.toContainText("paragraph");
  await panel
    .getByRole("button", { name: "外部工具修改", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  await expect(panel).toContainText("该筛选下暂无版本");
  await panel.getByRole("button", { name: "在页里编辑", exact: true }).click();
  await expect(review).toHaveCount(3);
  await review.last().click();

  await expect(panel.locator(".history-change-summary")).toContainText(
    "修改部分",
  );
  await expect(panel.locator(".history-hunk")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "比较更改" })).toHaveCount(0);

  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const sourcePreview = panel.locator('[aria-label="所选版本"]');
  await expect(sourcePreview).toContainText(
    "<script>globalThis.__historyExecuted = true</script>",
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __historyExecuted?: boolean })
          .__historyExecuted,
    ),
  ).toBeUndefined();
  expect(requests.filter((url) => url.includes("history.invalid"))).toEqual([]);

  const restore = panel.getByRole("button", { name: "恢复此版本" });
  await expect(restore).toBeDisabled();
  await expect(restore).toHaveCSS("background-color", "rgb(233, 237, 244)");
  await expect(restore).toHaveCSS("white-space", "nowrap");
  await expect(restore.locator("svg")).toHaveCSS("width", "16px");
  await panel.getByLabel(/恢复将替换当前内容和图片/).check();
  await expect(restore).toBeEnabled();
  await restore.click();
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^(?:更多|菜单)$/u }),
  ).toBeFocused();
  await expect(page.locator(".edit-document")).toContainText("Old one");
  await expect(page.locator(".edit-document")).not.toContainText("Current one");

  await page.keyboard.press("Meta+z");
  await expect(page.locator(".edit-document")).toContainText("Current one");
  await expect(page.locator(".edit-document")).toContainText("Current two");
  await page.keyboard.press("Meta+Shift+z");
  await expect(page.locator(".edit-document")).toContainText("Old one");
  await expect(page.locator(".edit-document")).toContainText("Old two");
});

test("restores and undo-redoes Markdown and embedded assets atomically", async ({
  page,
}) => {
  const firstAsset = syntheticGif;
  const secondAsset = Buffer.concat([firstAsset, Buffer.from([0])]);
  const firstId = `sha256:${createHash("sha256").update(firstAsset).digest("hex")}`;
  const secondId = `sha256:${createHash("sha256").update(secondAsset).digest("hex")}`;
  const firstDataUri = `data:image/gif;base64,${firstAsset.toString("base64")}`;
  const secondDataUri = `data:image/gif;base64,${secondAsset.toString("base64")}`;

  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: /选择图片.*图片区块示例/u }).click();
  const inspector = page.getByRole("complementary", { name: "属性面板" });
  const image = page.locator(".document-figure img");

  await inspector.getByLabel("替换图片").setInputFiles({
    buffer: firstAsset,
    mimeType: "image/gif",
    name: "first.gif",
  });
  await expect(image).toHaveAttribute("src", firstDataUri);
  await waitForStoredVersions(page, 2);

  await inspector.getByLabel("替换图片").setInputFiles({
    buffer: secondAsset,
    mimeType: "image/gif",
    name: "second.gif",
  });
  await expect(image).toHaveAttribute("src", secondDataUri);
  await waitForStoredVersions(page, 3);

  await openHistoryPanel(page);
  const panel = page.getByRole("complementary", { name: "历史版本" });
  const reviews = panel.getByRole("button", { name: "查看版本" });
  await expect(reviews).toHaveCount(3);
  await reviews.nth(1).click();
  await expect(panel.locator(".history-asset-summary")).toContainText(firstId);
  await expect(panel.locator(".history-asset-summary")).toContainText(secondId);
  await expect(panel.locator('[aria-label="所选版本"]')).toContainText(
    `yeli-asset:${firstId}`,
  );
  await panel.getByLabel(/恢复将替换当前内容和图片/).check();
  await panel.getByRole("button", { name: "恢复此版本" }).click();
  await expect(image).toHaveAttribute("src", firstDataUri);

  await page.keyboard.press("Meta+z");
  await expect(image).toHaveAttribute("src", secondDataUri);
  await page.keyboard.press("Meta+Shift+z");
  await expect(image).toHaveAttribute("src", firstDataUri);
});
