import {
  ArrowLeftIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BackspaceIcon,
  Bars3BottomLeftIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  LinkIcon,
  ListBulletIcon,
  MinusIcon,
  PhotoIcon,
  PlusIcon,
  QueueListIcon,
  ShieldExclamationIcon,
  Square2StackIcon,
  TableCellsIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon } from "@heroicons/react/24/solid";
import { createPortal } from "react-dom";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CompositionEvent,
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { DocumentStore, type DocumentSnapshot } from "../document/store.ts";
import {
  createFootnoteBodyPatch,
  indexFootnotes,
  type FootnoteDefinition,
} from "../editor/footnotes.ts";
import type { YeliAsset } from "../document/model.ts";
import {
  createConstructPatch,
  createSplitInlineBlockPatch,
  projectMarkdown,
  projectTableRows,
  resolveReadEditTarget,
  type ReadEditFallbackReason,
  type ReadEditTarget,
  type SourceBlock,
} from "../editor/block-projection.ts";
import {
  commandsForSurface,
  executeBlockCommand,
  executeBlockSelectionCommand,
  executeInsertAfterCommand,
  executeSlashCommand,
  getCommand,
  matchesCommandShortcut,
  type CommandId,
} from "../editor/command-registry.ts";
import {
  insertPlainTextAtSelection,
  mergeInlineTextEdit,
  plainTextFromInlineDom,
  serializeInlineDom,
  splitInlineDomAtSelection,
} from "../editor/commands.ts";
import { headingAnchor } from "../editor/outline.ts";
import { createSourcePatch } from "../editor/source-ranges.ts";
import {
  createTableStructurePatch,
  type TableDimensions,
  type TableStructureKind,
} from "../editor/table-commands.ts";
import type { Labels } from "../i18n/en.ts";
import {
  renderSafeInlineMarkdown,
  createInlineFootnoteContext,
  type InlineFootnoteContext,
  usesFirstQuoteCallout,
} from "../render/markdown.ts";
import { MetadataInline } from "./metadata-inline.tsx";
import { imageBlockDetails } from "./image-block.ts";
import type { ImagePreviewTarget } from "./image-preview.tsx";
import { resolveWorkspaceImage } from "./starter-assets.ts";
import { TableSizePicker } from "./table-size-picker.tsx";
import { useDocumentStore } from "./use-document-store.ts";

const FootnoteContext = createContext<InlineFootnoteContext | undefined>(
  undefined,
);
const FootnoteEditorContext = createContext<
  | {
      scope: string;
      sourceOffset: (offset: number) => number;
    }
  | undefined
>(undefined);

interface EditCanvasProps {
  assets: readonly YeliAsset[];
  displayTitle: string;
  handoffTarget: ReadEditTarget | null;
  labels: Labels;
  locale: "en" | "zh-CN";
  onHandoffResolved: (reason?: ReadEditFallbackReason) => void;
  onOpenDocumentInspector: () => void;
  onOpenImage: (image: ImagePreviewTarget, trigger: HTMLElement) => void;
  onSelectBlock: (block: SourceBlock, revealInspector?: boolean) => void;
  selectedBlockId: string | undefined;
  snapshot: DocumentSnapshot;
  store: DocumentStore;
}

function textPosition(
  root: HTMLElement,
  offset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let last: Text | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    last = text;
    if (remaining <= text.data.length) return { node: text, offset: remaining };
    remaining -= text.data.length;
  }
  return remaining === 0 && last
    ? { node: last, offset: last.data.length }
    : null;
}

function restoreTextSelection(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
): boolean {
  const start = textPosition(root, startOffset);
  const end = textPosition(root, endOffset);
  if (!start || !end) return false;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

interface DomCaretPoint {
  node: Node;
  offset: number;
}

interface CanvasCaretPoint {
  blockId: string;
  nodeOffset: number;
  nodePath: number[];
}

function caretPointFromViewport(x: number, y: number): DomCaretPoint | null {
  const caretDocument = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offset: number; offsetNode: Node } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = caretDocument.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = caretDocument.caretRangeFromPoint?.(x, y);
  return range
    ? { node: range.startContainer, offset: range.startOffset }
    : null;
}

function editableForCaretPoint(point: DomCaretPoint): HTMLElement | null {
  const element =
    point.node instanceof Element ? point.node : point.node.parentElement;
  return element?.closest<HTMLElement>(".block-content-editable") ?? null;
}

function storeCanvasCaretPoint(
  editable: HTMLElement,
  point: DomCaretPoint,
): CanvasCaretPoint | null {
  const shell = editable.closest<HTMLElement>("[data-source-block-id]");
  const blockId = shell?.dataset.sourceBlockId;
  if (!blockId) return null;
  const nodePath = pathFromRoot(editable, point.node);
  return nodePath ? { blockId, nodeOffset: point.offset, nodePath } : null;
}

function resolveCanvasCaretPoint(
  canvas: HTMLElement,
  point: CanvasCaretPoint,
): DomCaretPoint | null {
  const shell = [
    ...canvas.querySelectorAll<HTMLElement>("[data-source-block-id]"),
  ].find((candidate) => candidate.dataset.sourceBlockId === point.blockId);
  const editable = shell?.querySelector<HTMLElement>(".block-content-editable");
  if (!editable) return null;
  const node = nodeFromPath(editable, point.nodePath);
  return node ? { node, offset: point.nodeOffset } : null;
}

function blockContent(block: SourceBlock): string {
  return createConstructPatch(block, { kind: "block-content" }, "")
    .expectedText;
}

function createNarrowInlinePatch(block: SourceBlock, replacement: string) {
  if (block.kind === "blank") {
    return createSourcePatch(block, `\n${replacement}\n\n`, "wysiwyg:inline");
  }
  const base = createConstructPatch(block, { kind: "block-content" }, "");
  let prefix = 0;
  while (
    prefix < base.expectedText.length &&
    prefix < replacement.length &&
    base.expectedText[prefix] === replacement[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < base.expectedText.length - prefix &&
    suffix < replacement.length - prefix &&
    base.expectedText[base.expectedText.length - suffix - 1] ===
      replacement[replacement.length - suffix - 1]
  ) {
    suffix += 1;
  }
  return createSourcePatch(
    {
      expectedText: base.expectedText,
      id: block.id,
      range: base.range,
      revision: block.revision,
      sourceHash: block.sourceHash,
    },
    replacement.slice(prefix, replacement.length - suffix),
    "wysiwyg:inline",
    {
      from: base.range.from + prefix,
      to: base.range.to - suffix,
    },
  );
}

function focusProjectedBlock(
  block: SourceBlock,
  atEnd = false,
  scope?: string,
) {
  window.requestAnimationFrame(() => {
    const root = scope ? document.querySelector(scope) : document;
    const shell = [
      ...(root?.querySelectorAll<HTMLElement>(
        `[data-block-from="${block.range.from}"]`,
      ) ?? []),
    ].find((candidate) => scope || !candidate.closest(".footnote-body"));
    const editable = shell?.matches(".block-content-editable")
      ? shell
      : shell?.querySelector<HTMLElement>(".block-content-editable");
    if (!editable) return;
    editable.focus();
    const offset = atEnd ? plainTextFromInlineDom(editable).length : 0;
    restoreTextSelection(editable, offset, offset);
  });
}

interface StoredDomSelection {
  endOffset: number;
  endPath: number[];
  startOffset: number;
  startPath: number[];
}

function pathFromRoot(root: Node, node: Node): number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    const index = [...parent.childNodes].indexOf(current as ChildNode);
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }
  return current === root ? path : null;
}

function nodeFromPath(root: Node, path: readonly number[]): Node | null {
  let current = root;
  for (const index of path) {
    const next: ChildNode | undefined = current.childNodes[index];
    if (!next) return null;
    current = next;
  }
  return current;
}

