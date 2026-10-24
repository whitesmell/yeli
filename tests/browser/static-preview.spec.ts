import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");

test("JavaScript-disabled opening exposes only the inert bounded preview", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(pathToFileURL(artifactPath).href);

  await expect(page.locator("#yeli-static-preview")).toBeVisible();
  await expect(page.locator("#yeli-static-preview h1")).toContainText(
    "让知识成为可以携带的文件",
  );
  await expect(page.locator(".workspace-shell")).toHaveCount(0);
  await context.close();
});

test("normal boot removes the inert preview before the first animation frame", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    requestAnimationFrame(() => {
      Object.defineProperty(window, "__yeliPreviewVisibleAtFirstFrame", {
        configurable: false,
        value: Boolean(document.getElementById("yeli-static-preview")),
        writable: false,
      });
    });
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(artifactPath).href);
  await expect(page.locator(".workspace-shell")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __yeliPreviewVisibleAtFirstFrame?: boolean;
            }
          ).__yeliPreviewVisibleAtFirstFrame,
      ),
    )
    .toBe(false);
  await expect(page.locator("#yeli-static-preview")).toHaveCount(0);
  await context.close();
});
