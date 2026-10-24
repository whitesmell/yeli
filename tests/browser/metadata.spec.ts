import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseYeliArtifact } from "../../src/format/parse.ts";
import { projectShell } from "../../src/integrity/shell-projection.ts";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");
const source =
  '---\ntitle: Property fixture\nlang: zh-CN\n# keep this comment\nproject: "Yeli"\nrating: 1 # score\npublished: false\nreview: 2026-10-24\nrelated: ["one, two", three]\ncount: 9007199254740993\nextra: {owner: Ada}\n---\n\n# Body\n\nUntouched paragraph.\n';

async function openProperties(page: Page, markdown = source) {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(markdown),
    mimeType: "text/markdown",
    name: "properties.md",
  });
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: "添加文档属性", exact: true }).click();
  return page.getByRole("complementary", { name: "属性面板" });
}

test("typed metadata survives save/reopen with narrow source changes and shell fidelity", async ({
  page,
  browser,
}, testInfo) => {
  const panel = await openProperties(page);
  await expect(panel.getByLabel("project", { exact: true })).toHaveValue(
    "Yeli",
  );
  await expect(panel.getByLabel("related", { exact: true })).toHaveValue(
    "one, two\nthree",
  );
  await expect(panel.locator('[data-property-key="extra"]')).toContainText(
    "已保留原始结构",
  );
  await expect(panel.locator('[data-property-key="count"]')).toContainText(
    "9007199254740993",
  );
  await expect(panel.getByLabel("count", { exact: true })).toHaveCount(0);
  const rating = panel.getByLabel("rating", { exact: true });
  await rating.fill("2.5");
  await rating.press("Enter");
  await panel.getByRole("switch", { name: "published" }).check();
  await panel.getByLabel("review", { exact: true }).fill("2026-11-02");
  await panel.getByLabel("review", { exact: true }).blur();
  await panel.getByRole("button", { name: "添加属性", exact: true }).click();
  await panel.getByLabel("属性名称", { exact: true }).fill("project");
  await panel.getByRole("button", { name: "添加属性", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("此名称已被使用");
  await panel.getByLabel("属性名称", { exact: true }).fill("priority");
  await panel.getByLabel("类型", { exact: true }).selectOption("number");
  await panel.getByLabel("属性值", { exact: true }).fill("3");
  await panel.getByRole("button", { name: "添加属性", exact: true }).click();
  await expect(panel.getByLabel("priority", { exact: true })).toHaveValue("3");
  await panel
    .getByRole("button", { name: "移除属性 project", exact: true })
    .click();
  await expect(panel.getByLabel("project", { exact: true })).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) <= 820) {
    await panel.getByRole("button", { name: "收起属性面板" }).click();
    await page.getByRole("button", { name: "更多", exact: true }).click();
    await page.locator('[data-command-id="document.undo"]:visible').click();
    await page
      .getByRole("button", { name: "添加文档属性", exact: true })
      .click();
  } else {
    await page.getByRole("button", { name: "撤销", exact: true }).click();
  }
  await expect(panel.getByLabel("project", { exact: true })).toHaveValue(
    "Yeli",
  );

  await panel.getByRole("button", { name: "收起属性面板" }).click();
  await page.getByRole("button", { name: "更多", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.locator('[data-menu-action="save-copy"]').click();
  const saved = testInfo.outputPath("properties.yeli.html");
  mkdirSync(path.dirname(saved), { recursive: true });
  await (await pending).saveAs(saved);
  const html = readFileSync(saved, "utf8");
  const parsed = await parseYeliArtifact(html);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.markdown).toBe(
    source
      .replace("rating: 1", "rating: 2.5")
      .replace("published: false", "published: true")
      .replace("review: 2026-10-24", "review: 2026-11-02")
      .replace("extra: {owner: Ada}\n", "extra: {owner: Ada}\npriority: 3\n"),
  );
  expect(projectShell(html).hash).toBe(
    projectShell(readFileSync(artifactPath, "utf8")).hash,
  );

  const reopenedContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1280, height: 720 },
    isMobile: testInfo.project.name.includes("mobile"),
    hasTouch: testInfo.project.name.includes("mobile"),
    locale: "zh-CN",
  });
  try {
    const reopened = await reopenedContext.newPage();
    await reopened.goto(pathToFileURL(saved).href);
    await reopened.getByRole("button", { name: "编辑", exact: true }).click();
    await reopened
      .getByRole("button", { name: "添加文档属性", exact: true })
      .click();
    const properties = reopened.getByRole("complementary", {
      name: "属性面板",
    });
    await expect(
      properties.getByRole("switch", { name: "published" }),
    ).toBeChecked();
    await expect(
      properties.getByLabel("priority", { exact: true }),
    ).toHaveValue("3");
    await expect(properties.getByLabel("review", { exact: true })).toHaveValue(
      "2026-11-02",
    );
    await properties.screenshot({
      path: testInfo.outputPath("metadata-panel.png"),
    });
  } finally {
    await reopenedContext.close();
  }
});

