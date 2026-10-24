import { describe, expect, it } from "vitest";

import { DocumentStore } from "../../src/document/store.ts";
import { projectMarkdown } from "../../src/editor/block-projection.ts";
import { createTableStructurePatch } from "../../src/editor/table-commands.ts";

const source = [
  "Before",
  "",
  "| Name | Value |",
  "| :--- | ---: |",
  "| Alpha | One |",
  "| Beta | Two |",
  "",
  "After",
  "",
].join("\n");

function tableBlock(markdown = source, revision = 1) {
  return projectMarkdown(markdown, revision).blocks.find(
    (block) => block.kind === "table",
  )!;
}

describe("table structure commands", () => {
  it("inserts rows around the active row and keeps alignment plus adjacent source", () => {
    const store = new DocumentStore(source);
    const result = store.applyPatch(
      createTableStructurePatch(tableBlock(), {
        activeCell: { column: 1, row: 1, value: "One | edited" },
        kind: "insert-row-below",
      })!,
    );

    expect(result).toMatchObject({
      ok: true,
      operation: "table.insert-row-below",
      undoEntries: 1,
    });
    expect(store.getSnapshot().source).toBe(
      [
        "Before",
        "",
        "| Name | Value |",
        "| :--- | ---: |",
        "| Alpha | One \\| edited |",
        "|  |  |",
        "| Beta | Two |",
        "",
        "After",
        "",
      ].join("\n"),
    );
    expect(store.undo()).toMatchObject({ ok: true });
    expect(store.getSnapshot().source).toBe(source);
  });

  it("inserts and deletes columns without changing the rest of the document", () => {
    const inserted = new DocumentStore(source);
    expect(
      inserted.applyPatch(
        createTableStructurePatch(tableBlock(), {
          activeCell: { column: 0, row: 2 },
          kind: "insert-column-right",
        })!,
      ),
    ).toMatchObject({ ok: true, operation: "table.insert-column-right" });
    expect(inserted.getSnapshot().source).toContain(
      "| Name |  | Value |\n| :--- | --- | ---: |",
    );
    expect(inserted.getSnapshot().source.startsWith("Before\n\n")).toBe(true);
    expect(inserted.getSnapshot().source.endsWith("\nAfter\n")).toBe(true);

    const insertedSnapshot = inserted.getSnapshot();
    const deleted = inserted.applyPatch(
      createTableStructurePatch(
        tableBlock(insertedSnapshot.source, insertedSnapshot.revision),
        {
          activeCell: { column: 1, row: 2 },
          kind: "delete-column",
        },
      )!,
    );
    expect(deleted).toMatchObject({
      ok: true,
      operation: "table.delete-column",
      undoEntries: 1,
    });
    expect(inserted.getSnapshot().source).toBe(source);
  });

  it("does not delete the only visible row or column", () => {
    const oneCell = "| Only |\n| --- |\n";
    const block = tableBlock(oneCell);

    expect(
      createTableStructurePatch(block, {
        activeCell: { column: 0, row: 0 },
        kind: "delete-row",
      }),
    ).toBeNull();
    expect(
      createTableStructurePatch(block, {
        activeCell: { column: 0, row: 0 },
        kind: "delete-column",
      }),
    ).toBeNull();
  });
});
