import { useRef, useState, type KeyboardEvent } from "react";

import type { TableDimensions } from "../editor/table-commands.ts";
import type { Labels } from "../i18n/en.ts";

const GRID_ROWS = 8;
const GRID_COLUMNS = 8;

function dimensionLabel(labels: Labels, dimensions: TableDimensions): string {
  return labels.tableDimensions
    .replace("{rows}", String(dimensions.rows))
    .replace("{columns}", String(dimensions.columns));
}

export function TableSizePicker({
  labels,
  onSelect,
}: {
  labels: Labels;
  onSelect: (dimensions: TableDimensions) => void;
}) {
  const [preview, setPreview] = useState<TableDimensions>({
    columns: 3,
    rows: 3,
  });
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusCell = (row: number, column: number) => {
    const nextRow = Math.min(GRID_ROWS - 1, Math.max(0, row));
    const nextColumn = Math.min(GRID_COLUMNS - 1, Math.max(0, column));
    cellRefs.current[nextRow * GRID_COLUMNS + nextColumn]?.focus();
  };
  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    column: number,
  ) => {
    if (event.key === "ArrowUp") focusCell(row - 1, column);
    else if (event.key === "ArrowDown") focusCell(row + 1, column);
    else if (event.key === "ArrowLeft") focusCell(row, column - 1);
    else if (event.key === "ArrowRight") focusCell(row, column + 1);
    else return;
    event.preventDefault();
  };

  return (
    <div
      aria-label={labels.chooseTableSize}
      className="table-size-picker"
      role="group"
    >
      <div className="table-size-picker-grid">
        {Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, index) => {
          const row = Math.floor(index / GRID_COLUMNS);
          const column = index % GRID_COLUMNS;
          const dimensions = { columns: column + 1, rows: row + 1 };
          const active =
            dimensions.rows <= preview.rows &&
            dimensions.columns <= preview.columns;
          return (
            <button
              aria-label={`${labels.insertTable} · ${dimensionLabel(labels, dimensions)}`}
              className={`table-size-cell${active ? " is-active" : ""}`}
              data-columns={dimensions.columns}
              data-rows={dimensions.rows}
              key={`${dimensions.rows}:${dimensions.columns}`}
              onClick={() => onSelect(dimensions)}
              onFocus={() => setPreview(dimensions)}
              onKeyDown={(event) => handleKeyDown(event, row, column)}
              onPointerEnter={() => setPreview(dimensions)}
              ref={(element) => {
                cellRefs.current[index] = element;
              }}
              tabIndex={
                dimensions.rows === 3 && dimensions.columns === 3 ? 0 : -1
              }
              type="button"
            />
          );
        })}
      </div>
      <strong aria-live="polite">{dimensionLabel(labels, preview)}</strong>
    </div>
  );
}
