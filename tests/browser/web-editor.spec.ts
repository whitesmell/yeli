import {
  test,
  expect,
  type Page,
  type Route,
  type TestInfo,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseYeliArtifact } from "../../src/format/parse.ts";
import { projectShell } from "../../src/integrity/shell-projection.ts";

test.use({ locale: "zh-CN" });

const site = path.resolve("dist/site");
let server: Server;
let origin: string;

function resource(url: string) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const file = path.resolve(
    site,
    `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`,
  );
  if (!file.startsWith(`${site}${path.sep}`) || !existsSync(file)) return null;
  const contentType = file.endsWith(".js")
    ? "text/javascript"
    : file.endsWith(".css")
      ? "text/css"
      : "text/html";
  return { body: readFileSync(file), contentType };
}

test.beforeAll(async () => {
  expect(existsSync(path.join(site, "editor/index.html"))).toBe(true);
  server = createServer((request, response) => {
    const found = resource(`http://localhost${request.url ?? "/"}`);
    if (!found) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": found.contentType });
    response.end(found.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

async function more(page: Page) {
  const trigger = page.locator("[data-more-trigger]");
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  await expect(page.locator(".more-popover")).toBeVisible();
}

async function openMarkdown(page: Page, source: string, name = "notes.md") {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "text/markdown",
    buffer: Buffer.from(source, "utf8"),
  });
}

async function openInitialNativeMarkdown(page: Page) {
  await page
    .getByRole("dialog", { name: "本机文档", exact: true })
    .getByRole("button", { name: "打开文件", exact: true })
    .click();
}

async function append(page: Page, text: string) {
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
  await paragraph.blur();
}

async function downloadMarkdown(page: Page) {
  await more(page);
  const pending = page.waitForEvent("download");
  await page.locator('[data-menu-action="save"]').click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.md$/u);
  const file = await download.path();
  if (!file) throw new Error("Missing Markdown download");
  return readFileSync(file, "utf8");
}

async function serveOrigin(page: Page, url: string) {
  await page.route(`${new URL(url).origin}/**`, async (route: Route) => {
    const found = resource(route.request().url());
    if (found) await route.fulfill(found);
    else await route.abort();
  });
  await page.goto(url);
}

function editorBundle() {
  const editor = readFileSync(path.join(site, "editor/index.html"), "utf8");
  const sources = [...editor.matchAll(/(?:src|href)="([^"]+)"/gu)].map(
    (match) => match[1]!,
  );
  const source = sources.find((candidate) => {
    if (/^(?:https?:|\/\/)/iu.test(candidate)) return false;
    return readFileSync(
      path.resolve(site, "editor", candidate),
      "utf8",
    ).includes("PCFkb2N0eXBlIGh0bWw");
  });
  if (!source) throw new Error("Missing same-origin web editor bundle");
  const file = path.resolve(site, "editor", source);
  return {
    code: readFileSync(file, "utf8"),
    file,
    scriptUrl: new URL(source, `${origin}/editor/`).href,
  };
}

interface WebTemplateMetadata {
  hash: string;
  path: string;
  shellHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function templateMetadata(): WebTemplateMetadata {
  const release: unknown = JSON.parse(
    readFileSync(path.join(site, "release.json"), "utf8"),
  );
  if (!isRecord(release) || !isRecord(release.editor))
    throw new Error("Missing release editor metadata");
  const template = release.editor.template;
  if (
    !isRecord(template) ||
    typeof template.hash !== "string" ||
    typeof template.path !== "string" ||
    typeof template.shellHash !== "string"
  )
    throw new Error("Missing release template metadata");
  return {
    hash: template.hash,
    path: template.path,
    shellHash: template.shellHash,
  };
}

async function downloadYeli(page: Page, testInfo: TestInfo) {
  await more(page);
  const pending = page.waitForEvent("download");
  await page.locator('[data-menu-action="export-yeli"]').click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.yeli\.html$/u);
  const target = testInfo.outputPath("web-export.yeli.html");
  mkdirSync(path.dirname(target), { recursive: true });
  await download.saveAs(target);
  return { bytes: readFileSync(target), target };
}

interface CapturedPrintFrame {
  sandbox: string | null;
  srcdoc: string;
  title: string;
}

async function capturePrintFrames(page: Page) {
  await page.addInitScript(() => {
    const frames: CapturedPrintFrame[] = [];
    const seen = new WeakSet<HTMLIFrameElement>();
    const inspect = () => {
      for (const frame of document.querySelectorAll<HTMLIFrameElement>(
        "iframe.print-frame",
      )) {
        if (seen.has(frame)) continue;
        seen.add(frame);
        frames.push({
          sandbox: frame.getAttribute("sandbox"),
          srcdoc: frame.srcdoc,
          title: frame.title,
        });
      }
    };
    new MutationObserver(inspect).observe(document, {
      childList: true,
      subtree: true,
    });
    Object.defineProperty(window, "__yeliPrintFrames", {
      configurable: true,
      value: frames,
    });
  });
}

async function printedFrames(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __yeliPrintFrames?: CapturedPrintFrame[];
        }
      ).__yeliPrintFrames ?? [],
  );
}

