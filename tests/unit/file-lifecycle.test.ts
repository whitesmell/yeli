import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStore } from "../../src/document/store.ts";
import { createDocumentPayload } from "../../src/document/model.ts";
import * as fileSave from "../../src/format/save.ts";
import { openYeliArtifact } from "../../src/format/open.ts";
import { createConstructPatch } from "../../src/editor/block-projection.ts";
import {
  serializePayloadBlock,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
  YELI_AGENT_PREAMBLE,
} from "../../src/format/serialize.ts";
import { createArtifactHost, createWebHost } from "../../src/host/host.ts";
import type { YeliHost } from "../../src/host/contracts.ts";
import { en, type Labels } from "../../src/i18n/en.ts";
import { zhCN } from "../../src/i18n/zh-CN.ts";
import { openMarkdownFile } from "../../src/host/markdown-files.ts";
import {
  describeWebTemplate,
  validateWebTemplate,
} from "../../src/host/web-template.ts";
import { buildStaticPreviewHtml } from "../../src/format/static-shell-preview.ts";
import { parseYeliArtifact } from "../../src/format/parse.ts";
import { projectShell } from "../../src/integrity/shell-projection.ts";
import * as documentModel from "../../src/document/model.ts";
import * as printExport from "../../src/export/print.ts";
import { WebSessionRepository } from "../../src/storage/web-sessions.ts";
import type { FileHandleLike } from "../../src/storage/file-handles.ts";
import {
  LocalDocumentRepository,
  MemoryStorageAdapter,
  type StoredVersion,
} from "../../src/storage/recovery.ts";
import { useDocumentStore } from "../../src/ui/use-document-store.ts";
import {
  refreshHistoryPanel,
  useFileLifecycle,
} from "../../src/ui/use-file-lifecycle.ts";

const recoveryPolicy = vi.hoisted(() => ({ allowed: true }));
vi.mock("../../src/storage/recovery-policy.ts", () => ({
  persistentRecoveryAllowed: () => recoveryPolicy.allowed,
}));

vi.mock("../../src/storage/recovery.ts", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/storage/recovery.ts")>();
  return {
    ...original,
    IndexedDbStorageAdapter: original.MemoryStorageAdapter,
  };
});

describe("file lifecycle history ordering", () => {
  it("does not reopen History when another rail supersedes a pending refresh", async () => {
    let resolveVersions: ((versions: StoredVersion[]) => void) | undefined;
    const versions = new Promise<StoredVersion[]>((resolve) => {
      resolveVersions = resolve;
    });
    let historyOpen = false;

    const pending = refreshHistoryPanel({
      localInstanceId: "local-history",
      listVersions: () => versions,
      onFailure: () => undefined,
      onOpen: () => {
        historyOpen = true;
      },
      onVersions: () => undefined,
    });

    expect(historyOpen).toBe(true);
    historyOpen = false;
    resolveVersions?.([]);
    await pending;

    expect(historyOpen).toBe(false);
  });
});

let cleanup: (() => void) | undefined;
beforeEach(() => {
  recoveryPolicy.allowed = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  window.history.replaceState(null, "", "/");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mountLifecycle(
  host: YeliHost = createWebHost({ error: "No file yet", ok: false }),
  labels: Labels = en,
) {
  const initial = host.initialResult.ok ? host.initialResult.document : null;
  const store = new DocumentStore(
    initial?.markdown ?? "",
    initial?.payload.revision ?? 1,
    initial?.payload.assets ?? [],
  );
  const notify = vi.fn();
  const download = vi
    .spyOn(fileSave, "downloadText")
    .mockImplementation(() => {});
  let lifecycle!: ReturnType<typeof useFileLifecycle>;
  function Panel() {
    const snapshot = useDocumentStore(store);
    lifecycle = useFileLifecycle({ host, labels, notify, snapshot, store });
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Panel));
    await Promise.resolve();
  });
  cleanup = () => act(() => root.unmount());
  return {
    download,
    get lifecycle() {
      return lifecycle;
    },
    notify,
    store,
  };
}

const imageBytes = "GIF89a-test";
const imageAsset = {
  data: btoa(imageBytes),
  id: `sha256:${fileSave.fingerprintArtifact(imageBytes)}`,
  mimeType: "image/gif",
};
const imageSource = `![Example](yeli-asset:${imageAsset.id})\n`;

function markdownHandle(source = "# Opened\r\n") {
  let disk = source;
  let pending = source;
  const file = () => new File([disk], "notes.md", { type: "text/markdown" });
  const write = vi.fn(async (value: string | Blob) => {
    pending = typeof value === "string" ? value : await value.text();
  });
  const close = vi.fn(() => {
    disk = pending;
    return Promise.resolve();
  });
  const handle: FileHandleLike = {
    createWritable: vi.fn(() => Promise.resolve({ close, write })),
    getFile: vi.fn(() => Promise.resolve(file())),
    name: "notes.md",
    queryPermission: vi.fn(() => Promise.resolve("granted" as const)),
  };
  return {
    close,
    file,
    handle,
    setDisk: (source: string) => {
      disk = source;
    },
    write,
  };
}

async function openAndEdit(source = "# Changed\r\n") {
  const panel = await mountLifecycle();
  const connected = markdownHandle();
  await act(async () =>
    panel.lifecycle.openFile(connected.file(), connected.handle),
  );
  act(() => {
    panel.store.replaceSource(source);
  });
  return { connected, panel, source };
}

