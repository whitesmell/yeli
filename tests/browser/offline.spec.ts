import { expect, test } from "@playwright/test";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");
let artifactBytes = 0;

test.beforeAll(() => {
  expect(existsSync(artifactPath), "single-file artifact must be built").toBe(
    true,
  );
  artifactBytes = statSync(artifactPath).size;
});

test("U7 opens the exact artifact offline and presents eligible Read sections without mutation", async ({
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
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();

  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.getByRole("dialog", { name: "演示文稿" })).toBeVisible();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.getByRole("dialog", { name: "演示文稿" })).toHaveCount(0);

  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("menuitem", { name: /演示/u }).click();
  const dialog = page.getByRole("dialog", { name: "演示文稿" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "为什么选择 页里" }),
  ).toBeVisible();
  await expect(dialog).toContainText("1 / 3");
  const close = dialog.getByRole("button", { name: "关闭演示" });
  await expect(close).toHaveCSS("color", "rgb(248, 250, 252)");
  await expect(close).toHaveCSS(
    "background-color",
    "rgba(255, 255, 255, 0.08)",
  );
  const previous = dialog.getByRole("button", { name: "上一页" });
  const next = dialog.getByRole("button", { name: "下一页" });
  const previousBox = await previous.boundingBox();
  const nextBox = await next.boundingBox();
  expect(previousBox?.width).toBe(nextBox?.width);
  expect(previousBox?.width).toBeLessThanOrEqual(132);
  await dialog.getByRole("button", { name: "下一页" }).click();
  await expect(dialog.getByRole("heading", { name: "核心能力" })).toBeVisible();
  await page.getByRole("button", { name: "更多" }).focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更多" })).toBeFocused();

  await page.getByRole("button", { name: "更多" }).click();
  await expect(page.getByRole("menuitem", { name: "高级视图" })).toHaveCount(0);
  await expect(page.locator(".cm-editor")).toHaveCount(0);
  expect(remoteRequests).toEqual([]);
});

for (const locale of ["zh-CN", "en"] as const) {
  test(`About keeps ${locale} product copy concise and file details progressive`, async ({
    page,
  }) => {
    const chinese = locale === "zh-CN";
    await page.goto(pathToFileURL(artifactPath).href);
    await page.getByRole("button", { name: "更多" }).click();
    if (!chinese) {
      await page.getByRole("menuitem", { name: "English" }).click();
      await page.getByRole("button", { name: "More", exact: true }).click();
    }
    await page
      .getByRole("menuitem", { name: chinese ? "关于 页里" : "About Yeli" })
      .click();

    const dialog = page.getByRole("dialog", {
      name: chinese ? "关于 页里" : "About Yeli",
    });
    await expect(dialog).toContainText(
      chinese ? "一份文件，随处续写。" : "One file. Keep creating.",
    );
    await expect(dialog).toContainText("0.1.0");
    await expect(dialog).not.toContainText(
      /不等于|本版本不包含|内容权威|凭据|实验性?版本|[Ee]xperimental|built-in AI|credential|content authority|\bV1\b/u,
    );
    await expect(
      dialog.getByRole("heading", {
        name: chinese ? "当前文件" : "Current file",
      }),
    ).toBeVisible();
    const formattedArtifactSize =
      artifactBytes < 1_000_000
        ? `${(artifactBytes / 1_000).toFixed(2)} KB`
        : `${(artifactBytes / 1_000_000).toFixed(2)} MB`;
    await expect(dialog.locator(".about-file-size-value")).toHaveText(
      formattedArtifactSize,
    );
    await expect(dialog.locator(".about-file-size-bytes")).toContainText(
      `${artifactBytes.toLocaleString()} ${chinese ? "字节" : "bytes"}`,
    );
    await expect(dialog.locator(".about-file-projected-size")).toHaveCount(0);
    await expect(dialog.locator(".about-share-note")).toContainText(
      chinese ? "可信来源" : "trusted sources",
    );
    const details = dialog.locator("details");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(
      dialog.getByText(chinese ? "发布校验" : "Release verification"),
    ).toBeHidden();
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open", "");
    await expect(details).toContainText(
      chinese ? "Yeli 校验工具" : "Yeli verification tool",
    );
    await expect(details).toContainText("67.11 MB (67,108,864");
    await expect(details).toContainText(
      chinese ? "HTML 附件" : "HTML attachments",
    );
  });
}