async function mockNativePrint(page: Page) {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      "contentWindow",
    );
    if (!descriptor?.get) return;
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      configurable: true,
      get() {
        const target = descriptor.get?.call(this) as Window | null;
        if (
          target &&
          !(target as Window & { __yeliPrintMocked?: boolean })
            .__yeliPrintMocked
        ) {
          Object.defineProperty(target, "__yeliPrintMocked", { value: true });
          Object.defineProperty(target, "print", {
            configurable: true,
            value: () => {},
          });
        }
        return target;
      },
    });
  });
}

async function replaceEditorBundle(
  page: Page,
  testInfo: TestInfo,
  transform: (code: string) => string,
) {
  const bundle = editorBundle();
  const changed = transform(bundle.code);
  expect(changed).not.toBe(bundle.code);
  const target = testInfo.outputPath("editor-bundle.js");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, changed, "utf8");
  await page.route(bundle.scriptUrl, (route) =>
    route.fulfill({
      body: changed,
      contentType: "text/javascript",
      status: 200,
    }),
  );
  return { bundle, target };
}

test("fresh visits and reloads offer New/Open without creating blank records", async ({
  page,
}) => {
  await page.goto(`${origin}/editor/`);
  const chooser = page.getByRole("dialog", { name: "本机文档", exact: true });
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText("暂无本机文档");
  await expect(
    chooser.getByRole("button", { name: "新建 Markdown", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(chooser).toBeVisible();
  await page.reload();
  await expect(chooser).toContainText("暂无本机文档");
  await chooser
    .getByRole("button", { name: "新建 Markdown", exact: true })
    .click();
  await expect(chooser).toHaveCount(0);
  await expect(page.locator(".workspace-shell.is-edit")).toBeVisible();
  await expect(page.locator(".document-title-input")).toBeFocused();
  await page.reload();
  await expect(
    chooser.getByRole("button", { name: /document\.md/ }),
  ).toHaveCount(1);
});

test("canceling the startup picker preserves guidance and shortcuts stay within the chooser", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Canceled", "AbortError")),
    });
  });
  await page.goto(`${origin}/editor/`);
  const chooser = page.getByRole("dialog", { name: "本机文档", exact: true });
  await expect(chooser).toBeVisible();
  await page.keyboard.press("Control+f");
  await expect(page.locator(".search-overlay")).toHaveCount(0);
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "打开文件", exact: true }).click();
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText("暂无本机文档");
  await chooser
    .getByRole("button", { name: "新建 Markdown", exact: true })
    .click();
  await expect(chooser).toHaveCount(0);
  await expect(page.locator(".workspace-shell.is-edit")).toBeVisible();
});

