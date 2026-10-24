import type { DocumentStore } from "../document/store.ts";
import type { DocumentTransactionResult } from "../document/transactions.ts";
import type { Labels } from "../i18n/en.ts";
import {
  createConstructPatch,
  projectMarkdown,
  type SourceBlock,
  type SourceBlockKind,
} from "./block-projection.ts";
import { createSourcePatch } from "./source-ranges.ts";
import { createTableMarkdown, type TableDimensions } from "./table-commands.ts";

export type CommandMode = "edit" | "read";
export type CommandScope =
  "auxiliary" | "block" | "document" | "selection" | "structure";
export type CommandSurface =
  | "block-menu"
  | "empty-block-menu"
  | "efficiency-guide"
  | "keyboard"
  | "line-insert"
  | "selection-toolbar"
  | "slash"
  | "table-toolbar"
  | "template-menu"
  | "top-insert";

export type CommandId =
  | "block.convert.bullet-list"
  | "block.convert.code"
  | "block.convert.heading"
  | "block.convert.heading1"
  | "block.convert.heading3"
  | "block.convert.heading4"
  | "block.convert.heading5"
  | "block.convert.heading6"
  | "block.convert.numbered-list"
  | "block.convert.paragraph"
  | "block.convert.quote"
  | "block.convert.task"
  | "block.delete"
  | "block.duplicate"
  | "block.insert-below"
  | "document.redo"
  | "document.save"
  | "document.undo"
  | "insert.paragraph"
  | "insert.bullet-list"
  | "insert.code-block"
  | "insert.divider"
  | "insert.heading1"
  | "insert.heading3"
  | "insert.heading4"
  | "insert.heading5"
  | "insert.heading6"
  | "insert.numbered-list"
  | "insert.quote"
  | "insert.section"
  | "insert.table"
  | "insert.task"
  | "selection.bold"
  | "selection.clear"
  | "selection.code"
  | "selection.italic"
  | "selection.link"
  | "selection.strike"
  | "table.delete-column"
  | "table.delete-row"
  | "table.insert-column-left"
  | "table.insert-column-right"
  | "table.insert-row-above"
  | "table.insert-row-below"
  | "template.meeting-notes"
  | "view.command-guide"
  | "view.font-size"
  | "view.outline"
  | "view.page-width"
  | "view.presentation"
  | "view.search";

export interface CommandShortcut {
  aria: string;
  code?: string;
  display: string;
  key: string;
  shift?: boolean;
}

export interface CommandDefinition {
  id: CommandId;
  keywords: readonly string[];
  label: keyof Labels;
  modes: readonly CommandMode[];
  mutates: boolean;
  scope: CommandScope;
  shortcuts?: readonly CommandShortcut[];
  surfaces: readonly CommandSurface[];
}

export interface CommandContext {
  block?: SourceBlock;
  canRedo?: boolean;
  canUndo?: boolean;
  hasSelection?: boolean;
  mode: CommandMode;
}

export interface ResolvedCommand {
  available: boolean;
  definition: CommandDefinition;
  disabledReason?: keyof Labels;
}

const EDIT = ["edit"] as const;
const BOTH = ["read", "edit"] as const;

