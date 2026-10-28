import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("English starter reads, edits, exports and switches language offline", async ({
  browserName,
  context,
  page,
}) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) remoteRequests.push(request.url());
  });
  if (browserName === "webkit") {
    await context.route(/^https?:/u, (route) => route.abort());
  } else {
    await context.setOffline(true);
  }
  await page.goto(
    pathToFileURL(path.resolve("dist/html/starter.en.yeli.html")).href,
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#document-title")).toHaveText(
    "Make knowledge a file you can carry",
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const title = page.locator(".document-title-input");
  await title.fill("English offline edit");
  await title.blur();
  await page
    .getByRole("button", { name: /^(?:More|Menu)$/u, exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Export Markdown", exact: true })
    .click();
  const download = await downloaded;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const markdown = readFileSync(downloadPath, "utf8");
  expect(markdown).toContain("title: English offline edit");
  expect(markdown).toContain("lang: en");
  expect(markdown).toContain("## Core capabilities");
  await page
    .getByRole("button", { name: /^(?:More|Menu)$/u, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "简体中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(title).toHaveValue("English offline edit");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  expect(remoteRequests).toEqual([]);
});

test("English starter has an English static preview with JavaScript disabled", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(
      pathToFileURL(path.resolve("dist/html/starter.en.yeli.html")).href,
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#yeli-static-preview h1")).toHaveText(
      "Make knowledge a file you can carry",
    );
    await expect(page.locator("#yeli-static-preview")).toContainText(
      "Yeli · portable Markdown",
    );
    await expect(page.locator(".workspace-shell")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
