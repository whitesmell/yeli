import { describe, expect, it } from "vitest";

import { DocumentStore } from "../../src/document/store.ts";
import {
  COMMAND_CATALOG,
  commandsForSurface,
  executeAppendCommand,
  executeBlockCommand,
  executeBlockSelectionCommand,
  executeInsertAfterCommand,
  executeSlashCommand,
  matchesCommandShortcut,
} from "../../src/editor/command-registry.ts";
import { projectMarkdown } from "../../src/editor/block-projection.ts";
import { en } from "../../src/i18n/en.ts";
import { zhCN } from "../../src/i18n/zh-CN.ts";

function paragraph(source: string, text: string, revision = 1) {
  return projectMarkdown(source, revision).blocks.find(
    (block) => block.kind === "paragraph" && block.expectedText.includes(text),
  )!;
}

describe("scoped command registry", () => {
  it("keeps the BOM when deleting frontmatter and restores exact source on undo", () => {
    const source = "\ufeff---\ntitle: Original\n---\nBody\n";
    const store = new DocumentStore(source);
    const frontmatter = store
      .getSnapshot()
      .projection.blocks.find((block) => block.kind === "frontmatter")!;
    expect(frontmatter.range.from).toBe(1);

    expect(
      executeBlockCommand(store, "block.delete", frontmatter, en),
    ).toMatchObject({ ok: true, source: "\ufeffBody\n", undoEntries: 1 });
    expect(store.undo()?.ok).toBe(true);
    expect(store.getSnapshot().source).toBe(source);
    expect(store.redo()?.ok).toBe(true);
    expect(store.getSnapshot().source).toBe("\ufeffBody\n");
  });

  it("keeps command identifiers unique and filters one catalog by mode and surface", () => {
    expect(new Set(COMMAND_CATALOG.map((command) => command.id)).size).toBe(
      COMMAND_CATALOG.length,
    );

    const readInsert = commandsForSurface("top-insert", { mode: "read" });
    const editInsert = commandsForSurface("top-insert", { mode: "edit" });
    const readGuide = commandsForSurface("efficiency-guide", {
      mode: "read",
    });
    const emptyBlockMenu = commandsForSurface("empty-block-menu", {
      mode: "edit",
    });
    const tableBlock = projectMarkdown(
      "| A | B |\n| --- | --- |\n| C | D |\n",
      1,
    ).blocks[0]!;
    const tableTools = commandsForSurface("table-toolbar", {
      block: tableBlock,
      mode: "edit",
    });

    expect(readInsert).toEqual([]);
    expect(editInsert.map(({ definition }) => definition.id)).toEqual([
      "insert.paragraph",
      "insert.section",
      "insert.task",
      "insert.bullet-list",
      "insert.numbered-list",
      "insert.quote",
      "insert.code-block",
      "insert.table",
      "insert.divider",
    ]);
    expect(
      editInsert.find(({ definition }) => definition.id === "insert.section")
        ?.definition.scope,
    ).toBe("structure");
    expect(
      readGuide.some(({ definition }) => definition.shortcuts === undefined),
    ).toBe(false);
    expect(
      readGuide.find(({ definition }) => definition.id === "insert.paragraph"),
    ).toBeUndefined();
    expect(readGuide.map(({ definition }) => definition.id)).toEqual(
      expect.arrayContaining(["view.page-width", "view.presentation"]),
    );
    expect(emptyBlockMenu.map(({ definition }) => definition.id)).toEqual([
      "insert.paragraph",
      "insert.heading1",
      "insert.section",
      "insert.heading3",
      "insert.heading4",
      "insert.heading5",
      "insert.heading6",
      "insert.task",
      "insert.bullet-list",
      "insert.numbered-list",
      "insert.quote",
      "insert.code-block",
      "insert.table",
      "insert.divider",
      "template.meeting-notes",
    ]);
    expect(tableTools.map(({ definition }) => definition.id)).toEqual([
      "table.insert-row-above",
      "table.insert-row-below",
      "table.insert-column-left",
      "table.insert-column-right",
      "table.delete-row",
      "table.delete-column",
    ]);
    expect(tableTools.every(({ available }) => available)).toBe(true);
  });

  it("searches localized labels and exposes catalog-owned shortcuts", () => {
    expect(
      commandsForSurface(
        "efficiency-guide",
        { mode: "edit" },
        { labels: zhCN, query: "目录" },
      ).map(({ definition }) => definition.id),
    ).toEqual(["view.outline"]);
    expect(
      commandsForSurface(
        "slash",
        { mode: "edit" },
        { labels: zhCN, query: "待办" },
      ).map(({ definition }) => definition.id),
    ).toEqual(["insert.task"]);
    expect(
      commandsForSurface(
        "slash",
        { mode: "edit" },
        { labels: zhCN, query: "h3" },
      ).map(({ definition }) => definition.id),
    ).toEqual(["insert.heading3"]);
    expect(
      commandsForSurface(
        "slash",
        { mode: "edit" },
        { labels: zhCN, query: "h" },
      ).map(({ definition }) => definition.id),
    ).toEqual([
      "insert.heading1",
      "insert.section",
      "insert.heading3",
      "insert.heading4",
      "insert.heading5",
      "insert.heading6",
    ]);
    expect(
      matchesCommandShortcut("view.outline", {
        altKey: false,
        ctrlKey: true,
        key: "O",
        metaKey: false,
        shiftKey: true,
      }),
    ).toBe(true);
    expect(
      matchesCommandShortcut("view.page-width", {
        altKey: false,
        ctrlKey: true,
        key: "\\",
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
    expect(
      matchesCommandShortcut("view.font-size", {
        altKey: false,
        code: "Backslash",
        ctrlKey: true,
        key: "|",
        metaKey: false,
        shiftKey: true,
      }),
    ).toBe(true);
    expect(
      matchesCommandShortcut("view.font-size", {
        altKey: false,
        code: "Backslash",
        ctrlKey: false,
        key: "\\",
        metaKey: true,
        shiftKey: true,
      }),
    ).toBe(true);
    expect(
      matchesCommandShortcut("view.presentation", {
        altKey: false,
        ctrlKey: false,
        key: "Enter",
        metaKey: true,
        shiftKey: true,
      }),
    ).toBe(true);
    expect(
      matchesCommandShortcut("selection.code", {
        altKey: false,
        ctrlKey: false,
        key: "C",
        metaKey: true,
        shiftKey: true,
      }),
    ).toBe(true);
    expect(
      matchesCommandShortcut("selection.code", {
        altKey: false,
        ctrlKey: false,
        key: "c",
        metaKey: true,
        shiftKey: false,
      }),
    ).toBe(false);
    expect(
      commandsForSurface(
        "efficiency-guide",
        { mode: "read" },
        { labels: en, query: "ctrl f" },
      ).map(({ definition }) => definition.id),
    ).toEqual(["view.search"]);
  });

  it("inserts below the active source range instead of the document end", () => {
    const source = "# First\n\nMiddle\n\nLast\n";
    const store = new DocumentStore(source);
    const block = paragraph(source, "Middle");

    const result = executeBlockCommand(store, "block.insert-below", block, en);

    expect(result).toMatchObject({
      ok: true,
      operation: "block.insert-below",
      undoEntries: 1,
    });
    expect(store.getSnapshot().source).toBe(
      "# First\n\nMiddle\n\nNew paragraph\n\nLast\n",
    );
    expect(store.undo()).toMatchObject({ ok: true });
    expect(store.getSnapshot().source).toBe(source);
  });

  it("inserts any source-safe Markdown block below the active block", () => {
    const source = "# First\n\nMiddle\n\nLast\n";
    const store = new DocumentStore(source);

    const result = executeInsertAfterCommand(
      store,
      "insert.table",
      paragraph(source, "Middle"),
      en,
      "en",
    );

    expect(result).toMatchObject({
      ok: true,
      operation: "insert.table",
      undoEntries: 1,
    });
    expect(store.getSnapshot().source).toBe(
      "# First\n\nMiddle\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n\nLast\n",
    );
  });

  it("inserts a table with the selected visible row and column count", () => {
    const store = new DocumentStore("# Sized table\n");

    const result = executeAppendCommand(store, "insert.table", en, "en", {
      columns: 3,
      rows: 4,
    });

    expect(result).toMatchObject({
      ok: true,
      operation: "insert.table",
      undoEntries: 1,
    });
    expect(store.getSnapshot().source).toBe(
      [
        "# Sized table",
        "",
        "| Column 1 | Column 2 | Column 3 |",
        "| --- | --- | --- |",
        "| Cell | Cell | Cell |",
        "| Cell | Cell | Cell |",
        "| Cell | Cell | Cell |",
        "",
      ].join("\n"),
    );
    expect(store.undo()).toMatchObject({ ok: true });
    expect(store.getSnapshot().source).toBe("# Sized table\n");
  });

  it("converts, duplicates, and deletes only the selected block boundary", () => {
    const source = "Before\n\nMiddle\n\nAfter\n";

    const converted = new DocumentStore(source);
    expect(
      executeBlockCommand(
        converted,
        "block.convert.heading",
        paragraph(source, "Middle"),
        en,
      ),
    ).toMatchObject({ ok: true, undoEntries: 1 });
    expect(converted.getSnapshot().source).toBe(
      "Before\n\n## Middle\n\nAfter\n",
    );

    const duplicated = new DocumentStore(source);
    expect(
      executeBlockCommand(
        duplicated,
        "block.duplicate",
        paragraph(source, "Middle"),
        en,
      ),
    ).toMatchObject({ ok: true, undoEntries: 1 });
    expect(duplicated.getSnapshot().source).toBe(
      "Before\n\nMiddle\n\nMiddle\n\nAfter\n",
    );

    const deleted = new DocumentStore(source);
    expect(
      executeBlockCommand(
        deleted,
        "block.delete",
        paragraph(source, "Middle"),
        en,
      ),
    ).toMatchObject({ ok: true, undoEntries: 1 });
    expect(deleted.getSnapshot().source).toBe("Before\n\n\nAfter\n");
  });

  it("converts a multi-block list selection in one undoable transaction", () => {
    const source = "1. First\n2. Second\n3. Third\n";
    const store = new DocumentStore(source);
    const blocks = projectMarkdown(source, 1).blocks.slice(0, 2);

    expect(
      executeBlockSelectionCommand(store, "block.convert.bullet-list", blocks),
    ).toMatchObject({ ok: true, undoEntries: 1 });
    expect(store.getSnapshot().source).toBe("- First\n- Second\n3. Third\n");
    expect(store.undo()).toMatchObject({ ok: true });
    expect(store.getSnapshot().source).toBe(source);
  });

  it("expands slash and built-in template commands into ordinary Markdown", () => {
    const slashStore = new DocumentStore("/\n");
    expect(
      executeSlashCommand(
        slashStore,
        "insert.task",
        paragraph("/\n", "/"),
        en,
        "en",
      ),
    ).toMatchObject({
      ok: true,
      operation: "insert.task",
      undoEntries: 1,
    });
    expect(slashStore.getSnapshot().source).toBe("- [ ] New task\n");

    const blankSource = "Before\n\nAfter\n";
    const blankStore = new DocumentStore(blankSource);
    const blankBlock = projectMarkdown(blankSource, 1).blocks.find(
      (block) => block.kind === "blank",
    )!;
    expect(
      executeSlashCommand(blankStore, "insert.task", blankBlock, en, "en"),
    ).toMatchObject({ ok: true, undoEntries: 1 });
    expect(blankStore.getSnapshot().source).toBe(
      "Before\n\n- [ ] New task\n\nAfter\n",
    );
    expect(blankStore.undo()).toMatchObject({ ok: true });
    expect(blankStore.getSnapshot().source).toBe(blankSource);

    const headingStore = new DocumentStore(blankSource);
    expect(
      executeSlashCommand(
        headingStore,
        "insert.heading1",
        blankBlock,
        en,
        "en",
      ),
    ).toMatchObject({ ok: true, operation: "insert.heading1" });
    expect(headingStore.getSnapshot().source).toBe(
      "Before\n\n# New section\n\nAfter\n",
    );

    const templateStore = new DocumentStore("# Notes\n");
    expect(
      executeAppendCommand(templateStore, "template.meeting-notes", en, "en"),
    ).toMatchObject({
      ok: true,
      operation: "template.meeting-notes",
      undoEntries: 1,
    });
    expect(templateStore.getSnapshot().source).toContain("## Meeting notes");
    expect(templateStore.getSnapshot().source).toContain("- [ ] ");

    const structures = new DocumentStore("# Structures\n");
    for (const command of [
      "insert.bullet-list",
      "insert.numbered-list",
      "insert.quote",
      "insert.code-block",
      "insert.table",
      "insert.divider",
    ] as const) {
      expect(executeAppendCommand(structures, command, en, "en")).toMatchObject(
        {
          ok: true,
          operation: command,
        },
      );
    }
    expect(structures.getSnapshot().source).toContain("- List item");
    expect(structures.getSnapshot().source).toContain("1. List item");
    expect(structures.getSnapshot().source).toContain("> Quoted text");
    expect(structures.getSnapshot().source).toContain("```\ncode\n```");
    expect(structures.getSnapshot().source).toContain(
      "| Column 1 | Column 2 |",
    );
    expect(structures.getSnapshot().source).toContain("\n---\n");
  });

  it("converts a simple block to every supported structural Markdown family", () => {
    const cases = [
      ["block.convert.heading1", "# Middle"],
      ["block.convert.heading6", "###### Middle"],
      ["block.convert.bullet-list", "- Middle"],
      ["block.convert.numbered-list", "1. Middle"],
      ["block.convert.code", "```\nMiddle\n```"],
    ] as const;
    for (const [command, expected] of cases) {
      const source = "Before\n\nMiddle\n\nAfter\n";
      const store = new DocumentStore(source);
      expect(
        executeBlockCommand(store, command, paragraph(source, "Middle"), en),
      ).toMatchObject({ ok: true, operation: command });
      expect(store.getSnapshot().source).toContain(expected);
    }
  });
});
