import { describe, expect, it, vi } from "vitest";
import { openMarkdownFile } from "../../src/host/markdown-files.ts";
import {
  MemoryStorageAdapter,
  LocalDocumentRepository,
} from "../../src/storage/recovery.ts";
import { WebSessionRepository } from "../../src/storage/web-sessions.ts";

describe("web local sessions", () => {
  it("keeps empty and same-name documents independent across repository reloads", async () => {
    const storage = new MemoryStorageAdapter();
    const repository = new WebSessionRepository(storage);
    const empty = await openMarkdownFile("");
    const first = await repository.create(empty, "notes.md");
    const second = await repository.create(empty, "notes.md");
    expect(first.localInstanceId).not.toBe(second.localInstanceId);
    const reload = new WebSessionRepository(storage);
    expect(await reload.list()).toHaveLength(2);
    expect((await reload.get(first.localInstanceId))?.baseline.source).toBe("");
  });

  it("retains draft/history when a handle cannot be structured-cloned", async () => {
    const storage = new MemoryStorageAdapter();
    const repository = new WebSessionRepository(storage);
    const session = await repository.create(
      await openMarkdownFile("# Base\r\n"),
      "same.md",
    );
    const locals = new LocalDocumentRepository(storage);
    await locals.saveRecovery(session.localInstanceId, {
      revision: 2,
      source: "# Draft\r\n",
      sourceHash: "draft",
    });
    expect(
      await repository.retainHandle(session.localInstanceId, {
        name: "same.md",
        getFile: () => Promise.resolve(new File(["# Base\r\n"], "same.md")),
        createWritable: () => Promise.reject(new Error("unused")),
      }),
    ).toBe(false);
    expect((await repository.list())[0]?.hasDraft).toBe(true);
    expect((await locals.getRecovery(session.localInstanceId))?.source).toBe(
      "# Draft\r\n",
    );
  });

  it("serializes writes and keeps disk baseline separate from draft", async () => {
    const storage = new MemoryStorageAdapter();
    const repository = new WebSessionRepository(storage);
    const session = await repository.create(
      await openMarkdownFile("\ufeff# Base\r\n"),
      "bom.md",
    );
    const locals = repository.local;
    await Promise.all([
      repository.run(() =>
        locals.saveRecovery(session.localInstanceId, {
          source: "# Older",
          revision: 2,
          sourceHash: "older",
        }),
      ),
      repository.run(() =>
        locals.saveRecovery(session.localInstanceId, {
          source: "# Latest",
          revision: 3,
          sourceHash: "latest",
        }),
      ),
    ]);
    expect((await locals.getRecovery(session.localInstanceId))?.source).toBe(
      "# Latest",
    );
    expect(
      (await repository.get(session.localInstanceId))?.baseline.source,
    ).toBe("\ufeff# Base\r\n");
    for (let i = 0; i < 35; i++) {
      await locals.recordVersion(session.localInstanceId, {
        reason: "edit",
        source: String(i),
        sourceHash: String(i),
        revision: i,
      });
    }
    expect(await locals.listVersions(session.localInstanceId)).toHaveLength(30);
  });

  it("skips corrupt records without deleting their recovery", async () => {
    const storage = new MemoryStorageAdapter();
    const repository = new WebSessionRepository(storage);
    await storage.set("web-session:bad", {
      version: 99,
      localInstanceId: "bad",
    });
    await storage.set("recovery:bad", { source: "keep" });
    expect(await repository.list()).toEqual([]);
    expect(await storage.get("recovery:bad")).toEqual({ source: "keep" });
  });
});

it("an old draft touch cannot revert a newly saved disk baseline", async () => {
  const repository = new WebSessionRepository(new MemoryStorageAdapter());
  const old = await repository.create(
    await openMarkdownFile("# Original"),
    "notes.md",
  );
  const saved = await openMarkdownFile("# Saved");
  await repository.run(() => repository.updateBaseline(old, saved));
  await repository.run(() => repository.touch(old));
  expect((await repository.get(old.localInstanceId))?.baseline.source).toBe(
    "# Saved",
  );
});

it("does not resurrect a previous handle when replacement fails", async () => {
  const storage = new MemoryStorageAdapter();
  const repository = new WebSessionRepository(storage);
  const session = await repository.create(
    await openMarkdownFile("# Same"),
    "same.md",
  );
  // Stored sentinel represents the previous native handle; native structured
  // cloning is verified by the OPFS browser fixture.
  await storage.set(`web-handle:${session.localInstanceId}`, {
    name: "old.md",
  });
  expect((await repository.getHandle(session.localInstanceId))?.name).toBe(
    "old.md",
  );
  expect(
    await repository.retainHandle(session.localInstanceId, {
      name: "new.md",
      getFile: () => Promise.reject(new Error("unused")),
      createWritable: () => Promise.reject(new Error("unused")),
    }),
  ).toBe(false);
  expect(await repository.getHandle(session.localInstanceId)).toBeNull();
});

it("tombstones a stale handle when deletion fails and refuses reconnect if invalidation is blocked", async () => {
  const storage = new MemoryStorageAdapter();
  const repository = new WebSessionRepository(storage);
  await storage.set("web-handle:old", { name: "old.md" });
  vi.spyOn(storage, "delete").mockRejectedValue(new Error("delete blocked"));
  expect(await repository.retainHandle("old", null)).toBe(false);
  expect(await repository.getHandle("old")).toBeNull();
  await storage.set("web-handle:old", { name: "old.md" });
  vi.spyOn(storage, "set").mockRejectedValue(new Error("all storage blocked"));
  await expect(repository.retainHandle("old", null)).rejects.toThrow(
    "all storage blocked",
  );
});
