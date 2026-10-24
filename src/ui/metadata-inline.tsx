import { PlusIcon, TagIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { indexFrontmatter } from "../document/frontmatter.ts";
import type { DocumentStore } from "../document/store.ts";
import type { DocumentSnapshot } from "../document/store.ts";
import type { Labels } from "../i18n/en.ts";
import { normalizeLocale } from "../i18n/locale.ts";

interface MetadataInlineProps {
  displayTitle: string;
  labels: Labels;
  onOpenInspector: () => void;
  snapshot: DocumentSnapshot;
  store: DocumentStore;
}

function listValue(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(
      (item, index, items) => item.length > 0 && items.indexOf(item) === index,
    );
}

export function MetadataInline({
  displayTitle,
  labels,
  onOpenInspector,
  snapshot,
  store,
}: MetadataInlineProps) {
  const frontmatter = indexFrontmatter(snapshot.source);
  const metadata = frontmatter.metadata;
  const disabled = frontmatter.status === "unsafe";
  const tags = metadata.tags ?? [];
  const authors = metadata.authors ?? [];
  const title = metadata.title ?? displayTitle;

  const addTag = (input: HTMLInputElement) => {
    const value = input.value.trim();
    if (value.length > 0 && !tags.includes(value)) {
      store.patchMetadata("tags", [...tags, value]);
    }
    input.value = "";
  };

  return (
    <header className="document-heading">
      <input
        className="document-title-input"
        id="document-title"
        readOnly={disabled}
        defaultValue={title}
        key={`${snapshot.revision}:title:${title}`}
        aria-label={labels.documentTitle}
        onBlur={(event) => {
          if (event.currentTarget.value === title) return;
          const value = event.currentTarget.value.trim();
          if (value !== title) {
            store.patchMetadata("title", value);
          }
        }}
      />
      <div className="metadata-row" aria-label={labels.documentMetadata}>
        <div className="metadata-property metadata-tags">
          <TagIcon aria-hidden="true" />
          <span className="metadata-label">{labels.tags}</span>
          <div className="tag-list">
            {tags.map((tag) => (
              <span className="tag-chip" key={tag}>
                {tag}
                <button
                  disabled={disabled}
                  type="button"
                  aria-label={`${labels.removeTag} ${tag}`}
                  onClick={() =>
                    store.patchMetadata(
                      "tags",
                      tags.filter((candidate) => candidate !== tag),
                    )
                  }
                >
                  <XMarkIcon aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              disabled={disabled}
              className="metadata-tag-input"
              aria-label={labels.addTag}
              placeholder={labels.addTag}
              onBlur={(event) => addTag(event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing)
                  return;
                event.preventDefault();
                addTag(event.currentTarget);
              }}
            />
          </div>
        </div>
        <label className="metadata-property metadata-text-property">
          <span className="metadata-label">{labels.authors}</span>
          <input
            disabled={disabled}
            className="metadata-inline-input"
            aria-label={labels.authors}
            defaultValue={listValue(authors)}
            key={`${snapshot.revision}:inline-authors`}
            onBlur={(event) => {
              if (event.currentTarget.value === listValue(authors)) return;
              const value = parseList(event.currentTarget.value);
              if (listValue(value) !== listValue(authors)) {
                store.patchMetadata("authors", value);
              }
            }}
          />
        </label>
        <label className="metadata-property metadata-text-property">
          <span className="metadata-label">{labels.language}</span>
          <select
            disabled={disabled}
            className="metadata-inline-select"
            aria-label={labels.language}
            value={normalizeLocale(metadata.lang) ?? metadata.lang ?? "zh-CN"}
            onChange={(event) =>
              store.patchMetadata("lang", event.currentTarget.value)
            }
          >
            {metadata.lang &&
            !["zh-CN", "en", "ja"].includes(metadata.lang) &&
            normalizeLocale(metadata.lang) === null ? (
              <option value={metadata.lang}>{metadata.lang}</option>
            ) : null}
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        <button
          className="metadata-add"
          type="button"
          onClick={onOpenInspector}
          aria-label={labels.addDocumentProperty}
          title={labels.addDocumentProperty}
        >
          <PlusIcon aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
