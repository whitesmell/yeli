import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDocumentPayload } from "../../src/document/model.ts";
import { fingerprintArtifact } from "../../src/format/save.ts";
import {
  createArtifactFileAdapter,
  createWebFileAdapter,
} from "../../src/host/adapters.ts";
import {
  createArtifactHost,
  createWebHost,
  saveFilenameForHost,
  saveKindForHost,
} from "../../src/host/host.ts";
import {
  isMarkdownFilename,
  markdownFingerprint,
  markdownSaveDisclosure,
  markdownSavePlan,
  openMarkdownFile,
  readMarkdownFile,
} from "../../src/host/markdown-files.ts";
import {
  writeArtifactToHandle,
  writeMarkdownToHandle,
  type FileHandleLike,
} from "../../src/storage/file-handles.ts";
import { sourceHash } from "../../src/editor/source-ranges.ts";

afterEach(() => vi.unstubAllGlobals());

describe("host file adapters", () => {
  it("recognizes Markdown names without treating .yeli.html as Markdown", () => {
    expect(isMarkdownFilename("notes.md")).toBe(true);
    expect(isMarkdownFilename("NOTES.MD")).toBe(true);
    expect(isMarkdownFilename("notes.yeli.html")).toBe(false);
    expect(isMarkdownFilename("notes.html")).toBe(false);
  });

  it("opens Markdown and Yeli in the artifact adapter with explicit handle retention", async () => {
    const adapter = createArtifactFileAdapter();
    const markdown = new File(["# Imported\n"], "notes.md", {
      type: "text/markdown",
    });
    const yeli = new File(
      ['<script id="yeli-doc" type="application/yeli+json">{}</script>'],
      "notes.yeli.html",
      { type: "text/html" },
    );
    const handle = fakeHandle({ current: "# Imported\n", events: [] });

    const markdownResult = await adapter.openFile(markdown, handle);
    expect(markdownResult).toMatchObject({
      document: { artifactKind: "markdown", markdown: "# Imported\n" },
      ok: true,
    });
    expect(adapter.retainHandleOnOpen(markdown, handle)).toBeNull();
    expect(adapter.retainHandleOnOpen(yeli, handle)).toBe(handle);
  });

  it("accepts only .md through the web adapter", async () => {
    const adapter = createWebFileAdapter();
    const markdown = new File(["\ufeff# Web\r\n"], "web.md", {
      type: "text/markdown",
    });

    await expect(adapter.openFile(markdown, null)).resolves.toMatchObject({
      document: { artifactKind: "markdown" },
      ok: true,
    });
    const htmlResult = await adapter.openFile(
      new File(["<!doctype html><title>HTML</title>"], "page.html", {
        type: "text/html",
      }),
      null,
    );
    expect(htmlResult.ok).toBe(false);
    expect(htmlResult).toHaveProperty("error");
    const yeliResult = await adapter.openFile(
      new File(
        ['<script id="yeli-doc" type="application/yeli+json">{}</script>'],
        "document.yeli.html",
        { type: "text/html" },
      ),
      null,
    );
    expect(yeliResult.ok).toBe(false);
    expect(yeliResult).toHaveProperty("error");
  });

  it("uses the system picker for web Markdown and passes the handle to open", async () => {
    const adapter = createWebFileAdapter();
    const file = new File(["# Picked\n"], "picked.md", {
      type: "text/markdown",
    });
    const handle = fakeHandle({ current: "# Picked\n", events: [] });
    const picker = vi.fn().mockResolvedValue([handle]);
    const fallback = vi.fn();
    const open = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("showOpenFilePicker", picker);
    vi.spyOn(handle, "getFile").mockResolvedValue(file);

    await adapter.chooseFile(fallback, open);

    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeAcceptAllOption: true,
        multiple: false,
        types: [
          {
            accept: { "text/markdown": [".md"] },
            description: "Markdown",
          },
        ],
      }),
    );
    expect(fallback).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(file, handle);
    expect(picker.mock.contexts[0]).toBe(window);
  });

  it("falls back to the file input when the web system picker is absent", async () => {
    const adapter = createWebFileAdapter();
    const fallback = vi.fn();
    const open = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("showOpenFilePicker", undefined);

    await adapter.chooseFile(fallback, open);

    expect(fallback).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });

  it("leaves cancellation silent without falling back to an input", async () => {
    const picker = vi
      .fn()
      .mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    vi.stubGlobal("showOpenFilePicker", picker);
    const fallback = vi.fn();
    const open = vi.fn();

    await expect(
      createWebFileAdapter().chooseFile(fallback, open),
    ).resolves.toBeUndefined();

    expect(fallback).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("propagates picker failures without opening another picker", async () => {
    const failure = new DOMException("Denied", "NotAllowedError");
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockRejectedValue(failure));
    const fallback = vi.fn();

    await expect(
      createWebFileAdapter().chooseFile(fallback, vi.fn()),
    ).rejects.toBe(failure);

    expect(fallback).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 Markdown instead of replacing physical bytes", async () => {
    const bytes = [0x23, 0x20, 0xc0, 0xaf, 0x0a];
    const file = new File([new Uint8Array(bytes)], "invalid.md");

    await expect(createWebFileAdapter().openFile(file, null)).rejects.toThrow();

    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual(bytes);
  });
});

