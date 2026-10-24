import {
  expect,
  test,
  type Download,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { projectShell } from "../../src/integrity/shell-projection.ts";

const artifactPath = path.resolve("dist/html/starter.zh-CN.yeli.html");

interface LifecycleHarnessWindow extends Window {
  __yeliExternalChange: () => void;
  __yeliHandleEvents: string[];
}

test.beforeAll(() => {
  expect(existsSync(artifactPath)).toBe(true);
});

async function saveDownload(
  download: Download,
  testInfo: TestInfo,
  filename: string,
) {
  const outputPath = testInfo.outputPath(filename);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  await download.saveAs(outputPath);
  return outputPath;
}

function createFutureVersionArtifact(testInfo: TestInfo) {
  const artifact = readFileSync(artifactPath, "utf8");
  const futureTemplate = artifact.replace(
    '  "version": 1,',
    '  "version": 999,',
  );
  expect(futureTemplate).not.toBe(artifact);
  const futureArtifact = futureTemplate;
  const invalidPath = testInfo.outputPath("future-version.yeli.html");
  mkdirSync(path.dirname(invalidPath), { recursive: true });
  writeFileSync(invalidPath, futureArtifact, "utf8");
  return { futureArtifact, invalidPath };
}

async function openMoreMenu(page: Page) {
  const more = page.locator("[data-more-trigger]");
  await expect(more).toBeVisible();
  if ((await more.getAttribute("aria-expanded")) !== "true") {
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
  }
  await expect(page.locator(".more-popover")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "文件", exact: true }),
  ).toHaveCount(0);
}

async function appendToFirstParagraph(page: Page, text: string) {
  const paragraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type(text);
  await page.locator(".document-heading").click();
  await expect(paragraph).toContainText(text);
}

test("download fallback produces a complete YELI copy and keeps recovery active", async ({
  page,
}, testInfo) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await appendToFirstParagraph(page, " 保存副本验证");

  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "关于 页里" }).click();
  const about = page.getByRole("dialog", { name: "关于 页里" });
  await expect(about.getByText("下载新副本", { exact: true })).toBeVisible();
  await expect(about.locator(".about-share-note")).toContainText("可信来源");
  await expect(about.locator(".about-file-size")).toContainText("字节");
  await expect(about.locator(".about-file-size-bytes")).toContainText(
    `${statSync(artifactPath).size.toLocaleString()} 字节`,
  );
  const projectedBytes = Number(
    (await about.locator(".about-file-projected-bytes").textContent())?.replace(
      /\D/gu,
      "",
    ),
  );
  await about.getByRole("button", { name: "关闭" }).click();
  await openMoreMenu(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载更新副本" }).click();
  const download = await downloadPromise;
  const downloadedPath = await saveDownload(
    download,
    testInfo,
    "updated-copy.yeli.html",
  );

  const downloadedArtifact = readFileSync(downloadedPath, "utf8");
  expect(download.suggestedFilename()).toMatch(/\.yeli\.html$/u);
  expect(projectedBytes).toBe(statSync(downloadedPath).size);
  expect(downloadedArtifact).toContain('id="yeli-runtime"');
  expect(downloadedArtifact).toContain('data-yeli-runtime="deflate-b86"');
  expect(downloadedArtifact).not.toContain("<style");
  expect(downloadedArtifact).toContain("保存副本验证");
  expect(projectShell(downloadedArtifact).hash).toBe(
    projectShell(readFileSync(artifactPath, "utf8")).hash,
  );
  await openMoreMenu(page);
  await expect(page.locator("#more-save-state-description")).toHaveText(
    "未保存",
  );
});

test("generates a distinct no-network Export Preview", async ({ page }) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.locator(".document-title-input").fill("未保存的导出标题");
  await page.locator(".document-title-input").blur();
  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "导出只读 HTML" }).click();

  const dialog = page.getByRole("dialog", { name: "导出预览" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("只读文件 · 离线阅读");
  await expect(dialog.locator("iframe")).toHaveAttribute("sandbox", "");
  await expect(dialog.locator("iframe")).toHaveAttribute(
    "srcdoc",
    /Content-Security-Policy/u,
  );
  await expect(dialog.locator("iframe")).not.toHaveAttribute(
    "srcdoc",
    /<script/iu,
  );
  await expect(
    dialog.locator("iframe").contentFrame().getByRole("button", {
      name: "编辑",
    }),
  ).toHaveCount(0);
  await expect(
    dialog.locator("iframe").contentFrame().locator("[contenteditable]"),
  ).toHaveCount(0);
  await expect(
    dialog.locator("iframe").contentFrame().getByRole("heading", {
      name: "未保存的导出标题",
    }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "关闭" }).click();
  await expect(dialog).toHaveCount(0);
});