describe("web Markdown file lifecycle", () => {
  it.each([en, zhCN])(
    "rejects image embedding before reading or changing the document ($image)",
    async (labels) => {
      const original = "![Example](./example.gif)\n";
      const panel = await mountLifecycle(undefined, labels);
      const connected = markdownHandle(original);
      await act(async () =>
        panel.lifecycle.openFile(connected.file(), connected.handle),
      );
      const file = new File([imageBytes], "example.gif", {
        type: "image/gif",
      });
      const read = vi.spyOn(file, "arrayBuffer");
      const block = panel.store.getSnapshot().projection.blocks[0]!;
      const createPatch = vi.fn((destination: string) =>
        createConstructPatch(block, { kind: "image-target" }, destination),
      );
      const before = panel.store.getSnapshot();

      await act(async () => {
        expect(await panel.lifecycle.embedImage(file, createPatch)).toBe(false);
      });

      expect(panel.lifecycle.canEmbedImages).toBe(false);
      expect(panel.store.getSnapshot()).toBe(before);
      expect(read).not.toHaveBeenCalled();
      expect(createPatch).not.toHaveBeenCalled();
      expect(panel.notify).toHaveBeenLastCalledWith(
        labels.imageEmbeddingUnavailableMarkdown,
      );
      act(() => {
        panel.store.replaceSource(`${original}\nKept linked image\n`);
      });
      await act(async () => panel.lifecycle.save());
      const reopened = await createWebHost({
        error: "No file yet",
        ok: false,
      }).fileAdapter.openFile(connected.file(), null);
      expect(reopened).toMatchObject({
        ok: true,
        document: {
          markdown: `${original}\nKept linked image\n`,
          payload: { assets: [] },
        },
      });
      expect(connected.write).not.toHaveBeenCalledWith(
        expect.stringContaining("yeli-asset:"),
      );
    },
  );

  it.each([false, true])(
    "blocks Markdown save with injected assets, including copy=%s",
    async (copy) => {
      const discard = vi.spyOn(
        LocalDocumentRepository.prototype,
        "discardRecovery",
      );
      const recovery = vi.spyOn(
        LocalDocumentRepository.prototype,
        "saveRecovery",
      );
      const { panel, connected } = await openAndEdit();
      const fingerprint = panel.lifecycle.document?.fingerprint;
      act(() => {
        expect(panel.store.replaceDocument(imageSource, [imageAsset])?.ok).toBe(
          true,
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });

      await act(async () => panel.lifecycle.save(copy));

      expect(connected.write).not.toHaveBeenCalled();
      expect(panel.download).not.toHaveBeenCalled();
      expect(panel.lifecycle.document?.fingerprint).toBe(fingerprint);
      expect(panel.store.getSnapshot()).toMatchObject({
        assets: [imageAsset],
        dirty: true,
        source: imageSource,
      });
      expect(recovery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ assets: [imageAsset], source: imageSource }),
      );
      expect(discard).not.toHaveBeenCalled();
      expect(panel.lifecycle.saveStatus).toBe("error");
      expect(panel.notify).toHaveBeenLastCalledWith(
        en.saveMarkdownAssetsUnsupported,
      );
      expect(panel.notify).not.toHaveBeenCalledWith(en.saveComplete);
    },
  );

  it("blocks saving assets restored from history and retains their recovery", async () => {
    const discard = vi.spyOn(
      LocalDocumentRepository.prototype,
      "discardRecovery",
    );
    const { panel, connected } = await openAndEdit();
    act(() => {
      panel.store.replaceDocument(imageSource, [imageAsset]);
    });
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });
    await act(async () => panel.lifecycle.openHistory());
    const version = panel.lifecycle.versions.find(
      (candidate) => candidate.source === imageSource,
    );
    expect(version?.assets).toEqual([imageAsset]);
    act(() => {
      panel.store.replaceDocument("# Text only\n", []);
    });
    await act(async () => {
      expect(
        await panel.lifecycle.restoreVersion(
          version!,
          panel.store.getSnapshot(),
        ),
      ).toBe(true);
    });

    await act(async () => panel.lifecycle.save());

    expect(connected.write).not.toHaveBeenCalled();
    expect(panel.download).not.toHaveBeenCalled();
    expect(panel.store.getSnapshot()).toMatchObject({
      assets: [imageAsset],
      dirty: true,
      source: imageSource,
    });
    expect(discard).not.toHaveBeenCalled();
    expect(panel.notify).toHaveBeenLastCalledWith(
      en.saveMarkdownAssetsUnsupported,
    );
  });

  it("uses document.md as the initial web filename regardless of the page path", async () => {
    window.history.replaceState(null, "", "/index.html");

    const panel = await mountLifecycle();

    expect(panel.lifecycle.fileName).toBe("document.md");
  });

  it.each(["# Windows\r\n\r\nBody\r\n", "\ufeff# BOM\r\n"])(
    "keeps disclosure valid before and after editing physical source %j",
    async (source) => {
      const panel = await mountLifecycle();
      await act(async () =>
        panel.lifecycle.openFile(new File([source], "notes.md")),
      );
      for (const current of [source, source + "Edited\r\n"]) {
        act(() => {
          panel.store.replaceSource(current);
        });
        expect(panel.lifecycle.saveDisclosure).toBeNull();
        await act(async () => panel.lifecycle.prepareSaveDisclosure());
        expect(panel.lifecycle.saveDisclosure).toMatchObject({
          currentBytes: new TextEncoder().encode(current).byteLength,
          documentFingerprint: panel.lifecycle.document?.fingerprint,
          sourceHash: panel.store.getSnapshot().sourceHash,
        });
        expect(panel.lifecycle.saveDisclosureLoading).toBe(false);
      }
    },
  );

  it("opens a picker handle through the lifecycle and directly writes an edited file", async () => {
    const panel = await mountLifecycle();
    const connected = markdownHandle();
    const picker = vi.fn(() => Promise.resolve([connected.handle]));
    vi.stubGlobal("showOpenFilePicker", picker);
    const fallback = vi.fn();

    await act(async () => panel.lifecycle.chooseFile(fallback));
    act(() => {
      panel.store.replaceSource("# Picker edit\r\n");
    });
    await act(async () => panel.lifecycle.save());

    expect(picker).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(panel.lifecycle.canDirectSave).toBe(true);
    expect(connected.write).toHaveBeenCalledWith("# Picker edit\r\n");
    expect(panel.store.getSnapshot().dirty).toBe(false);
    expect(panel.download).not.toHaveBeenCalled();
  });

  it("reloads an external Markdown conflict through the existing file handle", async () => {
    const { connected, panel } = await openAndEdit();
    connected.setDisk("# External\r\n");

    await act(async () => panel.lifecycle.save());

    expect(panel.lifecycle.conflict).toMatchObject({
      kind: "markdown",
      snapshot: { source: "# Changed\r\n" },
    });
    expect(connected.write).not.toHaveBeenCalled();
    expect(panel.download).not.toHaveBeenCalled();
    expect(panel.store.getSnapshot().dirty).toBe(true);

    await act(async () => panel.lifecycle.reloadExternal());

    expect(panel.lifecycle.conflict).toBeNull();
    expect(panel.store.getSnapshot().source).toBe("# External\r\n");
    expect(panel.store.getSnapshot().dirty).toBe(false);
    expect(panel.lifecycle.canDirectSave).toBe(true);
  });

  it("downloads the conflict plan as .md while preserving dirty and recovery state", async () => {
    const discard = vi.spyOn(
      LocalDocumentRepository.prototype,
      "discardRecovery",
    );
    const record = vi.spyOn(LocalDocumentRepository.prototype, "recordVersion");
    const { connected, panel, source } = await openAndEdit();
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });
    connected.setDisk("# External\r\n");
    await act(async () => panel.lifecycle.save());
    // Keep the exact reviewed save plan even if the page receives a later edit.
    act(() => {
      panel.store.replaceSource("# Later edit\r\n");
    });

    await act(async () => panel.lifecycle.saveConflictCopy());

    expect(panel.download).toHaveBeenCalledWith(
      source,
      "document.md",
      "text/markdown;charset=utf-8",
    );
    expect(panel.lifecycle.conflict).toBeNull();
    expect(panel.store.getSnapshot().dirty).toBe(true);
    expect(panel.lifecycle.recoveryAvailable).toBe(true);
    expect(discard).not.toHaveBeenCalled();
    expect(
      record.mock.calls.some(([, version]) => version.reason === "save"),
    ).toBe(false);
    expect(panel.notify).toHaveBeenLastCalledWith(en.saveDownloaded);
  });

  it("overwrites external changes only after explicit confirmation", async () => {
    const { connected, panel, source } = await openAndEdit();
    connected.setDisk("# External\r\n");
    await act(async () => panel.lifecycle.save());
    expect(connected.write).not.toHaveBeenCalled();

    await act(async () => panel.lifecycle.confirmOverwrite());

    expect(connected.write).toHaveBeenCalledWith(source);
    expect(connected.close).toHaveBeenCalledOnce();
    expect(panel.lifecycle.conflict).toBeNull();
    expect(panel.store.getSnapshot().dirty).toBe(false);
    expect(panel.notify).toHaveBeenLastCalledWith(en.saveComplete);
  });

  it.each(["permission-denied", "write-failed", "close-failed"] as const)(
    "downloads .md on %s and retains dirty/recovery state",
    async (failure) => {
      const discard = vi.spyOn(
        LocalDocumentRepository.prototype,
        "discardRecovery",
      );
      const recovery = vi.spyOn(
        LocalDocumentRepository.prototype,
        "saveRecovery",
      );
      const { connected, panel, source } = await openAndEdit();
      await act(async () => {
        vi.advanceTimersByTime(800);
        await Promise.resolve();
      });
      const originalFingerprint = panel.lifecycle.document?.fingerprint;
      if (failure === "permission-denied") {
        connected.handle.queryPermission = () => Promise.resolve("denied");
        connected.handle.requestPermission = vi.fn(() =>
          Promise.resolve("denied" as const),
        );
      } else if (failure === "write-failed") {
        connected.write.mockRejectedValueOnce(new Error("write diagnostic"));
      } else {
        connected.close.mockRejectedValueOnce(new Error("close diagnostic"));
      }

      await act(async () => panel.lifecycle.save());

      expect(panel.download).toHaveBeenCalledWith(
        source,
        "document.md",
        "text/markdown;charset=utf-8",
      );
      expect(panel.store.getSnapshot().dirty).toBe(true);
      expect(panel.lifecycle.document?.fingerprint).toBe(originalFingerprint);
      expect(panel.lifecycle.recoveryAvailable).toBe(true);
      expect(recovery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ source }),
      );
      expect(discard).not.toHaveBeenCalled();
      expect(panel.lifecycle.saveStatus).toBe("error");
      expect(panel.notify).toHaveBeenLastCalledWith(en.saveDownloadedFallback);
      expect(panel.notify).not.toHaveBeenCalledWith(en.saveComplete);
    },
  );

  it("marks clean, updates the fingerprint and records history only after close", async () => {
    const discard = vi.spyOn(
      LocalDocumentRepository.prototype,
      "discardRecovery",
    );
    const record = vi.spyOn(LocalDocumentRepository.prototype, "recordVersion");
    const { connected, panel, source } = await openAndEdit();
    let resolveClose!: () => void;
    connected.close.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = panel.lifecycle.save();
      await Promise.resolve();
    });
    expect(connected.write).toHaveBeenCalledWith(source);
    expect(connected.close).toHaveBeenCalledOnce();
    expect(panel.store.getSnapshot().dirty).toBe(true);
    expect(discard).not.toHaveBeenCalled();
    expect(panel.notify).not.toHaveBeenCalledWith(en.saveComplete);

    await act(async () => {
      resolveClose();
      await pending;
    });

    expect(panel.store.getSnapshot().dirty).toBe(false);
    expect(panel.lifecycle.document?.fingerprint).toBe(
      fileSave.fingerprintArtifact(source),
    );
    expect(discard).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reason: "save",
        source,
        sourceHash: panel.store.getSnapshot().sourceHash,
      }),
    );
    expect(
      panel.lifecycle.versions.some((version) => version.source === source),
    ).toBe(true);
    expect(panel.notify).toHaveBeenLastCalledWith(en.saveComplete);
  });

  it("retains newer edits and recovery when a pending close finishes", async () => {
    const discard = vi.spyOn(
      LocalDocumentRepository.prototype,
      "discardRecovery",
    );
    const { connected, panel, source } = await openAndEdit();
    let resolveClose!: () => void;
    connected.close.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = panel.lifecycle.save();
      await Promise.resolve();
    });
    act(() => {
      panel.store.replaceSource("# Newer\r\n");
    });
    await act(async () => {
      resolveClose();
      await pending;
    });

    expect(panel.store.getSnapshot()).toMatchObject({
      dirty: true,
      source: "# Newer\r\n",
    });
    expect(discard).not.toHaveBeenCalled();
    expect(panel.lifecycle.document?.markdown).toBe(source);
  });

  it("downloads without a handle without marking edits clean", async () => {
    const panel = await mountLifecycle();
    await act(async () =>
      panel.lifecycle.openFile(new File(["# Imported\r\n"], "notes.md")),
    );
    act(() => {
      panel.store.replaceSource("# Download\r\n");
    });
    await act(async () => panel.lifecycle.save());

    expect(panel.download).toHaveBeenCalledWith(
      "# Download\r\n",
      "document.md",
      "text/markdown;charset=utf-8",
    );
    expect(panel.store.getSnapshot().dirty).toBe(true);
    expect(panel.notify).toHaveBeenLastCalledWith(en.saveDownloaded);
  });
});