export const COMMAND_CATALOG: readonly CommandDefinition[] = [
  {
    id: "document.undo",
    keywords: ["undo", "back"],
    label: "undo",
    modes: EDIT,
    mutates: true,
    scope: "document",
    shortcuts: [{ aria: "Meta+Z Control+Z", display: "⌘/Ctrl Z", key: "z" }],
    surfaces: ["keyboard", "efficiency-guide"],
  },
  {
    id: "document.redo",
    keywords: ["redo", "forward"],
    label: "redo",
    modes: EDIT,
    mutates: true,
    scope: "document",
    shortcuts: [
      {
        aria: "Meta+Shift+Z Control+Shift+Z",
        display: "⇧⌘/Ctrl Z",
        key: "z",
        shift: true,
      },
      { aria: "Control+Y", display: "Ctrl Y", key: "y" },
    ],
    surfaces: ["keyboard", "efficiency-guide"],
  },
  {
    id: "document.save",
    keywords: ["save", "file"],
    label: "saveFile",
    modes: BOTH,
    mutates: false,
    scope: "document",
    shortcuts: [{ aria: "Meta+S Control+S", display: "⌘/Ctrl S", key: "s" }],
    surfaces: ["keyboard", "efficiency-guide"],
  },
  {
    id: "view.search",
    keywords: ["find", "search"],
    label: "searchDocument",
    modes: BOTH,
    mutates: false,
    scope: "auxiliary",
    shortcuts: [{ aria: "Meta+F Control+F", display: "⌘/Ctrl F", key: "f" }],
    surfaces: ["keyboard", "efficiency-guide"],
  },
  {
    id: "view.outline",
    keywords: ["outline", "navigation", "contents", "toc"],
    label: "outline",
    modes: BOTH,
    mutates: false,
    scope: "auxiliary",
    shortcuts: [
      {
        aria: "Meta+Shift+O Control+Shift+O",
        display: "⇧⌘/Ctrl O",
        key: "o",
        shift: true,
      },
    ],
    surfaces: ["keyboard", "efficiency-guide"],
  },
  {
    id: "view.font-size",
    keywords: ["font", "size", "text", "reading", "cycle"],
    label: "fontSize",
    modes: BOTH,
    mutates: false,
    scope: "auxiliary",
    shortcuts: [
      {
        aria: "Meta+Shift+\\ Control+Shift+\\",
        code: "Backslash",
        display: "⇧⌘/Ctrl \\",
        key: "|",
        shift: true,
      },
    ],
    surfaces: ["keyboard", "efficiency-guide"],
  },
  {
    id: "view.page-width",
    keywords: ["page", "width", "layout", "cycle"],
    label: "pageWidth",
    modes: BOTH,
    mutates: false,
    scope: "auxiliary",
    shortcuts: [
      {
        aria: "Meta+\\ Control+\\",
        display: "⌘/Ctrl \\",
        key: "\\",
      },
    ],
    surfaces: ["keyboard", "efficiency-guide"],
  },
  {
    id: "view.presentation",
    keywords: ["present", "presentation", "slides", "stage"],
    label: "present",
    modes: BOTH,
    mutates: false,
    scope: "auxiliary",
    shortcuts: [
      {
        aria: "Meta+Shift+Enter Control+Shift+Enter",
        display: "⇧⌘/Ctrl Enter",
        key: "enter",
        shift: true,
      },
    ],
    surfaces: ["keyboard", "efficiency-guide"],
  },
  {
    id: "view.command-guide",
    keywords: ["commands", "guide", "shortcuts"],
    label: "efficiencyGuideMenu",
    modes: BOTH,
    mutates: false,
    scope: "auxiliary",
    shortcuts: [{ aria: "Meta+/ Control+/", display: "⌘/Ctrl /", key: "/" }],
    surfaces: ["keyboard", "efficiency-guide"],
  },
  {
    id: "insert.paragraph",
    keywords: ["paragraph", "text", "insert"],
    label: "insertParagraph",
    modes: EDIT,
    mutates: true,
    scope: "document",
    surfaces: ["top-insert", "empty-block-menu", "slash", "efficiency-guide"],
  },
  ...([1, 2, 3, 4, 5, 6] as const).map((level): CommandDefinition => ({
    id: level === 2 ? "insert.section" : `insert.heading${level}`,
    keywords: ["heading", "section", `h${level}`, "insert"],
    label: level === 2 ? "insertSection" : `insertHeading${level}`,
    modes: EDIT,
    mutates: true,
    scope: "structure",
    surfaces:
      level === 2
        ? ["top-insert", "empty-block-menu", "slash", "efficiency-guide"]
        : ["empty-block-menu", "slash"],
  })),
  {
    id: "insert.task",
    keywords: ["task", "todo", "insert"],
    label: "insertTask",
    modes: EDIT,
    mutates: true,
    scope: "document",
    surfaces: ["top-insert", "empty-block-menu", "slash", "efficiency-guide"],
  },
  {
    id: "insert.bullet-list",
    keywords: ["bullet", "unordered", "list", "insert"],
    label: "insertBulletList",
    modes: EDIT,
    mutates: true,
    scope: "document",
    surfaces: ["top-insert", "empty-block-menu", "slash", "efficiency-guide"],
  },
  {
    id: "insert.numbered-list",
    keywords: ["numbered", "ordered", "list", "insert"],
    label: "insertNumberedList",
    modes: EDIT,
    mutates: true,
    scope: "document",
    surfaces: ["top-insert", "empty-block-menu", "slash", "efficiency-guide"],
  },
  {
    id: "insert.quote",
    keywords: ["blockquote", "quote", "insert"],
    label: "insertQuote",
    modes: EDIT,
    mutates: true,
    scope: "document",
    surfaces: ["top-insert", "empty-block-menu", "slash", "efficiency-guide"],
  },
  {
    id: "insert.code-block",
    keywords: ["code", "fence", "insert"],
    label: "insertCodeBlock",
    modes: EDIT,
    mutates: true,
    scope: "document",
    surfaces: ["top-insert", "empty-block-menu", "slash", "efficiency-guide"],
  },
  {
    id: "insert.table",
    keywords: ["table", "columns", "insert", "gfm"],
    label: "insertTable",
    modes: EDIT,
    mutates: true,
    scope: "document",
    surfaces: ["top-insert", "empty-block-menu", "slash", "efficiency-guide"],
  },
  {
    id: "insert.divider",
    keywords: ["divider", "thematic", "break", "separator", "insert"],
    label: "insertDivider",
    modes: EDIT,
    mutates: true,
    scope: "structure",
    surfaces: ["top-insert", "empty-block-menu", "slash", "efficiency-guide"],
  },
  {
    id: "template.meeting-notes",
    keywords: ["meeting", "notes", "template"],
    label: "templateMeeting",
    modes: EDIT,
    mutates: true,
    scope: "document",
    surfaces: [
      "template-menu",
      "empty-block-menu",
      "slash",
      "efficiency-guide",
    ],
  },
  {
    id: "block.insert-below",
    keywords: ["below", "paragraph", "insert"],
    label: "insertBelow",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["line-insert", "block-menu", "efficiency-guide"],
  },
  {
    id: "block.convert.paragraph",
    keywords: ["convert", "paragraph", "text"],
    label: "convertParagraph",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  },
  {
    id: "block.convert.heading",
    keywords: ["convert", "heading", "section"],
    label: "convertHeading",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  },
  ...([1, 3, 4, 5, 6] as const).map((level): CommandDefinition => ({
    id: `block.convert.heading${level}`,
    keywords: ["convert", "heading", `h${level}`],
    label: `convertHeading${level}`,
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  })),
  {
    id: "block.convert.task",
    keywords: ["convert", "task", "todo"],
    label: "convertTask",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  },
  {
    id: "block.convert.quote",
    keywords: ["convert", "quote"],
    label: "convertQuote",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  },
  {
    id: "block.convert.bullet-list",
    keywords: ["convert", "bullet", "unordered", "list"],
    label: "convertBulletList",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  },
  {
    id: "block.convert.numbered-list",
    keywords: ["convert", "numbered", "ordered", "list"],
    label: "convertNumberedList",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  },
  {
    id: "block.convert.code",
    keywords: ["convert", "code", "fence"],
    label: "convertCodeBlock",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  },
  {
    id: "block.duplicate",
    keywords: ["copy", "duplicate", "block"],
    label: "duplicateBlock",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  },
  {
    id: "block.delete",
    keywords: ["delete", "remove", "block"],
    label: "deleteBlock",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["block-menu", "efficiency-guide"],
  },
  {
    id: "table.insert-row-above",
    keywords: ["table", "row", "above", "insert"],
    label: "insertRowAbove",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["table-toolbar"],
  },
  {
    id: "table.insert-row-below",
    keywords: ["table", "row", "below", "insert"],
    label: "insertRowBelow",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["table-toolbar"],
  },
  {
    id: "table.insert-column-left",
    keywords: ["table", "column", "left", "insert"],
    label: "insertColumnLeft",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["table-toolbar"],
  },
  {
    id: "table.insert-column-right",
    keywords: ["table", "column", "right", "insert"],
    label: "insertColumnRight",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["table-toolbar"],
  },
  {
    id: "table.delete-row",
    keywords: ["table", "row", "delete", "remove"],
    label: "deleteTableRow",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["table-toolbar"],
  },
  {
    id: "table.delete-column",
    keywords: ["table", "column", "delete", "remove"],
    label: "deleteTableColumn",
    modes: EDIT,
    mutates: true,
    scope: "block",
    surfaces: ["table-toolbar"],
  },
  {
    id: "selection.bold",
    keywords: ["bold", "strong"],
    label: "bold",
    modes: EDIT,
    mutates: true,
    scope: "selection",
    shortcuts: [{ aria: "Meta+B Control+B", display: "⌘/Ctrl B", key: "b" }],
    surfaces: ["selection-toolbar", "keyboard", "efficiency-guide"],
  },
  {
    id: "selection.italic",
    keywords: ["italic", "emphasis"],
    label: "italic",
    modes: EDIT,
    mutates: true,
    scope: "selection",
    shortcuts: [{ aria: "Meta+I Control+I", display: "⌘/Ctrl I", key: "i" }],
    surfaces: ["selection-toolbar", "keyboard", "efficiency-guide"],
  },
  {
    id: "selection.strike",
    keywords: ["strike", "strikethrough"],
    label: "strikethrough",
    modes: EDIT,
    mutates: true,
    scope: "selection",
    surfaces: ["selection-toolbar", "efficiency-guide"],
  },
  {
    id: "selection.code",
    keywords: ["inline", "code"],
    label: "inlineCode",
    modes: EDIT,
    mutates: true,
    scope: "selection",
    shortcuts: [
      {
        aria: "Meta+Shift+C Control+Shift+C",
        display: "⇧⌘/Ctrl C",
        key: "c",
        shift: true,
      },
    ],
    surfaces: ["selection-toolbar", "keyboard", "efficiency-guide"],
  },
  {
    id: "selection.link",
    keywords: ["link", "url"],
    label: "addLink",
    modes: EDIT,
    mutates: true,
    scope: "selection",
    shortcuts: [{ aria: "Meta+K Control+K", display: "⌘/Ctrl K", key: "k" }],
    surfaces: ["selection-toolbar", "keyboard", "efficiency-guide"],
  },
  {
    id: "selection.clear",
    keywords: ["clear", "formatting"],
    label: "clearFormatting",
    modes: EDIT,
    mutates: true,
    scope: "selection",
    surfaces: ["selection-toolbar", "efficiency-guide"],
  },
];