test("local guidance can be dismissed, stays dismissed on reload and can be reopened", async ({
  page,
}) => {
  await page.goto(`${origin}/editor/`);
  await openMarkdown(page, "# Guidance\n\nUnchanged Markdown.\n");
  const note = page.locator(".web-session-note");
  const body = page.locator(".workspace-body");
  const before = await body.boundingBox();
  await note
    .getByRole("button", { name: "关闭本地编辑说明", exact: true })
    .click();
  await expect(note).toHaveCount(0);
  await expect(page.locator("[data-more-trigger]")).toBeFocused();
  const after = await body.boundingBox();
  expect(after!.height).toBeGreaterThan(before!.height);
  expect(after!.y).toBeLessThan(before!.y);
  await page.reload();
  await page
    .getByRole("dialog", { name: "本机文档", exact: true })
    .getByRole("button", { name: /notes\.md/ })
    .click();
  await expect(note).toHaveCount(0);
  await more(page);
  await page.locator('[data-menu-action="web-guidance"]').click();
  await expect(
    note.getByRole("button", { name: "关闭本地编辑说明", exact: true }),
  ).toBeFocused();
  expect(await downloadMarkdown(page)).toBe(
    "# Guidance\n\nUnchanged Markdown.\n",
  );
  await page.reload();
  await expect(note).toBeVisible();
});

test("guidance preference failure stays usable and degraded storage remains visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      value: undefined,
      configurable: true,
    });
    Storage.prototype.getItem = () => {
      throw new DOMException("Synthetic blocked preference", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException(
        "Synthetic blocked preference",
        "QuotaExceededError",
      );
    };
    Storage.prototype.removeItem = () => {
      throw new DOMException("Synthetic blocked preference", "SecurityError");
    };
  });
  await page.goto(`${origin}/editor/`);
  const chooser = page.getByRole("dialog", { name: "本机文档", exact: true });
  await expect(chooser).toContainText("无法自动保留草稿");
  await chooser
    .getByRole("button", { name: "新建 Markdown", exact: true })
    .click();
  await page
    .getByRole("button", { name: "关闭本地编辑说明", exact: true })
    .click();
  await expect(page.locator(".web-session-note")).toHaveCount(0);
  await expect(page.locator(".web-storage-warning")).toContainText(
    "无法自动保留草稿",
  );
  await more(page);
  await page.locator('[data-menu-action="web-guidance"]').click();
  await expect(page.locator(".web-session-note")).toBeVisible();
  await more(page);
  await page.locator('[data-menu-action="focus"]').click();
  await expect(page.locator(".web-storage-warning")).toBeVisible();
  await expect(page.locator(".web-session-note")).toBeHidden();
});

for (const failure of ["hash", "missing"] as const) {
  test(`web template ${failure} failure disables only editable Yeli export`, async ({
    page,
  }, testInfo) => {
    await capturePrintFrames(page);
    await mockNativePrint(page);
    await replaceEditorBundle(page, testInfo, (code) => {
      if (failure === "hash") {
        const hash = templateMetadata().hash;
        if (!code.includes(`hash:\`${hash}\``))
          throw new Error("Embedded template hash is absent");
        return code.replace(`hash:\`${hash}\``, `hash:\`${"0".repeat(64)}\``);
      }
      if (!code.includes("new TextDecoder(`utf-8`,{fatal:!0})"))
        throw new Error("Embedded template decoder is absent");
      const stripped = code.replace(
        /Uint8Array\.from\(atob\(`[A-Za-z0-9+/=]+`\),e=>e\.charCodeAt\(0\)\)/u,
        "Uint8Array.from(atob(``),e=>e.charCodeAt(0))",
      );
      if (stripped === code)
        throw new Error("Embedded template bytes are absent");
      return stripped;
    });
    await page.goto(`${origin}/editor/`);
    await openMarkdown(
      page,
      "# Template failure\n\nOther exports stay available.\n",
    );
    await more(page);
    await expect(
      page.locator('[data-menu-action="export-yeli"]'),
    ).toBeDisabled();
    await expect(page.locator("#yeli-export-unavailable")).toContainText(
      failure === "hash" ? "字节校验" : "缺少导出模板",
    );
    await more(page);
    expect(await downloadMarkdown(page)).toBe(
      "# Template failure\n\nOther exports stay available.\n",
    );
    await more(page);
    await page.locator('[data-menu-action="export-html"]').click();
    const preview = page.getByRole("dialog", { name: "导出预览" });
    await expect(
      preview
        .locator("iframe")
        .contentFrame()
        .locator("main")
        .getByText("Other exports stay available.", { exact: true }),
    ).toBeVisible();
    await preview.getByRole("button", { name: "关闭" }).click();
    await more(page);
    await page.locator('[data-menu-action="print"]').click();
    await expect
      .poll(async () => (await printedFrames(page)).length)
      .toBeGreaterThan(0);
    await expect(page.locator("iframe.print-frame")).toHaveCount(0);
  });
}