test("shows a recovery sheet for a future-version artifact and preserves its bytes", async ({
  page,
}, testInfo) => {
  const { futureArtifact, invalidPath } = createFutureVersionArtifact(testInfo);

  await page.goto(pathToFileURL(invalidPath).href);

  const dialog = page.getByRole("alertdialog", {
    name: "无法打开此文件",
  });
  await expect(dialog).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载原始文件" }).click();
  const download = await downloadPromise;
  const downloadedPath = await saveDownload(
    download,
    testInfo,
    "future-version-original.yeli.html",
  );
  expect(readFileSync(downloadedPath, "utf8")).toBe(futureArtifact);

  await dialog.getByRole("button", { name: "恢复 Markdown" }).click();
  await expect(
    page.getByRole("heading", { name: "页里" }).first(),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test("dismisses an invalid-file sheet safely and returns focus to More", async ({
  page,
}, testInfo) => {
  const { invalidPath } = createFutureVersionArtifact(testInfo);
  const openInvalidFile = async () => {
    await page.goto(pathToFileURL(invalidPath).href);
    const dialog = page.getByRole("alertdialog", {
      name: "无法打开此文件",
    });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  const moreButton = page.getByRole("button", { name: "更多" });

  let dialog = await openInvalidFile();
  await dialog.locator(".recovery-file-detail").click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "关闭" }).click();
  await expect(moreButton).toBeFocused();

  dialog = await openInvalidFile();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(moreButton).toBeFocused();

  dialog = await openInvalidFile();
  await expect(dialog).toBeVisible();
  await page.locator(".recovery-backdrop").click({ position: { x: 1, y: 1 } });
  await expect(dialog).toHaveCount(0);
  await expect(moreButton).toBeFocused();
});

test("requires confirmation before reconnecting byte-identical local history", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "历史版本" }).click();
  const history = page.getByRole("complementary", { name: "历史版本" });
  await expect(history).toContainText("本机存储");
  await page
    .getByRole("complementary", { name: "历史版本" })
    .getByRole("button", {
      name: "关闭",
    })
    .click();

  await page.reload();

  const dialog = page.getByRole("dialog", {
    name: "使用这份文件的已有历史？",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("与之前打开的文件内容一致");
  await dialog.getByRole("button", { name: "作为独立副本打开" }).click();
  await expect(dialog).toHaveCount(0);
});

test("restores a newer local recovery as one undoable change", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await appendToFirstParagraph(page, " 本地恢复验证");
  await page.waitForTimeout(1_000);

  await page.reload();
  const reconnect = page.getByRole("dialog", {
    name: "使用这份文件的已有历史？",
  });
  await expect(reconnect).toBeVisible();
  await reconnect.getByRole("button", { name: "使用已有历史" }).click();

  const recovery = page.getByRole("dialog", { name: "恢复未保存的更改？" });
  await expect(recovery).toContainText("本地恢复验证");
  await recovery.getByRole("button", { name: "恢复草稿" }).click();
  await expect(page.getByText(/本地恢复验证/u)).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  if ((page.viewportSize()?.width ?? 1_000) <= 820) {
    await page.getByRole("button", { name: "更多" }).click();
  }
  const undo = page.getByRole("button", { name: "撤销" });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByText(/本地恢复验证/u)).toHaveCount(0);
});

test("keeps an invalid recovery available without changing the document", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await appendToFirstParagraph(page, " 无效恢复验证");
  await page.waitForTimeout(1_000);

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yeli-local-v1", 1);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("IndexedDB open failed")),
      );
    });
    const transaction = database.transaction("entries", "readwrite");
    const store = transaction.objectStore("entries");
    const entries = await new Promise<Array<{ key: string; value: unknown }>>(
      (resolve, reject) => {
        const request = store.getAll();
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () =>
          reject(request.error ?? new Error("IndexedDB read failed")),
        );
      },
    );
    const recovery = entries.find((entry) => entry.key.startsWith("recovery:"));
    if (!recovery || typeof recovery.value !== "object" || !recovery.value) {
      throw new Error("Expected a persisted recovery snapshot");
    }
    const value = recovery.value as { source?: unknown };
    if (typeof value.source !== "string") {
      throw new Error("Expected recovery Markdown");
    }
    store.put({
      ...recovery,
      value: {
        ...recovery.value,
        assets: [],
        source: `${value.source}\n![missing](yeli-asset:sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824)\n`,
      },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("abort", () =>
        reject(transaction.error ?? new Error("IndexedDB write aborted")),
      );
      transaction.addEventListener("error", () =>
        reject(transaction.error ?? new Error("IndexedDB write failed")),
      );
    });
    database.close();
  });

  await page.reload();
  await page
    .getByRole("dialog", { name: "使用这份文件的已有历史？" })
    .getByRole("button", { name: "使用已有历史" })
    .click();

  const recovery = page.getByRole("dialog", { name: "恢复未保存的更改？" });
  await expect(recovery).toContainText("无效恢复验证");
  await recovery.getByRole("button", { name: "恢复草稿" }).click();

  await expect(
    page.getByText("无法读取这份草稿。当前文档未更改，草稿仍保留供稍后重试。"),
  ).toBeVisible();
  await expect(recovery).toBeVisible();
  await expect(page.locator("main")).not.toContainText("无效恢复验证");
});

