import {
  ArrowDownIcon,
  ArrowUpIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";

import type { DocumentStore } from "../document/store.ts";
import type {
  BlockProjection,
  SourceBlock,
} from "../editor/block-projection.ts";
import {
  buildSearchIndexCooperative,
  buildSearchReplacement,
  searchIndexCooperative,
  type SearchIndex,
  type SearchLimitReason,
  type SearchMatch,
  type SearchResult,
} from "../editor/search-index.ts";
import type { Labels } from "../i18n/en.ts";

interface IndexedState {
  index: SearchIndex;
  key: string;
}

interface SearchedState {
  key: string;
  result: SearchResult;
}

function formatCount(template: string, current: number, total: number): string {
  return template
    .replace("{current}", String(current))
    .replace("{total}", String(total));
}

function limitMessage(reason: SearchLimitReason | undefined, labels: Labels) {
  if (reason === "query-too-long") return labels.searchQueryTooLong;
  if (reason === "time-budget") return labels.searchTimeLimited;
  return labels.searchLimitedResults;
}

function targetElement(match: SearchMatch, mode: "edit" | "read") {
  const selector = `[data-source-from="${match.block.range.from}"][data-source-to="${match.block.range.to}"]`;
  return document.querySelector<HTMLElement>(
    mode === "read" ? `.read-surface ${selector}` : `.edit-surface ${selector}`,
  );
}

export function SearchOverlay({
  labels,
  mode,
  onClose,
  onEditSourceSafe,
  onEnterEdit,
  projection,
  store,
}: {
  labels: Labels;
  mode: "edit" | "read";
  onClose: () => void;
  onEditSourceSafe: (block: SourceBlock) => void;
  onEnterEdit: (block: SourceBlock, viewportTop: number) => void;
  projection: BlockProjection;
  store: DocumentStore;
}) {
  const key = `${projection.revision}:${projection.sourceHash}`;
  const [indexed, setIndexed] = useState<IndexedState | null>(null);
  const [searched, setSearched] = useState<SearchedState | null>(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void buildSearchIndexCooperative(projection, {
      signal: controller.signal,
    })
      .then((index) => {
        if (!controller.signal.aborted) setIndexed({ index, key });
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.name !== "AbortError") {
          setMessage(labels.searchTimeLimited);
        }
      });
    return () => controller.abort();
  }, [key, labels.searchTimeLimited, projection]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const index = indexed?.key === key ? indexed.index : null;
  const searchKey = `${key}:${query}`;
  useEffect(() => {
    if (!index || query.length === 0) return;
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => {
      void searchIndexCooperative(index, query, {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) {
            setSearched({ key: searchKey, result });
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error) || error.name !== "AbortError") {
            setMessage(labels.searchTimeLimited);
          }
        });
    }, 120);
    return () => {
      globalThis.clearTimeout(timeout);
      controller.abort();
    };
  }, [index, labels.searchTimeLimited, query, searchKey]);
  const results =
    query.length > 0 && searched?.key === searchKey
      ? searched.result
      : { matches: [], normalizedQuery: "", truncated: false };
  const searchReady = query.length === 0 || searched?.key === searchKey;
  const foundIndex = results.matches.findIndex(
    (match) => match.id === currentMatchId,
  );
  const currentIndex = foundIndex >= 0 ? foundIndex : 0;
  const current = results.matches[currentIndex] ?? null;
  const safeMatches = results.matches.filter((match) => match.replaceable);

  useEffect(() => {
    document
      .querySelectorAll(".search-current-target")
      .forEach((element) => element.classList.remove("search-current-target"));
    if (!current) return;
    const element = targetElement(current, mode);
    element?.classList.add("search-current-target");
    element?.scrollIntoView({ block: "center", behavior: "instant" });
    return () => element?.classList.remove("search-current-target");
  }, [current, mode]);

  const navigate = (offset: number) => {
    if (results.matches.length === 0) return;
    const next =
      (currentIndex + offset + results.matches.length) % results.matches.length;
    setCurrentMatchId(results.matches[next]!.id);
  };

  const replace = (all: boolean) => {
    if (!index || !current) return;
    const selected = all ? safeMatches : [current];
    const built = buildSearchReplacement(
      index,
      selected,
      replacement,
      all ? "search.replace-all" : "search.replace-one",
    );
    if (!built.ok) {
      setMessage(
        built.code === "UNSAFE_REPLACEMENT"
          ? labels.searchUnsafeReplacement
          : labels.searchViewOnlyInline,
      );
      return;
    }
    const result = store.applyTransaction(built.transaction);
    if (!result.ok) {
      setMessage(labels.searchStaleRefreshed);
      return;
    }
    setMessage(
      labels.searchReplaced.replace(
        "{count}",
        String(all ? safeMatches.length : 1),
      ),
    );
  };

  const viewOnlyMessage =
    current?.viewOnlyReason === "cross-block"
      ? labels.searchViewOnlyCrossBlock
      : current?.viewOnlyReason === "source-safe-block"
        ? labels.searchViewOnlySourceSafe
        : labels.searchViewOnlyInline;
  const indexLimit = index?.limitedReasons[0];
  const limit = results.limitedReason ?? indexLimit;

  return (
    <section
      aria-labelledby="document-search-title"
      className="search-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        } else if (
          event.key === "Enter" &&
          event.target === searchRef.current
        ) {
          event.preventDefault();
          navigate(event.shiftKey ? -1 : 1);
        }
      }}
      role="dialog"
    >
      <header>
        <div>
          <span className="search-eyebrow">
            <MagnifyingGlassIcon aria-hidden="true" />
            {labels.searchDocument}
          </span>
          <h2 id="document-search-title">{labels.searchTitle}</h2>
        </div>
        <button type="button" aria-label={labels.closeSearch} onClick={onClose}>
          <XMarkIcon aria-hidden="true" />
        </button>
      </header>

      <label className="search-query-field">
        <span className="sr-only">{labels.searchQuery}</span>
        <input
          ref={searchRef}
          type="search"
          autoComplete="off"
          placeholder={labels.searchPlaceholder}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setCurrentMatchId(null);
            setMessage(null);
          }}
        />
      </label>

      <div className="search-navigation">
        <span aria-live="polite">
          {!index || !searchReady
            ? labels.searchIndexing
            : query && results.matches.length === 0
              ? labels.searchNoResults
              : formatCount(
                  labels.searchCount,
                  current ? currentIndex + 1 : 0,
                  results.matches.length,
                )}
        </span>
        <button
          type="button"
          aria-label={labels.previousMatch}
          disabled={results.matches.length === 0}
          onClick={() => navigate(-1)}
        >
          <ArrowUpIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={labels.nextMatch}
          disabled={results.matches.length === 0}
          onClick={() => navigate(1)}
        >
          <ArrowDownIcon aria-hidden="true" />
        </button>
      </div>

      {current ? (
        <div className="search-current-result">
          <p>{current.excerpt}</p>
          <small>
            {labels.commandScope}: {labels.commandScope_block} ·{" "}
            {current.block.kind}
          </small>
        </div>
      ) : null}

      {limit ? (
        <p className="search-limit-note" role="note">
          {limitMessage(limit, labels)}
        </p>
      ) : null}

      {mode === "read" ? (
        <div className="search-read-actions">
          <p>{labels.searchReadOnlyHint}</p>
          <button
            type="button"
            disabled={!current}
            onClick={() => {
              if (!current) return;
              const element = targetElement(current, "read");
              onEnterEdit(
                current.block,
                element?.getBoundingClientRect().top ?? 120,
              );
            }}
          >
            <PencilSquareIcon aria-hidden="true" />
            {labels.editSearchResult}
          </button>
        </div>
      ) : (
        <div className="search-replace">
          <label>
            <span>{labels.replaceWith}</span>
            <input
              type="text"
              value={replacement}
              onChange={(event) => setReplacement(event.currentTarget.value)}
            />
          </label>
          <div>
            <button
              type="button"
              disabled={!current?.replaceable}
              onClick={() => replace(false)}
            >
              {labels.replaceOne}
            </button>
            <button
              type="button"
              disabled={safeMatches.length === 0}
              onClick={() => replace(true)}
            >
              {labels.replaceAll.replace("{count}", String(safeMatches.length))}
            </button>
          </div>
          {current && !current.replaceable ? (
            <div className="search-view-only" role="note">
              <p>{viewOnlyMessage}</p>
              <button
                type="button"
                onClick={() => onEditSourceSafe(current.block)}
              >
                {labels.editRawBlock}
              </button>
            </div>
          ) : null}
        </div>
      )}
      {message ? (
        <p className="search-status" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
