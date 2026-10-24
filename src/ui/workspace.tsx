import {
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  ArrowsRightLeftIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  Bars3BottomLeftIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ClockIcon,
  CodeBracketIcon,
  DocumentCheckIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  ExclamationCircleIcon,
  EyeIcon,
  FolderOpenIcon,
  InformationCircleIcon,
  LanguageIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PencilSquareIcon,
  PresentationChartBarIcon,
  PlusIcon,
  PrinterIcon,
  QuestionMarkCircleIcon,
  QueueListIcon,
  Squares2X2Icon,
  TableCellsIcon,
  CodeBracketSquareIcon,
} from "@heroicons/react/24/outline";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { indexFrontmatter } from "../document/frontmatter.ts";
import { starterMarkdown } from "../document/starter.ts";
import { DocumentStore } from "../document/store.ts";
import { deriveDisplayTitle } from "../document/title.ts";
import { derivePresentation } from "../editor/presentation.ts";
import type {
  ReadEditFallbackReason,
  ReadEditTarget,
  SourceBlock,
} from "../editor/block-projection.ts";
import {
  commandsForSurface,
  executeAppendCommand,
  getCommand,
  matchesCommandShortcut,
  type CommandId,
} from "../editor/command-registry.ts";
import type { TableDimensions } from "../editor/table-commands.ts";
import type { OpenEmbeddedResult } from "../format/open.ts";
import { en } from "../i18n/en.ts";
import {
  LOCALE_STORAGE_KEY,
  resolveInitialLocale,
  type Locale,
} from "../i18n/locale.ts";
import { zhCN } from "../i18n/zh-CN.ts";
import { advancedModePlugin } from "#advanced-mode";
import { AboutDialog } from "./about-dialog.tsx";
import { ConflictDialog } from "./conflict-dialog.tsx";
import { EditCanvas } from "./edit-canvas.tsx";
import { EfficiencyGuide } from "./efficiency-guide.tsx";
import { ExportPreview } from "./export-preview.tsx";
import { HistoryOverlay } from "./history-overlay.tsx";
import { ImagePreview, type ImagePreviewTarget } from "./image-preview.tsx";
import { InvalidFileDialog } from "./invalid-file-dialog.tsx";
import { Inspector } from "./inspector.tsx";
import { isInspectableImageBlock } from "./image-block.ts";
import { OutlinePanel } from "./outline-panel.tsx";
import { PresentationOverlay } from "./presentation-overlay.tsx";
import { captureReadEditTarget } from "./read-handoff.ts";
import { ReadSurface } from "./read-surface.tsx";
import { ReconnectDialog } from "./reconnect-dialog.tsx";
import { RecoveryDialog } from "./recovery-dialog.tsx";
import { SearchOverlay } from "./search-overlay.tsx";
import { TableSizePicker } from "./table-size-picker.tsx";
import { useDocumentStore } from "./use-document-store.ts";
import { useFileLifecycle } from "./use-file-lifecycle.ts";
import { YeliLogo } from "./yeli-logo.tsx";

type FontSizeMode = "small" | "default" | "large";
type PageWidthMode = "default" | "full" | "wide";

const FONT_SIZE_STORAGE_KEY = "yeli:font-size";
const PAGE_WIDTH_STORAGE_KEY = "yeli:page-width";
const FONT_SIZE_MODES: FontSizeMode[] = ["small", "default", "large"];
const PAGE_WIDTH_MODES: PageWidthMode[] = ["default", "wide", "full"];

function readInitialLocale(markdown: string): Locale {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Locale still follows the document/browser without local storage.
  }

  const browserLanguages =
    navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return resolveInitialLocale(
    stored,
    indexFrontmatter(markdown).metadata.lang,
    browserLanguages,
  );
}

function writeLocalePreference(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The selected UI language remains active for the current session.
  }
}

function readFontSizePreference(): FontSizeMode {
  try {
    const value = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    return FONT_SIZE_MODES.includes(value as FontSizeMode)
      ? (value as FontSizeMode)
      : "default";
  } catch {
    return "default";
  }
}

function writeFontSizePreference(mode: FontSizeMode): void {
  try {
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, mode);
  } catch {
    // View preferences remain usable for the current session without storage.
  }
}

function readPageWidthPreference(): PageWidthMode {
  try {
    const value = window.localStorage.getItem(PAGE_WIDTH_STORAGE_KEY);
    return PAGE_WIDTH_MODES.includes(value as PageWidthMode)
      ? (value as PageWidthMode)
      : "default";
  } catch {
    return "default";
  }
}

function writePageWidthPreference(mode: PageWidthMode): void {
  try {
    window.localStorage.setItem(PAGE_WIDTH_STORAGE_KEY, mode);
  } catch {
    // View preferences remain usable for the current session without storage.
  }
}

interface SelectedBlockBinding {
  from: number;
  id: string;
  kind: SourceBlock["kind"];
}

function InsertCommandIcon({ id }: { id: CommandId }) {
  if (id === "insert.section")
    return <Bars3BottomLeftIcon aria-hidden="true" />;
  if (id === "insert.task") return <CheckCircleIcon aria-hidden="true" />;
  if (id === "insert.bullet-list") return <ListBulletIcon aria-hidden="true" />;
  if (id === "insert.numbered-list")
    return <QueueListIcon aria-hidden="true" />;
  if (id === "insert.quote")
    return <ChatBubbleBottomCenterTextIcon aria-hidden="true" />;
  if (id === "insert.code-block") return <CodeBracketIcon aria-hidden="true" />;
  if (id === "insert.table") return <TableCellsIcon aria-hidden="true" />;
  if (id === "insert.divider") return <MinusIcon aria-hidden="true" />;
  return <PencilSquareIcon aria-hidden="true" />;
}

