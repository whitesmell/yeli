import { describe, expect, it } from "vitest";

import {
  LocalDocumentRepository,
  MemoryStorageAdapter,
} from "../../src/storage/recovery.ts";

describe("local recovery and version identity", () => {
  it("isolates same-docId files by opaque local instance identity", async () => {
    const storage = new MemoryStorageAdapter();
    let sequence = 0;
    const repository = new LocalDocumentRepository(storage, {
      now: () => 1_700_000_000_000 + sequence,
      randomId: () => `local-${++sequence}`,
      versionLimit: 3,
    });
    const first = await repository.createInstance(
      "shared-doc",
      "fingerprint-a",
    );
    const second = await repository.createInstance(
      "shared-doc",
      "fingerprint-b",
    );

    await repository.saveRecovery(first.localInstanceId, {
      revision: 2,
      source: "first recovery",
      sourceHash: "hash-first",
    });

    expect(await repository.getRecovery(first.localInstanceId)).toMatchObject({
      source: "first recovery",
    });
    expect(await repository.getRecovery(second.localInstanceId)).toBeNull();
    expect(first.localInstanceId).not.toBe(second.localInstanceId);
  });

  it("keeps byte-identical instances distinct until a caller explicitly reconnects", async () => {
    const repository = new LocalDocumentRepository(new MemoryStorageAdapter(), {
      randomId: (() => {
        let value = 0;
        return () => `identical-${++value}`;
      })(),
    });
    const first = await repository.createInstance("shared", "same-bytes");
    const second = await repository.createInstance("shared", "same-bytes");
    await repository.saveRecovery(first.localInstanceId, {
      revision: 2,
      source: "private draft",
      sourceHash: "private-hash",
    });

    const matches = await repository.findByFingerprint("same-bytes");

    expect(matches.map((item) => item.localInstanceId).sort()).toEqual([
      first.localInstanceId,
      second.localInstanceId,
    ]);
    expect(await repository.getRecovery(second.localInstanceId)).toBeNull();
  });

  it("keeps embedded assets with recovery and history snapshots", async () => {
    const repository = new LocalDocumentRepository(new MemoryStorageAdapter(), {
      now: () => 1_700_000_000_000,
      randomId: () => "asset-instance",
    });
    const instance = await repository.createInstance(
      "asset-doc",
      "fingerprint",
    );
    const assets = [
      {
        data: "UklGRgAAAABXRUJQ",
        id: `sha256:${"a".repeat(64)}`,
        mimeType: "image/webp",
      },
    ];

    await repository.saveRecovery(instance.localInstanceId, {
      assets,
      revision: 2,
      source: `![image](yeli-asset:${assets[0]!.id})`,
      sourceHash: "asset-hash",
    });
    await repository.recordVersion(instance.localInstanceId, {
      assets,
      change: {
        actorLabel: "codex/session-42",
        origin: "external-agent",
        summary: "Updated the image caption",
      },
      reason: "edit",
      revision: 2,
      source: `![image](yeli-asset:${assets[0]!.id})`,
      sourceHash: "asset-hash",
    });

    expect(
      await repository.getRecovery(instance.localInstanceId),
    ).toMatchObject({
      assets,
    });
    expect(
      await repository.listVersions(instance.localInstanceId),
    ).toMatchObject([
      {
        assets,
        change: {
          actorLabel: "codex/session-42",
          origin: "external-agent",
          summary: "Updated the image caption",
        },
      },
    ]);
  });

  it("caps history and restores only through an explicit instance key", async () => {
    const storage = new MemoryStorageAdapter();
    let sequence = 0;
    const repository = new LocalDocumentRepository(storage, {
      now: () => 1_700_000_000_000 + sequence,
      randomId: () => `local-${++sequence}`,
      versionLimit: 2,
    });
    const instance = await repository.createInstance("doc", "fingerprint");

    await repository.recordVersion(instance.localInstanceId, {
      reason: "edit",
      revision: 1,
      source: "one",
      sourceHash: "hash-1",
    });
    await repository.recordVersion(instance.localInstanceId, {
      reason: "edit",
      revision: 2,
      source: "two",
      sourceHash: "hash-2",
    });
    await repository.recordVersion(instance.localInstanceId, {
      reason: "save",
      revision: 3,
      source: "three",
      sourceHash: "hash-3",
    });

    const versions = await repository.listVersions(instance.localInstanceId);
    expect(versions.map((version) => version.source)).toEqual(["three", "two"]);
    expect(
      await repository.findVersion(instance.localInstanceId, versions[1]!.id),
    ).toEqual(versions[1]);
    expect(
      await repository.findVersion(instance.localInstanceId, "deleted-version"),
    ).toBeNull();
  });

  it("forks Save Copy to a new local instance and leaves history behind", async () => {
    const repository = new LocalDocumentRepository(new MemoryStorageAdapter(), {
      now: () => 1_700_000_000_000,
      randomId: (() => {
        let value = 0;
        return () => `local-${++value}`;
      })(),
      versionLimit: 3,
    });
    const source = await repository.createInstance("doc", "fingerprint");
    await repository.recordVersion(source.localInstanceId, {
      reason: "edit",
      revision: 1,
      source: "source",
      sourceHash: "hash",
    });

    const fork = await repository.forkInstance(
      source.localInstanceId,
      "fingerprint-copy",
    );

    expect(fork.localInstanceId).not.toBe(source.localInstanceId);
    expect(await repository.listVersions(fork.localInstanceId)).toEqual([]);
    expect(await repository.listVersions(source.localInstanceId)).toHaveLength(
      1,
    );
  });
});