describe("host save policy", () => {
  it("keeps artifact-host Markdown saves as .yeli.html regardless of provenance", async () => {
    const opened = await openMarkdownFile(
      "---\ntitle: Imported artifact Markdown\n---\n\n# Body\n",
    );
    const artifactHost = createArtifactHost(
      { document: opened, ok: true },
      "<!doctype html>",
    );

    expect(opened.artifactKind).toBe("markdown");
    expect(saveKindForHost(artifactHost)).toBe("artifact");
    expect(saveFilenameForHost(artifactHost, opened.payload)).toBe(
      "Imported artifact Markdown.yeli.html",
    );
  });

  it("uses the web host even when an opened document reports artifact provenance", async () => {
    const payload = await createDocumentPayload(
      "---\ntitle: Initial\n---\n\n# Body\n",
      {
        docId: "web-policy-document",
      },
    );
    const opened = {
      artifact: "<!doctype html>",
      artifactKind: "yeli" as const,
      fingerprint: fingerprintArtifact("<!doctype html>"),
      freshness: {
        agentSummary: { status: "absent" as const },
        manifest: { status: "fresh" as const, value: payload.manifest },
        sourceHash: payload.manifest.sourceHash,
      },
      markdown: "# Initial\n",
      payload,
      releaseTemplate: "<!doctype html>",
    };
    const webHost = createWebHost({ document: opened, ok: true });

    expect(opened.artifactKind).toBe("yeli");
    expect(saveKindForHost(webHost)).toBe("markdown");
    expect(saveFilenameForHost(webHost, opened.payload)).toBe("Initial.md");
  });

  it("plans web Markdown saves and discloses exact UTF-8 source bytes without a release template", async () => {
    const source = "---\r\ntitle: 页里\r\n---\r\nBody\r\n";
    const opened = await openMarkdownFile(source);
    const host = createWebHost({ document: opened, ok: true });
    const plan = markdownSavePlan(source, opened.payload, false);
    const disclosure = markdownSaveDisclosure(opened, source, true);

    expect(host.releaseTemplate).toBe("");
    expect(plan).toEqual({
      bytes: new TextEncoder().encode(source).byteLength,
      content: source,
      filename: "页里.md",
      mode: "download",
    });
    expect(disclosure).toEqual({
      currentBytes: new TextEncoder().encode(source).byteLength,
      documentFingerprint: opened.fingerprint,
      projectedBytes: new TextEncoder().encode(source).byteLength,
      sourceHash: sourceHash(source),
    });
    expect(disclosure.currentBytes).toBeGreaterThan(
      new TextEncoder().encode(opened.payload.markdown.lines.join("\n"))
        .byteLength,
    );
  });

  it("keeps Markdown disclosure valid after edits and for CRLF/BOM source", async () => {
    const initial = "# Initial\r\n\r\nBody\r\n";
    const opened = await openMarkdownFile(initial);
    const disclosure = markdownSaveDisclosure(
      opened,
      "# Changed\r\n\r\nBody\r\n",
      true,
    );
    const bom = new Uint8Array([
      0xef, 0xbb, 0xbf, 0x23, 0x20, 0x42, 0x4f, 0x4d, 0x0a,
    ]);
    const read = await readMarkdownFile({
      arrayBuffer: () => Promise.resolve(bom.buffer),
    });
    const bomOpened = await openMarkdownFile(read);
    const bomDisclosure = markdownSaveDisclosure(bomOpened, read, false);

    expect(disclosure.sourceHash).toBe(sourceHash("# Changed\r\n\r\nBody\r\n"));
    expect(disclosure.currentBytes).toBe(
      new TextEncoder().encode("# Changed\r\n\r\nBody\r\n").byteLength,
    );
    expect(disclosure.projectedBytes).toBe(disclosure.currentBytes);
    expect(read).toBe("\ufeff# BOM\n");
    expect([...new TextEncoder().encode(read)]).toEqual([...bom]);
    expect(bomOpened.fingerprint).toBe(markdownFingerprint(read));
    expect(bomOpened.fingerprint).not.toBe(markdownFingerprint("# BOM\n"));
    expect(bomDisclosure.sourceHash).toBe(sourceHash(read));
    expect(bomDisclosure.currentBytes).toBe(bom.byteLength);
  });
});