test("web exports an offline editable Yeli copy without local state", async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(`${origin}/editor/`);
  const source = "# Web export\n\nEditable copy stays offline.\n";
  await openMarkdown(page, source, "web-export.md");
  const { bytes, target } = await downloadYeli(page, testInfo);
  const artifact = bytes.toString("utf8");
  const parsed = await parseYeliArtifact(artifact);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.markdown).toBe(source);
  expect(parsed.payload.assets).toEqual([]);
  expect(parsed.payload.settings).toEqual({});
  expect(artifact).not.toContain("localInstanceId");
  expect(artifact).not.toContain("contenteditable");
  expect(artifact).not.toContain("draft checkpoint");
  expect(projectShell(artifact).hash).toBe(templateMetadata().shellHash);
  expect(
    requests.filter(
      (url) =>
        !url.startsWith(`${origin}/editor/`) &&
        !url.startsWith(`${origin}/assets/`),
    ),
  ).toEqual([]);
  expect(requests.some((url) => url.endsWith("yeli-template.yeli.html"))).toBe(
    false,
  );
  await page.goto(pathToFileURL(target).href);
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator("main")).toContainText(
    "Editable copy stays offline.",
  );
});

test("web static HTML and browser printing share one inert committed snapshot", async ({
  page,
}) => {
  await capturePrintFrames(page);
  await mockNativePrint(page);
  await page.goto(`${origin}/editor/`);
  await openMarkdown(
    page,
    "# Static parity\n\nOne committed snapshot.\n",
    "static.md",
  );
  await more(page);
  await page.locator('[data-menu-action="export-html"]').click();
  const dialog = page.getByRole("dialog", { name: "导出预览" });
  const preview = dialog.locator("iframe");
  await expect(preview).toHaveAttribute("sandbox", "");
  const previewHtml = await preview.getAttribute("srcdoc");
  expect(previewHtml).toContain("One committed snapshot.");
  expect(previewHtml).not.toMatch(/<script/iu);
  await dialog.getByRole("button", { name: "关闭" }).click();
  await more(page);
  await page.locator('[data-menu-action="print"]').click();
  await expect
    .poll(async () => (await printedFrames(page)).length)
    .toBeGreaterThan(0);
  const [frame] = await printedFrames(page);
  expect(frame?.sandbox).toBe("allow-modals allow-same-origin");
  expect(frame?.srcdoc).toBe(previewHtml);
  expect(frame?.srcdoc).not.toMatch(/<script/iu);
  await expect(page.locator("iframe.print-frame")).toHaveCount(0);
});

