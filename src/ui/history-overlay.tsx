import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  ClockIcon,
  CommandLineIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";

import type { DocumentSnapshot } from "../document/store.ts";
import type { Labels } from "../i18n/en.ts";
import type { StoredVersion } from "../storage/recovery.ts";
import { summarizeVersionChange } from "../storage/version-diff.ts";
import {
  formatHistoryText,
  versionCategory,
  versionDescription,
  versionKindLabels,
  versionLabel,
  type VersionCategory,
} from "../storage/versions.ts";

function AssetList({ ids, label }: { ids: readonly string[]; label: string }) {
  if (ids.length === 0) return null;
  return (
    <section className="history-assets">
      <h4>{label}</h4>
      <ul>
        {ids.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </section>
  );
}

function VersionChange({
  labels,
  showKinds = false,
  version,
}: {
  labels: Labels;
  showKinds?: boolean;
  version: StoredVersion;
}) {
  const change = version.change;
  const isAgent = versionCategory(version) === "agent";
  const isSystem = change?.origin === "system";
  const origin = isAgent
    ? labels.historyOriginAgent
    : isSystem
      ? labels.historyOriginSystem
      : labels.historyOriginEditor;
  const OriginIcon = isAgent
    ? CommandLineIcon
    : isSystem
      ? Cog6ToothIcon
      : PencilSquareIcon;
  const kinds = showKinds ? versionKindLabels(version, labels) : [];
  return (
    <div className="history-change">
      <div className="history-change-meta">
        <span
          className={`history-origin history-origin-${change?.origin ?? "system"}`}
        >
          <OriginIcon aria-hidden="true" />
          {origin}
        </span>
        {change?.actorLabel ? (
          <span title={labels.historyActorSelfReported}>
            {change.actorLabel} · {labels.historyActorSelfReported}
          </span>
        ) : null}
      </div>
      <p>{versionDescription(version, labels)}</p>
      {showKinds && kinds.length > 0 ? (
        <div
          className="history-change-tags"
          aria-label={labels.historyBlockTags}
        >
          {kinds.map((kind) => (
            <span key={kind}>{kind}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HistoryOverlay({
  historyAvailable,
  labels,
  locale,
  onClose,
  onRestore,
  snapshot,
  versions,
}: {
  historyAvailable: boolean;
  labels: Labels;
  locale: "en" | "zh-CN";
  onClose: () => void;
  onRestore: (
    version: StoredVersion,
    expected: { revision: number; sourceHash: string },
  ) => Promise<boolean>;
  snapshot: DocumentSnapshot;
  versions: StoredVersion[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | VersionCategory>("all");
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = useMemo(
    () => versions.find((version) => version.id === selectedId) ?? null,
    [selectedId, versions],
  );
  const filteredVersions = useMemo(
    () =>
      filter === "all"
        ? versions
        : versions.filter((version) => versionCategory(version) === filter),
    [filter, versions],
  );
  const summary = useMemo(
    () => (selected ? summarizeVersionChange(snapshot, selected) : null),
    [selected, snapshot],
  );
  const hasAssetChanges = summary
    ? summary.assetSummary.changed.length > 0 ||
      summary.assetSummary.currentOnly.length > 0 ||
      summary.assetSummary.historicalOnly.length > 0
    : false;
  const hasChanges = Boolean(summary?.sourceChanged || hasAssetChanges);

  useEffect(() => closeRef.current?.focus(), []);

  const selectVersion = (version: StoredVersion) => {
    setSelectedId(version.id);
    setConfirmed(false);
  };

  return (
    <aside
      aria-labelledby="history-panel-title"
      className="history-panel side-utility-panel"
      role="complementary"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <span className="overlay-eyebrow">
            <ClockIcon aria-hidden="true" />
            {labels.localOnly}
          </span>
          <h2 id="history-panel-title">{labels.history}</h2>
          {historyAvailable ? <p>{labels.historyDescription}</p> : null}
        </div>
        <button
          className="icon-button"
          ref={closeRef}
          type="button"
          aria-label={labels.close}
          onClick={onClose}
        >
          <XMarkIcon aria-hidden="true" />
        </button>
      </header>

      {!selected ? (
        <>
          <div
            aria-label={labels.historyFilterLabel}
            className="history-filters"
            role="group"
          >
            {(
              [
                ["all", labels.historyFilterAll],
                ["local", labels.historyFilterLocal],
                ["agent", labels.historyFilterAgent],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={filter === value}
                key={value}
                type="button"
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="history-list">
            {!historyAvailable ? (
              <div className="history-empty" role="alert">
                <ClockIcon aria-hidden="true" />
                <p>{labels.historyStorageUnavailable}</p>
              </div>
            ) : versions.length === 0 ? (
              <div className="history-empty">
                <ClockIcon aria-hidden="true" />
                <p>{labels.historyEmpty}</p>
              </div>
            ) : filteredVersions.length === 0 ? (
              <div className="history-empty history-empty-filtered">
                <p>{labels.historyFilteredEmpty}</p>
              </div>
            ) : (
              filteredVersions.map((version) => (
                <article className="history-item" key={version.id}>
                  <div>
                    <strong>{versionLabel(version, locale)}</strong>
                    <span>
                      {labels.version} {version.revision} ·{" "}
                      {labels[`historyReason_${version.reason}`]}
                    </span>
                    <VersionChange labels={labels} version={version} />
                  </div>
                  <button type="button" onClick={() => selectVersion(version)}>
                    {labels.historyReview}
                    <ChevronRightIcon aria-hidden="true" />
                  </button>
                </article>
              ))
            )}
          </div>
        </>
      ) : summary ? (
        <div className="history-detail">
          <button
            className="history-back"
            type="button"
            onClick={() => setSelectedId(null)}
          >
            <ArrowLeftIcon aria-hidden="true" />
            {labels.historyBack}
          </button>
          <div className="history-selected-version">
            <strong>{versionLabel(selected, locale)}</strong>
            <span>
              {labels.version} {selected.revision} ·{" "}
              {labels[`historyReason_${selected.reason}`]}
            </span>
          </div>
          <VersionChange labels={labels} showKinds version={selected} />

          <p className="history-source-summary">
            {formatHistoryText(labels.historySourceSummary, {
              current: summary.currentLineCount,
              historical: summary.historicalLineCount,
            })}
          </p>
          <p className="history-change-summary">
            {formatHistoryText(labels.historyChangeSummary, {
              current: summary.currentChangedLines,
              historical: summary.historicalChangedLines,
            })}
          </p>

          {!hasChanges ? (
            <p className="history-no-changes">{labels.historyNoChanges}</p>
          ) : null}

          <div className="history-asset-summary">
            <AssetList
              ids={summary.assetSummary.currentOnly}
              label={labels.historyAssetsCurrentOnly}
            />
            <AssetList
              ids={summary.assetSummary.historicalOnly}
              label={labels.historyAssetsHistoricalOnly}
            />
            <AssetList
              ids={summary.assetSummary.changed}
              label={labels.historyAssetsChanged}
            />
            {summary.assetSummary.legacyAssetsRetained ? (
              <p role="note">{labels.historyLegacyAssets}</p>
            ) : null}
          </div>

          <section className="history-preview-section">
            <h3>{labels.historyPreview}</h3>
            <pre
              aria-label={labels.historyPreviewLabel}
              className="history-source-preview"
            >
              {summary.historicalPreview}
              {summary.historicalPreviewTruncated ? "\n…" : ""}
            </pre>
          </section>

          {hasChanges ? (
            <label className="history-restore-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={restoring}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
              />
              <span>{labels.historyRestoreConfirm}</span>
            </label>
          ) : null}
          <div className="history-restore-actions">
            {hasChanges ? (
              <button
                className="primary-action"
                type="button"
                disabled={!confirmed || restoring}
                onClick={() => {
                  setRestoring(true);
                  void onRestore(selected, {
                    revision: snapshot.revision,
                    sourceHash: snapshot.sourceHash,
                  }).finally(() => setRestoring(false));
                }}
              >
                <ArrowPathIcon aria-hidden="true" />
                {restoring
                  ? labels.historyRestoring
                  : labels.historyRestoreThis}
              </button>
            ) : (
              <button
                className="secondary-action"
                type="button"
                onClick={() => setSelectedId(null)}
              >
                {labels.historyChooseVersion}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