const commandById = new Map(
  COMMAND_CATALOG.map((definition) => [definition.id, definition]),
);

export function getCommand(id: CommandId): CommandDefinition {
  return commandById.get(id)!;
}

const CONVERTIBLE_KINDS = new Set<SourceBlockKind>([
  "blank",
  "heading",
  "list-item",
  "paragraph",
  "quote",
  "task",
]);

function isTableCommand(id: CommandId): boolean {
  return id.startsWith("table.");
}

function conversionTarget(id: CommandId): SourceBlockKind | undefined {
  if (id === "block.convert.paragraph") return "paragraph";
  if (id === "block.convert.heading") return "heading";
  if (id === "block.convert.task") return "task";
  if (id === "block.convert.quote") return "quote";
  if (id === "block.convert.bullet-list") return "list-item";
  if (id === "block.convert.numbered-list") return "list-item";
  if (id === "block.convert.code") return "code-fence";
  if (/^block\.convert\.heading(?:[13456])?$/u.test(id)) return "heading";
  return undefined;
}

function conversionAlreadyApplied(block: SourceBlock, id: CommandId): boolean {
  if (block.kind === "heading" && id.startsWith("block.convert.heading")) {
    const requested = Number(
      /^block\.convert\.heading([13456])$/u.exec(id)?.[1] ?? 2,
    );
    const current =
      /^ {0,3}(#{1,6})/u.exec(block.expectedText)?.[1]?.length ??
      (/\n {0,3}=+\s*\n?$/u.test(block.expectedText) ? 1 : 2);
    return current === requested;
  }
  if (block.kind === "list-item") {
    const ordered = /^\s*\d+[.)]\s/u.test(block.expectedText);
    if (id === "block.convert.numbered-list") return ordered;
    if (id === "block.convert.bullet-list") return !ordered;
  }
  return conversionTarget(id) === block.kind;
}