test("metadata drafts cancel, retain focus, and reject an empty number", async ({
  page,
}) => {
  const panel = await openProperties(page);
  const project = panel.getByLabel("project", { exact: true });
  await project.fill("Cancelled");
  await project.press("Escape");
  await expect(project).toHaveValue("Yeli");
  const rating = panel.getByLabel("rating", { exact: true });
  await rating.fill("");
  await rating.blur();
  await expect(rating).toHaveAttribute("aria-invalid", "true");
  await expect(panel.getByRole("alert")).toContainText("有效值");
  await rating.focus();
  await rating.press("Escape");
  await expect(rating).toHaveValue("1");
  await project.fill("Updated");
  await rating.click();
  await expect(rating).toBeFocused();
  await expect(project).toHaveValue("Updated");
  await expect(page.locator(".metadata-status")).toHaveCount(0);
  await expect(page.locator(".metadata-row")).not.toContainText("草稿");
  await panel.getByRole("button", { name: "收起属性面板" }).click();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator(".metadata-status")).toHaveCount(0);
  await expect(page.locator(".read-heading")).not.toContainText("草稿");
});

test("creates each property type with its portable YAML value", async ({
  page,
}, testInfo) => {
  const panel = await openProperties(page);
  const fields = [
    { key: "text-value", type: "text", value: "false" },
    { key: "number-value", type: "number", value: "0" },
    { key: "switch-value", type: "boolean", value: "true" },
    { key: "date-value", type: "date", value: "2026-11-02" },
    { key: "list-value", type: "list", value: "one, two\nthree" },
  ];
  for (const field of fields) {
    await panel.getByRole("button", { name: "添加属性", exact: true }).click();
    await panel.getByLabel("属性名称", { exact: true }).fill(field.key);
    await panel.getByLabel("类型", { exact: true }).selectOption(field.type);
    const input = panel.getByLabel("属性值", { exact: true });
    if (field.type === "boolean") await input.selectOption(field.value);
    else await input.fill(field.value);
    await panel.getByRole("button", { name: "添加属性", exact: true }).click();
    await expect(panel.locator(".property-add").last()).toBeFocused();
  }
  await expect(
    panel.getByRole("switch", { name: "switch-value" }),
  ).toBeChecked();
  await expect(panel.getByLabel("list-value", { exact: true })).toHaveValue(
    "one, two\nthree",
  );
  await panel.getByRole("button", { name: "收起属性面板" }).click();
  await page.getByRole("button", { name: "更多", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.locator('[data-menu-action="save-copy"]').click();
  const saved = testInfo.outputPath("created-types.yeli.html");
  mkdirSync(path.dirname(saved), { recursive: true });
  await (await pending).saveAs(saved);
  const parsed = await parseYeliArtifact(readFileSync(saved, "utf8"));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.markdown).toBe(
    source.replace(
      "extra: {owner: Ada}\n",
      'extra: {owner: Ada}\ntext-value: "false"\nnumber-value: 0\nswitch-value: true\ndate-value: 2026-11-02\nlist-value: ["one, two", three]\n',
    ),
  );
});

test("unsafe YAML disables metadata editing without changing the document", async ({
  page,
}) => {
  const panel = await openProperties(
    page,
    "---\ntitle: One\ntitle: Two\n---\n\n# Body\n",
  );
  await expect(panel.getByRole("alert")).toContainText("文档属性暂不可修改");
  await expect(
    panel.getByRole("button", { name: "添加属性", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".metadata-inline-input")).toBeDisabled();
  await expect(page.locator(".document-title-input")).toHaveAttribute(
    "readonly",
  );
});
