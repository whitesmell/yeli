import type { Labels } from "../i18n/en.ts";
import type { SourceBlock } from "./block-projection.ts";
import { createSourcePatch, type SourcePatch } from "./source-ranges.ts";

export interface TableDimensions {
  columns: number;
  rows: number;
}

export interface TableCellPosition {
  column: number;
  row: number;
  value?: string;
}

export type TableStructureKind =
  | "delete-column"
  | "delete-row"
  | "insert-column-left"
  | "insert-column-right"
  | "insert-row-above"
  | "insert-row-below";

export interface TableStructureCommand {
  activeCell: TableCellPosition;
  kind: TableStructureKind;
}

const MAX_TABLE_DIMENSION = 20;

function assertDimensions({ columns, rows }: TableDimensions): void {
  if (
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    columns < 1 ||
    rows < 1 ||
    columns > MAX_TABLE_DIMENSION ||
    rows > MAX_TABLE_DIMENSION
  ) {
    throw new RangeError(
      `Table dimensions must be integers from 1 to ${MAX_TABLE_DIMENSION}`,
    );
  }
}

function escapeTableCell(value: string): string {
  if (/\r|\n/u.test(value)) {
    throw new Error("Table cell content cannot contain a line break");
  }
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

function rowCells(content: string): string[] {
  const pipes: number[] = [];
  let escaped = false;
  let activeTickRun = 0;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "`") {
      let runLength = 1;
      while (content[index + runLength] === "`") runLength += 1;
      if (activeTickRun === 0) activeTickRun = runLength;
      else if (activeTickRun === runLength) activeTickRun = 0;
      index += runLength - 1;
      continue;
    }
    if (character === "|" && activeTickRun === 0) pipes.push(index);
  }

  const startsWithPipe = content.trimStart().startsWith("|");
  const boundaries = [startsWithPipe ? pipes.shift()! : -1, ...pipes];
  if (!content.trimEnd().endsWith("|")) boundaries.push(content.length);
  if (boundaries.length < 2) return [];
  return boundaries.slice(0, -1).map((boundary, index) => {
    const from = boundary + 1;
    const to = boundaries[index + 1]!;
    return content.slice(from, to).trim();
  });
}

function isDelimiterRow(cells: readonly string[]): boolean {
  return (
    cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()))
  );
}

function parseTableSource(markdown: string): {
  delimiters: string[];
  finalNewline: boolean;
  rows: string[][];
} {
  const lines = markdown.endsWith("\n")
    ? markdown.slice(0, -1).split("\n")
    : markdown.split("\n");
  const parsed = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => rowCells(line));
  const delimiterIndex = parsed.findIndex(isDelimiterRow);
  if (delimiterIndex !== 1 || parsed.length < 2) {
    throw new Error("Table source is ambiguous");
  }
  return {
    delimiters: parsed[delimiterIndex]!,
    finalNewline: markdown.endsWith("\n"),
    rows: parsed.filter((_, index) => index !== delimiterIndex),
  };
}

function serializeTable(
  rows: readonly (readonly string[])[],
  delimiters: readonly string[],
  finalNewline: boolean,
): string {
  const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
  const output = [line(rows[0]!), line(delimiters)];
  output.push(...rows.slice(1).map(line));
  return `${output.join("\n")}${finalNewline ? "\n" : ""}`;
}

export function createTableMarkdown(
  labels: Pick<Labels, "newTableCell" | "newTableColumn">,
  dimensions: TableDimensions = { columns: 2, rows: 2 },
): string {
  assertDimensions(dimensions);
  const header = Array.from(
    { length: dimensions.columns },
    (_, index) => `${labels.newTableColumn} ${index + 1}`,
  );
  const body = Array.from({ length: dimensions.rows - 1 }, () =>
    Array.from({ length: dimensions.columns }, () => labels.newTableCell),
  );
  const delimiters = Array.from({ length: dimensions.columns }, () => "---");
  return serializeTable([header, ...body], delimiters, true);
}

export function createTableStructurePatch(
  block: SourceBlock,
  command: TableStructureCommand,
): SourcePatch | null {
  if (block.kind !== "table" || !block.editable) {
    throw new Error("Block is not an editable table");
  }
  const parsed = parseTableSource(block.expectedText);
  const columnCount = Math.max(
    parsed.delimiters.length,
    ...parsed.rows.map((row) => row.length),
  );
  const rows = parsed.rows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ""),
  ]);
  const delimiters = [
    ...parsed.delimiters,
    ...Array.from(
      { length: columnCount - parsed.delimiters.length },
      () => "---",
    ),
  ];
  const { column, row, value } = command.activeCell;
  if (
    !Number.isSafeInteger(row) ||
    !Number.isSafeInteger(column) ||
    row < 0 ||
    row >= rows.length ||
    column < 0 ||
    column >= columnCount
  ) {
    throw new RangeError("Active table cell is out of range");
  }
  if (value !== undefined) rows[row]![column] = escapeTableCell(value);

  switch (command.kind) {
    case "insert-row-above":
      rows.splice(
        row,
        0,
        Array.from({ length: columnCount }, () => ""),
      );
      break;
    case "insert-row-below":
      rows.splice(
        row + 1,
        0,
        Array.from({ length: columnCount }, () => ""),
      );
      break;
    case "insert-column-left":
      rows.forEach((cells) => cells.splice(column, 0, ""));
      delimiters.splice(column, 0, "---");
      break;
    case "insert-column-right":
      rows.forEach((cells) => cells.splice(column + 1, 0, ""));
      delimiters.splice(column + 1, 0, "---");
      break;
    case "delete-row":
      if (rows.length === 1) return null;
      rows.splice(row, 1);
      break;
    case "delete-column":
      if (columnCount === 1) return null;
      rows.forEach((cells) => cells.splice(column, 1));
      delimiters.splice(column, 1);
      break;
  }

  return createSourcePatch(
    block,
    serializeTable(rows, delimiters, parsed.finalNewline),
    `table.${command.kind}`,
  );
}