test("truthfully reports when persistent browser recovery is unavailable", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto(pathToFileURL(artifactPath).href);
  await expect(
    page.getByText(
      "此页面无法自动保留草稿和历史版本，请及时下载副本保存修改。",
    ),
  ).toBeVisible();
  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "关于 页里" }).click();
  const about = page.getByRole("dialog", { name: "关于 页里" });
  await expect(about.locator(".about-recovery-status")).toHaveText(
    "本机恢复不可用",
  );
  await expect(about).not.toContainText(/继续保留恢复数据|恢复已启用/u);
  await about.getByRole("button", { name: "关闭" }).click();
  await openMoreMenu(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载更新副本" }).click();
  await saveDownload(await pending, testInfo, "without-recovery.yeli.html");
  await expect(page.locator(".toast")).toHaveText(
    "已准备新副本，请确认浏览器已完成下载。",
  );
});

for (const failure of ["permission-denied", "write-failed"] as const) {
  test(`explains ${failure} and offers a copy without exposing browser errors`, async ({
    page,
  }, testInfo) => {
    const artifact = readFileSync(artifactPath, "utf8");
    await page.addInitScript(
      ({ artifact, failure }) => {
        Object.defineProperty(window, "showOpenFilePicker", {
          configurable: true,
          value: () =>
            Promise.resolve([
              {
                name: "connected.yeli.html",
                getFile: () =>
                  Promise.resolve(
                    new File([artifact], "connected.yeli.html", {
                      type: "text/html",
                    }),
                  ),
                queryPermission: () =>
                  Promise.resolve(
                    failure === "permission-denied" ? "denied" : "granted",
                  ),
                requestPermission: () => Promise.resolve("denied"),
                createWritable: () =>
                  Promise.reject(
                    new DOMException(
                      "Internal write diagnostic",
                      "NotAllowedError",
                    ),
                  ),
              },
            ]),
        });
      },
      { artifact, failure },
    );
    await page.goto(pathToFileURL(artifactPath).href);
    await openMoreMenu(page);
    await page.getByRole("menuitem", { name: "打开文件", exact: true }).click();
    await page
      .getByRole("dialog", { name: "使用这份文件的已有历史？" })
      .getByRole("button", { name: "作为独立副本打开" })
      .click();
    await openMoreMenu(page);
    await page.getByRole("menuitem", { name: "保存", exact: true }).click();
    await expect(page.locator(".toast")).toContainText(
      failure === "permission-denied" ? "未获准修改原文件" : "无法写入原文件",
    );
    await expect(page.locator(".toast")).toContainText("保存副本");
    await expect(page.locator(".toast")).not.toContainText(
      /NotAllowedError|Internal write diagnostic/,
    );
    await openMoreMenu(page);
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "保存副本", exact: true }).click();
    const downloaded = await saveDownload(
      await download,
      testInfo,
      `${failure}.yeli.html`,
    );
    expect(readFileSync(downloaded, "utf8")).toContain('id="yeli-doc"');
  });
}

test("Save Copy detaches the original writable handle", async ({ page }) => {
  const artifact = readFileSync(artifactPath, "utf8");
  await page.addInitScript(
    ({ initialArtifact }) => {
      const harness = window as unknown as LifecycleHarnessWindow;
      harness.__yeliHandleEvents = [];
      Object.defineProperty(window, "showOpenFilePicker", {
        configurable: true,
        value: () =>
          Promise.resolve([
            {
              createWritable: () =>
                Promise.resolve({
                  close: () => {
                    harness.__yeliHandleEvents.push("close");
                    return Promise.resolve();
                  },
                  write: () => {
                    harness.__yeliHandleEvents.push("write");
                    return Promise.resolve();
                  },
                }),
              getFile: () =>
                Promise.resolve(
                  new File([initialArtifact], "connected.yeli.html", {
                    type: "text/html",
                  }),
                ),
              name: "connected.yeli.html",
              queryPermission: () => Promise.resolve("granted"),
            },
          ]),
      });
    },
    { initialArtifact: artifact },
  );
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "历史版本" }).click();
  await page
    .getByRole("complementary", { name: "历史版本" })
    .getByRole("button", {
      name: "关闭",
    })
    .click();
  await expect(
    page.getByRole("complementary", { name: "历史版本" }),
  ).toHaveCount(0);
  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "打开文件" }).click();
  await page
    .getByRole("dialog", { name: "使用这份文件的已有历史？" })
    .getByRole("button", { name: "作为独立副本打开" })
    .click();

  await openMoreMenu(page);
  const copyDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "保存副本" }).click();
  await copyDownload;

  await openMoreMenu(page);
  await expect(
    page.getByRole("menuitem", { name: "下载更新副本" }),
  ).toBeVisible();
  const saveDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载更新副本" }).click();
  await saveDownload;
  expect(
    await page.evaluate(
      () => (window as unknown as LifecycleHarnessWindow).__yeliHandleEvents,
    ),
  ).toEqual([]);
});

