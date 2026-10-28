import { describe, expect, it, vi } from "vitest";

import type { YeliAsset } from "../../src/document/model.ts";
import { DocumentStore } from "../../src/document/store.ts";
import type { DocumentTransaction } from "../../src/document/transactions.ts";
import {
  createConstructPatch,
  projectMarkdown,
} from "../../src/editor/block-projection.ts";
import { sourceHash } from "../../src/editor/source-ranges.ts";

const source = `---
title: Portable notes
tags: [local]
---
# Introduction

First paragraph.
`;

const helloAsset: YeliAsset = {
  data: "aGVsbG8=",
  id: "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  mimeType: "text/plain",
};
const worldAsset: YeliAsset = {
  data: "d29ybGQ=",
  id: "sha256:486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7",
  mimeType: "text/plain",
};

describe("canonical document store", () => {
  it("replays three bounded edits twice with exact source and increasing revisions", () => {
    const original =
      '\ufeff---\r\n# keep this comment\r\ntitle: "Exact" # inline\r\ncustom: {unknown: [one, two]}\r\n---\r\n\r\nFirst paragraph.\r\n';
    const states = ["First", "Second", "Third", "Fourth"].map((word) =>
      original.replace("First paragraph.", `${word} paragraph.`),
    );
    const jobs: Array<() => void> = [];
    const store = new DocumentStore(original, 10, (job) => jobs.push(job));
    const paragraph = store
      .getSnapshot()
      .projection.blocks.find((block) => block.kind === "paragraph")!;
    const oldPatch = createConstructPatch(
      paragraph,
      { kind: "block-content" },
      "External edit.",
    );
    let revision = 10;
    const assertState = (index: number) => {
      expect(store.getSnapshot()).toMatchObject({
        canRedo: index < 3,
        canUndo: index > 0,
        revision: ++revision,
        source: states[index],
        sourceHash: sourceHash(states[index]!),
      });
    };
    for (const index of [1, 2, 3]) {
      const block = projectMarkdown(
        store.getSnapshot().source,
        store.getSnapshot().revision,
      ).blocks.find((candidate) => candidate.kind === "paragraph")!;
      expect(
        store.applyPatch(
          createConstructPatch(
            block,
            { kind: "block-content" },
            `${["First", "Second", "Third", "Fourth"][index]} paragraph.`,
          ),
        ),
      ).toMatchObject({ ok: true });
      expect(store.getSnapshot().source).toBe(states[index]);
      expect(store.getSnapshot().revision).toBe(++revision);
    }
    for (let round = 0; round < 2; round += 1) {
      store.markClean();
      expect(store.getSnapshot().canUndo).toBe(true);
      for (const index of [2, 1, 0]) {
        expect(store.undo()).toMatchObject({ ok: true });
        assertState(index);
      }
      expect(store.getSnapshot().dirty).toBe(true);
      expect(store.undo()).toBeNull();
      const beforeStale = store.getSnapshot();
      expect(store.applyPatch(oldPatch)).toMatchObject({
        ok: false,
        code: "STALE_REVISION",
      });
      expect(store.getSnapshot()).toBe(beforeStale);
      store.markClean();
      expect(store.getSnapshot().canRedo).toBe(true);
      for (const index of [1, 2, 3]) {
        expect(store.redo()).toMatchObject({ ok: true });
        assertState(index);
      }
      expect(store.redo()).toBeNull();
    }
    const latestJob = jobs.pop()!;
    latestJob();
    const projected = store.getSnapshot();
    for (const job of jobs.reverse()) job();
    expect(store.getSnapshot()).toBe(projected);
    expect(projected.projectionStatus).toBe(
      projectMarkdown(states[3]!, revision).status,
    );
    expect(projected.projection).toMatchObject({
      revision,
      source: states[3],
      sourceHash: projected.sourceHash,
    });
  });

  it("restores every asset-only and mixed step atomically even with equal source hashes", () => {
    const store = new DocumentStore(source, 10);
    const states = [
      { source, assets: [] },
      { source, assets: [helloAsset] },
      { source, assets: [helloAsset, worldAsset] },
      {
        source: `${source}![world](yeli-asset:${worldAsset.id})\n`,
        assets: [worldAsset],
      },
      {
        source: `${source}![world](yeli-asset:${worldAsset.id})\n`,
        assets: [worldAsset, helloAsset],
      },
    ];
    let revision = 10;
    for (const next of states.slice(1)) {
      expect(store.replaceDocument(next.source, next.assets)).toMatchObject({
        ok: true,
      });
      expect(store.getSnapshot()).toMatchObject({
        ...next,
        revision: ++revision,
      });
    }
    let expected = states[4]!;
    const listener = vi.fn(() => {
      const snapshot = store.getSnapshot();
      expect(snapshot.source).toBe(expected.source);
      expect(snapshot.assets).toHaveLength(expected.assets.length);
      expect(snapshot.assets).toEqual(expect.arrayContaining(expected.assets));
    });
    store.subscribe(listener);
    for (let round = 0; round < 2; round += 1) {
      for (const index of [3, 2, 1, 0]) {
        expected = states[index]!;
        expect(store.undo()).toMatchObject({ ok: true });
        expect(store.getSnapshot().revision).toBe(++revision);
      }
      for (const index of [1, 2, 3, 4]) {
        expected = states[index]!;
        expect(store.redo()).toMatchObject({ ok: true });
        expect(store.getSnapshot().revision).toBe(++revision);
      }
    }
    expect(listener).toHaveBeenCalledTimes(16);
  });

  describe.each(["undo", "redo"] as const)("%s failure", (direction) => {
    const failures: Array<{
      code: string;
      corrupt: (transaction: DocumentTransaction) => void;
      label: string;
    }> = [
      {
        label: "original patch revision binding",
        code: "STALE_REVISION",
        corrupt: (transaction) => {
          transaction.patches[0]!.revision -= 1;
        },
      },
      {
        label: "original patch hash binding",
        code: "STALE_SOURCE_HASH",
        corrupt: (transaction) => {
          transaction.patches[0]!.sourceHash = sourceHash("other");
        },
      },
      {
        label: "historical source hash",
        code: "STALE_SOURCE_HASH",
        corrupt: (transaction) => {
          transaction.expectedSourceHash = sourceHash("other");
          transaction.patches[0]!.sourceHash = transaction.expectedSourceHash;
        },
      },
      {
        label: "expected text",
        code: "EXPECTED_TEXT_MISMATCH",
        corrupt: (transaction) => {
          transaction.patches[0]!.expectedText = "other";
        },
      },
      {
        label: "range",
        code: "INVALID_RANGE",
        corrupt: (transaction) => {
          transaction.patches[0]!.range.to += 1;
        },
      },
      {
        label: "asset delta",
        code: "ASSET_DELTA_INVALID",
        corrupt: (transaction) => {
          transaction.assetDelta = { remove: [helloAsset.id] };
        },
      },
      {
        label: "asset validation",
        code: "ASSET_SET_INVALID",
        corrupt: (transaction) => {
          transaction.assetDelta = {
            upsert: [{ ...helloAsset, data: worldAsset.data }],
          };
        },
      },
    ];
    it.each(failures)(
      "retains the entry and publishes nothing for invalid $label",
      ({ code, corrupt }) => {
        const jobs: Array<() => void> = [];
        const store = new DocumentStore("First", 10, (job) => jobs.push(job));
        const first = store.replaceSource("Second")!;
        expect(first.ok).toBe(true);
        if (!first.ok) throw new Error("Expected first edit");
        expect(store.replaceSource("Third")).toMatchObject({ ok: true });
        const undone = store.undo()!;
        expect(undone.ok).toBe(true);
        if (!undone.ok) throw new Error("Expected undo");
        let transaction = first.inverse;
        if (direction === "redo") {
          expect(store.undo()).toMatchObject({ ok: true });
          expect(store.redo()).toMatchObject({ ok: true });
          transaction = undone.inverse;
        }
        const original = structuredClone(transaction);
        corrupt(transaction);
        const corrupted = structuredClone(transaction);
        const before = store.getSnapshot();
        const jobCount = jobs.length;
        const listener = vi.fn();
        store.subscribe(listener);
        for (let attempt = 0; attempt < 2; attempt += 1) {
          expect(store[direction]()).toMatchObject({ ok: false, code });
          expect(store.getSnapshot()).toBe(before);
          expect(transaction).toEqual(corrupted);
        }
        expect(jobs).toHaveLength(jobCount);
        expect(listener).not.toHaveBeenCalled();
        delete transaction.assetDelta;
        Object.assign(transaction, original);
        expect(store[direction]()).toMatchObject({ ok: true });
        expect(store.getSnapshot().source).toBe(
          direction === "undo" ? "First" : "Third",
        );
        expect(transaction).toEqual(original);
      },
    );
  });

  it("clears redo only for successful new edits and clears both stacks on load", () => {
    const jobs: Array<() => void> = [];
    const store = new DocumentStore("First", 10, (job) => jobs.push(job));
    expect(store.replaceSource("Second")).toMatchObject({ ok: true });
    expect(store.replaceSource("Third")).toMatchObject({ ok: true });
    expect(store.undo()).toMatchObject({ ok: true });
    const before = store.getSnapshot();
    expect(store.replaceSource("Second")).toBeNull();
    expect(store.replaceDocument("Second", [])).toBeNull();
    expect(
      store.applyTransaction({
        expectedRevision: before.revision,
        expectedSourceHash: before.sourceHash,
        operation: "invalid:asset",
        patches: [],
        assetDelta: { remove: [helloAsset.id] },
      }),
    ).toMatchObject({ ok: false, code: "ASSET_DELTA_INVALID" });
    expect(store.getSnapshot()).toBe(before);
    expect(store.redo()).toMatchObject({ ok: true, source: "Third" });
    expect(store.undo()).toMatchObject({ ok: true });
    expect(store.replaceSource("Branch")).toMatchObject({ ok: true });
    expect(store.getSnapshot().canRedo).toBe(false);
    expect(store.redo()).toBeNull();
    expect(store.undo()).toMatchObject({ ok: true, source: "Second" });
    expect(store.getSnapshot()).toMatchObject({ canUndo: true, canRedo: true });
    store.loadSource("Loaded", 30, [helloAsset]);
    const loaded = store.getSnapshot();
    expect(store.undo()).toBeNull();
    expect(store.redo()).toBeNull();
    for (const job of jobs.reverse()) job();
    expect(store.getSnapshot()).toBe(loaded);
    expect(loaded).toMatchObject({
      assets: [helloAsset],
      canUndo: false,
      canRedo: false,
      dirty: false,
      projectionStatus: "ready",
      revision: 30,
      source: "Loaded",
    });
  });

  it("keeps custom property changes atomic and undoable with no body drift", () => {
    const store = new DocumentStore(source, 4);
    expect(store.patchMetadata("reviewed", false)).toMatchObject({ ok: true });
    expect(store.getSnapshot().source).toBe(
      source.replace(
        "---\n# Introduction",
        "reviewed: false\n---\n# Introduction",
      ),
    );
    expect(store.getSnapshot().revision).toBe(5);
    expect(store.undo()).toMatchObject({ ok: true });
    expect(store.getSnapshot().source).toBe(source);
    expect(store.redo()).toMatchObject({ ok: true });
    const added = store.getSnapshot().source;
    expect(store.patchMetadata("reviewed", undefined)).toMatchObject({
      ok: true,
    });
    expect(store.getSnapshot().source).toBe(source);
    expect(store.undo()).toMatchObject({ ok: true });
    expect(store.getSnapshot().source).toBe(added);
  });
  it("keeps mode and focus transitions byte-neutral", () => {
    const store = new DocumentStore(source, 4);
    const before = store.getSnapshot().source;

    store.setPrimaryMode("edit");
    store.openAdvancedSource();
    store.closeAdvancedSource();
    store.setPrimaryMode("read");

    expect(store.getSnapshot()).toMatchObject({
      mode: "read",
      primaryMode: "read",
      revision: 4,
      source: before,
    });
  });

  it("commits one bounded block patch and then publishes its projection", () => {
    const jobs: Array<() => void> = [];
    const store = new DocumentStore(source, 4, (job) => jobs.push(job));
    const paragraph = store
      .getSnapshot()
      .projection.blocks.find((block) => block.kind === "paragraph")!;
    const patch = createConstructPatch(
      paragraph,
      { kind: "block-content" },
      "Changed paragraph.",
    );

    expect(store.applyPatch(patch)).toMatchObject({ ok: true });
    expect(store.getSnapshot()).toMatchObject({
      canUndo: true,
      dirty: true,
      projectionStatus: "pending",
      revision: 5,
    });
    expect(store.getSnapshot().source).toContain("Changed paragraph.");
    expect(store.getSnapshot().projection.blocks).not.toHaveLength(0);

    jobs.shift()?.();
    expect(store.getSnapshot().projectionStatus).toBe("ready");
    expect(
      store
        .getSnapshot()
        .projection.blocks.find((block) => block.kind === "paragraph")
        ?.expectedText,
    ).toBe("Changed paragraph.\n");
  });

  it("rejects stale edits and preserves the current source", () => {
    const store = new DocumentStore(source, 4);
    const staleProjection = projectMarkdown(source, 3);
    const paragraph = staleProjection.blocks.find(
      (block) => block.kind === "paragraph",
    )!;
    const before = store.getSnapshot().source;

    expect(
      store.applyPatch(
        createConstructPatch(
          paragraph,
          { kind: "block-content" },
          "Stale replacement",
        ),
      ),
    ).toMatchObject({ ok: false, code: "STALE_REVISION" });
    expect(store.getSnapshot().source).toBe(before);
  });

  it("undoes and redoes committed source operations without broad drift", () => {
    const jobs: Array<() => void> = [];
    const store = new DocumentStore(source, 4, (job) => jobs.push(job));
    const paragraph = store
      .getSnapshot()
      .projection.blocks.find((block) => block.kind === "paragraph")!;
    store.applyPatch(
      createConstructPatch(
        paragraph,
        { kind: "block-content" },
        "Changed paragraph.",
      ),
    );
    jobs.shift()?.();
    const changed = store.getSnapshot().source;

    expect(store.undo()).toMatchObject({ ok: true });
    jobs.shift()?.();
    expect(store.getSnapshot().source).toBe(source);
    expect(store.getSnapshot().canRedo).toBe(true);

    expect(store.redo()).toMatchObject({ ok: true });
    jobs.shift()?.();
    expect(store.getSnapshot().source).toBe(changed);
  });

  it("patches one metadata property and retains unknown source text", () => {
    const jobs: Array<() => void> = [];
    const custom = source.replace(
      "tags: [local]",
      "custom: exact\ntags: [local]",
    );
    const store = new DocumentStore(custom, 1, (job) => jobs.push(job));

    expect(store.patchMetadata("title", "Renamed")).toMatchObject({ ok: true });
    jobs.shift()?.();
    expect(store.getSnapshot().source).toContain("title: Renamed");
    expect(store.getSnapshot().source).toContain("custom: exact");
  });

  it("appends declarative template content as ordinary Markdown", () => {
    const store = new DocumentStore(source, 1);

    expect(
      store.appendMarkdown(
        "\n## 会议记录\n\n- [ ] 下一步\n",
        "template:meeting-notes",
      ),
    ).toMatchObject({ ok: true });
    expect(
      store.getSnapshot().source.endsWith("\n## 会议记录\n\n- [ ] 下一步\n"),
    ).toBe(true);
    expect(store.getSnapshot().source).not.toContain("<script");
  });

  it("withholds projection work from an older revision", () => {
    const jobs: Array<() => void> = [];
    const store = new DocumentStore(source, 1, (job) => jobs.push(job));

    store.replaceSource(source.replace("First", "Second"), "advanced-source");
    store.replaceSource(
      store.getSnapshot().source.replace("Second", "Third"),
      "advanced-source",
    );
    expect(jobs).toHaveLength(2);

    jobs[0]?.();
    expect(store.getSnapshot().projectionStatus).toBe("pending");
    jobs[1]?.();
    expect(store.getSnapshot().projectionStatus).toBe("ready");
    expect(store.getSnapshot().source).toContain("Third paragraph");
    expect(store.getSnapshot().projection.source).toContain("Third paragraph");
  });

  it("keeps unchanged downstream block identities stable after an earlier edit", () => {
    const jobs: Array<() => void> = [];
    const large = `${source}\n\`\`\`text\n${"x".repeat(1024 * 1024)}\n\`\`\`\n`;
    const store = new DocumentStore(large, 1, (job) => jobs.push(job));
    const before = store.getSnapshot().projection.blocks;
    const paragraph = before.find((block) => block.kind === "paragraph")!;
    const fenceId = before.find((block) => block.kind === "code-fence")!.id;

    store.applyPatch(
      createConstructPatch(
        paragraph,
        { kind: "block-content" },
        "A longer replacement paragraph.",
      ),
    );
    jobs.shift()?.();

    expect(
      store
        .getSnapshot()
        .projection.blocks.find((block) => block.kind === "code-fence")?.id,
    ).toBe(fenceId);
  });

  it("keeps retained and inserted block identities unique", () => {
    const jobs: Array<() => void> = [];
    const original = "# A\n\nBody\n\n# B\n\nTail\n";
    const store = new DocumentStore(original, 1, (job) => jobs.push(job));
    const before = store.getSnapshot().projection.blocks;
    const retainedHeadingId = before.find(
      (block) => block.kind === "heading" && block.expectedText === "# A\n",
    )!.id;

    store.replaceSource(`# Z\n\n${original}`, "advanced-source");
    jobs.shift()?.();

    const after = store.getSnapshot().projection.blocks;
    expect(new Set(after.map((block) => block.id)).size).toBe(after.length);
    expect(
      after.find(
        (block) => block.kind === "heading" && block.expectedText === "# A\n",
      )?.id,
    ).toBe(retainedHeadingId);
    expect(after[0]?.id).not.toBe(retainedHeadingId);
  });
});
