import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectShell } from "../../src/integrity/shell-projection.ts";
import {
  createArtifactContentPolicy,
  rewriteArtifactContentPolicy,
} from "../../src/integrity/content-policy.ts";

const artifactPath = path.resolve(
  process.env.YELI_TEST_ARTIFACT ?? "dist/html/starter.zh-CN.yeli.html",
);

test("reopens a downloaded compressed copy offline with its shell intact", async ({
  browserName,
  page,
}, testInfo) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) remoteRequests.push(request.url());
  });
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: /^(?:更多|菜单)$/u }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载更新副本" }).click();
  const outputPath = testInfo.outputPath("offline-saved-copy.yeli.html");
  await (await downloadPromise).saveAs(outputPath);

  const saved = readFileSync(outputPath, "utf8");
  expect(saved).toContain(
    `<!-- YELI_PROJECT_LICENSE\n${readFileSync(path.resolve("LICENSE"), "utf8")}-->`,
  );
  expect(saved).toContain('id="yeli-runtime"');
  expect(saved).toContain('id="yeli-runtime-css"');
  expect(saved).toContain('data-yeli-runtime="deflate-b86"');
  expect(saved).not.toContain("<style");
  expect(projectShell(saved).hash).toBe(
    projectShell(readFileSync(artifactPath, "utf8")).hash,
  );

  const reopen = await page.context().newPage();
  const reopenedRequests: string[] = [];
  reopen.on("request", (request) => {
    if (/^https?:/u.test(request.url())) reopenedRequests.push(request.url());
  });
  if (browserName === "webkit") {
    await page.context().route(/^https?:/u, (route) => route.abort());
  } else {
    await page.context().setOffline(true);
  }
  await reopen.goto(pathToFileURL(outputPath).href);
  await expect(
    reopen.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
  await expect(reopen.locator(".workspace-topbar")).toHaveCSS(
    "display",
    "grid",
  );
  await expect(reopen.locator(".workspace-topbar")).toHaveCSS(
    "background-color",
    "rgba(255, 255, 255, 0.96)",
  );
  expect(reopenedRequests).toEqual([]);
  expect(remoteRequests).toEqual([]);
  await reopen.close();
});

test("reports an unavailable decompressor while preserving readable document data", async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "DecompressionStream", { value: undefined });
  });
  await context.setOffline(true);
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) remoteRequests.push(request.url());
  });
  await page.goto(pathToFileURL(artifactPath).href);
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("无法启动页里。请尝试使用新版浏览器");
  await expect(alert.locator("details")).not.toHaveAttribute("open", "");
  await expect(alert.locator("pre")).toBeHidden();
  await alert.locator("summary").click();
  await expect(alert.locator("pre")).toContainText("DecompressionStream");
  await expect(page.locator(".workspace-shell")).toHaveCount(0);
  const payload = await page.locator("#yeli-doc").textContent();
  expect(JSON.parse(payload!) as { format?: string }).toMatchObject({
    format: "yeli/document",
  });
  expect(remoteRequests).toEqual([]);
});

for (const damage of ["invalid-symbol", "decoded-length"] as const) {
  test(`rejects ${damage} before mounting and preserves document data offline`, async ({
    context,
    page,
    browserName,
  }, testInfo) => {
    const original = readFileSync(artifactPath, "utf8");
    let damaged =
      damage === "invalid-symbol"
        ? original.replace(
            /(<script id="yeli-runtime" type="application\/yeli\+deflate-b86">)./u,
            '$1"',
          )
        : original.replace(
            /(inflate\("yeli-runtime",\d+,)(\d+)(\))/u,
            (_, prefix: string, length: string, suffix: string) =>
              `${prefix}${Number(length) + 1}${suffix}`,
          );
    expect(damaged).not.toBe(original);
    damaged = rewriteArtifactContentPolicy(
      damaged,
      createArtifactContentPolicy(damaged).policy,
    );
    const fixturePath = testInfo.outputPath(`${damage}.yeli.html`);
    writeFileSync(fixturePath, damaged, "utf8");
    if (browserName === "webkit") {
      await context.route(/^https?:/u, (route) => route.abort());
    } else {
      await context.setOffline(true);
    }
    const remoteRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/u.test(request.url())) remoteRequests.push(request.url());
    });
    await page.goto(pathToFileURL(fixturePath).href);
    await expect(page.getByRole("alert")).toContainText(
      damage === "invalid-symbol"
        ? "invalid character"
        : "Decompressed Yeli payload length mismatch",
    );
    await expect(page.locator(".workspace-shell")).toHaveCount(0);
    await expect(page.locator("#yeli-runtime-style")).toHaveCount(0);
    expect(
      JSON.parse((await page.locator("#yeli-doc").textContent())!),
    ).toMatchObject({
      format: "yeli/document",
    });
    expect(remoteRequests).toEqual([]);
  });
}
