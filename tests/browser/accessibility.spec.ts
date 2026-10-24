import { expect, test } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");

test("@quality has no critical structural accessibility violations in Read and Edit", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);

  const audit = async () =>
    page.evaluate(() => {
      const visible = (element: HTMLElement) =>
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden";
      const interactive = [
        ...document.querySelectorAll<HTMLElement>(
          "button, a[href], input, textarea, [contenteditable='true']",
        ),
      ].filter(visible);
      const unlabeled = interactive.filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        const labelledBy = element.getAttribute("aria-labelledby");
        const labelledText = labelledBy
          ? labelledBy
              .split(/\s+/u)
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
          : "";
        const nativeLabel =
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
            ? [...(element.labels ?? [])]
                .map((label) => label.textContent ?? "")
                .join(" ")
            : "";
        return !(
          element.getAttribute("aria-label")?.trim() ||
          labelledText.trim() ||
          nativeLabel.trim() ||
          element.getAttribute("title")?.trim() ||
          element.textContent?.trim() ||
          (element instanceof HTMLInputElement && element.type === "file")
        );
      });
      const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map(
        (element) => element.id,
      );
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
      const imagesWithoutAlt = [
        ...document.querySelectorAll<HTMLImageElement>("img"),
      ].filter((image) => !image.hasAttribute("alt"));
      return {
        duplicateIds: [...new Set(duplicateIds)],
        imagesWithoutAlt: imagesWithoutAlt.length,
        unlabeled: unlabeled.map((element) => element.outerHTML.slice(0, 120)),
      };
    });

  expect(await audit()).toEqual({
    duplicateIds: [],
    imagesWithoutAlt: 0,
    unlabeled: [],
  });

  await page.getByRole("button", { name: "编辑", exact: true }).click();
  expect(await audit()).toEqual({
    duplicateIds: [],
    imagesWithoutAlt: 0,
    unlabeled: [],
  });
});

test("@quality traps subordinate-dialog focus, restores its origin, and honors reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(pathToFileURL(artifactPath).href);
  const more = page.getByRole("button", { name: "更多" });
  await more.click();
  await page.getByRole("menuitem", { name: "关于 页里" }).click();
  const dialog = page.getByRole("dialog", { name: "关于 页里" });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "关闭", exact: true });
  const summary = dialog.locator("summary");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(".about-version-control")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(".about-brand-control")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.locator("details")).toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(dialog.locator(".about-brand-control")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(".about-version-control")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();

  const motion = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector(".icon-button")!);
    return {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
    };
  });
  const seconds = (value: string) => Number.parseFloat(value) || 0;
  expect(seconds(motion.animationDuration)).toBeLessThanOrEqual(0.00001);
  expect(seconds(motion.transitionDuration)).toBeLessThanOrEqual(0.00001);
});

test("@quality keeps visible compact top-bar actions at usable touch sizes", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "compact profile only");
  await page.goto(pathToFileURL(artifactPath).href);
  const undersized = await page
    .locator(".workspace-topbar button:visible")
    .evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            height: rect.height,
            label: button.getAttribute("aria-label") ?? button.textContent,
            width: rect.width,
          };
        })
        .filter((item) => item.height < 36 || item.width < 36),
    );
  expect(undersized).toEqual([]);
});