test("built editor opens exact Markdown, edits with the shared canvas, downloads and restores draft/history", async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(`${origin}/editor/`);
  await expect(
    page.getByRole("dialog", { name: "本机文档", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".web-session-note")).toContainText("不上传文件");
  await expect(page.locator(".cm-editor")).toHaveCount(0);
  const exact =
    "\ufeff---\r\ntitle: Exact\r\ncustom: keep # untouched\r\n---\r\n\r\nExact body.\r\n";
  await openMarkdown(page, exact, "exact.md");
  expect(await downloadMarkdown(page)).toBe(exact);
  await openMarkdown(page, "# Note\n\nOriginal body.\n");
  await append(page, " draft checkpoint");
  // Explicit history open flushes the latest edit without waiting for debounce.
  await more(page);
  await page.locator('[data-menu-action="history"]').click();
  await expect(page.locator(".history-panel")).toContainText("本机存储");
  await expect(page.locator(".history-panel")).toContainText("本机");
  await page.reload();
  const chooser = page.getByRole("dialog", { name: "本机文档", exact: true });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: /notes\.md/ }).click();
  const recovery = page.getByRole("dialog", { name: "恢复未保存的更改？" });
  await expect(recovery).toContainText("draft checkpoint");
  await recovery.getByRole("button", { name: "恢复草稿" }).click();
  await expect(page.locator("main")).toContainText("draft checkpoint");
  expect(await downloadMarkdown(page)).toContain("draft checkpoint");
  await more(page);
  await expect(page.locator("#more-save-state-description")).toHaveText(
    "未保存",
  );
  await page.locator('[data-menu-action="history"]').click();
  await expect(page.locator(".history-panel")).toContainText("本机存储");
  expect(
    requests.filter(
      (url) =>
        !url.startsWith(`${origin}/editor/`) &&
        !url.startsWith(`${origin}/assets/`),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("same-name documents stay separate and switching flushes a final edit before 800ms", async ({
  page,
}) => {
  await page.goto(`${origin}/editor/`);
  await openMarkdown(page, "# One\n\nFirst body.\n", "same.md");
  await append(page, " last edit");
  await openMarkdown(page, "# Two\n\nSecond body.\n", "same.md");
  const confirm = page.getByRole("dialog", { name: "切换文档？" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "保留草稿并切换" }).click();
  await expect(page.locator("main")).toContainText("Second body.");
  await more(page);
  await page.locator('[data-menu-action="local-documents"]').click();
  const chooser = page.getByRole("dialog", { name: "本机文档", exact: true });
  await expect(chooser.getByRole("button", { name: /same\.md/ })).toHaveCount(
    2,
  );
  await chooser.getByRole("button", { name: /First body/ }).click();
  await page
    .getByRole("dialog", { name: "恢复未保存的更改？" })
    .getByRole("button", { name: "恢复草稿" })
    .click();
  await expect(page.locator("main")).toContainText("last edit");
  await more(page);
  await page.locator('[data-menu-action="new-markdown"]').click();
  await page
    .getByRole("dialog", { name: "切换文档？" })
    .getByRole("button", { name: "保留草稿并切换" })
    .click();
  await expect(page.locator("main")).not.toContainText("First body");
  await more(page);
  await page.locator('[data-menu-action="local-documents"]').click();
  await expect(
    page
      .getByRole("dialog", { name: "本机文档" })
      .getByRole("button", { name: /document\.md/ }),
  ).toHaveCount(1);
});

for (const profile of [
  {
    label: "pinned HTTPS",
    url: "https://yeli.zetury.com/editor/",
    allowed: true,
    disabled: false,
  },
  {
    label: "wrong HTTPS origin",
    url: "https://untrusted.example/editor/",
    allowed: false,
    disabled: false,
  },
  {
    label: "public HTTP",
    url: "http://public.example/editor/",
    allowed: false,
    disabled: false,
  },
  {
    label: "unavailable IndexedDB",
    url: "https://yeli.zetury.com/editor/",
    allowed: false,
    disabled: true,
  },
]) {
  test(`persistence boundary: ${profile.label}`, async ({ page }) => {
    if (profile.disabled)
      await page.addInitScript(() =>
        Object.defineProperty(window, "indexedDB", {
          value: undefined,
          configurable: true,
        }),
      );
    await serveOrigin(page, profile.url);
    await expect(
      page.getByRole("dialog", { name: "本机文档", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(
        profile.allowed ? ".web-session-note" : ".web-storage-warning",
      ),
    ).toContainText(profile.allowed ? "清理浏览器数据" : "无法自动保留草稿");
    await openMarkdown(page, "# Private\n\nLocal only.\n");
    expect(await downloadMarkdown(page)).toBe("# Private\n\nLocal only.\n");
    if (profile.allowed) {
      await page.reload();
      await expect(
        page.getByRole("dialog", { name: "本机文档" }),
      ).toBeVisible();
    } else {
      const keys = await page.evaluate(async () => {
        if (!window.indexedDB) return [];
        const databases = await indexedDB.databases();
        return databases.map((database) => database.name);
      });
      expect(keys).not.toContain("yeli-local-v1");
    }
  });
}

test("IndexedDB open failure keeps editing and downloads available", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException("Synthetic blocked storage", "SecurityError");
    };
  });
  await page.goto(`${origin}/editor/`);
  await expect(
    page.getByRole("dialog", { name: "本机文档", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".web-storage-warning")).toContainText(
    "无法自动保留草稿",
  );
  await openMarkdown(page, "# Available\n\nStill editable.\n");
  await append(page, " kept");
  expect(await downloadMarkdown(page)).toContain("Still editable. kept");
  await more(page);
  await page.locator('[data-menu-action="new-markdown"]').click();
  const confirm = page.getByRole("dialog", { name: "切换文档？" });
  await expect(
    confirm.getByRole("button", { name: "放弃修改并切换" }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator("main")).toContainText("Still editable. kept");
  expect(errors).toEqual([]);
});

test("real browser file handles survive IndexedDB and preserve direct/conflict/copy semantics", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Physical OPFS write/handle fixture uses Chromium's supported createWritable",
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: async () => {
        const directory = await navigator.storage.getDirectory();
        const handle = await directory.getFileHandle("physical.md", {
          create: true,
        });
        if ((await handle.getFile()).size === 0) {
          const writable = await handle.createWritable();
          await writable.write("# Physical\n\nReal handle body.\n");
          await writable.close();
        }
        return [handle];
      },
    });
  });
  await page.goto(`${origin}/editor/`);
  await openInitialNativeMarkdown(page);
  await expect(page.locator("main")).toContainText("Real handle body.");
  await append(page, " direct save");
  await more(page);
  await expect(page.locator('[data-menu-action="save"]')).toContainText(
    "保存到原 Markdown",
  );
  await page.locator('[data-menu-action="save"]').click();
  await expect(page.locator(".toast")).toContainText("已保存");
  await page.reload();
  await page
    .getByRole("dialog", { name: "本机文档" })
    .getByRole("button", { name: /physical\.md/ })
    .click();
  await expect(page.locator("main")).toContainText("direct save");
  await more(page);
  await expect(page.locator('[data-menu-action="save"]')).toContainText(
    "保存到原 Markdown",
  );
  await page.keyboard.press("Escape");
  await append(page, " local conflict draft");
  await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle("physical.md");
    const writable = await handle.createWritable();
    await writable.write("# External\n\nDisk changed.\n");
    await writable.close();
  });
  await more(page);
  await page.locator('[data-menu-action="save"]').click();
  const conflict = page.getByRole("alertdialog", { name: "原文件已更改" });
  await expect(conflict).toBeVisible();
  await conflict.getByRole("button", { name: "确认覆盖外部更改" }).click();
  await expect(conflict).toHaveCount(0);
  await more(page);
  const pending = page.waitForEvent("download");
  await page.locator('[data-menu-action="save-copy"]').click();
  await pending;
  await more(page);
  await expect(page.locator('[data-menu-action="save"]')).toContainText(
    "下载 Markdown",
  );
  const physical = await page.evaluate(async () =>
    (
      await (
        await (
          await navigator.storage.getDirectory()
        ).getFileHandle("physical.md")
      ).getFile()
    ).text(),
  );
  expect(physical).toContain("local conflict draft");
});

