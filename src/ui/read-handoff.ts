import type {
  BlockProjection,
  ReadEditSelectionCandidate,
  ReadEditTarget,
  SourceBlock,
} from "../editor/block-projection.ts";

function mappedElement(node: Node | null): HTMLElement | null {
  const element =
    node instanceof Element ? node : (node?.parentElement ?? null);
  return element?.closest<HTMLElement>("[data-read-block-id]") ?? null;
}

function blockForElement(
  element: HTMLElement,
  projection: BlockProjection,
): SourceBlock | null {
  const id = element.dataset.readBlockId;
  const from = Number(element.dataset.sourceFrom);
  const to = Number(element.dataset.sourceTo);
  const revision = Number(element.dataset.sourceRevision);
  if (!id || !Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
    return null;
  }
  if (revision !== projection.revision) return null;
  return (
    projection.blocks.find(
      (block) =>
        block.id === id && block.range.from === from && block.range.to === to,
    ) ?? null
  );
}

function textOffset(
  root: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(node, offset);
  } catch {
    return null;
  }
  return range.toString().length;
}

function selectionCandidate(
  root: HTMLElement,
  selection: Selection,
): ReadEditSelectionCandidate | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const start = textOffset(root, range.startContainer, range.startOffset);
  const end = textOffset(root, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return {
    end,
    renderedText: root.textContent ?? "",
    selectedText: selection.toString(),
    start,
  };
}

function viewportCandidate(surface: HTMLElement): HTMLElement | null {
  const candidates = [
    ...surface.querySelectorAll<HTMLElement>("[data-read-block-id]"),
  ].filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });
  const anchor = window.innerHeight * 0.42;
  return (
    candidates.sort(
      (left, right) =>
        Math.abs(left.getBoundingClientRect().top - anchor) -
        Math.abs(right.getBoundingClientRect().top - anchor),
    )[0] ?? null
  );
}

export function captureReadEditTarget(
  projection: BlockProjection,
): ReadEditTarget | null {
  const surface = document.querySelector<HTMLElement>(".read-surface");
  if (!surface) return null;
  const selection = window.getSelection();
  const selectionStart = mappedElement(selection?.anchorNode ?? null);
  const selectionEnd = mappedElement(selection?.focusNode ?? null);
  const active = mappedElement(document.activeElement);
  const element = selectionStart ?? active ?? viewportCandidate(surface);
  if (!element) return null;
  const block = blockForElement(element, projection);
  if (!block) return null;
  const nonCollapsed = Boolean(selection && !selection.isCollapsed);
  const selectionWasAmbiguous = Boolean(
    nonCollapsed &&
    (!selectionStart || !selectionEnd || selectionStart !== selectionEnd),
  );
  const exactSelection =
    selection &&
    nonCollapsed &&
    selectionStart === element &&
    selectionEnd === element
      ? selectionCandidate(element, selection)
      : null;
  return {
    block,
    revision: projection.revision,
    selection: exactSelection,
    selectionWasAmbiguous:
      selectionWasAmbiguous || (nonCollapsed && exactSelection === null),
    sourceHash: projection.sourceHash,
    viewportTop: element.getBoundingClientRect().top,
  };
}
