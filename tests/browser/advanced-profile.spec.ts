import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const artifactPath = path.resolve("dist/advanced/advanced.zh-CN.yeli.html");

test.skip(
  process.env.YELI_TEST_ADVANCED !== "1",
  "The default release intentionally excludes the Advanced Source plugin.",
);

test("official enhanced profile loads and edits through CodeMirror", async ({
  page,
}) => {
  expect(existsSync(artifactPath)).toBe(true);
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("menuitem", { name: "高级视图" }).click();

  const source = page.locator(".cm-content");
  await expect(source).toBeVisible();
  await expect(source).toContainText("让知识成为可以携带的文件");
  await source.click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type(
    "# Plugin profile verified.\n\nEnhanced source body.\n",
  );
  await expect(page.locator(".cm-line").first()).toContainText(
    "Plugin profile verified.",
  );
  await page.getByRole("button", { name: "关闭高级视图" }).click();
  await expect(page.locator("#plugin-profile-verified")).toBeVisible();
});

test("official enhanced profile waits for IME composition before committing", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("menuitem", { name: "高级视图" }).click();
  await page.getByRole("button", { name: "源码 + 预览" }).click();

  const source = page.locator(".cm-content");
  const preview = page.locator(".advanced-preview");
  await source.click();
  await page.keyboard.press("Meta+End");
  await source.dispatchEvent("compositionstart", { data: "" });
  await page.keyboard.insertText("\n\n组合输入验证");
  await page.waitForTimeout(250);
  await expect(preview).not.toContainText("组合输入验证");

  await source.dispatchEvent("compositionend", { data: "组合输入验证" });
  await expect(preview).toContainText("组合输入验证");
});