export function Workspace({
  initialResult,
}: {
  initialResult: OpenEmbeddedResult;
}) {
  const initialDocument = initialResult.ok ? initialResult.document : undefined;
  const [store] = useState(
    () =>
      new DocumentStore(
        initialDocument?.markdown ?? starterMarkdown,
        initialDocument?.payload.revision ?? 12,
        initialDocument?.payload.assets ?? [],
      ),
  );
  const snapshot = useDocumentStore(store);
  const [locale, setLocale] = useState<Locale>(() =>
    readInitialLocale(snapshot.source),
  );
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [tableSizeOpen, setTableSizeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pageWidthOpen, setPageWidthOpen] = useState(false);
  const [pageWidthPopoverPosition, setPageWidthPopoverPosition] = useState({
    left: 12,
    top: 76,
  });
  const [pageWidth, setPageWidth] = useState<PageWidthMode>(
    readPageWidthPreference,
  );
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [fontSizePopoverPosition, setFontSizePopoverPosition] = useState({
    left: 12,
    top: 76,
  });
  const [fontSize, setFontSize] = useState<FontSizeMode>(
    readFontSizePreference,
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  const [efficiencyGuideOpen, setEfficiencyGuideOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreviewTarget | null>(
    null,
  );
  const imagePreviewTriggerRef = useRef<HTMLElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [readEditTarget, setReadEditTarget] = useState<ReadEditTarget | null>(
    null,
  );
  const [activeBlockBinding, setActiveBlockBinding] =
    useState<SelectedBlockBinding | null>(null);
  const [selectedBlockBinding, setSelectedBlockBinding] =
    useState<SelectedBlockBinding | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const openImagePreview = (
    image: ImagePreviewTarget,
    trigger: HTMLElement,
  ) => {
    imagePreviewTriggerRef.current = trigger;
    setImagePreview(image);
  };
  const closeImagePreview = () => {
    setImagePreview(null);
    const trigger = imagePreviewTriggerRef.current;
    imagePreviewTriggerRef.current = null;
    window.requestAnimationFrame(() => trigger?.isConnected && trigger.focus());
  };
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const aboutReturnRef = useRef<HTMLElement | null>(null);
  const fontSizeTriggerRef = useRef<HTMLButtonElement>(null);
  const pageWidthTriggerRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const efficiencyReturnRef = useRef<HTMLElement | null>(null);
  const presentationReturnRef = useRef<HTMLElement | null>(null);
  const searchReturnRef = useRef<HTMLElement | null>(null);
  const recentReadTargetRef = useRef<ReadEditTarget | null>(null);
  const labels = locale === "zh-CN" ? zhCN : en;
  const AdvancedView = advancedModePlugin.View;
  const AdvancedMenuIcon = advancedModePlugin.MenuIcon;
  const frontmatter = useMemo(
    () => indexFrontmatter(snapshot.source),
    [snapshot.source],
  );
  const presentation = useMemo(
    () =>
      derivePresentation(snapshot.source, {
        bodyStart: frontmatter.status === "safe" ? frontmatter.bodyStart : 0,
      }),
    [frontmatter, snapshot.source],
  );
  const isRead = snapshot.primaryMode === "read";
  const overlayRails = () => window.matchMedia("(max-width: 1180px)").matches;
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);
  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setSelectedBlockBinding(null);
  }, []);
  const lifecycle = useFileLifecycle({
    initialResult,
    labels,
    notify,
    snapshot,
    store,
  });
  const { openHistory, setHistoryOpen, setInvalidFile } = lifecycle;
  const closeInvalidFile = useCallback(() => {
    setInvalidFile(null);
  }, [setInvalidFile]);
  const invalidFileOpen = lifecycle.invalidFile !== null;
  const previousInvalidFileOpenRef = useRef(invalidFileOpen);
  useEffect(() => {
    const wasOpen = previousInvalidFileOpenRef.current;
    previousInvalidFileOpenRef.current = invalidFileOpen;
    if (wasOpen && !invalidFileOpen) moreButtonRef.current?.focus();
  }, [invalidFileOpen]);
  const displayTitle = useMemo(
    () =>
      deriveDisplayTitle(snapshot.source, {
        filename: lifecycle.fileName,
        unnamed: labels.unnamedDocument,
      }),
    [labels.unnamedDocument, lifecycle.fileName, snapshot.source],
  );
  const openAbout = (origin: HTMLElement) => {
    aboutReturnRef.current = origin;
    if (lifecycle.saveDisclosure === null && !lifecycle.saveDisclosureLoading) {
      void lifecycle.prepareSaveDisclosure();
    }
    setMoreOpen(false);
    setAboutOpen(true);
  };
  const saveActionRef = useRef(lifecycle.save);
  const selectedBlock = useMemo(() => {
    if (!selectedBlockBinding) return undefined;
    return snapshot.projection.blocks.find(
      (block) =>
        block.id === selectedBlockBinding.id ||
        (block.kind === selectedBlockBinding.kind &&
          block.range.from === selectedBlockBinding.from),
    );
  }, [selectedBlockBinding, snapshot.projection.blocks]);
  const activeBlock = useMemo(() => {
    if (!activeBlockBinding) return undefined;
    return snapshot.projection.blocks.find(
      (block) =>
        block.id === activeBlockBinding.id ||
        (block.kind === activeBlockBinding.kind &&
          block.range.from === activeBlockBinding.from),
    );
  }, [activeBlockBinding, snapshot.projection.blocks]);
  const commandContext = useMemo(
    () => ({
      ...(activeBlock ? { block: activeBlock } : {}),
      canRedo: snapshot.canRedo,
      canUndo: snapshot.canUndo,
      hasSelection: false,
      mode: isRead ? ("read" as const) : ("edit" as const),
    }),
    [activeBlock, isRead, snapshot.canRedo, snapshot.canUndo],
  );
  const topInsertCommands = commandsForSurface("top-insert", commandContext);
  const templateCommands = commandsForSurface("template-menu", commandContext);
  const toggleOutline = useCallback(() => {
    setOutlineOpen((open) => {
      const next = !open;
      if (next && overlayRails()) {
        closeInspector();
        setHistoryOpen(false);
        setEfficiencyGuideOpen(false);
      }
      return next;
    });
  }, [closeInspector, setHistoryOpen]);
  const openEfficiencyGuide = useCallback(
    (origin?: HTMLElement | null) => {
      efficiencyReturnRef.current =
        origin ?? (document.activeElement as HTMLElement);
      setInsertOpen(false);
      setMoreOpen(false);
      setSearchOpen(false);
      setHistoryOpen(false);
      closeInspector();
      if (overlayRails()) setOutlineOpen(false);
      setFocusMode(false);
      setEfficiencyGuideOpen(true);
    },
    [closeInspector, setHistoryOpen],
  );
  const closeEfficiencyGuide = useCallback(() => {
    setEfficiencyGuideOpen(false);
    window.requestAnimationFrame(() => {
      (efficiencyReturnRef.current ?? moreButtonRef.current)?.focus();
    });
  }, []);
  const toggleEfficiencyGuide = useCallback(
    (origin?: HTMLElement | null) => {
      if (efficiencyGuideOpen) {
        closeEfficiencyGuide();
      } else {
        openEfficiencyGuide(origin);
      }
    },
    [closeEfficiencyGuide, efficiencyGuideOpen, openEfficiencyGuide],
  );
  const openHistoryPanel = useCallback(async () => {
    setInsertOpen(false);
    setMoreOpen(false);
    setPageWidthOpen(false);
    setEfficiencyGuideOpen(false);
    setSearchOpen(false);
    closeInspector();
    if (overlayRails()) setOutlineOpen(false);
    setFocusMode(false);
    await openHistory();
  }, [closeInspector, openHistory]);
  const openSearch = useCallback(
    (origin?: HTMLElement | null) => {
      searchReturnRef.current =
        origin ?? (document.activeElement as HTMLElement | null);
      setInsertOpen(false);
      setMoreOpen(false);
      setHistoryOpen(false);
      setEfficiencyGuideOpen(false);
      if (overlayRails()) {
        setOutlineOpen(false);
        closeInspector();
      }
      setSearchOpen(true);
    },
    [closeInspector, setHistoryOpen],
  );
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    window.requestAnimationFrame(() => {
      const origin = searchReturnRef.current;
      if (origin?.isConnected) origin.focus();
      else (searchButtonRef.current ?? moreButtonRef.current)?.focus();
    });
  }, []);
  const resolveReadEditHandoff = useCallback(
    (reason?: ReadEditFallbackReason) => {
      setReadEditTarget(null);
      if (reason === "selection-ambiguous") {
        notify(labels.readEditSelectionFallback);
      } else if (reason === "stale-target") {
        notify(labels.readEditStaleFallback);
      } else if (reason === "target-unavailable") {
        notify(labels.readEditTargetFallback);
      }
    },
    [labels, notify],
  );
  const pageWidthLabel = useCallback(
    (mode: PageWidthMode) =>
      mode === "default"
        ? labels.pageWidthDefault
        : mode === "wide"
          ? labels.pageWidthWide
          : labels.pageWidthFull,
    [labels],
  );
  const fontSizeLabel = useCallback(
    (mode: FontSizeMode) =>
      mode === "small"
        ? labels.fontSizeSmall
        : mode === "large"
          ? labels.fontSizeLarge
          : labels.fontSizeDefault,
    [labels],
  );
  const cyclePageWidth = useCallback(() => {
    const currentIndex = PAGE_WIDTH_MODES.indexOf(pageWidth);
    const next =
      PAGE_WIDTH_MODES[(currentIndex + 1) % PAGE_WIDTH_MODES.length]!;
    setPageWidth(next);
    writePageWidthPreference(next);
    setPageWidthOpen(false);
    setMoreOpen(false);
    notify(labels.pageWidthChanged.replace("{mode}", pageWidthLabel(next)));
  }, [labels.pageWidthChanged, notify, pageWidth, pageWidthLabel]);
  const cycleFontSize = useCallback(() => {
    const currentIndex = FONT_SIZE_MODES.indexOf(fontSize);
    const next = FONT_SIZE_MODES[(currentIndex + 1) % FONT_SIZE_MODES.length]!;
    setFontSize(next);
    writeFontSizePreference(next);
    setFontSizeOpen(false);
    setMoreOpen(false);
    notify(labels.fontSizeChanged.replace("{mode}", fontSizeLabel(next)));
  }, [fontSize, fontSizeLabel, labels.fontSizeChanged, notify]);
  const closePresentation = useCallback(() => {
    setPresentationOpen(false);
    window.requestAnimationFrame(() => {
      (presentationReturnRef.current ?? moreButtonRef.current)?.focus();
    });
  }, []);
  const togglePresentation = useCallback(
    (origin?: HTMLElement | null) => {
      if (presentationOpen) {
        closePresentation();
        return;
      }
      if (!presentation?.eligible) {
        notify(labels.presentationUnavailable);
        return;
      }
      presentationReturnRef.current =
        origin ?? (document.activeElement as HTMLElement | null);
      setInsertOpen(false);
      setMoreOpen(false);
      setFontSizeOpen(false);
      setPageWidthOpen(false);
      setPresentationOpen(true);
    },
    [
      closePresentation,
      labels.presentationUnavailable,
      notify,
      presentation?.eligible,
      presentationOpen,
    ],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${displayTitle} · Yeli`;
  }, [displayTitle, locale]);

  useLayoutEffect(() => {
    recentReadTargetRef.current = null;
  }, [snapshot.revision, snapshot.sourceHash]);

  useLayoutEffect(() => {
    if (!isRead) return;
    const rememberSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const target = captureReadEditTarget(snapshot.projection);
      if (target?.selection || target?.selectionWasAmbiguous) {
        recentReadTargetRef.current = target;
      }
    };
    const clearBeforeReadPointerSelection = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".read-surface")) {
        recentReadTargetRef.current = null;
      }
    };
    document.addEventListener("selectionchange", rememberSelection);
    document.addEventListener("pointerdown", clearBeforeReadPointerSelection);
    return () => {
      document.removeEventListener("selectionchange", rememberSelection);
      document.removeEventListener(
        "pointerdown",
        clearBeforeReadPointerSelection,
      );
    };
  }, [isRead, snapshot.projection]);

  const capturePendingReadTarget = () => {
    if (!isRead) return;
    const target = captureReadEditTarget(snapshot.projection);
    if (target?.selection || target?.selectionWasAmbiguous) {
      recentReadTargetRef.current = target;
    }
  };

  useEffect(() => {
    saveActionRef.current = lifecycle.save;
  }, [lifecycle.save]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1180px)");
    const keepCanvasPrimary = (event: MediaQueryListEvent | MediaQueryList) => {
      if (!event.matches) return;
      setOutlineOpen(false);
      closeInspector();
    };
    keepCanvasPrimary(query);
    query.addEventListener("change", keepCanvasPrimary);
    return () => query.removeEventListener("change", keepCanvasPrimary);
  }, [closeInspector]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches("input, textarea, select, [role='textbox']"));
      if (matchesCommandShortcut("view.command-guide", event)) {
        event.preventDefault();
        toggleEfficiencyGuide(target instanceof HTMLElement ? target : null);
        return;
      }
      if (matchesCommandShortcut("document.save", event)) {
        event.preventDefault();
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable || target.matches(".topbar-title-input"))
        ) {
          target.blur();
        }
        window.setTimeout(() => void saveActionRef.current(false), 0);
        return;
      }
      if (matchesCommandShortcut("view.search", event)) {
        event.preventDefault();
        openSearch(target instanceof HTMLElement ? target : null);
        return;
      }
      if (matchesCommandShortcut("view.outline", event)) {
        event.preventDefault();
        toggleOutline();
        return;
      }
      if (matchesCommandShortcut("view.page-width", event)) {
        event.preventDefault();
        cyclePageWidth();
        return;
      }
      if (matchesCommandShortcut("view.font-size", event)) {
        event.preventDefault();
        cycleFontSize();
        return;
      }
      if (matchesCommandShortcut("view.presentation", event)) {
        event.preventDefault();
        togglePresentation(target instanceof HTMLElement ? target : null);
        return;
      }
      if (editing) return;
      if (matchesCommandShortcut("document.undo", event)) {
        event.preventDefault();
        store.undo();
      } else if (matchesCommandShortcut("document.redo", event)) {
        event.preventDefault();
        store.redo();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    cycleFontSize,
    cyclePageWidth,
    openSearch,
    store,
    toggleEfficiencyGuide,
    toggleOutline,
    togglePresentation,
  ]);

  useEffect(() => {
    if (!insertOpen && !moreOpen) return;
    const closePopovers = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".toolbar-popover-anchor")
      ) {
        return;
      }
      setInsertOpen(false);
      setMoreOpen(false);
      setPageWidthOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setInsertOpen(false);
      setMoreOpen(false);
      setPageWidthOpen(false);
    };
    document.addEventListener("pointerdown", closePopovers);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePopovers);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [insertOpen, moreOpen]);

  const appendCommand = (id: CommandId, tableDimensions?: TableDimensions) => {
    executeAppendCommand(store, id, labels, locale, tableDimensions);
    setInsertOpen(false);
    setMoreOpen(false);
  };

  const openInsertMenu = () => {
    if (!insertOpen) setTableSizeOpen(false);
    setInsertOpen(true);
    setMoreOpen(false);
    setPageWidthOpen(false);
  };

  const enterMode = (mode: "edit" | "read") => {
    if (mode === "edit" && isRead) {
      const current = captureReadEditTarget(snapshot.projection);
      const hasCurrentSelection = Boolean(
        current?.selection || current?.selectionWasAmbiguous,
      );
      setReadEditTarget(
        hasCurrentSelection
          ? current
          : (recentReadTargetRef.current ?? current),
      );
      recentReadTargetRef.current = null;
    }
    store.setPrimaryMode(mode);
    setInsertOpen(false);
    setMoreOpen(false);
    if (mode === "read") {
      setHistoryOpen(false);
      setReadEditTarget(null);
      setActiveBlockBinding(null);
      setSelectedBlockBinding(null);
      setInspectorOpen(false);
      setOutlineOpen(false);
    } else {
      const overlay = overlayRails();
      setOutlineOpen(!overlay);
      closeInspector();
    }
  };

  const enterEditAtSearchResult = (block: SourceBlock, viewportTop: number) => {
    setReadEditTarget({
      block,
      revision: block.revision,
      selection: null,
      selectionWasAmbiguous: false,
      sourceHash: block.sourceHash,
      viewportTop,
    });
    store.setPrimaryMode("edit");
    setInsertOpen(false);
    setMoreOpen(false);
    const overlay = overlayRails();
    setOutlineOpen(!overlay);
    closeInspector();
  };

  const openAdvanced = () => {
    if (!advancedModePlugin.enabled) return;
    store.openAdvancedSource();
    setInsertOpen(false);
    setMoreOpen(false);
  };

  const positionPageWidthPopover = useCallback(() => {
    const trigger = pageWidthTriggerRef.current;
    if (!trigger) return;
    const triggerBounds = trigger.getBoundingClientRect();
    const popoverWidth = Math.min(306, window.innerWidth - 24);
    const minimumTop =
      (moreButtonRef.current?.getBoundingClientRect().bottom ?? 64) + 12;
    setPageWidthPopoverPosition({
      left: Math.max(12, triggerBounds.left - popoverWidth + 2),
      top: Math.min(
        Math.max(minimumTop, triggerBounds.top - 8),
        Math.max(minimumTop, window.innerHeight - 182),
      ),
    });
  }, []);

  const openPageWidthMenu = () => {
    positionPageWidthPopover();
    setPageWidthOpen(true);
  };

  const positionFontSizePopover = useCallback(() => {
    const trigger = fontSizeTriggerRef.current;
    if (!trigger) return;
    const triggerBounds = trigger.getBoundingClientRect();
    const popoverWidth = Math.min(306, window.innerWidth - 24);
    const minimumTop =
      (moreButtonRef.current?.getBoundingClientRect().bottom ?? 64) + 12;
    setFontSizePopoverPosition({
      left: Math.max(12, triggerBounds.left - popoverWidth + 2),
      top: Math.min(
        Math.max(minimumTop, triggerBounds.top - 8),
        Math.max(minimumTop, window.innerHeight - 182),
      ),
    });
  }, []);

  const openFontSizeMenu = () => {
    positionFontSizePopover();
    setFontSizeOpen(true);
  };

  useEffect(() => {
    if (!pageWidthOpen) return;
    window.addEventListener("resize", positionPageWidthPopover);
    return () => window.removeEventListener("resize", positionPageWidthPopover);
  }, [pageWidthOpen, positionPageWidthPopover]);

  useEffect(() => {
    if (!fontSizeOpen) return;
    window.addEventListener("resize", positionFontSizePopover);
    return () => window.removeEventListener("resize", positionFontSizePopover);
  }, [fontSizeOpen, positionFontSizePopover]);

  const saveStateLabel =
    lifecycle.saveStatus === "saving"
      ? labels.saveStateSaving
      : lifecycle.saveStatus === "error"
        ? labels.saveStateFailed
        : snapshot.dirty
          ? labels.saveStateUnsaved
          : labels.saveStateClean;
  const saveReady =
    lifecycle.saveDisclosure !== null && !lifecycle.saveDisclosureLoading;

  return (
    <div
      className={`workspace-shell is-width-${pageWidth} is-font-${fontSize}${isRead ? " is-read" : " is-edit"}${focusMode ? " is-focus" : ""}`}
    >
      <header className="workspace-topbar">
        <div className="topbar-leading">
          <button
            className="icon-button rail-toggle topbar-brand"
            type="button"
            aria-label={`Yeli · ${outlineOpen ? labels.outlineToggleClose : labels.outlineOpen}`}
            aria-pressed={outlineOpen}
            aria-keyshortcuts={getCommand("view.outline").shortcuts?.[0]?.aria}
            title={outlineOpen ? labels.outlineToggleClose : labels.outlineOpen}
            onClick={toggleOutline}
          >
            <YeliLogo expanded={outlineOpen} />
          </button>
          <div className="topbar-document-name" title={displayTitle}>
            {isRead ? (
              displayTitle
            ) : (
              <input
                id="toolbar-document-title"
                className="topbar-title-input"
                key={`${snapshot.revision}:toolbar-title:${displayTitle}`}
                defaultValue={displayTitle}
                aria-label={labels.toolbarDocumentTitle}
                title={
                  frontmatter.status === "unsafe"
                    ? labels.metadataUnsafe
                    : labels.toolbarTitleHint
                }
                readOnly={frontmatter.status === "unsafe"}
                onBlur={(event) => {
                  const input = event.currentTarget;
                  const value = input.value.trim();
                  if (store.getSnapshot().revision !== snapshot.revision)
                    return;
                  if (!value || value === displayTitle) {
                    input.value = displayTitle;
                    return;
                  }
                  const result = store.patchMetadata("title", value);
                  if (!result.ok) {
                    input.value = displayTitle;
                    notify(labels.metadataUnsafe);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.value = displayTitle;
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                    window.requestAnimationFrame(() => {
                      document
                        .getElementById("toolbar-document-title")
                        ?.focus();
                    });
                  }
                }}
              />
            )}
          </div>
        </div>

        {!isRead ? (
          <div
            className="topbar-tools"
            role="toolbar"
            aria-label={labels.editingTools}
          >
            <div className="topbar-command-cluster">
              <button
                className="icon-button"
                data-command-id="document.undo"
                type="button"
                onClick={() => store.undo()}
                disabled={!snapshot.canUndo}
                aria-label={labels[getCommand("document.undo").label]}
                aria-keyshortcuts={
                  getCommand("document.undo").shortcuts?.[0]?.aria
                }
              >
                <ArrowUturnLeftIcon aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                data-command-id="document.redo"
                type="button"
                onClick={() => store.redo()}
                disabled={!snapshot.canRedo}
                aria-label={labels[getCommand("document.redo").label]}
                aria-keyshortcuts={getCommand("document.redo")
                  .shortcuts?.map((shortcut) => shortcut.aria)
                  .join(" ")}
              >
                <ArrowUturnRightIcon aria-hidden="true" />
              </button>
            </div>
            <div
              className="toolbar-popover-anchor"
              onPointerEnter={openInsertMenu}
              onPointerLeave={(event) => {
                if (!event.currentTarget.contains(document.activeElement)) {
                  setInsertOpen(false);
                }
              }}
              onFocus={openInsertMenu}
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget) &&
                  !event.currentTarget.matches(":hover")
                ) {
                  setInsertOpen(false);
                }
              }}
            >
              <button
                className="tool-button"
                type="button"
                aria-expanded={insertOpen}
                aria-haspopup="menu"
                onClick={openInsertMenu}
              >
                <PlusIcon aria-hidden="true" />
                {labels.insert}
              </button>
              {insertOpen ? (
                <div
                  className="popover insert-popover"
                  role="menu"
                  aria-label={labels.insert}
                >
                  <small>{labels.insertAtEnd}</small>
                  {topInsertCommands.map(({ definition }) => {
                    if (definition.id === "insert.table") {
                      return (
                        <div
                          className="insert-table-command"
                          key={definition.id}
                        >
                          <button
                            aria-expanded={tableSizeOpen}
                            aria-haspopup="true"
                            data-command-id={definition.id}
                            onClick={() =>
                              setTableSizeOpen((current) => !current)
                            }
                            role="menuitem"
                            type="button"
                          >
                            <InsertCommandIcon id={definition.id} />
                            {labels[definition.label]}
                          </button>
                          {tableSizeOpen ? (
                            <TableSizePicker
                              labels={labels}
                              onSelect={(dimensions) =>
                                appendCommand(definition.id, dimensions)
                              }
                            />
                          ) : null}
                        </div>
                      );
                    }
                    return (
                      <button
                        data-command-id={definition.id}
                        key={definition.id}
                        type="button"
                        role="menuitem"
                        onClick={() => appendCommand(definition.id)}
                        onFocus={() => setTableSizeOpen(false)}
                        onPointerEnter={() => setTableSizeOpen(false)}
                      >
                        <InsertCommandIcon id={definition.id} />
                        {labels[definition.label]}
                      </button>
                    );
                  })}
                  <div className="popover-separator" />
                  <small className="insert-group-label">
                    {labels.templates}
                  </small>
                  {templateCommands.map(({ definition }) => (
                    <button
                      className="insert-template-item"
                      data-command-id={definition.id}
                      key={definition.id}
                      type="button"
                      role="menuitem"
                      onClick={() => appendCommand(definition.id)}
                    >
                      <DocumentCheckIcon aria-hidden="true" />
                      <span>
                        <strong>{labels[definition.label]}</strong>
                        <small>{labels.templateNote}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="topbar-actions">
          <div className="topbar-action-cluster">
            <button
              className="icon-button mobile-hide"
              data-command-id="view.search"
              ref={searchButtonRef}
              type="button"
              aria-label={labels.searchDocument}
              onClick={(event) => openSearch(event.currentTarget)}
            >
              <MagnifyingGlassIcon aria-hidden="true" />
            </button>
            {!isRead ? (
              <button
                className="icon-button inspector-toggle"
                type="button"
                aria-label={labels.documentProperties}
                aria-pressed={inspectorOpen && !selectedBlock}
                title={labels.documentProperties}
                onClick={() => {
                  if (inspectorOpen && !selectedBlock) {
                    closeInspector();
                    return;
                  }
                  setSelectedBlockBinding(null);
                  setHistoryOpen(false);
                  setEfficiencyGuideOpen(false);
                  if (overlayRails()) setOutlineOpen(false);
                  setInspectorOpen(true);
                }}
              >
                <AdjustmentsHorizontalIcon aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <nav className="primary-mode-switch" aria-label={labels.documentMode}>
            <button
              type="button"
              className={isRead ? "primary-edit-action" : "preview-action"}
              onPointerDown={capturePendingReadTarget}
              onClick={() => enterMode(isRead ? "edit" : "read")}
            >
              {isRead ? (
                <PencilSquareIcon aria-hidden="true" />
              ) : (
                <EyeIcon aria-hidden="true" />
              )}
              {isRead ? labels.edit : labels.read}
            </button>
          </nav>
          <div className="toolbar-popover-anchor">
            <button
              className="icon-button"
              ref={moreButtonRef}
              type="button"
              aria-label={labels.more}
              aria-expanded={moreOpen}
              data-more-trigger=""
              onClick={() => {
                const next = !moreOpen;
                setMoreOpen(next);
                if (
                  next &&
                  lifecycle.saveDisclosure === null &&
                  !lifecycle.saveDisclosureLoading
                ) {
                  void lifecycle.prepareSaveDisclosure();
                }
                if (!next) {
                  setFontSizeOpen(false);
                  setPageWidthOpen(false);
                }
                setInsertOpen(false);
              }}
            >
              <EllipsisVerticalIcon aria-hidden="true" />
            </button>
            {moreOpen ? (
              <div
                className="popover more-popover"
                role="menu"
                onScroll={() => {
                  if (fontSizeOpen) positionFontSizePopover();
                  if (pageWidthOpen) positionPageWidthPopover();
                }}
              >
                {!isRead ? (
                  <>
                    <button
                      className="mobile-only-menu-item"
                      data-command-id="document.undo"
                      type="button"
                      disabled={!snapshot.canUndo}
                      onClick={() => {
                        store.undo();
                        setMoreOpen(false);
                      }}
                    >
                      <ArrowUturnLeftIcon aria-hidden="true" />
                      {labels.undo}
                    </button>
                    <button
                      className="mobile-only-menu-item"
                      data-command-id="document.redo"
                      type="button"
                      disabled={!snapshot.canRedo}
                      onClick={() => {
                        store.redo();
                        setMoreOpen(false);
                      }}
                    >
                      <ArrowUturnRightIcon aria-hidden="true" />
                      {labels.redo}
                    </button>
                  </>
                ) : null}
                {!isRead ? (
                  <button
                    className="mobile-only-menu-item"
                    data-command-id="template.meeting-notes"
                    type="button"
                    onClick={() => appendCommand("template.meeting-notes")}
                  >
                    <Squares2X2Icon aria-hidden="true" />
                    {labels.templateMeeting}
                  </button>
                ) : null}
                <button
                  className="mobile-only-menu-item"
                  data-command-id="view.search"
                  type="button"
                  onClick={() => openSearch(moreButtonRef.current)}
                >
                  <MagnifyingGlassIcon aria-hidden="true" />
                  {labels.searchDocument}
                </button>
                <div className="more-menu-section-label" role="presentation">
                  {labels.file}
                </div>
                <button
                  data-menu-action="open"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    void lifecycle.chooseFile(() =>
                      fileInputRef.current?.click(),
                    );
                  }}
                >
                  <FolderOpenIcon aria-hidden="true" />
                  {labels.openFile}
                </button>
                <button
                  className="more-menu-save"
                  data-menu-action="save"
                  type="button"
                  role="menuitem"
                  disabled={!saveReady}
                  aria-describedby="more-save-state-description"
                  onClick={() => {
                    setMoreOpen(false);
                    void lifecycle.save(false);
                  }}
                >
                  {lifecycle.canDirectSave ? (
                    <DocumentCheckIcon aria-hidden="true" />
                  ) : (
                    <ArrowDownTrayIcon aria-hidden="true" />
                  )}
                  {lifecycle.canDirectSave
                    ? labels.saveFile
                    : labels.downloadUpdatedCopy}
                  <span
                    className={`save-state is-${lifecycle.saveStatus}${snapshot.dirty ? " is-dirty" : ""}`}
                    title={saveStateLabel}
                    aria-hidden="true"
                  >
                    {lifecycle.saveStatus === "saving" ? (
                      <ArrowPathIcon
                        className="save-state-spinner"
                        aria-hidden="true"
                      />
                    ) : lifecycle.saveStatus === "error" ? (
                      <ExclamationCircleIcon aria-hidden="true" />
                    ) : snapshot.dirty ? (
                      <span className="save-state-dot" aria-hidden="true" />
                    ) : (
                      <CheckIcon aria-hidden="true" />
                    )}
                  </span>
                </button>
                <span id="more-save-state-description" className="sr-only">
                  {saveStateLabel}
                </span>
                <button
                  data-menu-action="save-copy"
                  type="button"
                  role="menuitem"
                  disabled={!saveReady}
                  onClick={() => {
                    setMoreOpen(false);
                    void lifecycle.save(true);
                  }}
                >
                  <DocumentPlusIcon aria-hidden="true" />
                  {labels.saveCopy}
                </button>
                {!isRead ? (
                  <button
                    data-menu-action="history"
                    type="button"
                    role="menuitem"
                    onClick={() => void openHistoryPanel()}
                  >
                    <ClockIcon aria-hidden="true" />
                    {labels.history}
                  </button>
                ) : null}
                <div className="popover-separator" role="separator" />
                <div className="more-menu-section-label" role="presentation">
                  {labels.exportActions}
                </div>
                <button
                  data-menu-action="export-markdown"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    lifecycle.exportMarkdown();
                  }}
                >
                  <DocumentTextIcon aria-hidden="true" />
                  {labels.exportMarkdown}
                </button>
                <button
                  data-menu-action="export-html"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    void lifecycle.generateStaticExport();
                  }}
                >
                  <CodeBracketSquareIcon aria-hidden="true" />
                  {labels.exportReadOnlyHtml}
                </button>
                <button
                  data-menu-action="print"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    void lifecycle.print();
                  }}
                >
                  <PrinterIcon aria-hidden="true" />
                  {labels.printDocument}
                </button>
                <div className="popover-separator" role="separator" />
                <div className="more-menu-section-label" role="presentation">
                  {labels.moreView}
                </div>
                <div
                  className="nested-menu-anchor font-size-menu-anchor"
                  onPointerEnter={openFontSizeMenu}
                  onPointerLeave={() => setFontSizeOpen(false)}
                  onFocus={openFontSizeMenu}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setFontSizeOpen(false);
                    }
                  }}
                >
                  <button
                    className="font-size-trigger"
                    data-menu-action="font-size"
                    ref={fontSizeTriggerRef}
                    type="button"
                    role="menuitem"
                    aria-label={labels.fontSize}
                    aria-expanded={fontSizeOpen}
                    aria-haspopup="menu"
                    aria-keyshortcuts={
                      getCommand("view.font-size").shortcuts?.[0]?.aria
                    }
                    onClick={openFontSizeMenu}
                  >
                    <DocumentTextIcon aria-hidden="true" />
                    {labels.fontSize}
                    <kbd className="menu-shortcut">
                      {getCommand("view.font-size").shortcuts?.[0]?.display}
                    </kbd>
                    <ChevronLeftIcon
                      className="submenu-chevron"
                      aria-hidden="true"
                    />
                  </button>
                  {fontSizeOpen ? (
                    <div
                      className="popover font-size-popover"
                      role="menu"
                      aria-label={labels.fontSize}
                      style={
                        {
                          "--font-size-popover-left": `${fontSizePopoverPosition.left}px`,
                          "--font-size-popover-top": `${fontSizePopoverPosition.top}px`,
                        } as CSSProperties
                      }
                    >
                      <div className="page-width-popover-heading">
                        <span>{labels.readingOptions}</span>
                        <QuestionMarkCircleIcon aria-hidden="true" />
                      </div>
                      <div className="font-size-options">
                        {FONT_SIZE_MODES.map((mode) => (
                          <button
                            className={`font-size-option is-${mode}${fontSize === mode ? " is-selected" : ""}`}
                            key={mode}
                            type="button"
                            role="menuitemradio"
                            aria-checked={fontSize === mode}
                            onClick={() => {
                              setFontSize(mode);
                              writeFontSizePreference(mode);
                              setFontSizeOpen(false);
                              setMoreOpen(false);
                              notify(
                                labels.fontSizeChanged.replace(
                                  "{mode}",
                                  fontSizeLabel(mode),
                                ),
                              );
                            }}
                          >
                            <span
                              className="font-size-preview"
                              aria-hidden="true"
                            >
                              A
                            </span>
                            <span>{fontSizeLabel(mode)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div
                  className="nested-menu-anchor page-width-menu-anchor"
                  onPointerEnter={openPageWidthMenu}
                  onPointerLeave={() => setPageWidthOpen(false)}
                  onFocus={openPageWidthMenu}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setPageWidthOpen(false);
                    }
                  }}
                >
                  <button
                    className="page-width-trigger"
                    data-command-id="view.page-width"
                    data-menu-action="page-width"
                    ref={pageWidthTriggerRef}
                    type="button"
                    role="menuitem"
                    aria-label={labels.pageWidth}
                    aria-expanded={pageWidthOpen}
                    aria-haspopup="menu"
                    aria-keyshortcuts={
                      getCommand("view.page-width").shortcuts?.[0]?.aria
                    }
                    onClick={openPageWidthMenu}
                  >
                    <ArrowsRightLeftIcon aria-hidden="true" />
                    {labels.pageWidth}
                    <kbd className="menu-shortcut">
                      {getCommand("view.page-width").shortcuts?.[0]?.display}
                    </kbd>
                    <ChevronLeftIcon
                      className="submenu-chevron"
                      aria-hidden="true"
                    />
                  </button>
                  {pageWidthOpen ? (
                    <div
                      className="popover page-width-popover"
                      role="menu"
                      aria-label={labels.pageWidth}
                      style={
                        {
                          "--page-width-popover-left": `${pageWidthPopoverPosition.left}px`,
                          "--page-width-popover-top": `${pageWidthPopoverPosition.top}px`,
                        } as CSSProperties
                      }
                    >
                      <div className="page-width-popover-heading">
                        <span>{labels.readingOptions}</span>
                        <QuestionMarkCircleIcon aria-hidden="true" />
                      </div>
                      <div className="page-width-options">
                        {PAGE_WIDTH_MODES.map((mode) => {
                          const label =
                            mode === "default"
                              ? labels.pageWidthDefault
                              : mode === "wide"
                                ? labels.pageWidthWide
                                : labels.pageWidthFull;
                          return (
                            <button
                              className={`page-width-option is-${mode}${pageWidth === mode ? " is-selected" : ""}`}
                              key={mode}
                              type="button"
                              role="menuitemradio"
                              aria-checked={pageWidth === mode}
                              onClick={() => {
                                setPageWidth(mode);
                                writePageWidthPreference(mode);
                                setPageWidthOpen(false);
                                setMoreOpen(false);
                              }}
                            >
                              <span className="page-width-preview">
                                <Bars3BottomLeftIcon aria-hidden="true" />
                              </span>
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  data-menu-action="focus"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setFocusMode((focused) => !focused);
                    setMoreOpen(false);
                  }}
                >
                  <ArrowsPointingInIcon aria-hidden="true" />
                  {labels.focus}
                </button>
                <button
                  data-command-id="view.presentation"
                  data-menu-action="presentation"
                  type="button"
                  role="menuitem"
                  aria-label={labels.present}
                  disabled={!presentation?.eligible}
                  aria-keyshortcuts={
                    getCommand("view.presentation").shortcuts?.[0]?.aria
                  }
                  aria-describedby={
                    presentation?.eligible ? undefined : "present-unavailable"
                  }
                  onClick={() => togglePresentation(moreButtonRef.current)}
                >
                  <PresentationChartBarIcon aria-hidden="true" />
                  {labels.present}
                  <kbd className="menu-shortcut">
                    {getCommand("view.presentation").shortcuts?.[0]?.display}
                  </kbd>
                </button>
                {!presentation?.eligible ? (
                  <small id="present-unavailable" className="menu-explanation">
                    {labels.presentationUnavailable}
                  </small>
                ) : null}
                <div className="popover-separator" role="separator" />
                <div className="more-menu-section-label" role="presentation">
                  {labels.moreSettingsAndHelp}
                </div>
                <button
                  data-menu-action="language"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const nextLocale = locale === "zh-CN" ? "en" : "zh-CN";
                    setLocale(nextLocale);
                    writeLocalePreference(nextLocale);
                    setMoreOpen(false);
                  }}
                >
                  <LanguageIcon aria-hidden="true" />
                  {locale === "zh-CN" ? "English" : "简体中文"}
                </button>
                {advancedModePlugin.enabled && AdvancedMenuIcon ? (
                  <button
                    data-menu-action="advanced"
                    type="button"
                    role="menuitem"
                    onClick={openAdvanced}
                  >
                    <AdvancedMenuIcon aria-hidden="true" />
                    {advancedModePlugin.menuLabel(locale)}
                  </button>
                ) : null}
                <button
                  data-command-id="view.command-guide"
                  data-menu-action="shortcuts"
                  type="button"
                  role="menuitem"
                  onClick={() => openEfficiencyGuide(moreButtonRef.current)}
                >
                  <QuestionMarkCircleIcon aria-hidden="true" />
                  {labels.efficiencyGuideMenu}
                </button>
                <button
                  data-menu-action="about"
                  type="button"
                  role="menuitem"
                  onClick={() => openAbout(moreButtonRef.current!)}
                >
                  <InformationCircleIcon aria-hidden="true" />
                  {labels.aboutYeli}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div
        className={`workspace-body${outlineOpen && !focusMode ? " has-outline" : ""}${((!isRead && inspectorOpen) || lifecycle.historyOpen || efficiencyGuideOpen) && !focusMode ? " has-inspector" : ""}`}
      >
        {outlineOpen && !focusMode ? (
          <OutlinePanel
            focusSearchRequest={0}
            label={labels.documentOutline}
            labels={labels}
            onClose={() => setOutlineOpen(false)}
            source={snapshot.source}
          />
        ) : null}

        {isRead ? (
          <ReadSurface
            assets={snapshot.assets}
            displayTitle={displayTitle}
            labels={labels}
            onOpenImage={openImagePreview}
            revision={snapshot.revision}
            source={snapshot.source}
          />
        ) : (
          <EditCanvas
            assets={snapshot.assets}
            displayTitle={displayTitle}
            handoffTarget={readEditTarget}
            labels={labels}
            locale={locale}
            onHandoffResolved={resolveReadEditHandoff}
            onOpenDocumentInspector={() => {
              setSelectedBlockBinding(null);
              setHistoryOpen(false);
              setEfficiencyGuideOpen(false);
              if (overlayRails()) setOutlineOpen(false);
              setInspectorOpen(true);
            }}
            onOpenImage={openImagePreview}
            onSelectBlock={(block, revealInspector = false) => {
              setActiveBlockBinding({
                from: block.range.from,
                id: block.id,
                kind: block.kind,
              });
              if (!isInspectableImageBlock(block)) {
                if (selectedBlockBinding) {
                  closeInspector();
                }
                return;
              }
              setSelectedBlockBinding({
                from: block.range.from,
                id: block.id,
                kind: block.kind,
              });
              if (revealInspector) {
                setHistoryOpen(false);
                setEfficiencyGuideOpen(false);
                if (overlayRails()) setOutlineOpen(false);
                setInspectorOpen(true);
              }
            }}
            selectedBlockId={selectedBlock?.id}
            snapshot={snapshot}
            store={store}
          />
        )}

        {!isRead && inspectorOpen && !focusMode ? (
          <Inspector
            labels={labels}
            onClose={closeInspector}
            onClearSelection={closeInspector}
            onEmbedImage={lifecycle.embedImage}
            selectedBlock={selectedBlock}
            snapshot={snapshot}
            store={store}
          />
        ) : null}

        {!isRead && lifecycle.historyOpen && !focusMode ? (
          <HistoryOverlay
            historyAvailable={lifecycle.recoveryAvailable}
            labels={labels}
            locale={locale}
            onClose={() => {
              setHistoryOpen(false);
              moreButtonRef.current?.focus();
            }}
            onRestore={async (version, expected) => {
              const restored = await lifecycle.restoreVersion(
                version,
                expected,
              );
              if (restored) moreButtonRef.current?.focus();
              return restored;
            }}
            snapshot={snapshot}
            versions={lifecycle.versions}
          />
        ) : null}

        {efficiencyGuideOpen && !focusMode ? (
          <EfficiencyGuide
            context={commandContext}
            labels={labels}
            locale={locale}
            onClose={closeEfficiencyGuide}
          />
        ) : null}
      </div>

      {searchOpen ? (
        <SearchOverlay
          labels={labels}
          mode={isRead ? "read" : "edit"}
          onClose={closeSearch}
          onEditSourceSafe={(block) => {
            setSearchOpen(false);
            window.requestAnimationFrame(() => {
              const selector = `[data-source-block-id="${CSS.escape(block.id)}"]`;
              const element = document.querySelector<HTMLElement>(selector);
              element?.scrollIntoView({ block: "center" });
              element
                ?.querySelector<HTMLButtonElement>(".source-safe-edit")
                ?.click();
            });
          }}
          onEnterEdit={enterEditAtSearchResult}
          projection={snapshot.projection}
          store={store}
        />
      ) : null}

      {snapshot.mode === "advanced-source" && AdvancedView ? (
        <AdvancedView
          locale={locale}
          onClose={() => {
            store.closeAdvancedSource();
            moreButtonRef.current?.focus();
          }}
          snapshot={snapshot}
          store={store}
        />
      ) : null}

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".yeli.html,.html,.md,text/html,text/markdown"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void lifecycle.openFile(file);
          event.currentTarget.value = "";
        }}
      />

      {lifecycle.exportPreview ? (
        <ExportPreview
          artifact={lifecycle.exportPreview}
          labels={labels}
          onClose={() => {
            lifecycle.setExportPreview(null);
            moreButtonRef.current?.focus();
          }}
          onDownload={lifecycle.downloadStaticExport}
        />
      ) : null}

      {lifecycle.recovery ? (
        <RecoveryDialog
          labels={labels}
          onDiscard={() => void lifecycle.discardRecovery()}
          onRestore={lifecycle.restoreRecovery}
          recovery={lifecycle.recovery}
        />
      ) : null}

      {lifecycle.reconnect ? (
        <ReconnectDialog
          candidateCount={lifecycle.reconnect.candidates.length}
          labels={labels}
          onReconnect={() => void lifecycle.reconnectPrevious()}
          onSeparate={() => void lifecycle.keepSeparate()}
        />
      ) : null}

      {lifecycle.invalidFile ? (
        <InvalidFileDialog
          canRecoverMarkdown={
            lifecycle.invalidFile.recovery.recovery.extractableMarkdown !==
            undefined
          }
          problem={
            lifecycle.invalidFile.recovery.recovery.kind === "future-version"
              ? labels.fileFutureVersion
              : lifecycle.invalidFile.recovery.recovery.kind ===
                  "unsupported-format"
                ? labels.fileUnsupportedFormat
                : lifecycle.invalidFile.recovery.findings.some(
                      (finding) => finding.code === "FILE_SIZE_BUDGET",
                    )
                  ? labels.disclosureLocalTooLarge
                  : labels.fileInvalid
          }
          filename={lifecycle.invalidFile.filename}
          labels={labels}
          onClose={closeInvalidFile}
          onDownloadOriginal={lifecycle.downloadInvalidOriginal}
          onRecoverMarkdown={() => void lifecycle.recoverInvalidMarkdown()}
        />
      ) : null}

      {lifecycle.conflict ? (
        <ConflictDialog
          labels={labels}
          onOverwrite={() => void lifecycle.confirmOverwrite()}
          onReload={() => void lifecycle.reloadExternal()}
          onSaveCopy={() => void lifecycle.saveConflictCopy()}
        />
      ) : null}

      {imagePreview ? (
        <ImagePreview
          image={imagePreview}
          labels={labels}
          onClose={closeImagePreview}
        />
      ) : null}

      {presentationOpen && presentation?.eligible ? (
        <PresentationOverlay
          labels={labels}
          sections={presentation.sections}
          source={snapshot.source}
          onClose={closePresentation}
        />
      ) : null}

      {aboutOpen ? (
        <AboutDialog
          canDirectSave={lifecycle.canDirectSave}
          locale={locale}
          labels={labels}
          recoveryAvailable={lifecycle.recoveryAvailable}
          saveDisclosure={lifecycle.saveDisclosure}
          saveDisclosureLoading={lifecycle.saveDisclosureLoading}
          onClose={() => {
            setAboutOpen(false);
            (aboutReturnRef.current ?? moreButtonRef.current)?.focus();
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
