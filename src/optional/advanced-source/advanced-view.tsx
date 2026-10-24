import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";

import { renderDocumentMarkdown } from "../../render/markdown.ts";
import { en } from "../../i18n/en.ts";
import { zhCN } from "../../i18n/zh-CN.ts";
import type {
  AdvancedModeLocale,
  AdvancedModeViewProps,
} from "./plugin-api.ts";
import { SourceEditor } from "./source-editor.tsx";

interface PluginLabels {
  close: string;
  description: string;
  mode: string;
  plugin: string;
  source: string;
  sourceEditor: string;
  split: string;
  title: string;
}

const PLUGIN_LABELS: Record<AdvancedModeLocale, PluginLabels> = {
  en: {
    close: "Close Advanced View",
    description:
      "Edit the complete Markdown text, or view your changes beside a preview.",
    mode: "Advanced View mode",
    plugin: "Advanced View",
    source: "Source",
    sourceEditor: "Markdown source editor",
    split: "Source + Preview",
    title: "Markdown source",
  },
  "zh-CN": {
    close: "关闭高级视图",
    description: "编辑完整 Markdown 原文，也可对照预览查看修改效果。",
    mode: "高级视图模式",
    plugin: "高级视图",
    source: "源码",
    sourceEditor: "Markdown 源码编辑器",
    split: "源码 + 预览",
    title: "Markdown 源码",
  },
};

export function AdvancedView({
  locale,
  onClose,
  snapshot,
  store,
}: AdvancedModeViewProps) {
  const labels = PLUGIN_LABELS[locale];
  const [tab, setTab] = useState<"source" | "split">("source");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="advanced-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="advanced-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? []),
        ];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="advanced-view" ref={dialogRef}>
        <header>
          <div>
            <p className="eyebrow">{labels.plugin}</p>
            <h2 id="advanced-title">{labels.title}</h2>
            <p>{labels.description}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={labels.close}
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        </header>
        <nav className="advanced-tabs" aria-label={labels.mode}>
          <button
            type="button"
            aria-pressed={tab === "source"}
            onClick={() => setTab("source")}
          >
            {labels.source}
          </button>
          <button
            type="button"
            aria-pressed={tab === "split"}
            onClick={() => setTab("split")}
          >
            {labels.split}
          </button>
        </nav>
        <div
          className={tab === "split" ? "advanced-grid split" : "advanced-grid"}
        >
          <SourceEditor
            initialSource={snapshot.source}
            label={labels.sourceEditor}
            onChange={(source) =>
              store.replaceSource(source, "advanced-source")
            }
          />
          {tab === "split" ? (
            <article
              className="advanced-preview markdown-document"
              dangerouslySetInnerHTML={{
                __html: renderDocumentMarkdown(snapshot.source, {
                  imageUnavailableLabel: (locale === "zh-CN" ? zhCN : en)
                    .imageNotLoaded,
                }),
              }}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