describe("artifact lifecycle regression", () => {
  async function openArtifact() {
    const payload = await createDocumentPayload("# Artifact\n", {
      docId: "artifact-lifecycle-regression",
    });
    const artifact = `<!doctype html><html><body>${YELI_AGENT_PREAMBLE}\n${serializePayloadBlock(payload)}${STATIC_PREVIEW_OPEN}<p>preview</p>${STATIC_PREVIEW_CLOSE}</body></html>`;
    const panel = await mountLifecycle(
      createArtifactHost({ error: "No file yet", ok: false }, artifact),
    );
    let external = artifact;
    const file = () =>
      new File([external], "connected.yeli.html", { type: "text/html" });
    const write = vi.fn(async (value: string | Blob) => {
      external = typeof value === "string" ? value : await value.text();
    });
    const handle: FileHandleLike = {
      createWritable: () =>
        Promise.resolve({ close: () => Promise.resolve(), write }),
      getFile: () => Promise.resolve(file()),
      name: "connected.yeli.html",
      queryPermission: () => Promise.resolve("granted"),
    };
    await act(async () => panel.lifecycle.openFile(file(), handle));
    act(() => {
      panel.store.replaceSource("# Edited artifact\n");
    });
    return {
      file,
      handle,
      panel,
      setExternal: () => {
        external = "external change";
      },
      write,
    };
  }

  it("still embeds image bytes in artifact saves and reopens them intact", async () => {
    const { panel, file } = await openArtifact();
    await act(async () => {
      panel.store.replaceSource("![Example](./example.gif)\n");
      await Promise.resolve();
    });
    const block = panel.store.getSnapshot().projection.blocks[0]!;
    await act(async () => {
      expect(
        await panel.lifecycle.embedImage(
          new File([imageBytes], "example.gif", { type: "image/gif" }),
          (destination) =>
            createConstructPatch(block, { kind: "image-target" }, destination),
        ),
      ).toBe(true);
    });
    expect(panel.lifecycle.canEmbedImages).toBe(true);
    expect(panel.store.getSnapshot().assets).toEqual([imageAsset]);

    await act(async () => panel.lifecycle.save());
    const reopened = await openYeliArtifact(await file().text());

    expect(reopened).toMatchObject({
      ok: true,
      document: {
        markdown: imageSource,
        payload: { assets: [imageAsset] },
      },
    });
    expect(panel.store.getSnapshot().dirty).toBe(false);
    expect(panel.notify).toHaveBeenLastCalledWith(en.saveComplete);
  });

  it("retains the artifact permission failure notice without automatic download", async () => {
    const { handle, panel } = await openArtifact();
    handle.queryPermission = () => Promise.resolve("denied");

    await act(async () => panel.lifecycle.save());

    expect(panel.download).not.toHaveBeenCalled();
    expect(panel.lifecycle.saveStatus).toBe("error");
    expect(panel.store.getSnapshot().dirty).toBe(true);
    expect(panel.notify).toHaveBeenLastCalledWith(en.savePermissionDenied);
  });

  it("uses the artifact pathname for the initial filename", async () => {
    window.history.replaceState(null, "", "/interactive/connected.yeli.html");

    const panel = await mountLifecycle(
      createArtifactHost(
        { error: "No file yet", ok: false },
        "<!doctype html><html></html>",
      ),
    );

    expect(panel.lifecycle.fileName).toBe("connected.yeli.html");
  });

  it("keeps the artifact filename fallback for a directory path", async () => {
    window.history.replaceState(null, "", "/");

    const panel = await mountLifecycle(
      createArtifactHost(
        { error: "No file yet", ok: false },
        "<!doctype html><html></html>",
      ),
    );

    expect(panel.lifecycle.fileName).toBe("document.yeli.html");
  });

  it("reads a successful artifact exactly once through the adapter", async () => {
    const payload = await createDocumentPayload("# Artifact read once\n", {
      docId: "artifact-read-once",
    });
    const artifact = `<!doctype html><html><body>${YELI_AGENT_PREAMBLE}\n${serializePayloadBlock(payload)}${STATIC_PREVIEW_OPEN}<p>preview</p>${STATIC_PREVIEW_CLOSE}</body></html>`;
    const panel = await mountLifecycle(
      createArtifactHost(
        { error: "No file yet", ok: false },
        "<!doctype html><html></html>",
      ),
    );
    const file = new File([artifact], "connected.yeli.html", {
      type: "text/html",
    });
    const read = vi.spyOn(file, "text");

    await act(async () => panel.lifecycle.openFile(file));

    expect(read).toHaveBeenCalledOnce();
    expect(panel.lifecycle.document?.artifact).toBe(artifact);
    expect(panel.lifecycle.fileName).toBe("connected.yeli.html");
  });

  it("preserves invalid artifact text from the adapter without rereading", async () => {
    const invalid = '<!doctype html>\r\n<body data-label="原始">broken</body>';
    const panel = await mountLifecycle(
      createArtifactHost(
        { error: "No file yet", ok: false },
        "<!doctype html><html></html>",
      ),
    );
    const file = new File([invalid], "broken.yeli.html", {
      type: "text/html",
    });
    const read = vi.spyOn(file, "text");

    await act(async () => panel.lifecycle.openFile(file));

    expect(read).toHaveBeenCalledOnce();
    expect(panel.lifecycle.invalidFile).toMatchObject({
      filename: "broken.yeli.html",
      recovery: { recovery: { originalBytes: invalid } },
    });
    act(() => panel.lifecycle.downloadInvalidOriginal());
    expect(panel.download).toHaveBeenCalledWith(
      invalid,
      "broken.yeli.html",
      "text/html;charset=utf-8",
    );
  });

  it("keeps artifact conflict copies as .yeli.html with the original save flow", async () => {
    const { panel, setExternal, write } = await openArtifact();
    setExternal();
    await act(async () => panel.lifecycle.save());
    expect(panel.lifecycle.conflict).toMatchObject({ kind: "artifact" });
    expect(write).not.toHaveBeenCalled();

    await act(async () => panel.lifecycle.saveConflictCopy());

    expect(panel.download).toHaveBeenCalledWith(
      expect.stringContaining('id="yeli-doc"'),
      "document.yeli.html",
      "text/html;charset=utf-8",
    );
    expect(panel.lifecycle.conflict).toBeNull();
    expect(panel.lifecycle.canDirectSave).toBe(false);
    expect(panel.store.getSnapshot().dirty).toBe(true);
    expect(panel.lifecycle.saveStatus).toBe("idle");
    expect(panel.notify).toHaveBeenLastCalledWith(en.saveDownloaded);
  });
});