export function resolveCommand(
  definition: CommandDefinition,
  context: CommandContext,
): ResolvedCommand {
  if (!definition.modes.includes(context.mode)) {
    return {
      available: false,
      definition,
      disabledReason: "commandUnavailableEdit",
    };
  }
  if (definition.id === "document.undo" && !context.canUndo) {
    return {
      available: false,
      definition,
      disabledReason: "commandUnavailableUndo",
    };
  }
  if (definition.id === "document.redo" && !context.canRedo) {
    return {
      available: false,
      definition,
      disabledReason: "commandUnavailableRedo",
    };
  }
  if (definition.scope === "selection" && !context.hasSelection) {
    return {
      available: false,
      definition,
      disabledReason: "commandUnavailableSelection",
    };
  }
  if (definition.scope === "block") {
    const block = context.block;
    if (!block?.editable) {
      return {
        available: false,
        definition,
        disabledReason: "commandUnavailableBlock",
      };
    }
    if (isTableCommand(definition.id) && block.kind !== "table") {
      return {
        available: false,
        definition,
        disabledReason: "commandUnavailableBlock",
      };
    }
    const target = conversionTarget(definition.id);
    if (target) {
      if (
        !CONVERTIBLE_KINDS.has(block.kind) ||
        blockContent(block).includes("\n")
      ) {
        return {
          available: false,
          definition,
          disabledReason: "commandUnavailableConvertible",
        };
      }
      if (conversionAlreadyApplied(block, definition.id)) {
        return {
          available: false,
          definition,
          disabledReason: "commandUnavailableSameType",
        };
      }
    }
  }
  return { available: true, definition };
}