test("retained native disk changes preserve both local draft and disk version across reload", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Uses actual Chromium OPFS file handles",
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      value: async () => {
        const directory = await navigator.storage.getDirectory();
        const handle = await directory.getFileHandle("conflict.md", {
          create: true,
        });
        if ((await handle.getFile()).size === 0) {
          const writable = await handle.createWritable();
          await writable.write("# Original\n\nOriginal baseline.\n");
          await writable.close();
        }
        return [handle];
      },
    });
  });
  await page.goto(`${origin}/editor/`);
  await openInitialNativeMarkdown(page);
  await expect(page.locator("main")).toContainText("Original baseline.");
  await append(page, " local draft");
  await more(page);
  await page.locator('[data-menu-action="history"]').click();
  await page.evaluate(async () => {
    const handle = await (
      await navigator.storage.getDirectory()
    ).getFileHandle("conflict.md");
    const writable = await handle.createWritable();
    await writable.write("# Disk\n\nChanged on disk.\n");
    await writable.close();
  });
  await page.reload();
  await page
    .getByRole("dialog", { name: "本机文档" })
    .getByRole("button", { name: /conflict\.md/ })
    .click();
  const choice = page.getByRole("dialog", { name: "磁盘文件已更改" });
  await expect(choice).toBeVisible();
  await choice.getByRole("button", { name: "单独打开磁盘版本" }).click();
  await expect(page.locator("main")).toContainText("Changed on disk.");
  await more(page);
  await page.locator('[data-menu-action="local-documents"]').click();
  const chooser = page.getByRole("dialog", { name: "本机文档" });
  await expect(
    chooser.getByRole("button", { name: /conflict\.md/ }),
  ).toHaveCount(2);
  await chooser.getByRole("button", { name: /Original baseline/ }).click();
  await choice.getByRole("button", { name: "继续本机版本" }).click();
  await page
    .getByRole("dialog", { name: "恢复未保存的更改？" })
    .getByRole("button", { name: "恢复草稿" })
    .click();
  await expect(page.locator("main")).toContainText("local draft");
  await more(page);
  await page.locator('[data-menu-action="save"]').click();
  await expect(
    page.getByRole("alertdialog", { name: "原文件已更改" }),
  ).toBeVisible();
});