async function mountWeb(
  repository = new WebSessionRepository(new MemoryStorageAdapter()),
) {
  const host = createWebHost({
    ok: true,
    document: await openMarkdownFile(""),
  });
  host.webSessions = repository;
  const panel = await mountLifecycle(host);
  return { panel, repository };
}

async function webExportHost() {
  const payload = await createDocumentPayload("", {
    docId: "yeli-empty",
    subtle: null,
  });
  const artifact = `<!doctype html><html><body>${serializePayloadBlock(payload)}${STATIC_PREVIEW_OPEN}\n${buildStaticPreviewHtml(payload, "")}\n${STATIC_PREVIEW_CLOSE}</body></html>`;
  const capability = await validateWebTemplate(
    artifact,
    describeWebTemplate(artifact, "0.1.0"),
    "0.1.0",
  );
  const opened = await openMarkdownFile("# Current\n\nKept source.\n");
  opened.payload.settings = { portable: true };
  Object.defineProperty(opened.payload, "futureSafe", {
    enumerable: true,
    value: { keep: "additive" },
  });
  const host = createWebHost({ ok: true, document: opened }, capability);
  return { host, artifact };
}

describe("web portable and print export", () => {
  it("exports the committed payload without changing handles, dirty, undo or recovery", async () => {
    const { host, artifact } = await webExportHost();
    const panel = await mountLifecycle(host);
    await act(async () => {
      panel.store.replaceDocument(imageSource, [imageAsset]);
      await Promise.resolve();
    });
    const before = panel.store.getSnapshot();
    const baseline = panel.lifecycle.document;
    await act(async () => panel.lifecycle.exportYeli());
    const [text, filename, mime] = panel.download.mock.calls[0]!;
    expect(filename).toBe("document.yeli.html");
    expect(mime).toBe("text/html;charset=utf-8");
    const parsed = await parseYeliArtifact(text);
    expect(parsed).toMatchObject({
      ok: true,
      markdown: imageSource,
      payload: {
        docId: baseline?.payload.docId,
        revision: before.revision,
        settings: { portable: true },
        assets: [imageAsset],
        futureSafe: { keep: "additive" },
      },
    });
    expect(projectShell(text).hash).toBe(projectShell(artifact).hash);
    expect(panel.store.getSnapshot()).toBe(before);
    expect(panel.lifecycle.document).toBe(baseline);
    expect(text).not.toContain("localInstanceId");
    expect(text).not.toContain("Kept source.");
    expect(text).not.toContain("contenteditable");
  });

  it.each([en, zhCN])(
    "keeps other exports available when the template is absent",
    async (labels) => {
      const panel = await mountLifecycle(
        createWebHost({
          ok: true,
          document: await openMarkdownFile("# Available\n"),
        }),
        labels,
      );
      expect(panel.lifecycle.canExportYeli).toBe(false);
      await act(async () => panel.lifecycle.exportYeli());
      expect(panel.download).not.toHaveBeenCalled();
      expect(panel.notify).toHaveBeenLastCalledWith(labels.webTemplateMissing);
      act(() => panel.lifecycle.exportMarkdown());
      expect(panel.download).toHaveBeenCalledWith(
        "# Available\n",
        "document.md",
        "text/markdown;charset=utf-8",
      );
      await act(async () => panel.lifecycle.generateStaticExport());
      expect(panel.lifecycle.exportPreview?.html).toContain("Available");
      const print = vi
        .spyOn(printExport, "printStaticHtml")
        .mockResolvedValue("requested");
      await act(async () => panel.lifecycle.print());
      expect(print).toHaveBeenCalled();
    },
  );

  it("rejects a stale export after an edit during async generation", async () => {
    const { host } = await webExportHost();
    const panel = await mountLifecycle(host);
    const original = fileSave.createSavedArtifact;
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(fileSave, "createSavedArtifact").mockImplementation(
      async (options) => {
        await gate;
        return original(options);
      },
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = panel.lifecycle.exportYeli();
      await Promise.resolve();
    });
    act(() => {
      panel.store.replaceSource("# Later\n");
    });
    await act(async () => {
      finish();
      await pending;
    });
    expect(panel.download).not.toHaveBeenCalled();
    expect(panel.notify).toHaveBeenLastCalledWith(en.exportStale);
  });

  it("does not download an artifact with a missing embedded asset reference", async () => {
    const { host } = await webExportHost();
    host.initialResult = {
      ok: true,
      document: await openMarkdownFile(imageSource),
    };
    const panel = await mountLifecycle(host);
    const before = panel.store.getSnapshot();
    await act(async () => panel.lifecycle.exportYeli());
    expect(panel.download).not.toHaveBeenCalled();
    expect(panel.notify).toHaveBeenLastCalledWith(en.exportFailed);
    expect(panel.store.getSnapshot()).toBe(before);
    act(() => panel.lifecycle.exportMarkdown());
    expect(panel.download).toHaveBeenCalledWith(
      imageSource,
      "document.md",
      "text/markdown;charset=utf-8",
    );
    await act(async () => panel.lifecycle.generateStaticExport());
    expect(panel.lifecycle.exportPreview?.html).toContain(en.imageNotLoaded);
    const print = vi
      .spyOn(printExport, "printStaticHtml")
      .mockResolvedValue("requested");
    await act(async () => panel.lifecycle.print());
    expect(print).toHaveBeenCalledWith(
      expect.stringContaining(en.imageNotLoaded),
      document,
      expect.any(Function),
    );
  });

  it("keeps the original Markdown connection after exporting a portable copy", async () => {
    const { host } = await webExportHost();
    const panel = await mountLifecycle(host);
    const connected = markdownHandle("# Original connection\n");
    await act(async () =>
      panel.lifecycle.openFile(connected.file(), connected.handle),
    );
    await act(async () => {
      panel.store.replaceSource("# Export only\n");
      await Promise.resolve();
    });
    const before = panel.store.getSnapshot();
    const opened = panel.lifecycle.document;
    const discard = vi.spyOn(
      LocalDocumentRepository.prototype,
      "discardRecovery",
    );
    const read = vi.spyOn(connected.handle, "getFile");
    const permission = vi.spyOn(connected.handle, "queryPermission");
    await act(async () => panel.lifecycle.exportYeli());
    expect(panel.download).toHaveBeenCalledWith(
      expect.any(String),
      "document.yeli.html",
      "text/html;charset=utf-8",
    );
    expect(connected.write).not.toHaveBeenCalled();
    expect(connected.close).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(permission).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(panel.lifecycle.canDirectSave).toBe(true);
    expect(panel.lifecycle.document).toBe(opened);
    expect(panel.store.getSnapshot()).toBe(before);
    await act(async () => panel.lifecycle.save());
    expect(await connected.file().text()).toBe("# Export only\n");
    expect(panel.store.getSnapshot().dirty).toBe(false);
  });

  it.each(["yeli", "html", "print"] as const)(
    "isolates pending %s export from a different web session",
    async (kind) => {
      const { host } = await webExportHost();
      host.webSessions = new WebSessionRepository(new MemoryStorageAdapter());
      const panel = await mountLifecycle(host);
      const original = documentModel.createDocumentPayload;
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      vi.spyOn(documentModel, "createDocumentPayload").mockImplementationOnce(
        async (...args) => {
          await gate;
          return original(...args);
        },
      );
      const print = vi
        .spyOn(printExport, "printStaticHtml")
        .mockResolvedValue("requested");
      let pending!: Promise<void>;
      act(() => {
        pending =
          kind === "yeli"
            ? panel.lifecycle.exportYeli()
            : kind === "html"
              ? panel.lifecycle.generateStaticExport()
              : panel.lifecycle.print();
      });
      await act(async () => panel.lifecycle.newWebDocument());
      const current = panel.store.getSnapshot();
      await act(async () => {
        finish();
        await pending;
      });
      expect(panel.download).not.toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
      expect(panel.lifecycle.exportPreview).toBeNull();
      expect(panel.store.getSnapshot()).toBe(current);
    },
  );

  it("uses one fresh committed snapshot for static HTML and browser printing", async () => {
    const { host } = await webExportHost();
    const panel = await mountLifecycle(host);
    // Invoke an earlier render's callback after a synchronous commit.
    const action = panel.lifecycle.print;
    const print = vi
      .spyOn(printExport, "printStaticHtml")
      .mockResolvedValue("requested");
    await act(async () => {
      panel.store.replaceSource(
        "---\ntitle: Committed\n---\nBody from commit.\n",
      );
      await Promise.resolve();
    });
    const before = panel.store.getSnapshot();
    await act(async () => action());
    const html = print.mock.calls[0]![0];
    expect(html).toContain("<h1>Committed</h1>");
    expect(html).toContain("Body from commit.");
    expect(html).not.toContain("Kept source.");
    expect(html).not.toContain("<script");
    expect(panel.store.getSnapshot()).toBe(before);
  });
});