export function commandsForSurface(
  surface: CommandSurface,
  context: CommandContext,
  options: { labels?: Labels; query?: string; scope?: CommandScope } = {},
): ResolvedCommand[] {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  return COMMAND_CATALOG.filter((definition) =>
    definition.surfaces.includes(surface),
  )
    .filter(
      (definition) =>
        surface !== "efficiency-guide" ||
        (definition.shortcuts?.length ?? 0) > 0,
    )
    .filter(
      (definition) =>
        options.scope === undefined || definition.scope === options.scope,
    )
    .filter(
      (definition) =>
        surface === "efficiency-guide" ||
        definition.modes.includes(context.mode),
    )
    .map((definition) => resolveCommand(definition, context))
    .filter(({ definition }) => {
      if (!query) return true;
      const label = (
        options.labels?.[definition.label] ?? definition.label
      ).toLocaleLowerCase();
      const idTerms = definition.id
        .toLocaleLowerCase()
        .split(/[.-]/u)
        .filter(Boolean);
      return (
        idTerms.some((term) => term.startsWith(query)) ||
        label.includes(query) ||
        definition.keywords.some((keyword) =>
          keyword.toLocaleLowerCase().startsWith(query),
        ) ||
        definition.shortcuts?.some(
          (shortcut) =>
            shortcut.display.toLocaleLowerCase().includes(query) ||
            shortcut.aria.toLocaleLowerCase().includes(query),
        ) === true
      );
    });
}

