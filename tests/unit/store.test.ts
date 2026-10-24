import { describe, expect, it } from "vitest";

import { DocumentStore } from "../../src/document/store.ts";
import {
  createConstructPatch,
  projectMarkdown,
} from "../../src/editor/block-projection.ts";

const source = `---
title: Portable notes
tags: [local]
---
# Introduction

First paragraph.
`;

describe("canonical document store", () => {
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
