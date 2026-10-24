import { expect, test } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");

test("@quality keeps a 1 MiB document input commit below the 100 ms long-task gate", async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "Long Tasks API reference runner is Chromium",
  );
  await page.goto(pathToFileURL(artifactPath).href);
  const padding = "x".repeat(1024 * 1024);
  const markdown = `---\ntitle: Large performance fixture\n---\n# Performance\nEditable paragraph\n\n\`\`\`text\n${padding}\n\`\`\`\n`;
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(markdown, "utf8"),
    mimeType: "text/markdown",
    name: "large-performance.md",
  });
  await expect(
    page.getByRole("heading", { name: "Large performance fixture" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator(".edit-document")).toBeVisible();

  const measurement = await page.evaluate(async () => {
    const durations: number[] = [];
    const supported =
      PerformanceObserver.supportedEntryTypes.includes("longtask");
    const observer = supported
      ? new PerformanceObserver((list) => {
          durations.push(...list.getEntries().map((entry) => entry.duration));
        })
      : null;
    observer?.observe({ entryTypes: ["longtask"] });
    const editable = document.querySelector<HTMLElement>(
      '.block-content-editable[contenteditable="true"]',
    );
    if (!editable) throw new Error("Missing editable block");
    const startedAt = performance.now();
    editable.focus();
    editable.textContent = "Measured editor input";
    editable.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: "t" }),
    );
    editable.blur();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const elapsed = performance.now() - startedAt;
    observer?.disconnect();
    return { elapsed, maxLongTask: Math.max(0, ...durations), supported };
  });

  expect(measurement.supported).toBe(true);
  expect(measurement.maxLongTask).toBeLessThan(100);
  expect(measurement.elapsed).toBeLessThan(500);
});

test("@quality keeps rapid 1 MiB document search below the 100 ms long-task gate", async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "Long Tasks API reference runner is Chromium",
  );
  await page.goto(pathToFileURL(artifactPath).href);
  const repeated = "needle ".repeat(Math.ceil((1024 * 1024) / 7));
  const markdown = `---\ntitle: Large search fixture\n---\n# Search performance\n\n\`\`\`text\n${repeated}\n\`\`\`\n`;
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(markdown, "utf8"),
    mimeType: "text/markdown",
    name: "large-search.md",
  });
  await expect(
    page.getByRole("heading", { name: "Large search fixture" }),
  ).toBeVisible();
  await page.keyboard.press("Meta+f");
  const dialog = page.getByRole("dialog", { name: "在文档中查找" });
  const query = dialog.getByRole("searchbox", { name: "查找" });

  const measurement = await page.evaluate(() => {
    const durations: number[] = [];
    const supported =
      PerformanceObserver.supportedEntryTypes.includes("longtask");
    const observer = supported
      ? new PerformanceObserver((list) => {
          durations.push(...list.getEntries().map((entry) => entry.duration));
        })
      : null;
    observer?.observe({ entryTypes: ["longtask"] });
    Object.assign(window, { __yeliSearchDurations: durations });
    return { supported };
  });

  await query.fill("needle");
  await query.fill("missing");
  await query.fill("needle");
  await expect(dialog.getByText("第 1 项，共 500 项")).toBeVisible();
  await expect(
    dialog.getByText("匹配项较多，请输入更具体的文字查看其他结果。"),
  ).toBeVisible();
  await expect(query).toBeFocused();

  const maxLongTask = await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const durations = (
      window as unknown as {
        __yeliSearchDurations: number[];
      }
    ).__yeliSearchDurations;
    return Math.max(0, ...durations);
  });
  expect(measurement.supported).toBe(true);
  expect(maxLongTask).toBeLessThan(100);
});

test("@quality keeps a 1 MiB history summary and inert preview below the 100 ms long-task gate", async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "Long Tasks API reference runner is Chromium",
  );
  await page.goto(pathToFileURL(artifactPath).href);
  const padding = "history-line\n".repeat(Math.ceil((1024 * 1024) / 13));
  const markdown = `---\ntitle: Large history fixture\n---\n# Before history\n\n\`\`\`text\n${padding}\`\`\`\n`;
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(markdown, "utf8"),
    mimeType: "text/markdown",
    name: "large-history.md",
  });
  await expect(
    page.getByRole("heading", { name: "Large history fixture" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page
    .locator('[data-block-kind="heading"] [contenteditable="true"]')
    .filter({ hasText: "Before history" })
    .fill("After history");
  await page.getByRole("button", { name: "更多" }).focus();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("menuitem", { name: "历史版本" }).click();
  const panel = page.getByRole("complementary", { name: "历史版本" });
  const review = panel.getByRole("button", { name: "查看版本" });
  await expect(review).toHaveCount(2);

  const measurement = await page.evaluate(() => {
    const durations: number[] = [];
    const supported =
      PerformanceObserver.supportedEntryTypes.includes("longtask");
    const observer = supported
      ? new PerformanceObserver((list) => {
          durations.push(...list.getEntries().map((entry) => entry.duration));
        })
      : null;
    observer?.observe({ entryTypes: ["longtask"] });
    Object.assign(window, { __yeliHistoryDurations: durations });
    return { supported };
  });

  await review.last().click();
  await expect(panel.locator(".history-change-summary")).toBeVisible();
  await expect(panel.locator(".history-hunk")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "比较更改" })).toHaveCount(0);
  await expect(panel.locator(".history-source-preview")).toContainText("…");
  expect(
    await panel.locator(".history-source-preview").textContent(),
  ).toHaveLength(4_002);
  const maxLongTask = await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const durations = (
      window as unknown as {
        __yeliHistoryDurations: number[];
      }
    ).__yeliHistoryDurations;
    return Math.max(0, ...durations);
  });
  expect(measurement.supported).toBe(true);
  expect(maxLongTask).toBeLessThan(100);
  await expect(page.locator(".edit-document")).toContainText("After history");
});