export function matchesCommandShortcut(
  id: CommandId,
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  > & { code?: string },
): boolean {
  if (event.altKey || !(event.metaKey || event.ctrlKey)) return false;
  return (
    getCommand(id).shortcuts?.some((shortcut) => {
      const matchesKey = shortcut.code
        ? event.code === shortcut.code
        : event.key.toLocaleLowerCase() === shortcut.key;
      return matchesKey && event.shiftKey === Boolean(shortcut.shift);
    }) ?? false
  );
}

export function meetingNotesMarkdown(locale: "en" | "zh-CN"): string {
  return locale === "zh-CN"
    ? "\n## 会议记录\n\n**日期：** \n\n**参与者：** \n\n### 结论\n\n- \n\n### 下一步\n\n- [ ] \n"
    : "\n## Meeting notes\n\n**Date:** \n\n**Participants:** \n\n### Decisions\n\n- \n\n### Next steps\n\n- [ ] \n";
}

function insertionMarkdown(
  id: CommandId,
  labels: Labels,
  locale: "en" | "zh-CN",
  tableDimensions?: TableDimensions,
): string | null {
  if (id === "insert.paragraph") return `\n${labels.newParagraph}\n`;
  const headingLevel = /^insert\.heading([13456])$/u.exec(id)?.[1];
  if (headingLevel)
    return `\n${"#".repeat(Number(headingLevel))} ${labels.newSection}\n`;
  if (id === "insert.section") return `\n## ${labels.newSection}\n`;
  if (id === "insert.task") return `\n- [ ] ${labels.newTask}\n`;
  if (id === "insert.bullet-list") return `\n- ${labels.newListItem}\n`;
  if (id === "insert.numbered-list") return `\n1. ${labels.newListItem}\n`;
  if (id === "insert.quote") return `\n> ${labels.newQuote}\n`;
  if (id === "insert.code-block")
    return `\n\`\`\`\n${labels.newCode}\n\`\`\`\n`;
  if (id === "insert.table") {
    return `\n${createTableMarkdown(labels, tableDimensions)}`;
  }
  if (id === "insert.divider") return "\n---\n";
  if (id === "template.meeting-notes") return meetingNotesMarkdown(locale);
  return null;
}

export function executeAppendCommand(
  store: DocumentStore,
  id: CommandId,
  labels: Labels,
  locale: "en" | "zh-CN",
  tableDimensions?: TableDimensions,
): DocumentTransactionResult | null {
  const markdown = insertionMarkdown(id, labels, locale, tableDimensions);
  if (markdown === null) return null;
  return store.appendMarkdown(markdown, id);
}

function currentBlock(
  store: DocumentStore,
  previous: SourceBlock,
): SourceBlock | null {
  const snapshot = store.getSnapshot();
  return (
    projectMarkdown(snapshot.source, snapshot.revision).blocks.find(
      (block) =>
        block.range.from === previous.range.from &&
        block.kind === previous.kind,
    ) ?? null
  );
}

function blockContent(block: SourceBlock): string {
  return createConstructPatch(block, { kind: "block-content" }, "")
    .expectedText;
}

function replaceBlockSource(block: SourceBlock, id: CommandId): string | null {
  const content = blockContent(block);
  const ending = block.expectedText.endsWith("\n") ? "\n" : "";
  if (content.includes("\n")) return null;
  if (id === "block.convert.paragraph") return `${content}${ending}`;
  if (id === "block.convert.heading") return `## ${content}${ending}`;
  const headingLevel = /^block\.convert\.heading([13456])$/u.exec(id)?.[1];
  if (headingLevel)
    return `${"#".repeat(Number(headingLevel))} ${content}${ending}`;
  if (id === "block.convert.task") return `- [ ] ${content}${ending}`;
  if (id === "block.convert.quote") return `> ${content}${ending}`;
  if (id === "block.convert.bullet-list") return `- ${content}${ending}`;
  if (id === "block.convert.numbered-list") return `1. ${content}${ending}`;
  if (id === "block.convert.code") return `\`\`\`\n${content}\n\`\`\`${ending}`;
  return null;
}