function InlineToolbar({
  block,
  blocks,
  editableRef,
  labels,
  onBlockCommand,
  onCommand,
  position,
  structuralOnly = false,
}: {
  block: SourceBlock;
  blocks?: readonly SourceBlock[];
  editableRef?: RefObject<HTMLElement | null>;
  labels: Labels;
  onBlockCommand: (id: CommandId) => void;
  onCommand?: (id: CommandId) => void;
  position: CSSProperties;
  structuralOnly?: boolean;
}) {
  const [blockTypesOpen, setBlockTypesOpen] = useState(false);
  const blockTypesRef = useRef<HTMLDivElement>(null);
  const commands = commandsForSurface("selection-toolbar", {
    hasSelection: true,
    mode: "edit",
  });
  const commandContent = (id: CommandId) => {
    if (id === "selection.bold") return <strong>B</strong>;
    if (id === "selection.italic") return <em>I</em>;
    if (id === "selection.strike")
      return <span className="strike-label">S</span>;
    if (id === "selection.code") return <CodeBracketIcon aria-hidden="true" />;
    if (id === "selection.link") return <LinkIcon aria-hidden="true" />;
    return <BackspaceIcon aria-hidden="true" />;
  };
  const groups: readonly (readonly CommandId[])[] = [
    ["selection.bold", "selection.italic", "selection.strike"],
    ["selection.code", "selection.link"],
    ["selection.clear"],
  ];
  const commandById = new Map(
    commands.map((command) => [command.definition.id, command]),
  );
  const targetBlocks = blocks ?? [block];
  const typeCommands = blockTypeOrder.map((id) => {
    const resolutions = targetBlocks.map((target) =>
      commandsForSurface("block-menu", { block: target, mode: "edit" }).find(
        ({ definition }) => definition.id === id,
      ),
    );
    const selected = resolutions.every(
      (resolution) =>
        resolution?.disabledReason === "commandUnavailableSameType",
    );
    return {
      available:
        !selected &&
        resolutions.every(
          (resolution) =>
            resolution?.available ||
            resolution?.disabledReason === "commandUnavailableSameType",
        ),
      definition: getCommand(id),
      disabledReason: selected ? "commandUnavailableSameType" : undefined,
    };
  });
  const typeDescription = targetBlocks.every(
    (target) =>
      blockTypeLabel(target, labels) === blockTypeLabel(block, labels),
  )
    ? blockTypeLabel(block, labels)
    : String(targetBlocks.length);

  useEffect(() => {
    if (!blockTypesOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        blockTypesRef.current?.contains(event.target)
      ) {
        return;
      }
      setBlockTypesOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [blockTypesOpen]);

  return (
    <div
      className={`inline-toolbar${structuralOnly ? " multi-block-toolbar" : ""}`}
      style={position}
      role="toolbar"
      aria-label={structuralOnly ? labels.blockType : labels.inlineFormatting}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape" && blockTypesOpen) {
          event.preventDefault();
          setBlockTypesOpen(false);
        }
      }}
    >
      <div
        className="inline-toolbar-group selection-block-type"
        ref={blockTypesRef}
        role="group"
        data-toolbar-group="structure"
      >
        <button
          aria-expanded={blockTypesOpen}
          aria-haspopup="menu"
          aria-label={`${labels.blockType} · ${typeDescription}`}
          className="selection-block-type-trigger"
          title={`${labels.blockType} · ${typeDescription}`}
          type="button"
          onClick={() => setBlockTypesOpen((open) => !open)}
        >
          <CurrentBlockIcon block={block} labels={labels} />
          <ChevronDownIcon aria-hidden="true" />
        </button>
        {blockTypesOpen ? (
          <div
            aria-label={labels.blockType}
            className="selection-block-type-menu"
            role="menu"
          >
            <span className="selection-block-type-heading">
              {labels.blockType}
            </span>
            <div className="selection-block-type-grid">
              {typeCommands.map(({ available, definition, disabledReason }) => {
                const selected =
                  disabledReason === "commandUnavailableSameType";
                return (
                  <button
                    aria-current={selected ? "true" : undefined}
                    aria-disabled={!available}
                    aria-label={labels[definition.label]}
                    className={selected ? "is-current" : undefined}
                    data-command-id={definition.id}
                    key={definition.id}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      if (!available) return;
                      onBlockCommand(definition.id);
                      setBlockTypesOpen(false);
                    }}
                  >
                    <BlockTypeIcon id={definition.id} />
                    {!definition.id.startsWith("block.convert.heading") ? (
                      <span>{blockCommandLabel(definition.id, labels)}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {structuralOnly
        ? null
        : groups.map((ids, groupIndex) => (
            <div
              className="inline-toolbar-group"
              key={ids.join(":")}
              role="group"
              data-toolbar-group={groupIndex + 1}
            >
              {ids.map((id) => {
                const command = commandById.get(id);
                if (!command) return null;
                const { definition } = command;
                const shortcut = definition.shortcuts?.[0];
                return (
                  <button
                    aria-keyshortcuts={shortcut?.aria}
                    aria-label={labels[definition.label]}
                    data-command-id={definition.id}
                    key={definition.id}
                    title={`${labels[definition.label]}${shortcut ? ` · ${shortcut.display}` : ""}`}
                    type="button"
                    onClick={() => {
                      editableRef?.current?.focus();
                      onCommand?.(definition.id);
                    }}
                  >
                    {commandContent(definition.id)}
                  </button>
                );
              })}
            </div>
          ))}
    </div>
  );
}

interface EditableInlineBlockProps {
  anchor: string | undefined;
  block: SourceBlock;
  isCallout?: boolean;
  labels: Labels;
  locale: "en" | "zh-CN";
  onSelectBlock: (block: SourceBlock) => void;
  store: DocumentStore;
}

function EditableInlineBlock({
  anchor,
  block,
  isCallout = false,
  labels,
  locale,
  onSelectBlock,
  store,
}: EditableInlineBlockProps) {
  const editableRef = useRef<HTMLElement>(null);
  const baselineSerializedRef = useRef("");
  const baselineTextRef = useRef("");
  const dirtyRef = useRef(false);
  const selectionRef = useRef<StoredDomSelection | null>(null);
  const suppressSelectionKeyUpRef = useRef(false);
  const composingRef = useRef(false);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const slashMenuId = `slash-commands-${useId()}`;
  const [active, setActive] = useState(false);
  const [selectionPosition, setSelectionPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const content = blockContent(block);
  const footnoteContext = useContext(FootnoteContext);
  const footnoteEditor = useContext(FootnoteEditorContext);
  const footnoteSourceFrom =
    footnoteEditor?.sourceOffset(block.range.from) ?? block.range.from;
  const inline = useMemo(
    () =>
      renderSafeInlineMarkdown(content, {
        imageUnavailableLabel: labels.imageNotLoaded,
        ...(footnoteContext ? { footnoteContext } : {}),
        editorFootnotes: true,
        footnoteSourceFrom,
      }),
    [content, footnoteContext, footnoteSourceFrom, labels.imageNotLoaded],
  );
  const setEditableRef = (node: HTMLElement | null) => {
    editableRef.current = node;
  };
  const hideSlashMenu = () => {
    const menu = slashMenuRef.current;
    const editable = editableRef.current;
    if (menu) menu.hidden = true;
    editable?.removeAttribute("aria-activedescendant");
    editable?.removeAttribute("aria-controls");
    editable?.removeAttribute("aria-expanded");
  };
  const visibleSlashOptions = () =>
    [
      ...(slashMenuRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-command-id]",
      ) ?? []),
    ].filter((button) => !button.hidden);
  const activateSlashOption = (index: number, scroll = false) => {
    const options = visibleSlashOptions();
    if (options.length === 0) {
      editableRef.current?.removeAttribute("aria-activedescendant");
      return;
    }
    const normalized = (index + options.length) % options.length;
    for (const [optionIndex, option] of options.entries()) {
      const selected = optionIndex === normalized;
      option.setAttribute("aria-selected", String(selected));
      option.classList.toggle("is-active", selected);
    }
    const activeOption = options[normalized]!;
    editableRef.current?.setAttribute("aria-activedescendant", activeOption.id);
    if (scroll) activeOption.scrollIntoView({ block: "nearest" });
  };

  useLayoutEffect(() => {
    const editable = editableRef.current;
    if (
      !editable ||
      editable === document.activeElement ||
      dirtyRef.current ||
      conflict
    )
      return;
    // React must not own the editable children: toolbar and selection renders
    // would otherwise replace native edits before the blur transaction.
    if (editable.innerHTML !== inline) editable.innerHTML = inline;
  }, [inline, active, conflict]);

  useLayoutEffect(() => {
    if (!active || !selectionPosition || !selectionRef.current) return;
    const editable = editableRef.current;
    if (!editable) return;
    const stored = selectionRef.current;
    const start = nodeFromPath(editable, stored.startPath);
    const end = nodeFromPath(editable, stored.endPath);
    if (!start || !end) return;
    const range = document.createRange();
    try {
      range.setStart(start, stored.startOffset);
      range.setEnd(end, stored.endOffset);
    } catch {
      return;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [active, selectionPosition]);

  const commitCurrent = (editable: HTMLElement) => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const serialized = serializeInlineDom(editable);
    const nextText = plainTextFromInlineDom(editable);
    const replacement =
      baselineTextRef.current === nextText
        ? baselineSerializedRef.current === content
          ? serialized
          : null
        : mergeInlineTextEdit(content, baselineTextRef.current, nextText);
    if (replacement === null) {
      setConflict(true);
      return;
    }
    if (replacement === content) {
      setConflict(false);
      return;
    }
    const result = store.applyPatch(
      createNarrowInlinePatch(block, replacement),
    );
    setConflict(!result.ok);
  };
  const commit = (event: FocusEvent<HTMLElement>) => {
    setActive(false);
    setSelectionPosition(null);
    hideSlashMenu();
    commitCurrent(event.currentTarget);
  };
  const paste = (event: ClipboardEvent<HTMLElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    if (insertPlainTextAtSelection(text, event.currentTarget)) {
      dirtyRef.current = true;
    }
  };
  const updateSlashQuery = (editable: HTMLElement) => {
    if (composingRef.current) return;
    const text = plainTextFromInlineDom(editable);
    const menu = slashMenuRef.current;
    if (!menu) return;
    if (!text.startsWith("/") || text.includes("\n") || text.length > 48) {
      hideSlashMenu();
      return;
    }
    const query = text.slice(1).trim().toLocaleLowerCase();
    const matchingIds = new Set(
      commandsForSurface("slash", { mode: "edit" }, { labels, query }).map(
        ({ definition }) => definition.id,
      ),
    );
    for (const button of menu.querySelectorAll<HTMLButtonElement>(
      "button[data-command-id]",
    )) {
      button.hidden = !matchingIds.has(button.dataset.commandId as CommandId);
    }
    for (const group of menu.querySelectorAll<HTMLElement>(
      "[data-slash-group]",
    )) {
      group.hidden = !group.querySelector("button:not([hidden])");
    }
    const empty = menu.querySelector<HTMLElement>("[data-slash-empty]");
    if (empty) empty.hidden = matchingIds.size > 0;
    const selection = window.getSelection();
    const selectionRect =
      selection && selection.rangeCount > 0
        ? selection.getRangeAt(0).getBoundingClientRect()
        : null;
    const blockRect = editable.getBoundingClientRect();
    const anchorRect =
      selectionRect && (selectionRect.height > 0 || selectionRect.width > 0)
        ? selectionRect
        : blockRect;
    const menuWidth = Math.min(280, window.innerWidth - 16);
    const desiredHeight = 360;
    const gap = 6;
    const availableBelow = window.innerHeight - anchorRect.bottom - gap - 8;
    const availableAbove = anchorRect.top - gap - 8;
    const openAbove = availableBelow < 220 && availableAbove > availableBelow;
    const availableHeight = Math.max(
      96,
      openAbove ? availableAbove : availableBelow,
    );
    menu.style.left = `${Math.max(8, Math.min(anchorRect.left, window.innerWidth - menuWidth - 8))}px`;
    menu.style.maxHeight = `${Math.min(desiredHeight, availableHeight)}px`;
    menu.style.top = openAbove
      ? `${Math.max(8, anchorRect.top - Math.min(desiredHeight, availableHeight) - gap)}px`
      : `${Math.max(8, anchorRect.bottom + gap)}px`;
    menu.hidden = false;
    editable.setAttribute("aria-controls", slashMenuId);
    editable.setAttribute("aria-expanded", "true");
    activateSlashOption(0);
  };
  const updateSelection = () => {
    const editable = editableRef.current;
    const selection = window.getSelection();
    if (
      !editable ||
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed ||
      !editable.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
      setSelectionPosition(null);
      return;
    }
    const rangeRect = selection.getRangeAt(0).getBoundingClientRect();
    const range = selection.getRangeAt(0);
    const startPath = pathFromRoot(editable, range.startContainer);
    const endPath = pathFromRoot(editable, range.endContainer);
    if (!startPath || !endPath) {
      setSelectionPosition(null);
      return;
    }
    selectionRef.current = {
      endOffset: range.endOffset,
      endPath,
      startOffset: range.startOffset,
      startPath,
    };
    const blockRect = editable.parentElement?.getBoundingClientRect();
    if (!blockRect || (rangeRect.width === 0 && rangeRect.height === 0)) {
      setSelectionPosition(null);
      return;
    }
    setSelectionPosition({
      left: rangeRect.left - blockRect.left + rangeRect.width / 2,
      top: rangeRect.top - blockRect.top,
    });
  };
  const applyInlineCode = () => {
    const editable = editableRef.current;
    const stored = selectionRef.current;
    if (!editable || !stored) return;
    const clone = editable.cloneNode(true) as HTMLElement;
    const start = nodeFromPath(clone, stored.startPath);
    const end = nodeFromPath(clone, stored.endPath);
    if (!start || !end) return;
    const range = document.createRange();
    try {
      range.setStart(start, stored.startOffset);
      range.setEnd(end, stored.endOffset);
    } catch {
      return;
    }
    const code = document.createElement("code");
    const selectedText = range.extractContents().textContent ?? "";
    code.textContent = selectedText;
    range.insertNode(code);
    const replacement = serializeInlineDom(clone);
    const result = store.applyPatch(
      createNarrowInlinePatch(block, replacement),
    );
    if (result.ok) {
      dirtyRef.current = false;
      setSelectionPosition(null);
      window.requestAnimationFrame(() => {
        const scope = footnoteEditor
          ? document.querySelector(footnoteEditor.scope)
          : document;
        const next = scope?.querySelector<HTMLElement>(
          `.editable-block[data-block-from="${block.range.from}"] .block-content-editable`,
        );
        if (!next) return;
        next.focus();
        const nextCode = [...next.querySelectorAll("code")].find(
          (candidate) => candidate.textContent === selectedText,
        );
        if (!nextCode) return;
        const nextRange = document.createRange();
        nextRange.selectNodeContents(nextCode);
        const nextSelection = window.getSelection();
        nextSelection?.removeAllRanges();
        nextSelection?.addRange(nextRange);
      });
    }
  };
  const runSelectionCommand = (id: CommandId) => {
    if (id === "selection.code") {
      applyInlineCode();
      return;
    }
    editableRef.current?.focus();
    let command: string;
    let value: string | undefined;
    if (id === "selection.bold") command = "bold";
    else if (id === "selection.italic") command = "italic";
    else if (id === "selection.strike") command = "strikeThrough";
    else if (id === "selection.clear") command = "removeFormat";
    else if (id === "selection.link") {
      command = "createLink";
      value = window.prompt(labels.linkAddress, "https://") ?? undefined;
      if (!value) return;
    } else return;
    document.execCommand(command, false, value);
    dirtyRef.current = true;
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    const shortcut = commandsForSurface(
      "keyboard",
      { hasSelection: true, mode: "edit" },
      { scope: "selection" },
    ).find(({ definition }) => matchesCommandShortcut(definition.id, event));
    if (shortcut) {
      event.preventDefault();
      suppressSelectionKeyUpRef.current = true;
      runSelectionCommand(shortcut.definition.id);
      return;
    }
    const slashMenuOpen = slashMenuRef.current?.hidden === false;
    if (
      slashMenuOpen &&
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      const options = visibleSlashOptions();
      const current = options.findIndex(
        (option) => option.getAttribute("aria-selected") === "true",
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : current + (event.key === "ArrowDown" ? 1 : -1);
      activateSlashOption(next, true);
      return;
    }
    if (slashMenuOpen && event.key === "Enter") {
      const selected = visibleSlashOptions().find(
        (option) => option.getAttribute("aria-selected") === "true",
      );
      if (selected) {
        event.preventDefault();
        selected.click();
        return;
      }
    }
    if (event.key === "Escape" && !slashMenuRef.current?.hidden) {
      event.preventDefault();
      hideSlashMenu();
      commitCurrent(event.currentTarget);
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") event.currentTarget.blur();
    if (
      !composingRef.current &&
      !event.shiftKey &&
      event.key === "Enter" &&
      (block.kind === "list-item" || block.kind === "task")
    ) {
      const split = splitInlineDomAtSelection(event.currentTarget);
      if (!split) return;
      event.preventDefault();
      const result = store.applyPatch(
        createSplitInlineBlockPatch(block, split.before, split.after),
      );
      if (!result.ok) {
        setConflict(true);
        return;
      }
      dirtyRef.current = false;
      setSelectionPosition(null);
      const updated = store.getSnapshot();
      const nextBlock = projectMarkdown(
        updated.source,
        updated.revision,
      ).blocks.find(
        (candidate) =>
          candidate.range.from > block.range.from &&
          candidate.kind === block.kind,
      );
      if (nextBlock)
        focusProjectedBlock(nextBlock, false, footnoteEditor?.scope);
      return;
    }
    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      block.kind === "blank" &&
      block.range.to > block.range.from &&
      plainTextFromInlineDom(event.currentTarget).trim().length === 0
    ) {
      event.preventDefault();
      dirtyRef.current = false;
      const before = store.getSnapshot().projection.blocks;
      const index = before.findIndex((candidate) => candidate.id === block.id);
      const result = executeBlockCommand(store, "block.delete", block, labels);
      if (!result?.ok) {
        setConflict(true);
        return;
      }
      const updated = store.getSnapshot();
      const after = projectMarkdown(updated.source, updated.revision).blocks;
      const target =
        event.key === "Backspace"
          ? after[Math.max(0, index - 1)]
          : after[Math.min(index, after.length - 1)];
      if (target)
        focusProjectedBlock(
          target,
          event.key === "Backspace",
          footnoteEditor?.scope,
        );
      return;
    }
    if (block.kind === "heading" && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const common = {
    "aria-label": `${labels.editBlock}: ${block.kind}`,
    className: "block-content-editable",
    contentEditable: true,
    onBlur: commit,
    onCompositionEnd: (event: CompositionEvent<HTMLElement>) => {
      composingRef.current = false;
      dirtyRef.current = true;
      updateSlashQuery(event.currentTarget);
    },
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      baselineSerializedRef.current = serializeInlineDom(event.currentTarget);
      baselineTextRef.current = plainTextFromInlineDom(event.currentTarget);
      setActive(true);
      onSelectBlock(block);
    },
    onInput: (event: FormEvent<HTMLElement>) => {
      dirtyRef.current = true;
      updateSlashQuery(event.currentTarget);
    },
    onKeyDown: keyDown,
    onKeyUp: () => {
      if (suppressSelectionKeyUpRef.current) {
        suppressSelectionKeyUpRef.current = false;
        return;
      }
      updateSelection();
    },
    onMouseUp: updateSelection,
    onPaste: paste,
    onSelect: updateSelection,
    ref: setEditableRef,
    role:
      block.kind === "heading" || block.kind === "quote"
        ? undefined
        : "textbox",
    suppressContentEditableWarning: true,
  } as const;

  let contentElement;
  if (block.kind === "heading") {
    const level =
      /^ {0,3}(#{1,6})/u.exec(block.expectedText)?.[1]?.length ??
      (/\n {0,3}=+\s*\n?$/u.test(block.expectedText) ? 1 : 2);
    if (level <= 2) contentElement = <h2 {...common} id={anchor} />;
    else if (level === 3) contentElement = <h3 {...common} id={anchor} />;
    else contentElement = <h4 {...common} id={anchor} />;
  } else if (block.kind === "quote") {
    contentElement = <blockquote {...common} />;
  } else {
    contentElement = <div {...common} />;
  }

  const marker =
    block.kind === "list-item"
      ? /^\s*((?:[-+*]|\d+[.)]))/u.exec(block.expectedText)?.[1]
      : null;
  const slashCommands = commandsForSurface(
    "slash",
    { mode: "edit" },
    { labels },
  ).sort(
    (left, right) =>
      insertCommandOrder.indexOf(left.definition.id) -
      insertCommandOrder.indexOf(right.definition.id),
  );
  const slashCommandGroups = [
    {
      commands: slashCommands.filter(
        ({ definition }) => definition.id !== "template.meeting-notes",
      ),
      id: "basic",
      label: labels.slashCommandsBasic,
    },
    {
      commands: slashCommands.filter(
        ({ definition }) => definition.id === "template.meeting-notes",
      ),
      id: "templates",
      label: labels.slashCommandsTemplate,
    },
  ];

  return (
    <div
      className={`editable-block block-${block.kind}${isCallout ? " is-callout" : ""}${active ? " is-active" : ""}${selectionPosition ? " has-selection" : ""}${blockMenuOpen ? " has-block-menu" : ""}`}
      data-block-from={block.range.from}
      data-block-kind={block.kind}
      data-source-block-id={block.id}
      data-source-from={block.range.from}
      data-source-to={block.range.to}
    >
      <BlockControls
        active={active}
        block={block}
        labels={labels}
        locale={locale}
        onOpenChange={setBlockMenuOpen}
        open={blockMenuOpen}
        store={store}
      />
      {marker ? <span className="list-marker">{marker}</span> : null}
      {isCallout ? (
        <span className="edit-callout-icon" aria-hidden="true">
          <HeartIcon />
        </span>
      ) : null}
      {contentElement}
      {createPortal(
        <div
          aria-label={labels.slashCommands}
          className="slash-command-menu"
          hidden
          id={slashMenuId}
          onMouseDown={(event) => event.preventDefault()}
          ref={slashMenuRef}
          role="listbox"
        >
          <div className="slash-command-results">
            {slashCommandGroups.map((group) => (
              <div data-slash-group={group.id} key={group.id}>
                <span className="slash-command-group-label">{group.label}</span>
                {group.commands.map(({ definition }) => (
                  <button
                    aria-selected="false"
                    data-command-id={definition.id}
                    id={`${slashMenuId}-${definition.id.replaceAll(".", "-")}`}
                    key={definition.id}
                    role="option"
                    type="button"
                    onPointerMove={(event) => {
                      const options = visibleSlashOptions();
                      activateSlashOption(options.indexOf(event.currentTarget));
                    }}
                    onClick={() => {
                      dirtyRef.current = false;
                      hideSlashMenu();
                      const result = executeSlashCommand(
                        store,
                        definition.id,
                        block,
                        labels,
                        locale,
                      );
                      if (!result?.ok) setConflict(true);
                    }}
                  >
                    <span className="slash-command-icon">
                      <InsertCommandIcon id={definition.id} />
                    </span>
                    <span>{labels[definition.label]}</span>
                    <span className="slash-command-syntax" aria-hidden="true">
                      {definition.id === "insert.paragraph"
                        ? "Text"
                        : definition.id === "insert.section"
                          ? "##"
                          : definition.id.startsWith("insert.heading")
                            ? "#".repeat(
                                Number(
                                  definition.id.replace("insert.heading", ""),
                                ),
                              )
                            : ""}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            <span data-slash-empty hidden role="status">
              {labels.commandNoResults}
            </span>
          </div>
          <div className="slash-command-footer" aria-hidden="true">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> {labels.slashKeyboardHint}
            </span>
            <span>
              <kbd>↵</kbd> {labels.slashSelectHint}
            </span>
          </div>
        </div>,
        document.body,
      )}
      {active && selectionPosition ? (
        <InlineToolbar
          block={block}
          editableRef={editableRef}
          labels={labels}
          onBlockCommand={(id) => {
            executeBlockCommand(store, id, block, labels);
            setSelectionPosition(null);
          }}
          onCommand={runSelectionCommand}
          position={
            {
              "--selection-left": `${selectionPosition.left}px`,
              "--selection-top": `${selectionPosition.top}px`,
            } as CSSProperties
          }
        />
      ) : null}
      {conflict ? (
        <span className="block-conflict" role="alert">
          {labels.writeConflict}
        </span>
      ) : null}
    </div>
  );
}

const insertCommandOrder: readonly CommandId[] = [
  "insert.paragraph",
  "insert.heading1",
  "insert.section",
  "insert.heading3",
  "insert.heading4",
  "insert.heading5",
  "insert.heading6",
  "insert.bullet-list",
  "insert.numbered-list",
  "insert.task",
  "insert.quote",
  "insert.code-block",
  "insert.table",
  "insert.divider",
  "template.meeting-notes",
];

function insertCommandLabel(id: CommandId, labels: Labels): string {
  if (id === "insert.section") return "H2";
  const heading = /^insert\.heading([13456])$/u.exec(id)?.[1];
  if (heading) return `H${heading}`;
  return labels[getCommand(id).label];
}

function InsertCommandIcon({ id }: { id: CommandId }) {
  const heading =
    id === "insert.section" ? "2" : /^insert\.heading([13456])$/u.exec(id)?.[1];
  if (heading) {
    return (
      <span className="block-type-token" aria-hidden="true">
        H{heading}
      </span>
    );
  }
  if (id === "insert.paragraph")
    return <Bars3BottomLeftIcon aria-hidden="true" />;
  if (id === "insert.task") return <CheckCircleIcon aria-hidden="true" />;
  if (id === "insert.quote")
    return <ChatBubbleBottomCenterTextIcon aria-hidden="true" />;
  if (id === "insert.bullet-list") return <ListBulletIcon aria-hidden="true" />;
  if (id === "insert.numbered-list")
    return <QueueListIcon aria-hidden="true" />;
  if (id === "insert.code-block") return <CodeBracketIcon aria-hidden="true" />;
  if (id === "insert.table") return <TableCellsIcon aria-hidden="true" />;
  if (id === "insert.divider") return <MinusIcon aria-hidden="true" />;
  return <Square2StackIcon aria-hidden="true" />;
}

function BlockControls({
  active,
  block,
  labels,
  locale,
  onOpenChange,
  open: controlledOpen,
  store,
  structureOnly = false,
  typeLabel,
}: {
  active?: boolean;
  block: SourceBlock;
  labels: Labels;
  locale?: "en" | "zh-CN";
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  store: DocumentStore;
  structureOnly?: boolean;
  typeLabel?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [gutterFocused, setGutterFocused] = useState(false);
  const [menuPosition, setMenuPosition] = useState<CSSProperties | null>(null);
  const [insertSubmenuPosition, setInsertSubmenuPosition] =
    useState<CSSProperties | null>(null);
  const [insertSubmenuOpen, setInsertSubmenuOpen] = useState(false);
  const [tablePickerContext, setTablePickerContext] = useState<
    "below" | "replace" | null
  >(null);
  const tablePickerContextRef = useRef<"below" | "replace" | null>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const hoverCloseRef = useRef<number | null>(null);
  const insertSubmenuCloseRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const insertBelowTriggerRef = useRef<HTMLButtonElement>(null);
  const insertSubmenuRef = useRef<HTMLDivElement>(null);
  const open = controlledOpen ?? internalOpen;
  const isEmpty = block.kind === "blank";
  const updateTablePickerContext = useCallback(
    (context: "below" | "replace" | null) => {
      tablePickerContextRef.current = context;
      setTablePickerContext(context);
    },
    [],
  );
  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) {
        setMenuPosition(null);
        setInsertSubmenuPosition(null);
        setInsertSubmenuOpen(false);
        updateTablePickerContext(null);
      }
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange, updateTablePickerContext],
  );
  const blockCommands = commandsForSurface("block-menu", {
    block,
    mode: "edit",
  }).filter(
    ({ definition }) =>
      !structureOnly ||
      ["block.insert-below", "block.duplicate", "block.delete"].includes(
        definition.id,
      ),
  );
  const insertCommands = commandsForSurface("empty-block-menu", {
    mode: "edit",
  })
    .filter(
      ({ definition }) =>
        locale !== undefined || definition.id !== "template.meeting-notes",
    )
    .sort(
      (left, right) =>
        insertCommandOrder.indexOf(left.definition.id) -
        insertCommandOrder.indexOf(right.definition.id),
    );
  const typeCommands = blockCommands
    .filter(({ definition }) => definition.id.startsWith("block.convert."))
    .filter(
      ({ available, disabledReason }) =>
        available || disabledReason === "commandUnavailableSameType",
    )
    .sort(
      (left, right) =>
        blockTypeOrder.indexOf(left.definition.id) -
        blockTypeOrder.indexOf(right.definition.id),
    );
  const actionCommands = blockCommands.filter(
    ({ definition }) =>
      !definition.id.startsWith("block.convert.") &&
      definition.id !== "block.insert-below",
  );
  const basicInsertCommands = insertCommands.filter(
    ({ definition }) =>
      !["insert.table", "insert.divider", "template.meeting-notes"].includes(
        definition.id,
      ),
  );
  const commonInsertCommands = insertCommands.filter(({ definition }) =>
    ["insert.table", "insert.divider", "template.meeting-notes"].includes(
      definition.id,
    ),
  );
  const currentType = typeLabel ?? blockTypeLabel(block, labels);
  const disabledReasonId = (id: CommandId) =>
    `block-command-reason-${block.range.from}-${id.replaceAll(".", "-")}`;
  const cancelHoverClose = () => {
    if (hoverCloseRef.current === null) return;
    window.clearTimeout(hoverCloseRef.current);
    hoverCloseRef.current = null;
  };
  const openFromHover = () => {
    cancelHoverClose();
    setOpen(true);
  };
  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverCloseRef.current = window.setTimeout(() => {
      hoverCloseRef.current = null;
      setOpen(false);
    }, 180);
  };
  const cancelInsertSubmenuClose = () => {
    if (insertSubmenuCloseRef.current === null) return;
    window.clearTimeout(insertSubmenuCloseRef.current);
    insertSubmenuCloseRef.current = null;
  };
  const openInsertSubmenu = () => {
    cancelInsertSubmenuClose();
    setInsertSubmenuOpen(true);
  };
  const scheduleInsertSubmenuClose = () => {
    if (tablePickerContextRef.current !== null) return;
    cancelInsertSubmenuClose();
    insertSubmenuCloseRef.current = window.setTimeout(() => {
      insertSubmenuCloseRef.current = null;
      setInsertSubmenuOpen(false);
      updateTablePickerContext(null);
    }, 220);
  };
  const runInsertCommand = (
    id: CommandId,
    below: boolean,
    tableDimensions?: TableDimensions,
  ) => {
    const result = below
      ? executeInsertAfterCommand(
          store,
          id,
          block,
          labels,
          locale ?? "en",
          tableDimensions,
        )
      : executeSlashCommand(
          store,
          id,
          block,
          labels,
          locale ?? "en",
          tableDimensions,
        );
    if (result?.ok) setOpen(false);
  };
  const insertionGrid = (
    commands: typeof insertCommands,
    below: boolean,
    compact = false,
  ) => {
    const context = below ? "below" : "replace";
    return (
      <>
        <div className={`block-insert-grid${compact ? " is-compact" : ""}`}>
          {commands.map(({ available, definition }) => {
            const button = (
              <button
                aria-disabled={!available}
                aria-expanded={
                  definition.id === "insert.table"
                    ? tablePickerContext === context
                    : undefined
                }
                aria-haspopup={
                  definition.id === "insert.table" ? "true" : undefined
                }
                aria-label={labels[definition.label]}
                data-command-id={definition.id}
                key={definition.id}
                role="menuitem"
                type="button"
                onClick={() => {
                  if (!available) return;
                  if (definition.id === "insert.table") {
                    updateTablePickerContext(
                      tablePickerContextRef.current === context
                        ? null
                        : context,
                    );
                    return;
                  }
                  runInsertCommand(definition.id, below);
                }}
              >
                <InsertCommandIcon id={definition.id} />
                {definition.id === "insert.section" ||
                definition.id.startsWith("insert.heading") ? null : (
                  <span>{insertCommandLabel(definition.id, labels)}</span>
                )}
              </button>
            );
            return button;
          })}
        </div>
        {commands.some(({ definition }) => definition.id === "insert.table") &&
        tablePickerContext === context ? (
          <TableSizePicker
            labels={labels}
            onSelect={(dimensions) =>
              runInsertCommand("insert.table", below, dimensions)
            }
          />
        ) : null}
      </>
    );
  };

  useEffect(
    () => () => {
      if (hoverCloseRef.current !== null) {
        window.clearTimeout(hoverCloseRef.current);
      }
      if (insertSubmenuCloseRef.current !== null) {
        window.clearTimeout(insertSubmenuCloseRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !menuTriggerRef.current) return;
    const triggerBox = menuTriggerRef.current.getBoundingClientRect();
    const menuBox = menuRef.current.getBoundingClientRect();
    const edge = 12;
    const topEdge =
      (document.querySelector(".workspace-topbar")?.getBoundingClientRect()
        .bottom ?? 0) + edge;
    const gap = 8;
    const rightSide = triggerBox.right + gap;
    const leftSide = triggerBox.left - menuBox.width - gap;
    const left =
      rightSide + menuBox.width <= window.innerWidth - edge
        ? rightSide
        : leftSide >= edge
          ? leftSide
          : Math.min(
              Math.max(edge, triggerBox.left),
              window.innerWidth - menuBox.width - edge,
            );
    const bottomEdge = Math.max(
      topEdge,
      window.innerHeight - menuBox.height - edge,
    );
    const top = Math.min(Math.max(topEdge, triggerBox.top), bottomEdge);
    setMenuPosition({ left, top });
  }, [insertCommands.length, open, typeCommands.length]);

  useLayoutEffect(() => {
    if (
      !open ||
      isEmpty ||
      !menuPosition ||
      !menuRef.current ||
      !insertBelowTriggerRef.current ||
      !insertSubmenuRef.current
    ) {
      setInsertSubmenuPosition(null);
      return;
    }
    const menuBox = menuRef.current.getBoundingClientRect();
    const triggerBox = insertBelowTriggerRef.current.getBoundingClientRect();
    const submenuBox = insertSubmenuRef.current.getBoundingClientRect();
    const edge = 12;
    const gap = 2;
    const topEdge =
      (document.querySelector(".workspace-topbar")?.getBoundingClientRect()
        .bottom ?? 0) + edge;
    const rightSide = menuBox.right + gap;
    const leftSide = menuBox.left - submenuBox.width - gap;
    const left =
      rightSide + submenuBox.width <= window.innerWidth - edge
        ? rightSide
        : Math.max(edge, leftSide);
    const top = Math.min(
      Math.max(topEdge, triggerBox.top),
      Math.max(topEdge, window.innerHeight - submenuBox.height - edge),
    );
    setInsertSubmenuPosition({ left, top });
  }, [insertCommands.length, isEmpty, menuPosition, open, tablePickerContext]);

  useEffect(() => {
    if (!open) return;
    const closeMenu = () => setOpen(false);
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        gutterRef.current?.contains(event.target)
      ) {
        return;
      }
      closeMenu();
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [open, setOpen]);

  return (
    <div
      className="block-gutter"
      ref={gutterRef}
      aria-hidden={
        active === undefined ? undefined : !active && !open && !gutterFocused
      }
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setGutterFocused(false);
        }
      }}
      onFocus={() => setGutterFocused(true)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
        }
      }}
    >
      <div
        aria-label={isEmpty ? labels.insertBlock : labels.blockMenu}
        className={`block-hover-toolbar ${isEmpty ? "is-empty" : "is-block"}`}
        role="toolbar"
      >
        {isEmpty ? (
          <button
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={labels.insertBlock}
            className="block-insert-trigger"
            ref={menuTriggerRef}
            title={labels.insertBlock}
            type="button"
            onClick={openFromHover}
            onFocus={openFromHover}
            onMouseEnter={openFromHover}
            onMouseLeave={scheduleHoverClose}
          >
            <PlusIcon aria-hidden="true" />
          </button>
        ) : (
          <button
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={`${labels.blockMenu} · ${currentType}`}
            className="block-menu-trigger"
            ref={menuTriggerRef}
            title={`${labels.blockMenu} · ${currentType}`}
            type="button"
            onClick={openFromHover}
            onFocus={openFromHover}
            onMouseEnter={openFromHover}
            onMouseLeave={scheduleHoverClose}
          >
            <CurrentBlockIcon
              block={block}
              labels={labels}
              typeLabel={typeLabel}
            />
          </button>
        )}
      </div>
      {open ? (
        <div
          aria-label={isEmpty ? labels.insertBlock : labels.blockMenu}
          className={`block-command-menu ${isEmpty ? "block-empty-menu" : "block-content-menu"}`}
          ref={menuRef}
          role="menu"
          style={menuPosition ?? { visibility: "hidden" }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        >
          <header className="block-command-menu-heading">
            <span>{isEmpty ? labels.insertBlock : labels.blockMenu}</span>
            <strong>{isEmpty ? "+" : currentType}</strong>
          </header>
          {isEmpty ? (
            <>
              <div
                aria-label={labels.blockType}
                className="block-command-group block-insert-type-group"
                role="group"
              >
                <span className="block-command-group-label">
                  {labels.blockType}
                </span>
                {insertionGrid(basicInsertCommands, false)}
              </div>
              {commonInsertCommands.length > 0 ? (
                <div
                  aria-label={labels.insert}
                  className="block-command-group block-insert-common-group"
                  role="group"
                >
                  <span className="block-command-group-label">
                    {labels.insert}
                  </span>
                  {insertionGrid(commonInsertCommands, false, true)}
                </div>
              ) : null}
            </>
          ) : (
            <>
              {typeCommands.length > 0 ? (
                <div
                  aria-label={labels.blockType}
                  className="block-command-group block-type-group"
                  role="group"
                >
                  <span className="block-command-group-label">
                    {labels.blockType}
                  </span>
                  <div className="block-type-grid">
                    {typeCommands.map(
                      ({ available, definition, disabledReason }) => {
                        const selected =
                          disabledReason === "commandUnavailableSameType";
                        return (
                          <button
                            aria-current={selected ? "true" : undefined}
                            aria-disabled={!available}
                            aria-label={labels[definition.label]}
                            className={selected ? "is-current" : undefined}
                            data-command-id={definition.id}
                            key={definition.id}
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              if (!available) return;
                              executeBlockCommand(
                                store,
                                definition.id,
                                block,
                                labels,
                              );
                              setOpen(false);
                            }}
                          >
                            <BlockTypeIcon id={definition.id} />
                            {!definition.id.startsWith(
                              "block.convert.heading",
                            ) ? (
                              <span>
                                {blockCommandLabel(definition.id, labels)}
                              </span>
                            ) : null}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : null}
              {actionCommands.length > 0 ? (
                <div
                  aria-label={labels.blockActions}
                  className="block-command-group block-action-group"
                  role="group"
                >
                  <span className="block-command-group-label">
                    {labels.blockActions}
                  </span>
                  {actionCommands.map(
                    ({ available, definition, disabledReason }) => (
                      <div key={definition.id}>
                        <button
                          aria-disabled={!available}
                          aria-describedby={
                            !available && disabledReason
                              ? disabledReasonId(definition.id)
                              : undefined
                          }
                          className={
                            definition.id === "block.delete"
                              ? "is-destructive"
                              : undefined
                          }
                          data-command-id={definition.id}
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            if (!available) return;
                            executeBlockCommand(
                              store,
                              definition.id,
                              block,
                              labels,
                            );
                            setOpen(false);
                          }}
                        >
                          <BlockActionIcon id={definition.id} />
                          <span>{labels[definition.label]}</span>
                        </button>
                        {!available && disabledReason ? (
                          <span
                            className="block-command-reason"
                            id={disabledReasonId(definition.id)}
                          >
                            {labels[disabledReason]}
                          </span>
                        ) : null}
                      </div>
                    ),
                  )}
                </div>
              ) : null}
              <div
                aria-label={labels.insertBelowMenu}
                className="block-command-group block-insert-below-group"
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    scheduleInsertSubmenuClose();
                  }
                }}
                onFocusCapture={openInsertSubmenu}
                onPointerEnter={openInsertSubmenu}
                onPointerLeave={scheduleInsertSubmenuClose}
                role="group"
              >
                <button
                  aria-haspopup="menu"
                  className="block-insert-below-trigger"
                  ref={insertBelowTriggerRef}
                  role="menuitem"
                  type="button"
                >
                  <PlusIcon aria-hidden="true" />
                  <span>{labels.insertBelowMenu}</span>
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="submenu-chevron"
                  />
                </button>
                <div
                  aria-label={labels.insertBelowMenu}
                  className={`block-insert-submenu${insertSubmenuOpen ? " is-open" : ""}${insertSubmenuPosition ? "" : " is-positioning"}`}
                  onPointerEnter={openInsertSubmenu}
                  onPointerLeave={scheduleInsertSubmenuClose}
                  ref={insertSubmenuRef}
                  role="menu"
                  style={insertSubmenuPosition ?? undefined}
                >
                  {insertionGrid(insertCommands, true, true)}
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

const blockTypeOrder: readonly CommandId[] = [
  "block.convert.paragraph",
  "block.convert.heading1",
  "block.convert.heading",
  "block.convert.heading3",
  "block.convert.heading4",
  "block.convert.heading5",
  "block.convert.heading6",
  "block.convert.bullet-list",
  "block.convert.numbered-list",
  "block.convert.task",
  "block.convert.quote",
  "block.convert.code",
];

function blockTypeLabel(block: SourceBlock, labels: Labels): string {
  if (block.kind === "heading") {
    const level =
      /^ {0,3}(#{1,6})/u.exec(block.expectedText)?.[1]?.length ??
      (/\n {0,3}=+\s*\n?$/u.test(block.expectedText) ? 1 : 2);
    return `H${level}`;
  }
  if (block.kind === "list-item") {
    return /^\s*\d+[.)]/u.test(block.expectedText)
      ? labels.insertNumberedList
      : labels.insertBulletList;
  }
  if (block.kind === "task") return labels.insertTask;
  if (block.kind === "quote") return labels.insertQuote;
  if (block.kind === "code-fence") return labels.insertCodeBlock;
  if (block.kind === "table") return labels.insertTable;
  if (block.kind === "thematic-break") return labels.insertDivider;
  return labels.insertParagraph;
}

function blockCommandLabel(id: CommandId, labels: Labels): string {
  if (id === "block.convert.heading") return "H2";
  const heading = /^block\.convert\.heading([13456])$/u.exec(id)?.[1];
  if (heading) return `H${heading}`;
  if (id === "block.convert.paragraph") return labels.insertParagraph;
  if (id === "block.convert.task") return labels.insertTask;
  if (id === "block.convert.quote") return labels.insertQuote;
  if (id === "block.convert.bullet-list") return labels.insertBulletList;
  if (id === "block.convert.numbered-list") return labels.insertNumberedList;
  if (id === "block.convert.code") return labels.insertCodeBlock;
  return labels[getCommand(id).label];
}

function BlockTypeIcon({ id }: { id: CommandId }) {
  const heading =
    id === "block.convert.heading"
      ? "2"
      : /^block\.convert\.heading([13456])$/u.exec(id)?.[1];
  if (heading) {
    return (
      <span className="block-type-token" aria-hidden="true">
        H{heading}
      </span>
    );
  }
  if (id === "block.convert.paragraph")
    return <Bars3BottomLeftIcon aria-hidden="true" />;
  if (id === "block.convert.task")
    return <CheckCircleIcon aria-hidden="true" />;
  if (id === "block.convert.quote")
    return <ChatBubbleBottomCenterTextIcon aria-hidden="true" />;
  if (id === "block.convert.bullet-list")
    return <ListBulletIcon aria-hidden="true" />;
  if (id === "block.convert.numbered-list")
    return <QueueListIcon aria-hidden="true" />;
  return <CodeBracketIcon aria-hidden="true" />;
}

function CurrentBlockIcon({
  block,
  labels,
  typeLabel,
}: {
  block: SourceBlock;
  labels: Labels;
  typeLabel?: string | undefined;
}) {
  if (typeLabel === labels.image) return <PhotoIcon aria-hidden="true" />;
  if (block.kind === "heading") {
    return (
      <span className="block-kind-token" aria-hidden="true">
        {blockTypeLabel(block, labels)}
      </span>
    );
  }
  if (block.kind === "list-item") {
    return /^\s*\d+[.)]/u.test(block.expectedText) ? (
      <QueueListIcon aria-hidden="true" />
    ) : (
      <ListBulletIcon aria-hidden="true" />
    );
  }
  if (block.kind === "task") return <CheckCircleIcon aria-hidden="true" />;
  if (block.kind === "quote") {
    return <ChatBubbleBottomCenterTextIcon aria-hidden="true" />;
  }
  if (block.kind === "code-fence")
    return <CodeBracketIcon aria-hidden="true" />;
  if (block.kind === "table") return <TableCellsIcon aria-hidden="true" />;
  if (block.kind === "thematic-break") return <MinusIcon aria-hidden="true" />;
  return <Bars3BottomLeftIcon aria-hidden="true" />;
}

function BlockActionIcon({ id }: { id: CommandId }) {
  if (id === "block.insert-below") return <ArrowDownIcon aria-hidden="true" />;
  if (id === "block.duplicate") return <Square2StackIcon aria-hidden="true" />;
  return <TrashIcon aria-hidden="true" />;
}

function TaskBlock({
  block,
  labels,
  locale,
  onSelectBlock,
  store,
}: {
  block: SourceBlock;
  labels: Labels;
  locale: "en" | "zh-CN";
  onSelectBlock: (block: SourceBlock) => void;
  store: DocumentStore;
}) {
  const checked = /\[[xX]\]/u.test(block.expectedText);
  return (
    <div className="editable-block task-block" data-block-kind="task">
      <input
        type="checkbox"
        checked={checked}
        aria-label={checked ? labels.markIncomplete : labels.markComplete}
        onChange={(event) =>
          store.applyPatch(
            createConstructPatch(
              block,
              { kind: "task-marker", checked: event.currentTarget.checked },
              "",
            ),
          )
        }
      />
      <EditableInlineBlock
        anchor={undefined}
        block={block}
        labels={labels}
        locale={locale}
        onSelectBlock={onSelectBlock}
        store={store}
      />
    </div>
  );
}

function CodeFenceBlock({
  block,
  labels,
  onSelectBlock,
  store,
}: {
  block: SourceBlock;
  labels: Labels;
  onSelectBlock: (block: SourceBlock) => void;
  store: DocumentStore;
}) {
  const content = createConstructPatch(
    block,
    { kind: "fence-content" },
    "",
  ).expectedText;
  return (
    <div
      className="structured-block-shell"
      data-block-kind="code-fence"
      data-source-block-id={block.id}
      data-source-from={block.range.from}
      data-source-to={block.range.to}
    >
      <BlockControls block={block} labels={labels} store={store} />
      <div className="editable-code-block">
        <div className="code-label">
          <CodeBracketIcon aria-hidden="true" />
          <span>{labels.code}</span>
        </div>
        <textarea
          defaultValue={content.replace(/\n$/u, "")}
          aria-label={labels.codeBlock}
          onFocus={() => onSelectBlock(block)}
          onBlur={(event) => {
            const next = `${event.currentTarget.value}\n`;
            if (next !== content) {
              store.applyPatch(
                createConstructPatch(block, { kind: "fence-content" }, next),
              );
            }
          }}
        />
      </div>
    </div>
  );
}

function TableStructureIcon({ kind }: { kind: TableStructureKind }) {
  if (kind === "insert-row-above") return <ArrowUpIcon aria-hidden="true" />;
  if (kind === "insert-row-below") return <ArrowDownIcon aria-hidden="true" />;
  if (kind === "insert-column-left")
    return <ArrowLeftIcon aria-hidden="true" />;
  if (kind === "insert-column-right")
    return <ArrowRightIcon aria-hidden="true" />;
  return <TrashIcon aria-hidden="true" />;
}

function TableBlock({
  block,
  labels,
  locale,
  onSelectBlock,
  store,
}: {
  block: SourceBlock;
  labels: Labels;
  locale: "en" | "zh-CN";
  onSelectBlock: (block: SourceBlock) => void;
  store: DocumentStore;
}) {
  const footnoteEditor = useContext(FootnoteEditorContext);
  const rows = projectTableRows(block.expectedText);
  const tableRef = useRef<HTMLDivElement>(null);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [activeCell, setActiveCell] = useState<{
    column: number;
    row: number;
  } | null>(null);
  const structureCommands = commandsForSurface("table-toolbar", {
    block,
    mode: "edit",
  });
  const fitCellHeight = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  const focusCell = (row: number, column: number) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const scope = footnoteEditor?.scope ?? ".block-canvas";
        const selector = `[data-table-row="${row}"][data-table-column="${column}"]`;
        document
          .querySelector<HTMLTextAreaElement>(
            `${scope} > [data-block-kind="table"][data-source-from="${block.range.from}"] ${selector}`,
          )
          ?.focus();
      });
    });
  };
  const runStructureCommand = (kind: TableStructureKind) => {
    if (!activeCell) return;
    const textarea = tableRef.current?.querySelector<HTMLTextAreaElement>(
      `[data-table-row="${activeCell.row}"][data-table-column="${activeCell.column}"]`,
    );
    const patch = createTableStructurePatch(block, {
      activeCell: {
        ...activeCell,
        ...(textarea ? { value: textarea.value } : {}),
      },
      kind,
    });
    if (!patch) return;
    const result = store.applyPatch(patch);
    if (!result.ok) return;

    const target = { ...activeCell };
    if (kind === "insert-row-below") target.row += 1;
    if (kind === "insert-column-right") target.column += 1;
    if (kind === "delete-row") {
      target.row = Math.min(activeCell.row, rows.length - 2);
    }
    if (kind === "delete-column") {
      target.column = Math.min(activeCell.column, rows[0]!.length - 2);
    }
    focusCell(Math.max(0, target.row), Math.max(0, target.column));
  };
  return (
    <div
      className={`structured-block-shell${blockMenuOpen ? " has-block-menu" : ""}`}
      data-block-kind="table"
      data-source-block-id={block.id}
      data-source-from={block.range.from}
      data-source-to={block.range.to}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setActiveCell(null);
        }
      }}
    >
      <BlockControls
        block={block}
        labels={labels}
        locale={locale}
        onOpenChange={setBlockMenuOpen}
        open={blockMenuOpen}
        store={store}
      />
      {activeCell ? (
        <div
          aria-label={labels.tableStructureTools}
          className="table-structure-toolbar"
          role="toolbar"
        >
          {structureCommands.map(({ available, definition }) => {
            const kind = definition.id.replace(
              /^table\./u,
              "",
            ) as TableStructureKind;
            const label = labels[definition.label];
            const disabled =
              !available ||
              (kind === "delete-row" && rows.length === 1) ||
              (kind === "delete-column" && rows[0]!.length === 1);
            return (
              <button
                aria-label={label}
                className={
                  kind.startsWith("delete-") ? "is-destructive" : undefined
                }
                data-command-id={definition.id}
                data-table-command={kind}
                disabled={disabled}
                key={kind}
                onClick={() => runStructureCommand(kind)}
                onMouseDown={(event) => event.preventDefault()}
                title={label}
                type="button"
              >
                <TableStructureIcon kind={kind} />
                {kind.startsWith("delete-") ? (
                  <span aria-hidden="true">
                    {kind === "delete-row"
                      ? labels.tableRowShort
                      : labels.tableColumnShort}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="table-shell" ref={tableRef}>
        <table>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${block.id}:${rowIndex}`}>
                {row.map((cell, columnIndex) => {
                  const Cell = rowIndex === 0 ? "th" : "td";
                  return (
                    <Cell key={`${block.id}:${rowIndex}:${columnIndex}`}>
                      <textarea
                        aria-label={`${labels.tableCell} ${rowIndex + 1}:${columnIndex + 1}`}
                        data-table-column={columnIndex}
                        data-table-row={rowIndex}
                        defaultValue={cell}
                        rows={1}
                        ref={(textarea) => {
                          if (textarea) fitCellHeight(textarea);
                        }}
                        onFocus={() => {
                          setActiveCell({ column: columnIndex, row: rowIndex });
                          onSelectBlock(block);
                        }}
                        onInput={(event) => fitCellHeight(event.currentTarget)}
                        onBlur={(event) => {
                          if (event.currentTarget.value === cell) return;
                          store.applyPatch(
                            createConstructPatch(
                              block,
                              {
                                kind: "table-cell",
                                row: rowIndex,
                                column: columnIndex,
                              },
                              event.currentTarget.value,
                            ),
                          );
                        }}
                      />
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImageBlock({
  assets,
  block,
  labels,
  locale,
  onSelectBlock,
  onOpenImage,
  selected,
  store,
}: {
  assets: readonly YeliAsset[];
  block: SourceBlock;
  labels: Labels;
  locale: "en" | "zh-CN";
  onSelectBlock: (block: SourceBlock, revealInspector?: boolean) => void;
  onOpenImage: (image: ImagePreviewTarget, trigger: HTMLElement) => void;
  selected: boolean;
  store: DocumentStore;
}) {
  const details = imageBlockDetails(block);
  const source = details ? resolveWorkspaceImage(details.target, assets) : null;
  const alternative = details?.alternative ?? labels.image;
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  return (
    <figure
      className={`document-figure${selected ? " is-selected" : ""}${blockMenuOpen ? " has-block-menu" : ""}`}
      data-block-kind="image"
      data-source-block-id={block.id}
      data-source-from={block.range.from}
      data-source-to={block.range.to}
    >
      <BlockControls
        block={block}
        labels={labels}
        locale={locale}
        onOpenChange={setBlockMenuOpen}
        open={blockMenuOpen}
        store={store}
        structureOnly
        typeLabel={labels.image}
      />
      <button
        className="image-selection-button"
        type="button"
        aria-label={`${labels.selectImage}: ${alternative}`}
        aria-pressed={selected}
        onClick={() => onSelectBlock(block, true)}
        onFocus={() => onSelectBlock(block)}
        onDoubleClick={(event) => {
          if (source) {
            onOpenImage({ alternative, source }, event.currentTarget);
          }
        }}
      >
        {source ? (
          <img src={source} alt={alternative} draggable={false} />
        ) : (
          <span className="image-placeholder">
            <PhotoIcon aria-hidden="true" />
            {alternative}
          </span>
        )}
      </button>
    </figure>
  );
}

function ThematicBreakBlock({
  block,
  labels,
  store,
}: {
  block: SourceBlock;
  labels: Labels;
  store: DocumentStore;
}) {
  return (
    <div
      className="structured-block-shell thematic-break-block"
      data-block-kind="thematic-break"
      data-source-block-id={block.id}
      data-source-from={block.range.from}
      data-source-to={block.range.to}
    >
      <BlockControls block={block} labels={labels} store={store} />
      <hr />
    </div>
  );
}

function SourceSafeBlock({
  block,
  labels,
  store,
}: {
  block: SourceBlock;
  labels: Labels;
  store: DocumentStore;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.expectedText);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const result = store.applyPatch(
      createSourcePatch(block, draft, "source-safe-raw-edit"),
    );
    if (!result.ok) {
      setError(labels.writeConflict);
      return;
    }
    setEditing(false);
    setError(null);
  };

  return (
    <section
      className="source-safe-block"
      data-block-kind={block.kind}
      data-source-block-id={block.id}
      data-source-from={block.range.from}
      data-source-to={block.range.to}
    >
      <ShieldExclamationIcon aria-hidden="true" />
      <div className="source-safe-content">
        <strong>{labels.sourceSafeTitle}</strong>
        <p>{labels.sourceSafeDescription}</p>
        {editing ? (
          <textarea
            aria-label={labels.sourceSafeEditor}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        ) : (
          <pre>{block.expectedText}</pre>
        )}
        {error ? <p role="alert">{error}</p> : null}
      </div>
      <div className="source-safe-actions">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => {
                setDraft(block.expectedText);
                setEditing(false);
                setError(null);
              }}
            >
              {labels.cancel}
            </button>
            <button type="button" onClick={apply}>
              {labels.applyChange}
            </button>
          </>
        ) : (
          <button
            className="source-safe-edit"
            type="button"
            onClick={() => setEditing(true)}
          >
            {labels.editRawBlock}
          </button>
        )}
      </div>
    </section>
  );
}

function FootnoteBlock({
  block,
  definition,
  labels,
  locale,
  source,
  store,
}: {
  block: SourceBlock;
  definition: FootnoteDefinition;
  labels: Labels;
  locale: "en" | "zh-CN";
  source: string;
  store: DocumentStore;
}) {
  const bodyStore = useMemo(() => {
    const buffer = new DocumentStore(definition.body, block.revision, []);
    buffer.setPrimaryMode("edit");
    return buffer;
  }, [block.revision, definition.body]);
  const bodySnapshot = useDocumentStore(bodyStore);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    let previous = definition.body;
    return bodyStore.subscribe(() => {
      const body = bodyStore.getSnapshot().source;
      if (body === previous) return;
      previous = body;
      const patch = createFootnoteBodyPatch(source, definition, body, block);
      if (patch) setConflict(!store.applyPatch(patch).ok);
    });
  }, [block, bodyStore, definition, source, store]);
  const selectBody = () => undefined;
  return (
    <section
      className="footnote-block"
      data-block-kind="footnote"
      data-footnote-label={definition.label}
      data-source-block-id={block.id}
      data-source-from={block.range.from}
      data-source-to={block.range.to}
      aria-label={`${labels.footnote}: ${definition.label}`}
      onKeyDownCapture={(event) => {
        const undo = matchesCommandShortcut("document.undo", event);
        const redo = matchesCommandShortcut("document.redo", event);
        if (!undo && !redo) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.target instanceof HTMLElement) event.target.blur();
        if (undo) store.undo();
        else store.redo();
      }}
    >
      <div className="footnote-label">
        {labels.footnote} <span>[^{definition.label}]</span>
      </div>
      <FootnoteEditorContext.Provider
        value={{
          scope: `.footnote-block[data-source-from="${definition.from}"] .footnote-body`,
          sourceOffset: (offset) =>
            definition.offsets[offset] ?? definition.bodyRange.to,
        }}
      >
        <div className="footnote-body">
          {bodySnapshot.projection.blocks.map((bodyBlock) => {
            if (!bodyBlock.editable || bodyBlock.kind === "footnote") {
              return (
                <SourceSafeBlock
                  key={bodyBlock.id}
                  block={bodyBlock}
                  labels={labels}
                  store={bodyStore}
                />
              );
            }
            if (bodyBlock.kind === "code-fence")
              return (
                <CodeFenceBlock
                  key={bodyBlock.id}
                  block={bodyBlock}
                  labels={labels}
                  onSelectBlock={selectBody}
                  store={bodyStore}
                />
              );
            if (bodyBlock.kind === "table")
              return (
                <TableBlock
                  key={bodyBlock.id}
                  block={bodyBlock}
                  labels={labels}
                  locale={locale}
                  onSelectBlock={selectBody}
                  store={bodyStore}
                />
              );
            if (bodyBlock.kind === "task")
              return (
                <TaskBlock
                  key={bodyBlock.id}
                  block={bodyBlock}
                  labels={labels}
                  locale={locale}
                  onSelectBlock={selectBody}
                  store={bodyStore}
                />
              );
            if (bodyBlock.kind === "thematic-break")
              return (
                <ThematicBreakBlock
                  key={bodyBlock.id}
                  block={bodyBlock}
                  labels={labels}
                  store={bodyStore}
                />
              );
            return (
              <EditableInlineBlock
                anchor={undefined}
                key={bodyBlock.id}
                block={bodyBlock}
                labels={labels}
                locale={locale}
                onSelectBlock={selectBody}
                store={bodyStore}
              />
            );
          })}
        </div>
      </FootnoteEditorContext.Provider>
      {conflict ? <p role="alert">{labels.writeConflict}</p> : null}
    </section>
  );
}

export function EditCanvas({
  assets,
  displayTitle,
  handoffTarget,
  labels,
  locale,
  onHandoffResolved,
  onOpenDocumentInspector,
  onOpenImage,
  onSelectBlock,
  selectedBlockId,
  snapshot,
  store,
}: EditCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  // The published source can advance before its projection. Keep note ranges
  // and editor atoms bound to the same revision as the rendered blocks.
  const projectedSource = snapshot.projection.source;
  const footnoteContext = useMemo(
    () => createInlineFootnoteContext(projectedSource),
    [projectedSource],
  );
  const footnotes = useMemo(
    () =>
      new Map(indexFootnotes(projectedSource).map((note) => [note.from, note])),
    [projectedSource],
  );
  const projectionRef = useRef(snapshot.projection);
  const pointerSelectionStartRef = useRef<{
    point: CanvasCaretPoint;
    pointerId: number;
  } | null>(null);
  const [multiBlockSelection, setMultiBlockSelection] = useState<{
    blocks: SourceBlock[];
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    projectionRef.current = snapshot.projection;
  }, [snapshot.projection]);
  const calloutId = useMemo(
    () =>
      usesFirstQuoteCallout(snapshot.source)
        ? snapshot.projection.blocks.find((block) => block.kind === "quote")?.id
        : undefined,
    [snapshot.projection.blocks, snapshot.source],
  );
  const headingAnchors = useMemo(() => {
    const seen = new Map<string, number>();
    const anchors = new Map<string, string>();
    for (const block of snapshot.projection.blocks) {
      if (block.kind !== "heading") continue;
      const text = blockContent(block)
        .replace(/[*_`~]/gu, "")
        .trim();
      const base = headingAnchor(text);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      anchors.set(block.id, count === 1 ? base : `${base}-${count}`);
    }
    return anchors;
  }, [snapshot.projection.blocks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rememberPointerStart = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      if (
        event.target instanceof Element &&
        event.target.closest(".footnote-body")
      )
        return;
      const point = caretPointFromViewport(event.clientX, event.clientY);
      if (!point) return;
      const editable = editableForCaretPoint(point);
      const stored = editable ? storeCanvasCaretPoint(editable, point) : null;
      pointerSelectionStartRef.current =
        editable && stored && canvas.contains(editable)
          ? { point: stored, pointerId: event.pointerId }
          : null;
    };
    const bridgePointerSelection = (event: PointerEvent) => {
      const start = pointerSelectionStartRef.current;
      pointerSelectionStartRef.current = null;
      if (!start || start.pointerId !== event.pointerId) return;
      const end = caretPointFromViewport(event.clientX, event.clientY);
      if (!end) return;
      const endEditable = editableForCaretPoint(end);
      const storedEnd = endEditable
        ? storeCanvasCaretPoint(endEditable, end)
        : null;
      if (
        !endEditable ||
        endEditable.closest(".footnote-body") ||
        !storedEnd ||
        !canvas.contains(endEditable) ||
        start.point.blockId === storedEnd.blockId
      ) {
        return;
      }
      window.requestAnimationFrame(() => {
        if (!canvas.isConnected) return;
        const selection = window.getSelection();
        const resolvedStart = resolveCanvasCaretPoint(canvas, start.point);
        const resolvedEnd = resolveCanvasCaretPoint(canvas, storedEnd);
        if (!selection || !resolvedStart || !resolvedEnd) return;
        try {
          selection.setBaseAndExtent(
            resolvedStart.node,
            resolvedStart.offset,
            resolvedEnd.node,
            resolvedEnd.offset,
          );
          document.dispatchEvent(new Event("selectionchange"));
        } catch {
          selection.removeAllRanges();
        }
      });
    };
    const clearPointerStart = () => {
      pointerSelectionStartRef.current = null;
    };
    canvas.addEventListener("pointerdown", rememberPointerStart, true);
    document.addEventListener("pointerup", bridgePointerSelection, true);
    document.addEventListener("pointercancel", clearPointerStart, true);
    return () => {
      canvas.removeEventListener("pointerdown", rememberPointerStart, true);
      document.removeEventListener("pointerup", bridgePointerSelection, true);
      document.removeEventListener("pointercancel", clearPointerStart, true);
    };
  }, []);

  useEffect(() => {
    const updateMultiBlockSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setMultiBlockSelection(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const selectedIds = new Set<string>();
      for (const editable of document.querySelectorAll<HTMLElement>(
        ".block-canvas .block-content-editable",
      )) {
        if (editable.closest(".footnote-body")) continue;
        try {
          if (!range.intersectsNode(editable)) continue;
        } catch {
          continue;
        }
        const shell = editable.closest<HTMLElement>("[data-source-block-id]");
        if (shell?.dataset.sourceBlockId) {
          selectedIds.add(shell.dataset.sourceBlockId);
        }
      }
      const blocks = projectionRef.current.blocks.filter(
        (block) => block.editable && selectedIds.has(block.id),
      );
      if (blocks.length < 2) {
        setMultiBlockSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setMultiBlockSelection(null);
        return;
      }
      setMultiBlockSelection({
        blocks,
        left: Math.max(
          132,
          Math.min(window.innerWidth - 132, rect.left + rect.width / 2),
        ),
        top: Math.max(56, rect.top),
      });
    };
    document.addEventListener("selectionchange", updateMultiBlockSelection);
    window.addEventListener("resize", updateMultiBlockSelection);
    return () => {
      document.removeEventListener(
        "selectionchange",
        updateMultiBlockSelection,
      );
      window.removeEventListener("resize", updateMultiBlockSelection);
    };
  }, []);

  useLayoutEffect(() => {
    if (!handoffTarget) return;
    const resolved = resolveReadEditTarget(snapshot.projection, handoffTarget);
    const block = resolved.block;
    if (!block) {
      onHandoffResolved("target-unavailable");
      return;
    }
    const shell = document.querySelector<HTMLElement>(
      `.edit-surface [data-source-from="${block.range.from}"][data-source-to="${block.range.to}"]`,
    );
    if (!shell) {
      onHandoffResolved("target-unavailable");
      return;
    }
    const editable = shell.matches(".block-content-editable")
      ? shell
      : shell.querySelector<HTMLElement>(".block-content-editable");
    const focusTarget =
      editable ??
      shell.querySelector<HTMLElement>("textarea, .image-selection-button") ??
      shell.querySelector<HTMLElement>("button, [tabindex]") ??
      shell;
    if (!focusTarget.hasAttribute("tabindex") && focusTarget === shell) {
      focusTarget.tabIndex = -1;
    }
    focusTarget.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => {
      const currentShell = document.querySelector<HTMLElement>(
        `.edit-surface [data-source-from="${block.range.from}"][data-source-to="${block.range.to}"]`,
      );
      if (!currentShell) {
        onHandoffResolved("target-unavailable");
        return;
      }
      const currentEditable = currentShell.matches(".block-content-editable")
        ? currentShell
        : currentShell.querySelector<HTMLElement>(".block-content-editable");
      let fallbackReason = resolved.fallbackReason;
      if (resolved.selection && !currentEditable) {
        fallbackReason = "selection-ambiguous";
      }
      const surface = currentShell.closest<HTMLElement>(".edit-surface");
      if (surface) {
        surface.scrollTop +=
          currentShell.getBoundingClientRect().top - handoffTarget.viewportTop;
      }
      const restoreLatestTarget = () => {
        const latestProjection = projectionRef.current;
        if (
          latestProjection.revision !== handoffTarget.revision ||
          latestProjection.sourceHash !== handoffTarget.sourceHash
        ) {
          return;
        }
        const latestShell = document.querySelector<HTMLElement>(
          `.edit-surface [data-source-from="${block.range.from}"][data-source-to="${block.range.to}"]`,
        );
        if (!latestShell) {
          onHandoffResolved("target-unavailable");
          return;
        }
        const latestEditable = latestShell.matches(".block-content-editable")
          ? latestShell
          : latestShell.querySelector<HTMLElement>(".block-content-editable");
        const latestFocusTarget =
          latestEditable ??
          latestShell.querySelector<HTMLElement>(
            "textarea, .image-selection-button",
          ) ??
          latestShell.querySelector<HTMLElement>("button, [tabindex]") ??
          latestShell;
        if (
          latestFocusTarget === latestShell &&
          !latestFocusTarget.hasAttribute("tabindex")
        ) {
          latestFocusTarget.tabIndex = -1;
        }
        latestFocusTarget.focus({ preventScroll: true });
        if (resolved.selection && latestEditable) {
          restoreTextSelection(
            latestEditable,
            resolved.selection.start,
            resolved.selection.end,
          );
        }
        const latestSurface = latestShell.closest<HTMLElement>(".edit-surface");
        if (latestSurface) {
          latestSurface.scrollTop +=
            latestShell.getBoundingClientRect().top - handoffTarget.viewportTop;
        }
      };
      onHandoffResolved(fallbackReason);
      window.requestAnimationFrame(restoreLatestTarget);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [handoffTarget, onHandoffResolved, snapshot.projection]);

  return (
    <FootnoteContext.Provider value={footnoteContext}>
      <main className="edit-surface" id="document-content">
        <article className="edit-document">
          <MetadataInline
            displayTitle={displayTitle}
            labels={labels}
            onOpenInspector={onOpenDocumentInspector}
            snapshot={snapshot}
            store={store}
          />

          {snapshot.projectionStatus === "pending" ? (
            <div className="projection-pending" role="status">
              {labels.projectionPending}
            </div>
          ) : null}

          <div
            className={`block-canvas${multiBlockSelection ? " has-multi-selection" : ""}`}
            aria-label={labels.blockCanvas}
            ref={canvasRef}
          >
            {snapshot.projection.blocks.map((block) => {
              if (block.kind === "frontmatter" && block.editable) return null;
              const definition =
                block.kind === "footnote"
                  ? footnotes.get(block.range.from)
                  : undefined;
              if (definition)
                return (
                  <FootnoteBlock
                    key={block.id}
                    block={block}
                    definition={definition}
                    labels={labels}
                    locale={locale}
                    source={projectedSource}
                    store={store}
                  />
                );
              if (!block.editable || block.kind === "footnote") {
                return (
                  <SourceSafeBlock
                    block={block}
                    key={block.id}
                    labels={labels}
                    store={store}
                  />
                );
              }
              if (imageBlockDetails(block)) {
                return (
                  <ImageBlock
                    assets={assets}
                    block={block}
                    key={block.id}
                    labels={labels}
                    locale={locale}
                    onSelectBlock={onSelectBlock}
                    onOpenImage={onOpenImage}
                    selected={block.id === selectedBlockId}
                    store={store}
                  />
                );
              }
              if (block.kind === "thematic-break") {
                return (
                  <ThematicBreakBlock
                    block={block}
                    key={block.id}
                    labels={labels}
                    store={store}
                  />
                );
              }
              if (block.kind === "task") {
                return (
                  <TaskBlock
                    block={block}
                    key={block.id}
                    labels={labels}
                    locale={locale}
                    onSelectBlock={onSelectBlock}
                    store={store}
                  />
                );
              }
              if (block.kind === "table") {
                return (
                  <TableBlock
                    block={block}
                    key={block.id}
                    labels={labels}
                    locale={locale}
                    onSelectBlock={onSelectBlock}
                    store={store}
                  />
                );
              }
              if (block.kind === "code-fence") {
                return (
                  <CodeFenceBlock
                    block={block}
                    key={block.id}
                    labels={labels}
                    onSelectBlock={onSelectBlock}
                    store={store}
                  />
                );
              }
              return (
                <EditableInlineBlock
                  anchor={headingAnchors.get(block.id)}
                  block={block}
                  isCallout={block.id === calloutId}
                  key={block.id}
                  labels={labels}
                  locale={locale}
                  onSelectBlock={onSelectBlock}
                  store={store}
                />
              );
            })}
          </div>
          {multiBlockSelection
            ? createPortal(
                <InlineToolbar
                  block={multiBlockSelection.blocks[0]!}
                  blocks={multiBlockSelection.blocks}
                  labels={labels}
                  onBlockCommand={(id) => {
                    const result = executeBlockSelectionCommand(
                      store,
                      id,
                      multiBlockSelection.blocks,
                    );
                    if (!result?.ok) return;
                    window.getSelection()?.removeAllRanges();
                    setMultiBlockSelection(null);
                  }}
                  position={
                    {
                      "--selection-left": `${multiBlockSelection.left}px`,
                      "--selection-top": `${multiBlockSelection.top}px`,
                      position: "fixed",
                    } as CSSProperties
                  }
                  structuralOnly
                />,
                document.body,
              )
            : null}
        </article>
      </main>
    </FootnoteContext.Provider>
  );
}