test("native permission denial downloads Markdown and retains local dirty draft", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Uses a real OPFS handle with a simulated permission response",
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      value: async () => {
        const handle = await (
          await navigator.storage.getDirectory()
        ).getFileHandle("denied.md", { create: true });
        const writable = await handle.createWritable();
        await writable.write("# Permission\n\nPermission baseline.\n");
        await writable.close();
        // Only permission responses are stubbed; content and structured cloning
        // still use an actual browser FileSystemFileHandle.
        Object.defineProperty(handle, "queryPermission", {
          value: () => Promise.resolve("denied"),
        });
        Object.defineProperty(handle, "requestPermission", {
          value: () => Promise.resolve("denied"),
        });
        return [handle];
      },
    });
  });
  await page.goto(`${origin}/editor/`);
  await openInitialNativeMarkdown(page);
  await expect(page.locator("main")).toContainText("Permission baseline.");
  await append(page, " denied edit");
  expect(await downloadMarkdown(page)).toContain("denied edit");
  await more(page);
  await expect(page.locator("#more-save-state-description")).toHaveText(
    "保存失败",
  );
  await expect(page.locator(".save-state.is-error.is-dirty")).toBeVisible();
  await page.locator('[data-menu-action="local-documents"]').click();
  await expect(
    page
      .getByRole("dialog", { name: "本机文档" })
      .getByRole("button", { name: /denied\.md/ }),
  ).toContainText("有本机草稿");
});

test("English narrow-screen editor keeps file actions and keyboard focus usable", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("yeli:locale", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/editor/`);
  await page
    .getByRole("dialog", { name: "Local documents", exact: true })
    .getByRole("button", { name: "New Markdown", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Dismiss local editing guidance",
      exact: true,
    })
    .click();
  await more(page);
  await page.locator('[data-menu-action="web-guidance"]').click();
  await expect(
    page.getByRole("button", {
      name: "Dismiss local editing guidance",
      exact: true,
    }),
  ).toBeFocused();
  await more(page);
  await expect(page.locator('[data-menu-action="save"]')).toContainText(
    "Download Markdown",
  );
  await page.locator('[data-menu-action="local-documents"]').click();
  const chooser = page.getByRole("dialog", {
    name: "Local documents",
    exact: true,
  });
  await expect(chooser).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await chooser.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".web-documents-dialog")).toHaveCount(0);
  await expect(page.locator("[data-more-trigger]")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await more(page);
  await page.locator('[data-menu-action="about"]').click();
  await expect(page.locator(".about-description")).toContainText(
    "no file is uploaded",
  );
});
