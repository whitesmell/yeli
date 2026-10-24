import type { YeliAsset } from "../document/model.ts";
import type { StoredVersion } from "./recovery.ts";

export interface VersionAssetSummary {
  changed: string[];
  currentOnly: string[];
  historicalOnly: string[];
  legacyAssetsRetained: boolean;
}

export interface VersionChangeSummary {
  assetSummary: VersionAssetSummary;
  currentChangedLines: number;
  currentLineCount: number;
  historicalChangedLines: number;
  historicalLineCount: number;
  historicalPreview: string;
  historicalPreviewTruncated: boolean;
  sourceChanged: boolean;
}

export interface VersionDiffCurrent {
  assets: readonly YeliAsset[];
  revision: number;
  source: string;
  sourceHash: string;
}

function sourceLines(source: string): string[] {
  if (source.length === 0) return [];
  const lines = source.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function sameAsset(left: YeliAsset, right: YeliAsset): boolean {
  return (
    left.id === right.id &&
    left.mimeType === right.mimeType &&
    left.data === right.data
  );
}

function compareAssets(
  current: readonly YeliAsset[],
  historical: readonly YeliAsset[] | undefined,
): VersionAssetSummary {
  const target = historical ?? current;
  const currentById = new Map(current.map((asset) => [asset.id, asset]));
  const historicalById = new Map(target.map((asset) => [asset.id, asset]));
  return {
    changed: target
      .filter((asset) => {
        const existing = currentById.get(asset.id);
        return existing !== undefined && !sameAsset(existing, asset);
      })
      .map((asset) => asset.id),
    currentOnly: current
      .filter((asset) => !historicalById.has(asset.id))
      .map((asset) => asset.id),
    historicalOnly: target
      .filter((asset) => !currentById.has(asset.id))
      .map((asset) => asset.id),
    legacyAssetsRetained: historical === undefined,
  };
}

/**
 * Produces a bounded, non-diff history summary. It only measures the changed
 * middle after the common prefix/suffix and keeps historical source inert.
 */
export function summarizeVersionChange(
  current: VersionDiffCurrent,
  historical: StoredVersion,
  options: { previewCharacters?: number } = {},
): VersionChangeSummary {
  const currentLines = sourceLines(current.source);
  const historicalLines = sourceLines(historical.source);
  let prefix = 0;
  while (
    prefix < currentLines.length &&
    prefix < historicalLines.length &&
    currentLines[prefix] === historicalLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < currentLines.length - prefix &&
    suffix < historicalLines.length - prefix &&
    currentLines[currentLines.length - suffix - 1] ===
      historicalLines[historicalLines.length - suffix - 1]
  ) {
    suffix += 1;
  }
  const previewCharacters = options.previewCharacters ?? 4_000;
  return {
    assetSummary: compareAssets(current.assets, historical.assets),
    currentChangedLines: Math.max(0, currentLines.length - prefix - suffix),
    currentLineCount: currentLines.length,
    historicalChangedLines: Math.max(
      0,
      historicalLines.length - prefix - suffix,
    ),
    historicalLineCount: historicalLines.length,
    historicalPreview: historical.source.slice(0, previewCharacters),
    historicalPreviewTruncated: historical.source.length > previewCharacters,
    sourceChanged: current.source !== historical.source,
  };
}