describe("persistent web Markdown sessions", () => {
  it("starts on an empty chooser, then creates and reloads an undoable draft", async () => {
    const { panel, repository } = await mountWeb();
    expect(panel.lifecycle.localDocuments).toEqual([]);
    expect(panel.lifecycle.webHasActiveDocument).toBe(false);
    expect(await repository.list()).toEqual([]);
    await act(async () => panel.lifecycle.newWebDocument());
    expect(panel.store.getSnapshot()).toMatchObject({
      source: "",
      primaryMode: "edit",
    });
    const [first] = await repository.list();
    expect(first).toBeDefined();
    act(() => {
      panel.store.replaceSource("# Last edit\r\n");
    });
    // No debounce has elapsed: switching still checkpoints the last edit.
    await act(async () => {
      await panel.lifecycle.newWebDocument();
    });
    expect(panel.lifecycle.switchRequest).toBe(true);
    await act(async () => panel.lifecycle.confirmWebSwitch());
    const records = await repository.list();
    expect(records).toHaveLength(2);
    expect(
      (await repository.local.getRecovery(first!.localInstanceId))?.source,
    ).toBe("# Last edit\r\n");
    await act(async () => {
      await panel.lifecycle.selectLocalDocument(first!);
    });
    expect(panel.lifecycle.recovery?.source).toBe("# Last edit\r\n");
    act(() => panel.lifecycle.restoreRecovery());
    expect(panel.store.getSnapshot()).toMatchObject({
      dirty: true,
      source: "# Last edit\r\n",
      canUndo: true,
    });
    act(() => {
      panel.store.undo();
    });
    expect(panel.store.getSnapshot().source).toBe("");
  });

  it("does not merge same-name files, and requires confirmation for byte-identical files", async () => {
    const { panel, repository } = await mountWeb();
    await act(async () =>
      panel.lifecycle.openFile(new File(["# One\n"], "same.md")),
    );
    await act(async () =>
      panel.lifecycle.openFile(new File(["# Two\n"], "same.md")),
    );
    expect(
      (await repository.list()).filter(
        (record) => record.filename === "same.md",
      ),
    ).toHaveLength(2);
    await act(async () =>
      panel.lifecycle.openFile(new File(["# One\n"], "other.md")),
    );
    expect(panel.lifecycle.webReconnect?.candidates).toHaveLength(1);
    expect(panel.store.getSnapshot().source).toBe("# Two\n");
    await act(async () => panel.lifecycle.separateWebSession());
    expect(panel.store.getSnapshot().source).toBe("# One\n");
    expect(await repository.list()).toHaveLength(3);
  });

  it("keeps history checkpoints debounced while persisting immediate draft edits", async () => {
    const { panel, repository } = await mountWeb();
    await act(async () => panel.lifecycle.newWebDocument());
    const [session] = await repository.list();
    for (let i = 0; i < 40; i++)
      act(() => {
        panel.store.replaceSource(`# Edit ${i}`);
      });
    await act(async () => {
      await repository.run(() => Promise.resolve(undefined));
    });
    expect(
      (await repository.local.getRecovery(session!.localInstanceId))?.source,
    ).toBe("# Edit 39");
    expect(
      await repository.local.listVersions(session!.localInstanceId),
    ).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(800);
      await repository.run(() => Promise.resolve(undefined));
    });
    const versions = await repository.local.listVersions(
      session!.localInstanceId,
    );
    expect(versions).toHaveLength(2);
    expect(versions.some((version) => version.source === "# Edit 39")).toBe(
      true,
    );
  });

  it("updates the disk baseline after close without a queued draft touch reverting it", async () => {
    const { panel, repository } = await mountWeb();
    vi.spyOn(repository, "retainHandle").mockResolvedValue(true); // Unit-only live handle; OPFS covers browser cloning.
    const connected = markdownHandle("# Baseline\r\n");
    await act(async () =>
      panel.lifecycle.openFile(connected.file(), connected.handle),
    );
    act(() => {
      panel.store.replaceSource("# Saved\r\n");
    });
    await act(async () => panel.lifecycle.save());
    const session = (await repository.list()).find(
      (record) => record.filename === "notes.md",
    )!;
    expect(session.baseline.source).toBe("# Saved\r\n");
    expect(
      await repository.local.getRecovery(session.localInstanceId),
    ).toBeNull();
    expect(panel.store.getSnapshot().dirty).toBe(false);
    act(() => {
      panel.store.replaceSource("# Newer\r\n");
    });
    await act(async () => {
      await repository.run(() => Promise.resolve(undefined));
    });
    expect(
      (await repository.get(session.localInstanceId))?.baseline.source,
    ).toBe("# Saved\r\n");
    expect(
      (await repository.local.getRecovery(session.localInstanceId))?.source,
    ).toBe("# Newer\r\n");
  });

  it("Save Copy forks the session and disconnects the original while downloads retain dirty", async () => {
    const { panel, repository } = await mountWeb();
    await act(async () => panel.lifecycle.newWebDocument());
    vi.spyOn(repository, "retainHandle").mockResolvedValue(true); // Unit-only live handle; OPFS covers browser cloning.
    const connected = markdownHandle();
    await act(async () =>
      panel.lifecycle.openFile(connected.file(), connected.handle),
    );
    act(() => {
      panel.store.replaceSource("# Copy\n");
    });
    await act(async () => panel.lifecycle.save(true));
    expect(panel.lifecycle.canDirectSave).toBe(false);
    expect(panel.store.getSnapshot().dirty).toBe(true);
    expect(await repository.list()).toHaveLength(3);
    await act(async () => panel.lifecycle.save());
    expect(connected.write).not.toHaveBeenCalled();
    expect(panel.download).toHaveBeenCalledTimes(2);
    const drafts = await Promise.all(
      (await repository.list()).map((record) =>
        repository.local.getRecovery(record.localInstanceId),
      ),
    );
    expect(drafts.filter((draft) => draft?.source === "# Copy\n")).toHaveLength(
      2,
    );
  });

  it("reopens a selected record without a handle and preserves other sessions", async () => {
    const repository = new WebSessionRepository(new MemoryStorageAdapter());
    const session = await repository.create(
      await openMarkdownFile("# Base"),
      "local.md",
    );
    await repository.local.saveRecovery(session.localInstanceId, {
      source: "# Recovered",
      sourceHash: "draft",
      revision: 2,
    });
    const { panel } = await mountWeb(repository);
    expect(panel.lifecycle.localDocuments).toHaveLength(1);
    await act(async () => panel.lifecycle.selectLocalDocument(session));
    act(() => panel.lifecycle.restoreRecovery());
    expect(panel.store.getSnapshot()).toMatchObject({
      source: "# Recovered",
      dirty: true,
      canUndo: true,
    });
    expect(panel.lifecycle.canDirectSave).toBe(false);
    await act(async () => panel.lifecycle.save());
    expect(
      (await repository.local.getRecovery(session.localInstanceId))?.source,
    ).toBe("# Recovered");
  });

  it("retains the old draft and fingerprint when a retained disk file changed", async () => {
    const repository = new WebSessionRepository(new MemoryStorageAdapter());
    vi.spyOn(repository, "retainHandle").mockResolvedValue(true); // Unit-only live handle; OPFS covers browser cloning.
    const connected = markdownHandle("# Base");
    const session = await repository.create(
      await openMarkdownFile("# Base"),
      "notes.md",
    );
    await repository.local.saveRecovery(session.localInstanceId, {
      source: "# Draft",
      sourceHash: "draft",
      revision: 2,
    });
    // Unit-only handle stub; real structured-cloned handles are browser-covered.
    vi.spyOn(repository, "getHandle").mockResolvedValue(connected.handle);
    connected.setDisk("# Disk changed");
    const { panel } = await mountWeb(repository);
    await act(async () => panel.lifecycle.selectLocalDocument(session));
    expect(panel.lifecycle.diskChoice).not.toBeNull();
    await act(async () => panel.lifecycle.useLocalDraft());
    act(() => panel.lifecycle.restoreRecovery());
    await act(async () => panel.lifecycle.save());
    expect(connected.write).not.toHaveBeenCalled();
    expect(panel.lifecycle.conflict).not.toBeNull();
    expect(
      (await repository.get(session.localInstanceId))?.baseline.source,
    ).toBe("# Base");
    expect(
      (await repository.local.getRecovery(session.localInstanceId))?.source,
    ).toBe("# Draft");
  });

  it("opens a changed disk file separately without orphaning the previous draft", async () => {
    const repository = new WebSessionRepository(new MemoryStorageAdapter());
    vi.spyOn(repository, "retainHandle").mockResolvedValue(true); // Unit-only live handle; OPFS covers browser cloning.
    const connected = markdownHandle("# Disk");
    const session = await repository.create(
      await openMarkdownFile("# Base"),
      "notes.md",
    );
    await repository.local.saveRecovery(session.localInstanceId, {
      source: "# Draft",
      sourceHash: "draft",
      revision: 2,
    });
    vi.spyOn(repository, "getHandle").mockResolvedValue(connected.handle);
    const { panel } = await mountWeb(repository);
    await act(async () => panel.lifecycle.selectLocalDocument(session));
    await act(async () => panel.lifecycle.useDiskVersion());
    expect(panel.store.getSnapshot().source).toBe("# Disk");
    expect(await repository.list()).toHaveLength(2);
    expect(
      (await repository.local.getRecovery(session.localInstanceId))?.source,
    ).toBe("# Draft");
  });
});