test("imports plain Markdown without introducing a source editor", async ({
  page,
}) => {
  await page.goto(pathToFileURL(artifactPath).href);
  await page.locator('input[type="file"]').setInputFiles({
    name: "plain.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Imported note\n\nPlain Markdown body.\n", "utf8"),
  });

  await expect(
    page.locator("#document-title", { hasText: "Imported note" }),
  ).toBeVisible();
  await expect(page.locator(".cm-editor")).toHaveCount(0);
  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "关于 页里" }).click();
  const about = page.getByRole("dialog", { name: "关于 页里" });
  await expect(
    about.getByRole("heading", { name: "保存后的文件" }),
  ).toBeVisible();
  await expect(about.locator(".about-file-size-label")).toHaveText(
    "保存后预计",
  );
  await expect(about.locator(".about-file-size-bytes")).not.toHaveText(
    `${Buffer.byteLength("# Imported note\n\nPlain Markdown body.\n", "utf8")} 字节`,
  );
  await about.getByRole("button", { name: "关闭" }).click();
  await openMoreMenu(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "导出 Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/u);
});

test("requires an explicit choice before overwriting an external change", async ({
  page,
}) => {
  const artifact = readFileSync(artifactPath, "utf8");
  await page.addInitScript(
    ({ initialArtifact }) => {
      const harness = window as unknown as LifecycleHarnessWindow;
      let current = initialArtifact;
      let pending = initialArtifact;
      harness.__yeliHandleEvents = [];
      harness.__yeliExternalChange = () => {
        current = "external change";
      };
      Object.defineProperty(window, "showOpenFilePicker", {
        configurable: true,
        value: () =>
          Promise.resolve([
            {
              createWritable: () =>
                Promise.resolve({
                  close: () => {
                    current = pending;
                    harness.__yeliHandleEvents.push("close");
                    return Promise.resolve();
                  },
                  write: (value: string | Blob) => {
                    harness.__yeliHandleEvents.push("write");
                    if (typeof value === "string") {
                      pending = value;
                      return Promise.resolve();
                    }
                    return value.text().then((text) => {
                      pending = text;
                    });
                  },
                }),
              getFile: () =>
                Promise.resolve(
                  new File([current], "connected.yeli.html", {
                    type: "text/html",
                  }),
                ),
              name: "connected.yeli.html",
              queryPermission: () => Promise.resolve("granted"),
            },
          ]),
      });
    },
    { initialArtifact: artifact },
  );
  await page.goto(pathToFileURL(artifactPath).href);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "历史版本" }).click();
  await page
    .getByRole("complementary", { name: "历史版本" })
    .getByRole("button", {
      name: "关闭",
    })
    .click();
  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "打开文件" }).click();
  await expect(page.getByRole("status")).toContainText("文件已打开");
  const reconnect = page.getByRole("dialog", {
    name: "使用这份文件的已有历史？",
  });
  await expect(reconnect).toBeVisible();
  await reconnect.getByRole("button", { name: "作为独立副本打开" }).click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const paragraph = page
    .locator('[data-block-kind="paragraph"] [contenteditable="true"]')
    .first();
  await paragraph.click();
  await paragraph.press("End");
  await paragraph.type(" 外部冲突验证");
  await paragraph.blur();
  await page.evaluate(() => {
    (window as unknown as LifecycleHarnessWindow).__yeliExternalChange();
  });

  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "保存", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "原文件已更改" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "重新载入外部文件" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "保存副本" })).toBeVisible();
  await dialog.getByRole("button", { name: "确认覆盖外部更改" }).click();

  await expect(dialog).toHaveCount(0);
  await openMoreMenu(page);
  await expect(page.locator("#more-save-state-description")).toContainText(
    "已保存",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as LifecycleHarnessWindow).__yeliHandleEvents,
    ),
  ).toEqual(["write", "close"]);
});
