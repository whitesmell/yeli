import { describe, expect, it } from "vitest";

import { DocumentStore } from "../../src/document/store.ts";
import {
  applyDocumentTransaction,
  createAssetDeltaForPatch,
  type DocumentTransactionState,
} from "../../src/document/transactions.ts";
import type { YeliAsset } from "../../src/document/model.ts";
import {
  createSourcePatch,
  sourceHash,
  type SourceRange,
} from "../../src/editor/source-ranges.ts";

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

function state(
  source: string,
  assets: readonly YeliAsset[] = [],
): DocumentTransactionState {
  return { assets, revision: 4, source, sourceHash: sourceHash(source) };
}

function patch(
  current: DocumentTransactionState,
  range: SourceRange,
  insert: string,
  operation = "test:patch",
) {
  return createSourcePatch(
    {
      expectedText: current.source,
      id: "document",
      range: { from: 0, to: current.source.length },
      revision: current.revision,
      sourceHash: current.sourceHash,
    },
    insert,
    operation,
    range,
  );
}

describe("document transactions", () => {
  it("keeps missing-property removal inside the BOM frontmatter block", () => {
    const source = "\ufeff---\ntitle: Original\n---\nBody\n";
    const store = new DocumentStore(source);

    expect(store.patchMetadata("missing", undefined)).toMatchObject({
      ok: true,
      source,
      changedRanges: [
        { before: { from: 1, to: 1 }, after: { from: 1, to: 1 } },
      ],
    });
    expect(store.getSnapshot().source).toBe(source);
  });

  it("edits a BOM frontmatter title with a narrow diff and restores exact bytes on undo", () => {
    const source =
      '\ufeff---\n# keep\ntitle: "Old title" # note\ncustom-safe: "keep  two  spaces"\n---\n\n# Body\n\nUntouched body.\n';
    const store = new DocumentStore(source, 4);
    const start = source.indexOf('"Old title"');
    const end = start + '"Old title"'.length;
    const result = store.patchMetadata("title", "New title");

    expect(result).toMatchObject({
      ok: true,
      changedRanges: [
        { before: { from: start, to: end }, after: { from: start, to: end } },
      ],
      source: source.replace('"Old title"', '"New title"'),
    });
    expect(store.getSnapshot().source[0]).toBe("\ufeff");
    expect(store.getSnapshot().source.slice(1).match(/^---$/gmu)).toHaveLength(
      2,
    );
    expect(store.undo()?.ok).toBe(true);
    expect(store.getSnapshot().source).toBe(source);
    expect(store.redo()?.ok).toBe(true);
    expect(store.getSnapshot().source).toBe(
      source.replace('"Old title"', '"New title"'),
    );
  });

  it("creates frontmatter after a leading BOM as one undoable insertion", () => {
    const source = "\ufeff# Body\n";
    const store = new DocumentStore(source);

    expect(store.patchMetadata("title", "Title")).toMatchObject({
      ok: true,
      changedRanges: [expect.objectContaining({ before: { from: 1, to: 1 } })],
      source: "\ufeff---\ntitle: Title\n---\n# Body\n",
    });
    expect(store.undo()?.ok).toBe(true);
    expect(store.getSnapshot().source).toBe(source);
  });

  it("applies multiple source patches against one snapshot as one revision", () => {
    const current = state("alpha beta gamma");
    const result = applyDocumentTransaction(current, {
      expectedRevision: current.revision,
      expectedSourceHash: current.sourceHash,
      operation: "replace:two",
      patches: [
        patch(current, { from: 0, to: 5 }, "A"),
        patch(current, { from: 11, to: 16 }, "G"),
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      revision: 5,
      source: "A beta G",
      undoEntries: 1,
    });
    if (!result.ok) return;
    expect(result.changedRanges).toEqual([
      { before: { from: 0, to: 5 }, after: { from: 0, to: 1 } },
      { before: { from: 11, to: 16 }, after: { from: 7, to: 8 } },
    ]);
  });

  it("rejects overlap and stale transactions without publishing partial data", () => {
    const current = state("alpha beta gamma", [helloAsset]);
    const overlap = applyDocumentTransaction(current, {
      assetDelta: { upsert: [worldAsset] },
      expectedRevision: current.revision,
      expectedSourceHash: current.sourceHash,
      operation: "invalid:overlap",
      patches: [
        patch(current, { from: 0, to: 5 }, "first"),
        patch(current, { from: 4, to: 10 }, "second"),
      ],
    });
    const stale = applyDocumentTransaction(current, {
      expectedRevision: current.revision - 1,
      expectedSourceHash: current.sourceHash,
      operation: "invalid:stale",
      patches: [],
    });

    expect(overlap).toMatchObject({
      assets: [helloAsset],
      code: "OVERLAPPING_RANGES",
      ok: false,
      source: current.source,
    });
    expect(stale).toMatchObject({
      assets: [helloAsset],
      code: "STALE_REVISION",
      ok: false,
      source: current.source,
    });
  });

  it("commits and undoes a source-plus-asset change atomically", () => {
    const original = "# Assets\n";
    const store = new DocumentStore(original, 4);
    const current = store.getSnapshot();
    const reference = `![hello](yeli-asset:${helloAsset.id})\n`;
    const result = store.applyTransaction({
      assetDelta: { upsert: [helloAsset] },
      expectedRevision: current.revision,
      expectedSourceHash: current.sourceHash,
      operation: "image:add",
      patches: [
        patch(
          current,
          { from: original.length, to: original.length },
          reference,
        ),
      ],
    });

    expect(result).toMatchObject({ ok: true, undoEntries: 1 });
    expect(store.getSnapshot()).toMatchObject({
      assets: [helloAsset],
      canUndo: true,
      lastMutation: {
        operation: "image:add",
      },
      revision: 5,
      source: `${original}${reference}`,
    });
    expect(store.getSnapshot().lastMutation?.blockKinds).toContain("heading");
    expect(store.getSnapshot().lastMutation?.blockKinds).toContain("image");

    expect(store.undo()).toMatchObject({ ok: true, undoEntries: 1 });
    expect(store.getSnapshot()).toMatchObject({
      assets: [],
      canRedo: true,
      revision: 6,
      source: original,
    });

    expect(store.redo()).toMatchObject({ ok: true, undoEntries: 1 });
    expect(store.getSnapshot()).toMatchObject({
      assets: [helloAsset],
      revision: 7,
      source: `${original}${reference}`,
    });
  });

  it("preserves shared assets and rejects removal while referenced", () => {
    const source = `![one](yeli-asset:${helloAsset.id})\n![two](yeli-asset:${helloAsset.id})\n`;
    const store = new DocumentStore(source, 4, [helloAsset]);
    const current = store.getSnapshot();
    const firstLineEnd = source.indexOf("\n") + 1;
    const firstDelete = patch(
      current,
      { from: 0, to: firstLineEnd },
      "",
      "image:delete",
    );
    const firstDelta = createAssetDeltaForPatch(current, firstDelete, {
      pruneAssetIds: [helloAsset.id],
    });

    expect(firstDelta).toBeUndefined();
    expect(
      store.applyTransaction({
        expectedRevision: current.revision,
        expectedSourceHash: current.sourceHash,
        operation: "image:delete",
        patches: [firstDelete],
      }),
    ).toMatchObject({ ok: true });
    expect(store.getSnapshot().assets).toEqual([helloAsset]);

    const afterDelete = store.getSnapshot();
    expect(
      store.applyTransaction({
        assetDelta: { remove: [helloAsset.id] },
        expectedRevision: afterDelete.revision,
        expectedSourceHash: afterDelete.sourceHash,
        operation: "asset:remove",
        patches: [],
      }),
    ).toMatchObject({ code: "ASSET_SET_INVALID", ok: false });
    expect(store.getSnapshot().assets).toEqual([helloAsset]);

    const beforeFinalDelete = store.getSnapshot();
    const finalDelete = patch(
      beforeFinalDelete,
      { from: 0, to: beforeFinalDelete.source.length },
      "",
      "image:delete",
    );
    const finalDelta = createAssetDeltaForPatch(
      beforeFinalDelete,
      finalDelete,
      { pruneAssetIds: [helloAsset.id] },
    );
    expect(finalDelta).toEqual({ remove: [helloAsset.id], upsert: [] });
    if (!finalDelta) throw new Error("Expected final-reference cleanup");
    expect(
      store.applyTransaction({
        assetDelta: finalDelta,
        expectedRevision: beforeFinalDelete.revision,
        expectedSourceHash: beforeFinalDelete.sourceHash,
        operation: "image:delete",
        patches: [finalDelete],
      }),
    ).toMatchObject({ ok: true });
    expect(store.getSnapshot()).toMatchObject({ assets: [], source: "" });
    expect(store.undo()).toMatchObject({ ok: true });
    expect(store.getSnapshot()).toMatchObject({
      assets: [helloAsset],
      source: `![two](yeli-asset:${helloAsset.id})\n`,
    });
  });

  it.each([
    ["deleting", ""],
    ["replacing", "![replacement](./replacement.png)\n"],
  ])(
    "retains a reference-style image asset when %s a direct image",
    (_operation, replacement) => {
      const direct = `![direct](yeli-asset:${helloAsset.id})\n`;
      const source = `${direct}![shared][asset]\n\n[asset]: yeli-asset:${helloAsset.id}\n`;
      const store = new DocumentStore(source, 4, [helloAsset]);
      const current = store.getSnapshot();
      const imagePatch = patch(
        current,
        { from: 0, to: direct.length },
        replacement,
        "image:update",
      );
      const assetDelta = createAssetDeltaForPatch(current, imagePatch, {
        pruneAssetIds: [helloAsset.id],
      });

      expect(assetDelta).toBeUndefined();
      expect(
        store.applyTransaction({
          expectedRevision: current.revision,
          expectedSourceHash: current.sourceHash,
          operation: "image:update",
          patches: [imagePatch],
        }),
      ).toMatchObject({ ok: true });
      expect(store.getSnapshot().assets).toEqual([helloAsset]);
    },
  );

  it("restores source and assets together and rejects an incomplete snapshot", () => {
    const firstSource = `![hello](yeli-asset:${helloAsset.id})\n`;
    const secondSource = `![world](yeli-asset:${worldAsset.id})\n`;
    const store = new DocumentStore(firstSource, 4, [helloAsset]);

    expect(
      store.replaceDocument(secondSource, [worldAsset], "recovery:restore"),
    ).toMatchObject({ ok: true });
    expect(store.getSnapshot()).toMatchObject({
      assets: [worldAsset],
      source: secondSource,
    });

    expect(store.undo()).toMatchObject({ ok: true });
    expect(store.getSnapshot()).toMatchObject({
      assets: [helloAsset],
      source: firstSource,
    });

    const beforeInvalid = store.getSnapshot();
    expect(
      store.replaceDocument(secondSource, [], "recovery:restore"),
    ).toMatchObject({ code: "ASSET_SET_INVALID", ok: false });
    expect(store.getSnapshot()).toEqual(beforeInvalid);
  });
});