it("persistent web open generations ignore an earlier file that resolves last", async () => {
  const repository = new WebSessionRepository(new MemoryStorageAdapter());
  const host = createWebHost({
    ok: true,
    document: await openMarkdownFile(""),
  });
  host.webSessions = repository;
  const panel = await mountLifecycle(host);
  let resolveEarlier!: (
    value: Awaited<ReturnType<typeof host.fileAdapter.openFile>>,
  ) => void;
  const earlier = new Promise<
    Awaited<ReturnType<typeof host.fileAdapter.openFile>>
  >((resolve) => {
    resolveEarlier = resolve;
  });
  const original = host.fileAdapter.openFile.bind(host.fileAdapter);
  vi.spyOn(host.fileAdapter, "openFile").mockImplementation((file, handle) =>
    file.name === "early.md" ? earlier : original(file, handle),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = panel.lifecycle.openFile(new File(["# Earlier"], "early.md"));
    await Promise.resolve();
  });
  await act(async () =>
    panel.lifecycle.openFile(new File(["# Latest"], "latest.md")),
  );
  await act(async () => {
    resolveEarlier({ ok: true, document: await openMarkdownFile("# Earlier") });
    await pending;
  });
  expect(panel.store.getSnapshot().source).toBe("# Latest");
  expect(panel.lifecycle.fileName).toBe("latest.md");
  expect(
    (await repository.list()).some((record) => record.filename === "early.md"),
  ).toBe(false);
});

