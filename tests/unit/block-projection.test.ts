import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MinimalInputBuffer } from "../../src/editor/candidates/minimal-input-buffer.ts";
import {
  applySourcePatch,
  type SourcePatch,
} from "../../src/editor/source-ranges.ts";
import {
  createBlockReplacementPatch,
  createConstructPatch,
  createFrontmatterPropertyPatch,
  createSplitInlineBlockPatch,
  projectTableRows,
  projectMarkdown,
  resolveReadEditTarget,
  transitionProjection,
} from "../../src/editor/block-projection.ts";

const source = readFileSync(
  resolve("tests/fixtures/fidelity/wysiwyg-combinations.md"),
  "utf8",
);

describe("source-mapped block projection", () => {
  it("splits ordered lists and tasks into adjacent structural blocks", () => {
    const orderedSource = "2. Before after\n";
    const ordered = projectMarkdown(orderedSource, 1).blocks[0]!;
    const orderedResult = applySourcePatch(
      orderedSource,
      { revision: 1 },
      createSplitInlineBlockPatch(ordered, "Before", "after"),
    );
    expect(orderedResult).toMatchObject({ ok: true });
    if (orderedResult.ok) {
      expect(orderedResult.source).toBe("2. Before\n3. after\n");
    }

    const taskSource = "- [x] Before after\n";
    const task = projectMarkdown(taskSource, 1).blocks[0]!;
    const taskResult = applySourcePatch(
      taskSource,
      { revision: 1 },
      createSplitInlineBlockPatch(task, "Before", "after"),
    );
    expect(taskResult).toMatchObject({ ok: true });
    if (taskResult.ok) {
      expect(taskResult.source).toBe("- [x] Before\n- [ ] after\n");
    }
  });

  it("projects an empty source as one editable blank block", () => {
    const projection = projectMarkdown("", 1);

    expect(projection.blocks).toHaveLength(1);
    expect(projection.blocks[0]).toMatchObject({
      editable: true,
      expectedText: "",
      kind: "blank",
      range: { from: 0, to: 0 },
    });

    const patch = createConstructPatch(
      projection.blocks[0]!,
      { kind: "block-content" },
      "First line",
    );
    expect(applySourcePatch("", { revision: 1 }, patch)).toMatchObject({
      ok: true,
      source: "First line",
    });
  });

  it("projects Setext headings and thematic breaks without flattening their source", () => {
    const projection = projectMarkdown(
      "Primary\n=======\n\nSecondary\n---------\n\n---\n",
      3,
    );
    expect(
      projection.blocks
        .filter((block) => block.kind !== "blank")
        .map((block) => ({
          editable: block.editable,
          expectedText: block.expectedText,
          kind: block.kind,
        })),
    ).toEqual([
      {
        editable: true,
        expectedText: "Primary\n=======\n",
        kind: "heading",
      },
      {
        editable: true,
        expectedText: "Secondary\n---------\n",
        kind: "heading",
      },
      { editable: true, expectedText: "---\n", kind: "thematic-break" },
    ]);
    const first = projection.blocks.find(
      (block) => block.expectedText === "Primary\n=======\n",
    )!;
    expect(
      createConstructPatch(first, { kind: "block-content" }, "Renamed")
        .expectedText,
    ).toBe("Primary");
  });

  it("only consumes paragraph-eligible lines as Setext headings", () => {
    const projection = projectMarkdown(
      [
        "- list",
        "---",
        "",
        "- [ ] task",
        "---",
        "",
        "1. ordered",
        "---",
        "",
        "> quote",
        "---",
        "",
        "---",
        "---",
        "",
        "```md",
        "inside",
        "```",
        "---",
        "",
        "[guide]: ./guide.md",
        "---",
        "",
        "<!-- source-safe -->",
        "---",
        "",
        "Valid",
        "===",
        "",
        "Valid two",
        "---",
        "",
      ].join("\n"),
      1,
    );

    expect(
      projection.blocks
        .filter((block) => block.kind !== "blank")
        .map((block) => block.kind),
    ).toEqual([
      "list-item",
      "thematic-break",
      "task",
      "thematic-break",
      "list-item",
      "thematic-break",
      "quote",
      "thematic-break",
      "thematic-break",
      "thematic-break",
      "code-fence",
      "thematic-break",
      "reference-definition",
      "thematic-break",
      "raw-html",
      "thematic-break",
      "heading",
      "heading",
    ]);
  });

  it("binds every block and patch to revision, sourceHash, and expected text", () => {
    const projection = projectMarkdown(source, 7);
    const heading = projection.blocks.find((block) => block.kind === "heading");
    expect(heading).toMatchObject({
      revision: 7,
      sourceHash: projection.sourceHash,
      expectedText: "# Heading with [reference][guide]\n",
    });

    const patch = createBlockReplacementPatch(
      heading!,
      "# Renamed with [reference][guide]\n",
    );
    expect(patch).toMatchObject({
      revision: 7,
      sourceHash: projection.sourceHash,
      expectedText: heading!.expectedText,
    });
  });

  it("keeps source byte-identical through no-edit projection transitions", () => {
    let projection = projectMarkdown(source, 11);
    for (const event of [
      "open",
      "focus",
      "blur",
      "read",
      "edit",
      "advanced-source-open",
      "advanced-source-close",
      "save",
    ] as const) {
      projection = transitionProjection(projection, event);
      expect(projection.source).toBe(source);
    }
  });

  it("returns from Advanced Source to the primary mode that opened it", () => {
    const readProjection = projectMarkdown(source, 11);
    expect(
      transitionProjection(
        transitionProjection(readProjection, "advanced-source-open"),
        "advanced-source-close",
      ).mode,
    ).toBe("read");

    const editProjection = transitionProjection(readProjection, "edit");
    expect(
      transitionProjection(
        transitionProjection(editProjection, "advanced-source-open"),
        "advanced-source-close",
      ).mode,
    ).toBe("edit");
  });

  it("restores only exact current visible-text selections", () => {
    const handoffSource = "Before\n\nPlain target\n\nAfter\n";
    const projection = projectMarkdown(handoffSource, 4);
    const block = projection.blocks.find(
      (candidate) => candidate.expectedText === "Plain target\n",
    )!;
    const resolved = resolveReadEditTarget(projection, {
      block,
      revision: projection.revision,
      selection: {
        end: 12,
        renderedText: "Plain target",
        selectedText: "target",
        start: 6,
      },
      selectionWasAmbiguous: false,
      sourceHash: projection.sourceHash,
      viewportTop: 220,
    });

    expect(resolved).toMatchObject({
      block: { id: block.id },
      selection: { end: 12, selectedText: "target", start: 6 },
    });

    const markedSource = "Before\n\n**Plain** target\n\nAfter\n";
    const markedProjection = projectMarkdown(markedSource, 5);
    const markedBlock = markedProjection.blocks.find(
      (candidate) => candidate.expectedText === "**Plain** target\n",
    )!;
    expect(
      resolveReadEditTarget(markedProjection, {
        block: markedBlock,
        revision: markedProjection.revision,
        selection: {
          end: 12,
          renderedText: "Plain target",
          selectedText: "target",
          start: 6,
        },
        selectionWasAmbiguous: false,
        sourceHash: markedProjection.sourceHash,
        viewportTop: 220,
      }),
    ).toMatchObject({
      block: { id: markedBlock.id },
      fallbackReason: "selection-ambiguous",
    });
  });

  it("falls back predictably for stale and unavailable Read targets", () => {
    const handoffSource = "First\n\nTarget\n\nLast\n";
    const original = projectMarkdown(handoffSource, 1);
    const block = original.blocks.find(
      (candidate) => candidate.expectedText === "Target\n",
    )!;
    const target = {
      block,
      revision: original.revision,
      selection: null,
      selectionWasAmbiguous: false,
      sourceHash: original.sourceHash,
      viewportTop: 180,
    } as const;

    expect(
      resolveReadEditTarget(projectMarkdown(handoffSource, 2), target),
    ).toMatchObject({
      block: { expectedText: "Target\n" },
      fallbackReason: "stale-target",
    });
    expect(
      resolveReadEditTarget(
        projectMarkdown("First\n\nReplacement\n\nLast\n", 2),
        target,
      ),
    ).toMatchObject({
      block: { expectedText: "Replacement\n" },
      fallbackReason: "target-unavailable",
    });
  });

  it("rejects a stale source span instead of overwriting newer text", () => {
    const projection = projectMarkdown(source, 3);
    const paragraph = projection.blocks.find(
      (block) => block.kind === "paragraph",
    )!;
    const patch = createBlockReplacementPatch(paragraph, "Replacement\n");
    const externallyEdited = source.replace("Paragraph", "Newer paragraph");

    expect(
      applySourcePatch(externallyEdited, { revision: 4 }, patch),
    ).toMatchObject({ ok: false, code: "STALE_REVISION" });
    expect(externallyEdited).toContain("Newer paragraph");
  });

  it("fails closed if expected text no longer matches at the asserted range", () => {
    const projection = projectMarkdown(source, 3);
    const paragraph = projection.blocks.find(
      (block) => block.kind === "paragraph",
    )!;
    const patch: SourcePatch = {
      ...createBlockReplacementPatch(paragraph, "Replacement\n"),
      expectedText: "not the current text",
    };

    expect(applySourcePatch(source, { revision: 3 }, patch)).toMatchObject({
      ok: false,
      code: "EXPECTED_TEXT_MISMATCH",
    });
  });

  it("fails closed on stale source hashes and invalid source ranges", () => {
    const projection = projectMarkdown(source, 3);
    const paragraph = projection.blocks.find(
      (block) => block.kind === "paragraph",
    )!;
    const patch = createBlockReplacementPatch(paragraph, "Replacement\n");
    const externallyEdited = source.replace("Paragraph", "Newer paragraph");

    expect(
      applySourcePatch(externallyEdited, { revision: 3 }, patch),
    ).toMatchObject({ ok: false, code: "STALE_SOURCE_HASH" });
    expect(
      applySourcePatch(
        source,
        { revision: 3 },
        {
          ...patch,
          range: { from: -1, to: patch.range.to },
        },
      ),
    ).toMatchObject({ ok: false, code: "INVALID_RANGE" });
  });

  it("applies a successful patch and its inverse as two atomic entries", () => {
    const projection = projectMarkdown(source, 3);
    const paragraph = projection.blocks.find(
      (block) => block.kind === "paragraph",
    )!;
    const changed = applySourcePatch(
      source,
      { revision: 3 },
      createBlockReplacementPatch(paragraph, "Replacement\n"),
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.undoEntries).toBe(1);

    const restored = applySourcePatch(
      changed.source,
      { revision: changed.revision, sourceHash: changed.sourceHash },
      changed.inverse,
    );
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.source).toBe(source);
  });

  it("keeps unsupported and ambiguous constructs exact and source-safe", () => {
    const projection = projectMarkdown(source, 1);
    expect(projection.status).toBe("degraded");
    const unsafeKinds = new Set([
      "reference-definition",
      "raw-html",
      "mermaid",
      "math",
      "unknown-extension",
    ]);
    const sourceSafe = projection.blocks.filter((block) => !block.editable);

    expect(new Set(sourceSafe.map((block) => block.kind))).toEqual(unsafeKinds);
    for (const block of sourceSafe) {
      expect(source.slice(block.range.from, block.range.to)).toBe(
        block.expectedText,
      );
    }
  });

  it("reports ready only when every projected construct is supported", () => {
    expect(projectMarkdown("# Heading\n\nPlain paragraph.\n", 1).status).toBe(
      "ready",
    );
  });

  it("rejects invalid projection revisions before binding source ranges", () => {
    for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => projectMarkdown("# Heading\n", revision)).toThrow(
        "Projection revision must be a non-negative safe integer",
      );
    }
  });

  it("expresses every supported construct as one bounded source operation", () => {
    const projection = projectMarkdown(source, 5);
    const targets = [
      ["heading", { kind: "block-content" }, "Renamed [reference][guide]"],
      ["paragraph", { kind: "link-label" }, "renamed link"],
      ["paragraph", { kind: "link-target" }, "./renamed.md"],
      ["paragraph", { kind: "image-alt" }, "descriptive alt"],
      ["paragraph", { kind: "image-target" }, "yeli-asset:sha256:changed"],
      ["paragraph", { kind: "image-title" }, "portable image"],
      ["list-item", { kind: "block-content" }, "renamed outer"],
      ["task", { kind: "task-marker", checked: true }, ""],
      ["quote", { kind: "block-content" }, "Renamed quote"],
      ["table", { kind: "table-cell", row: 1, column: 1 }, "changed"],
      ["code-fence", { kind: "fence-content" }, "const safe = true;\n"],
    ] as const;

    for (const [kind, target, insert] of targets) {
      const sourceBlock = projection.blocks.find((item) => item.kind === kind)!;
      const patch = createConstructPatch(sourceBlock, target, insert);
      expect(patch.range.from).toBeGreaterThanOrEqual(sourceBlock.range.from);
      expect(patch.range.to).toBeLessThanOrEqual(sourceBlock.range.to);
      expect(patch.expectedText).toBe(
        source.slice(patch.range.from, patch.range.to),
      );
      const result = applySourcePatch(source, { revision: 5 }, patch);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.changedRange.before).toEqual(patch.range);
      expect(result.undoEntries).toBe(1);
    }
  });

  it("patches an image destination without rewriting its alt text or block", () => {
    const imageSource =
      "Before\n\n![quiet alt](yeli-demo:workspace-photo)\n\nAfter\n";
    const projection = projectMarkdown(imageSource, 8);
    const image = projection.blocks.find(
      (block) =>
        block.kind === "paragraph" && block.expectedText.includes("!["),
    )!;
    const target = `yeli-asset:sha256:${"a".repeat(64)}`;
    const patch = createConstructPatch(image, { kind: "image-target" }, target);

    expect(patch.expectedText).toBe("yeli-demo:workspace-photo");
    const result = applySourcePatch(imageSource, { revision: 8 }, patch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe(`Before\n\n![quiet alt](${target})\n\nAfter\n`);
  });

  it.each([
    [
      "adds",
      "Before\n\n![quiet alt](yeli-demo:workspace-photo)\n\nAfter\n",
      "",
      'Before\n\n![quiet alt](yeli-demo:workspace-photo "Morning notes")\n\nAfter\n',
    ],
    [
      "replaces",
      "Before\n\n![quiet alt](yeli-demo:workspace-photo 'Old title')\n\nAfter\n",
      "Old title",
      "Before\n\n![quiet alt](yeli-demo:workspace-photo 'Morning notes')\n\nAfter\n",
    ],
  ])(
    "%s an image title without rewriting its destination",
    (_case, input, expectedText, expectedSource) => {
      const projection = projectMarkdown(input, 9);
      const image = projection.blocks.find(
        (block) =>
          block.kind === "paragraph" && block.expectedText.includes("!["),
      )!;
      const patch = createConstructPatch(
        image,
        { kind: "image-title" },
        "Morning notes",
      );

      expect(patch.expectedText).toBe(expectedText);
      const result = applySourcePatch(input, { revision: 9 }, patch);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.source).toBe(expectedSource);
    },
  );

  it("escapes structural table and label characters before patching", () => {
    const projection = projectMarkdown(source, 6);
    const table = projection.blocks.find((item) => item.kind === "table")!;
    const paragraph = projection.blocks.find(
      (item) => item.kind === "paragraph",
    )!;

    const tablePatch = createConstructPatch(
      table,
      { kind: "table-cell", row: 1, column: 1 },
      String.raw`one\two|three`,
    );
    expect(tablePatch.insert).toBe(String.raw`one\\two\|three`);

    const labelPatch = createConstructPatch(
      paragraph,
      { kind: "link-label" },
      String.raw`one\two]three`,
    );
    expect(labelPatch.insert).toBe(String.raw`one\\two\]three`);
  });

  it("patches complete balanced and angle-bracket link destinations", () => {
    const markdown = [
      "Paragraph [balanced](./foo(bar).md) and [angle](<./foo bar.md>).",
      "",
    ].join("\n");
    const projection = projectMarkdown(markdown, 1);
    const paragraph = projection.blocks.find(
      (item) => item.kind === "paragraph",
    )!;
    const balanced = createConstructPatch(
      paragraph,
      { kind: "link-target", occurrence: 0 },
      "./renamed(one).md",
    );
    expect(balanced.expectedText).toBe("./foo(bar).md");
    expect(balanced.insert).toBe(String.raw`./renamed\(one\).md`);
    const changed = applySourcePatch(markdown, { revision: 1 }, balanced);
    expect(changed.ok).toBe(true);
    if (changed.ok) {
      expect(changed.source).toContain(
        String.raw`[balanced](./renamed\(one\).md)`,
      );
      expect(changed.source).not.toContain(".md).md)");
    }

    const angle = createConstructPatch(
      paragraph,
      { kind: "link-target", occurrence: 1 },
      "./renamed (two).md",
    );
    expect(angle.expectedText).toBe("./foo bar.md");
    expect(angle.insert).toBe("./renamed (two).md");
  });

  it("rejects inserts that would escape their Markdown construct", () => {
    const projection = projectMarkdown(source, 6);
    const table = projection.blocks.find((item) => item.kind === "table")!;
    const paragraph = projection.blocks.find(
      (item) => item.kind === "paragraph",
    )!;
    const fence = projection.blocks.find((item) => item.kind === "code-fence")!;

    expect(() =>
      createConstructPatch(
        table,
        { kind: "table-cell", row: 1, column: 1 },
        "first\nsecond",
      ),
    ).toThrow("Table cell content cannot contain a line break");
    expect(() =>
      createConstructPatch(
        paragraph,
        { kind: "link-target" },
        "./space target.md",
      ),
    ).toThrow("Link target cannot contain whitespace");
    expect(() =>
      createConstructPatch(
        fence,
        { kind: "fence-content" },
        "const open = true;",
      ),
    ).toThrow("Fence content must end before the closing fence line");
    expect(() =>
      createConstructPatch(fence, { kind: "fence-content" }, "```\n"),
    ).toThrow("Fence content would close its own Markdown fence");
  });

  it("requires construct-specific patches for structural blocks", () => {
    const projection = projectMarkdown(source, 6);
    for (const kind of ["table", "code-fence", "frontmatter"] as const) {
      const sourceBlock = projection.blocks.find((item) => item.kind === kind)!;
      expect(() =>
        createBlockReplacementPatch(sourceBlock, sourceBlock.expectedText),
      ).toThrow("requires a construct-specific patch");
      expect(() =>
        createConstructPatch(
          sourceBlock,
          { kind: "block-content" },
          sourceBlock.expectedText,
        ),
      ).toThrow("requires a construct-specific patch");
    }
  });

  it("finds table cells around escaped pipes and matching backtick runs", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      "| one\\|two | ``three|four`` |",
      "",
    ].join("\n");
    const projection = projectMarkdown(markdown, 1);
    const table = projection.blocks.find((item) => item.kind === "table")!;
    const patch = createConstructPatch(
      table,
      { kind: "table-cell", row: 1, column: 1 },
      "changed",
    );
    expect(patch.expectedText).toBe("``three|four``");
    expect(projectTableRows(table.expectedText)).toEqual([
      ["A", "B"],
      ["one|two", "``three|four``"],
    ]);
  });

  it("binds a repeated table row to its own source occurrence", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      "| same | repeated |",
      "| same | repeated |",
      "",
    ].join("\n");
    const projection = projectMarkdown(markdown, 1);
    const table = projection.blocks.find((item) => item.kind === "table")!;
    const patch = createConstructPatch(
      table,
      { kind: "table-cell", row: 2, column: 1 },
      "last",
    );
    expect(patch.range.from).toBe(markdown.lastIndexOf("repeated"));
    const changed = applySourcePatch(markdown, { revision: 1 }, patch);
    expect(changed.ok).toBe(true);
    if (changed.ok) {
      expect(changed.source.match(/repeated/gu)).toHaveLength(1);
      expect(changed.source.endsWith("| same | last |\n")).toBe(true);
    }
  });

  it("recognizes backticks in tilde-fence info without widening backtick fences", () => {
    const markdown = [
      "~~~custom`info",
      "body",
      "~~~",
      "",
      "```custom`info",
      "paragraph",
      "",
    ].join("\n");
    const projection = projectMarkdown(markdown, 1);
    expect(projection.blocks[0]).toMatchObject({
      editable: true,
      kind: "code-fence",
    });
    expect(projection.blocks[2]).toMatchObject({
      editable: true,
      kind: "paragraph",
      expectedText: "```custom`info\n",
    });
  });

  it("patches one frontmatter property without rewriting its neighbors", () => {
    const projection = projectMarkdown(source, 13);
    const patch = createFrontmatterPropertyPatch(
      projection,
      "title",
      "Renamed",
    );
    const result = applySourcePatch(source, { revision: 13 }, patch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain("title: 'Renamed'");
    expect(result.source).toContain("custom-key: keep-this-exactly");
    expect(patch.expectedText).toBe("'Projection fixture'");
  });

  it("creates frontmatter only when the first metadata property is edited", () => {
    const plain = "# Plain\n";
    const projection = projectMarkdown(plain, 2);
    const patch = createFrontmatterPropertyPatch(projection, "title", "Plain");
    expect(patch.range).toEqual({ from: 0, to: 0 });
    const result = applySourcePatch(plain, { revision: 2 }, patch);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.source).toBe("---\ntitle: Plain\n---\n# Plain\n");
  });

  it("groups unclosed and multiline unsupported syntax into source-safe roots", () => {
    const unsupported = [
      "[^n]: first\n  continued\n\n",
      "[ref]: ./one\n  'continued title'\n\n",
      "<section>\nremote-looking <img src=https://example.test/x>\n\n",
      "$$\na + b\n$$\n\n",
      "```js\nconst x = 1;\n",
    ].join("");
    const projection = projectMarkdown(unsupported, 1);
    for (const sourceBlock of projection.blocks.filter(
      (item) => item.kind !== "blank",
    )) {
      expect(sourceBlock.editable).toBe(sourceBlock.kind === "footnote");
      expect(
        unsupported.slice(sourceBlock.range.from, sourceBlock.range.to),
      ).toBe(sourceBlock.expectedText);
    }
  });

  it("classifies empty unordered and ordered tasks as toggleable tasks", () => {
    const markdown = "- [ ]\n1. [x]\n";
    const projection = projectMarkdown(markdown, 1);
    const tasks = projection.blocks.filter((item) => item.kind === "task");
    expect(tasks).toHaveLength(2);
    for (const task of tasks) {
      expect(() =>
        createConstructPatch(task, { kind: "task-marker", checked: true }, ""),
      ).not.toThrow();
    }
  });

  it("uses UTF-16 code-unit ranges without splitting an emoji surrogate pair", () => {
    const projection = projectMarkdown(source, 21);
    const cjk = projection.blocks.find((item) =>
      item.expectedText.includes("🧭"),
    )!;
    const emojiFrom = source.indexOf("🧭");
    expect(source.slice(emojiFrom, emojiFrom + "🧭".length)).toBe("🧭");
    expect(cjk.range.from).toBeLessThanOrEqual(emojiFrom);
    expect(cjk.range.to).toBeGreaterThanOrEqual(emojiFrom + "🧭".length);
    const patch = createConstructPatch(
      cjk,
      { kind: "block-content" },
      "保留 👩‍💻",
    );
    expect(patch.range.from).toBe(cjk.range.from);
    expect(patch.range.to).toBe(cjk.range.to - 1);
  });

  it("collapses composition, paste, and validated asset drop into one undo entry", () => {
    const input = new MinimalInputBuffer();
    input.beginComposition();
    expect(input.updateComposition("中")).toBeNull();
    expect(input.updateComposition("中文")).toBeNull();
    expect(input.endComposition("中文输入")).toEqual({
      data: "中文输入",
      inputType: "insertCompositionText",
      undoEntries: 1,
    });
    expect(input.paste("one\ntwo")).toMatchObject({
      data: "one\ntwo",
      undoEntries: 1,
    });
    expect(
      input.dropAsset(`sha256:${"a".repeat(64)}`, "diagram ] one"),
    ).toMatchObject({
      data: `![diagram \\] one](asset:sha256:${"a".repeat(64)})`,
      undoEntries: 1,
    });
  });
});