export function executeBlockCommand(
  store: DocumentStore,
  id: CommandId,
  previousBlock: SourceBlock,
  labels: Labels,
): DocumentTransactionResult | null {
  const block = currentBlock(store, previousBlock);
  if (!block) return null;
  if (id === "block.insert-below" || id === "block.duplicate") {
    const content =
      id === "block.insert-below" ? labels.newParagraph : block.expectedText;
    const before = block.expectedText.endsWith("\n") ? "\n" : "\n\n";
    const after = content.endsWith("\n") ? "" : "\n";
    return store.applyPatch(
      createSourcePatch(block, `${before}${content}${after}`, id, {
        from: block.range.to,
        to: block.range.to,
      }),
    );
  }
  if (id === "block.delete") {
    return store.applyPatch(createSourcePatch(block, "", id));
  }
  const replacement = replaceBlockSource(block, id);
  return replacement === null
    ? null
    : store.applyPatch(createSourcePatch(block, replacement, id));
}

export function executeBlockSelectionCommand(
  store: DocumentStore,
  id: CommandId,
  previousBlocks: readonly SourceBlock[],
): DocumentTransactionResult | null {
  if (!id.startsWith("block.convert.") || previousBlocks.length < 2) {
    return null;
  }
  const snapshot = store.getSnapshot();
  const current = projectMarkdown(snapshot.source, snapshot.revision);
  const blocks = previousBlocks.map((previous) =>
    current.blocks.find(
      (block) =>
        block.range.from === previous.range.from &&
        block.range.to === previous.range.to &&
        block.kind === previous.kind,
    ),
  );
  if (blocks.some((block) => block === undefined)) return null;
  const patches: ReturnType<typeof createSourcePatch>[] = [];
  for (const block of blocks) {
    if (!block) return null;
    if (conversionAlreadyApplied(block, id)) continue;
    const replacement = replaceBlockSource(block, id);
    if (replacement === null) return null;
    patches.push(createSourcePatch(block, replacement, id));
  }
  if (patches.length === 0) return null;
  return store.applyTransaction({
    expectedRevision: snapshot.revision,
    expectedSourceHash: snapshot.sourceHash,
    operation: `${id}:selection`,
    patches,
  });
}

export function executeInsertAfterCommand(
  store: DocumentStore,
  id: CommandId,
  previousBlock: SourceBlock,
  labels: Labels,
  locale: "en" | "zh-CN",
  tableDimensions?: TableDimensions,
): DocumentTransactionResult | null {
  if (id === "insert.paragraph") {
    return executeBlockCommand(
      store,
      "block.insert-below",
      previousBlock,
      labels,
    );
  }
  const block = currentBlock(store, previousBlock);
  const markdown = insertionMarkdown(id, labels, locale, tableDimensions);
  if (!block || markdown === null) return null;
  const content = markdown.replace(/^\n/u, "").replace(/\n+$/u, "");
  const before = block.expectedText.endsWith("\n") ? "\n" : "\n\n";
  return store.applyPatch(
    createSourcePatch(block, `${before}${content}\n`, id, {
      from: block.range.to,
      to: block.range.to,
    }),
  );
}

export function executeSlashCommand(
  store: DocumentStore,
  id: CommandId,
  block: SourceBlock,
  labels: Labels,
  locale: "en" | "zh-CN",
  tableDimensions?: TableDimensions,
): DocumentTransactionResult | null {
  const markdown = insertionMarkdown(id, labels, locale, tableDimensions);
  if (markdown === null) return null;
  const replacement = markdown.replace(/^\n/u, "");
  const blankReplacement = replacement.replace(/\n+$/u, "");
  return store.applyPatch(
    createSourcePatch(
      block,
      block.kind === "blank" ? `\n${blankReplacement}\n\n` : replacement,
      id,
    ),
  );
}