it("persistent web save keeps edits made while the stream is closing", async () => {
  const { panel, repository } = await mountWeb();
  vi.spyOn(repository, "retainHandle").mockResolvedValue(true); // Unit-only live handle.
  const connected = markdownHandle();
  await act(async () =>
    panel.lifecycle.openFile(connected.file(), connected.handle),
  );
  act(() => {
    panel.store.replaceSource("# Saving");
  });
  let finish!: () => void;
  connected.close.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = panel.lifecycle.save();
    await repository.run(() => Promise.resolve());
  });
  act(() => {
    panel.store.replaceSource("# Edited during close");
  });
  await act(async () => {
    finish();
    await pending;
    await repository.run(() => Promise.resolve());
  });
  const session = (await repository.list()).find(
    (record) => record.filename === "notes.md",
  )!;
  expect(session.baseline.source).toBe("# Saving");
  expect(
    (await repository.local.getRecovery(session.localInstanceId))?.source,
  ).toBe("# Edited during close");
  expect(panel.store.getSnapshot()).toMatchObject({
    source: "# Edited during close",
    dirty: true,
  });
});

it("persistent web storage failure still offers an empty document and downloads", async () => {
  const repository = new WebSessionRepository(new MemoryStorageAdapter());
  vi.spyOn(repository, "list").mockRejectedValue(
    new Error("storage unavailable"),
  );
  const { panel } = await mountWeb(repository);
  expect(panel.lifecycle.recoveryAvailable).toBe(false);
  expect(panel.lifecycle.localDocuments).toEqual([]);
  expect(panel.lifecycle.webHasActiveDocument).toBe(false);
  await act(async () => panel.lifecycle.newWebDocument());
  expect(panel.store.getSnapshot().primaryMode).toBe("edit");
  act(() => {
    panel.store.replaceSource("# Kept locally in tab");
  });
  const beforeUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(beforeUnload);
  expect(beforeUnload.defaultPrevented).toBe(true);
  await act(async () => panel.lifecycle.save());
  expect(panel.download).toHaveBeenCalledWith(
    "# Kept locally in tab",
    "document.md",
    "text/markdown;charset=utf-8",
  );
  expect(panel.store.getSnapshot().dirty).toBe(true);
});