describe("Markdown direct writes", () => {
  it("retains artifact text decoding and fingerprint behavior when raw bytes are available", async () => {
    const file = new File(["\ufefforiginal artifact"], "notes.yeli.html");
    const readBytes = vi.spyOn(file, "arrayBuffer");
    const events: string[] = [];
    const handle = fakeHandle({ current: "", events });
    handle.getFile = () => Promise.resolve(file);

    const result = await writeArtifactToHandle(
      handle,
      "next artifact",
      fingerprintArtifact("original artifact"),
    );

    expect(result.ok).toBe(true);
    expect(readBytes).not.toHaveBeenCalled();
    expect(events).toEqual(["write:next artifact", "close"]);
  });

  it("preserves BOM and CRLF bytes through web open and direct write", async () => {
    const source = "\ufeff# 页里\r\n\r\nBody\r\n";
    const bytes = new TextEncoder().encode(source);
    const file = new File([bytes], "bom.md");
    const result = await createWebFileAdapter().openFile(file, null);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const handle = fakeHandle({ current: source, events: [] });
    const writer = await handle.createWritable();
    const write = vi.spyOn(writer, "write");
    handle.createWritable = () => Promise.resolve(writer);

    expect(await file.text()).toBe(source.slice(1));
    expect(result.document.markdown).toBe(source);
    expect(result.document.fingerprint).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    const saved = await writeMarkdownToHandle(
      handle,
      result.document.markdown,
      result.document.fingerprint,
    );

    expect(saved).toMatchObject({
      fingerprint: result.document.fingerprint,
      ok: true,
    });
    expect(write).toHaveBeenCalledWith(source);
  });

  it.each([
    ["# Text\r\n", "\ufeff# Text\r\n"],
    ["\ufeff# Text\r\n", "# Text\r\n"],
  ])(
    "detects a physical BOM change from %j to %j",
    async (opened, external) => {
      const events: string[] = [];
      const handle = fakeHandle({ current: external, events });
      const result = await writeMarkdownToHandle(
        handle,
        opened,
        markdownFingerprint(opened),
      );

      expect(result).toMatchObject({
        actualFingerprint: createHash("sha256").update(external).digest("hex"),
        ok: false,
        reason: "external-conflict",
      });
      expect(events).toEqual([]);
    },
  );

  it("uses the physical source fingerprint so CRLF files remain conflict-free", async () => {
    const source = "# Windows\r\n\r\nBody\r\n";
    const opened = await openMarkdownFile(source);
    const events: string[] = [];
    const handle = fakeHandle({ current: source, events });

    expect(opened.fingerprint).toBe(markdownFingerprint(source));
    expect(opened.fingerprint).not.toBe(opened.payload.manifest.sourceHash);
    const result = await writeMarkdownToHandle(
      handle,
      source,
      opened.fingerprint,
    );

    expect(result).toMatchObject({
      fingerprint: fingerprintArtifact(source),
      ok: true,
    });
    expect(events).toEqual([`write:${source}`, "close"]);
  });

  it("writes nothing on a direct-write conflict", async () => {
    const events: string[] = [];
    const handle = fakeHandle({ current: "external change\n", events });

    const result = await writeMarkdownToHandle(
      handle,
      "local change\n",
      fingerprintArtifact("opened source\n"),
    );

    expect(result).toMatchObject({
      actualFingerprint: fingerprintArtifact("external change\n"),
      ok: false,
      reason: "external-conflict",
    });
    expect(events).toEqual([]);
  });

  it("reports success only after the writable stream closes", async () => {
    const events: string[] = [];
    const handle: FileHandleLike = {
      createWritable() {
        return Promise.resolve({
          close() {
            events.push("close");
            return Promise.resolve();
          },
          write(value) {
            events.push(
              `write:${typeof value === "string" ? value : "[blob]"}`,
            );
            return Promise.resolve();
          },
        });
      },
      getFile() {
        return Promise.resolve({ text: () => Promise.resolve("opened\n") });
      },
      name: "notes.md",
    };

    const result = await writeMarkdownToHandle(
      handle,
      "saved\n",
      fingerprintArtifact("opened\n"),
    );

    expect(events).toEqual(["write:saved\n", "close"]);
    expect(result).toMatchObject({
      fingerprint: fingerprintArtifact("saved\n"),
      ok: true,
    });
  });
});

function fakeHandle({
  current,
  events,
}: {
  current: string;
  events: string[];
}): FileHandleLike {
  const handle = {
    createWritable() {
      return Promise.resolve({
        close() {
          events.push("close");
          return Promise.resolve();
        },
        write(value) {
          events.push(`write:${typeof value === "string" ? value : "[blob]"}`);
          return Promise.resolve();
        },
      });
    },
    getFile() {
      return Promise.resolve({
        arrayBuffer: () =>
          Promise.resolve(new TextEncoder().encode(current).buffer),
        text: () => Promise.resolve(current),
      });
    },
    name: "notes.md",
  } satisfies FileHandleLike;
  return handle;
}
