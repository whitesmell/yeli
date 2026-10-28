import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseYeliArtifact } from "../../src/format/parse.ts";
import { projectShell } from "../../src/integrity/shell-projection.ts";
import {
  brandContentDigests,
  contentDigest,
  hasBrandContent,
} from "../integration/brand-content.ts";

function artifactFile(locale: string) {
  return path.resolve(
    process.env.YELI_TEST_ARTIFACT ?? `dist/html/starter.${locale}.yeli.html`,
  );
}

async function openAbout(page: Page, chinese: boolean) {
  await page
    .getByRole("button", {
      name: chinese ? /^(?:更多|菜单)$/u : /^(?:More|Menu)$/u,
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: chinese ? "关于 页里" : "About Yeli" })
    .click();
  return page.getByRole("dialog", {
    name: chinese ? "关于 页里" : "About Yeli",
  });
}

async function pointerHold(page: Page, brand: Locator, touch: boolean) {
  if (touch) {
    const session = await page.context().newCDPSession(page);
    const bounds = (await brand.boundingBox())!;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      ],
    });
    await page.waitForTimeout(2100);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  } else {
    await brand.click({ delay: 2100 });
  }
}

for (const locale of ["zh-CN", "en"]) {
  test(`About brand detail stays dormant until the gesture in ${locale}`, async ({
    browserName,
    context,
    isMobile,
    page,
  }, testInfo) => {
    const chinese = locale === "zh-CN";
    const errors: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/^https?:/u.test(request.url())) requests.push(request.url());
    });
    if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
    await context.setOffline(true);
    await page.goto(pathToFileURL(artifactFile(locale)).href);
    const payload = await page.locator("#yeli-doc").textContent();
    const dialog = await openAbout(page, chinese);
    const brand = dialog.locator(".about-brand-control");
    const version = dialog.locator(".about-version-control");
    const detail = dialog.locator(".about-brand-detail");
    await expect(detail).toHaveCount(0);
    expect(hasBrandContent(await page.locator("body").innerHTML())).toBe(false);
    await expect(brand).not.toHaveAttribute("title");
    await expect(version).not.toHaveAttribute("title");
    await expect(brand).toHaveCSS("cursor", "default");
    await pointerHold(page, brand, isMobile && browserName === "chromium");
    await expect(detail).toHaveCount(0);
    await version.click();
    await version.click();
    await pointerHold(page, brand, isMobile && browserName === "chromium");
    await expect(detail.locator(".about-brand-marks > span")).toHaveCount(
      brandContentDigests.length,
    );
    expect(
      (await detail.locator(".about-brand-marks > span").allTextContents()).map(
        contentDigest,
      ),
    ).toEqual(brandContentDigests);
    await expect(detail.locator("p")).toHaveText(
      chinese
        ? "\u8fd9\u4e00\u9875\uff0c\u7559\u7ed9\u4f60\u4eec\u3002"
        : "For you, with love.",
    );
    expect(await page.locator("#yeli-doc").textContent()).toBe(payload);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await detail
        .locator(".about-brand-marks > span")
        .evaluateAll((elements) =>
          elements.every(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("brand-detail.png") });
    await page.emulateMedia({ media: "print" });
    await expect(detail).toBeHidden();
    await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
    await expect(detail).toHaveCSS("animation-name", "none");
    await dialog
      .getByRole("button", { name: chinese ? "关闭" : "Close", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const reopened = await openAbout(page, chinese);
    await expect(reopened.locator(".about-brand-detail")).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  });
}

test("About brand keyboard interaction preserves save and export content", async ({
  browser,
  context,
  page,
}, testInfo) => {
  await context.setOffline(true);
  const artifactPath = artifactFile("zh-CN");
  const original = readFileSync(artifactPath, "utf8");
  const before = await parseYeliArtifact(original);
  expect(before.ok).toBe(true);
  if (!before.ok) return;
  await page.goto(pathToFileURL(artifactPath).href);
  let dialog = await openAbout(page, true);
  const version = dialog.locator(".about-version-control");
  const brand = dialog.locator(".about-brand-control");
  await version.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await brand.focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(2100);
  await page.keyboard.up("Space");
  await expect(dialog.locator(".about-brand-marks > span")).toHaveCount(
    brandContentDigests.length,
  );
  expect(
    (await dialog.locator(".about-brand-marks > span").allTextContents()).map(
      contentDigest,
    ),
  ).toEqual(brandContentDigests);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page
    .getByRole("button", { name: /^(?:更多|菜单)$/u, exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载更新副本" }).click();
  const savedPath = testInfo.outputPath("brand-copy.yeli.html");
  await (await downloaded).saveAs(savedPath);
  const saved = readFileSync(savedPath, "utf8");
  const after = await parseYeliArtifact(saved);
  expect(after.ok).toBe(true);
  if (!after.ok) return;
  expect(after.markdown).toBe(before.markdown);
  expect(projectShell(saved).hash).toBe(projectShell(original).hash);
  expect(saved).not.toContain('class="about-brand-detail"');
  expect(hasBrandContent(saved)).toBe(false);
  const freshContext = await browser.newContext();
  try {
    await freshContext.setOffline(true);
    const reopened = await freshContext.newPage();
    await reopened.goto(pathToFileURL(savedPath).href);
    dialog = await openAbout(reopened, true);
    await expect(dialog.locator(".about-brand-detail")).toHaveCount(0);
    await reopened.keyboard.press("Escape");
    await reopened
      .getByRole("button", { name: /^(?:更多|菜单)$/u, exact: true })
      .click();
    await reopened.getByRole("menuitem", { name: "导出只读 HTML" }).click();
    const preview = reopened.getByRole("dialog", { name: "导出预览" });
    const html = await preview.locator("iframe").getAttribute("srcdoc");
    expect(html).not.toContain("about-brand-detail");
    expect(hasBrandContent(html ?? "")).toBe(false);
  } finally {
    await freshContext.close();
  }
});