it("rechecks a pending switch when an earlier save action starts closing", async () => {
  const { panel, repository } = await mountWeb();
  vi.spyOn(repository, "retainHandle").mockResolvedValue(true); // Unit-only live handle.
  const connected = markdownHandle();
  await act(async () =>
    panel.lifecycle.openFile(connected.file(), connected.handle),
  );
  act(() => {
    panel.store.replaceSource("# Saving A");
  });
  const earlierSaveAction = panel.lifecycle.save;
  await act(async () => panel.lifecycle.openFile(new File(["# B"], "b.md")));
  expect(panel.lifecycle.switchRequest).toBe(true);
  let finish!: () => void;
  connected.close.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = earlierSaveAction();
    await repository.run(() => Promise.resolve());
  });
  await act(async () => panel.lifecycle.confirmWebSwitch());
  expect(panel.store.getSnapshot().source).toBe("# Saving A");
  expect(
    (await repository.list()).some((record) => record.filename === "b.md"),
  ).toBe(false);
  await act(async () => {
    finish();
    await pending;
    await repository.run(() => Promise.resolve());
  });
  expect(panel.store.getSnapshot()).toMatchObject({
    source: "# Saving A",
    dirty: false,
  });
  expect(
    (await repository.list()).find((record) => record.filename === "notes.md")
      ?.baseline.source,
  ).toBe("# Saving A");
});

it("stale history selection cannot inject the prior document into an identical independent session", async () => {
  const repository = new WebSessionRepository(new MemoryStorageAdapter());
  const baseline = await openMarkdownFile("# Identical");
  const first = await repository.create(baseline, "a.md");
  const second = await repository.create(baseline, "b.md");
  const version = await repository.local.recordVersion(first.localInstanceId, {
    source: "# History from A",
    sourceHash: "different",
    revision: 9,
    reason: "edit",
  });
  const { panel } = await mountWeb(repository);
  await act(async () => panel.lifecycle.selectLocalDocument(first));
  const expected = panel.store.getSnapshot();
  const originalList = repository.local.listVersions.bind(repository.local);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(repository.local, "listVersions").mockImplementationOnce(
    async (id) => {
      const result = await originalList(id);
      await delayed;
      return result;
    },
  );
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = panel.lifecycle.restoreVersion(version, expected);
    await Promise.resolve();
  });
  await act(async () => panel.lifecycle.selectLocalDocument(second));
  await act(async () => {
    release();
    expect(await pending).toBe(false);
  });
  expect(panel.store.getSnapshot().source).toBe("# Identical");
  expect(panel.lifecycle.fileName).toBe("b.md");
  expect(await repository.local.getRecovery(second.localInstanceId)).toBeNull();
  expect(
    panel.lifecycle.versions.some(
      (candidate) => candidate.source === "# History from A",
    ),
  ).toBe(false);
});

it("a failed draft flush aborts a preserve-draft switch without replacing the document", async () => {
  const { panel, repository } = await mountWeb();
  await act(async () => panel.lifecycle.openFile(new File(["# A"], "a.md")));
  act(() => {
    panel.store.replaceSource("# Unsaved A");
  });
  await act(async () => {
    await repository.run(() => Promise.resolve());
  });
  vi.spyOn(repository.local, "saveRecovery").mockRejectedValueOnce(
    new Error("quota"),
  );
  await act(async () => panel.lifecycle.openFile(new File(["# B"], "b.md")));
  await act(async () => panel.lifecycle.confirmWebSwitch());
  expect(panel.store.getSnapshot().source).toBe("# Unsaved A");
  expect(panel.lifecycle.fileName).toBe("a.md");
  expect(panel.lifecycle.recoveryAvailable).toBe(false);
  expect(
    (await repository.list()).some((record) => record.filename === "b.md"),
  ).toBe(false);
});

it("warns before leaving a dirty web document when persistence was never available", async () => {
  recoveryPolicy.allowed = false;
  const { panel } = await mountWeb();
  act(() => {
    panel.store.replaceSource("# No persistent storage");
  });
  expect(panel.lifecycle.recoveryAvailable).toBe(false);
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

it("a late History refresh cannot replace another local document's version list", async () => {
  const repository = new WebSessionRepository(new MemoryStorageAdapter());
  const baseline = await openMarkdownFile("# Baseline");
  const first = await repository.create(baseline, "a.md");
  const second = await repository.create(baseline, "b.md");
  await repository.local.recordVersion(first.localInstanceId, {
    source: "# Private A",
    sourceHash: "private-a",
    revision: 2,
    reason: "edit",
  });
  const { panel } = await mountWeb(repository);
  await act(async () => panel.lifecycle.selectLocalDocument(first));
  const original = repository.local.listVersions.bind(repository.local);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(repository.local, "listVersions").mockImplementationOnce(
    async (id) => {
      const versions = await original(id);
      await delayed;
      return versions;
    },
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = panel.lifecycle.openHistory();
    await Promise.resolve();
  });
  await act(async () => panel.lifecycle.selectLocalDocument(second));
  await act(async () => {
    release();
    await pending;
  });
  expect(panel.lifecycle.fileName).toBe("b.md");
  expect(
    panel.lifecycle.versions.some(
      (version) => version.source === "# Private A",
    ),
  ).toBe(false);
  expect(panel.lifecycle.historyOpen).toBe(false);
});

it.each(["restore", "history", "documents"] as const)(
  "an old %s read rejection cannot disable the active document's recovery",
  async (action) => {
    const repository = new WebSessionRepository(new MemoryStorageAdapter());
    const baseline = await openMarkdownFile("# Identical");
    const first = await repository.create(baseline, "a.md");
    const second = await repository.create(baseline, "b.md");
    const version = await repository.local.recordVersion(
      first.localInstanceId,
      {
        source: "# A history",
        sourceHash: "a-history",
        revision: 2,
        reason: "edit",
      },
    );
    const { panel } = await mountWeb(repository);
    await act(async () => panel.lifecycle.selectLocalDocument(first));
    let rejectRead!: (error: Error) => void;
    if (action === "documents")
      vi.spyOn(repository, "list").mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectRead = reject;
          }),
      );
    else
      vi.spyOn(repository.local, "listVersions").mockImplementationOnce(
        () =>
          new Promise<StoredVersion[]>((_resolve, reject) => {
            rejectRead = reject;
          }),
      );
    let pending!: Promise<boolean | void>;
    await act(async () => {
      pending =
        action === "restore"
          ? panel.lifecycle.restoreVersion(version, panel.store.getSnapshot())
          : action === "history"
            ? panel.lifecycle.openHistory()
            : panel.lifecycle.openLocalDocuments();
      await Promise.resolve();
    });
    await act(async () => panel.lifecycle.selectLocalDocument(second));
    expect(panel.lifecycle.recoveryAvailable).toBe(true);
    await act(async () => {
      rejectRead(new Error("old A history read failed"));
      const result = await pending;
      if (action === "restore") expect(result).toBe(false);
    });
    expect(panel.lifecycle.fileName).toBe("b.md");
    expect(panel.lifecycle.recoveryAvailable).toBe(true);
    act(() => {
      panel.store.replaceSource("# New B edit");
    });
    await act(async () => {
      await repository.run(() => Promise.resolve());
    });
    expect(
      (await repository.local.getRecovery(second.localInstanceId))?.source,
    ).toBe("# New B edit");
  },
);
