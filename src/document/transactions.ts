import { assetReferencesFromMarkdown } from "./manifest.ts";
import type { YeliAsset, ValidationFinding } from "./model.ts";
import {
  sourceHash,
  type SourcePatch,
  type SourceRange,
} from "../editor/source-ranges.ts";
import { validateAssetReferences, validateAssetSet } from "../format/assets.ts";

export interface AssetDelta {
  remove?: readonly string[];
  upsert?: readonly YeliAsset[];
}

export interface DocumentTransaction {
  assetDelta?: AssetDelta;
  expectedRevision: number;
  expectedSourceHash: string;
  operation: string;
  patches: readonly SourcePatch[];
}

export interface DocumentTransactionState {
  assets: readonly YeliAsset[];
  revision: number;
  source: string;
  sourceHash: string;
}

export type DocumentTransactionFailureCode =
  | "ASSET_DELTA_INVALID"
  | "ASSET_SET_INVALID"
  | "EXPECTED_TEXT_MISMATCH"
  | "INVALID_RANGE"
  | "OVERLAPPING_RANGES"
  | "STALE_REVISION"
  | "STALE_SOURCE_HASH";

export type DocumentTransactionResult =
  | {
      assets: readonly YeliAsset[];
      code: DocumentTransactionFailureCode;
      findings?: ValidationFinding[];
      ok: false;
      source: string;
    }
  | {
      assetChanges: {
        added: string[];
        removed: string[];
        replaced: string[];
      };
      assets: readonly YeliAsset[];
      changedRanges: Array<{ after: SourceRange; before: SourceRange }>;
      inverse: DocumentTransaction;
      ok: true;
      operation: string;
      revision: number;
      source: string;
      sourceHash: string;
      undoEntries: 1;
    };

function failure(
  state: DocumentTransactionState,
  code: DocumentTransactionFailureCode,
  findings?: ValidationFinding[],
): DocumentTransactionResult {
  return {
    assets: state.assets,
    code,
    ...(findings ? { findings } : {}),
    ok: false,
    source: state.source,
  };
}

function sameAsset(left: YeliAsset, right: YeliAsset): boolean {
  return (
    left.id === right.id &&
    left.mimeType === right.mimeType &&
    left.data === right.data
  );
}

function validateAssetDelta(
  state: DocumentTransactionState,
  delta: AssetDelta | undefined,
): DocumentTransactionFailureCode | null {
  if (!delta) return null;
  const remove = delta.remove ?? [];
  const upsert = delta.upsert ?? [];
  const removed = new Set(remove);
  const upserted = new Set(upsert.map((asset) => asset.id));
  if (
    removed.size !== remove.length ||
    upserted.size !== upsert.length ||
    [...removed].some((id) => upserted.has(id))
  ) {
    return "ASSET_DELTA_INVALID";
  }
  const currentIds = new Set(state.assets.map((asset) => asset.id));
  if ([...removed].some((id) => !currentIds.has(id))) {
    return "ASSET_DELTA_INVALID";
  }
  return null;
}

function applyAssetDelta(
  current: readonly YeliAsset[],
  delta: AssetDelta | undefined,
): YeliAsset[] {
  if (!delta) return [...current];
  const removed = new Set(delta.remove ?? []);
  const upserts = new Map(
    (delta.upsert ?? []).map((asset) => [asset.id, { ...asset }]),
  );
  const next: YeliAsset[] = [];
  for (const asset of current) {
    if (removed.has(asset.id)) continue;
    next.push(upserts.get(asset.id) ?? { ...asset });
    upserts.delete(asset.id);
  }
  next.push(...upserts.values());
  return next;
}

export function createAssetDelta(
  current: readonly YeliAsset[],
  target: readonly YeliAsset[],
): AssetDelta | undefined {
  const currentById = new Map(current.map((asset) => [asset.id, asset]));
  const targetById = new Map(target.map((asset) => [asset.id, asset]));
  const remove = current
    .filter((asset) => !targetById.has(asset.id))
    .map((asset) => asset.id);
  const upsert = target.filter((asset) => {
    const existing = currentById.get(asset.id);
    return !existing || !sameAsset(existing, asset);
  });
  return remove.length > 0 || upsert.length > 0
    ? { remove, upsert }
    : undefined;
}

export function createAssetDeltaForPatch(
  state: Pick<DocumentTransactionState, "assets" | "source">,
  patch: SourcePatch,
  options: {
    pruneAssetIds?: readonly string[];
    upsert?: readonly YeliAsset[];
  } = {},
): AssetDelta | undefined {
  const nextSource = `${state.source.slice(0, patch.range.from)}${patch.insert}${state.source.slice(patch.range.to)}`;
  const nextReferences = new Set(assetReferencesFromMarkdown(nextSource));
  const currentIds = new Set(state.assets.map((asset) => asset.id));
  const remove = [...new Set(options.pruneAssetIds ?? [])].filter(
    (id) => currentIds.has(id) && !nextReferences.has(id),
  );
  const upsert = options.upsert ?? [];
  return remove.length > 0 || upsert.length > 0
    ? { remove, upsert }
    : undefined;
}

function fullReplacementPatch(
  source: string,
  state: DocumentTransactionState,
  operation: string,
): SourcePatch {
  return {
    blockId: "document",
    expectedText: state.source,
    insert: source,
    operation,
    range: { from: 0, to: state.source.length },
    revision: state.revision,
    sourceHash: state.sourceHash,
  };
}

export function createDocumentReplacement(
  state: DocumentTransactionState,
  source: string,
  assets: readonly YeliAsset[],
  operation: string,
): DocumentTransaction {
  const assetDelta = createAssetDelta(state.assets, assets);
  return {
    expectedRevision: state.revision,
    expectedSourceHash: state.sourceHash,
    operation,
    patches:
      source === state.source
        ? []
        : [fullReplacementPatch(source, state, operation)],
    ...(assetDelta ? { assetDelta } : {}),
  };
}

export function applyDocumentTransaction(
  state: DocumentTransactionState,
  transaction: DocumentTransaction,
): DocumentTransactionResult {
  if (state.revision !== transaction.expectedRevision) {
    return failure(state, "STALE_REVISION");
  }
  if (
    state.sourceHash !== transaction.expectedSourceHash ||
    sourceHash(state.source) !== transaction.expectedSourceHash
  ) {
    return failure(state, "STALE_SOURCE_HASH");
  }
  const assetDeltaFailure = validateAssetDelta(state, transaction.assetDelta);
  if (assetDeltaFailure) return failure(state, assetDeltaFailure);

  const patches = [...transaction.patches].sort(
    (left, right) =>
      left.range.from - right.range.from || left.range.to - right.range.to,
  );
  let previous: SourcePatch | undefined;
  for (const patch of patches) {
    if (
      patch.revision !== transaction.expectedRevision ||
      patch.sourceHash !== transaction.expectedSourceHash
    ) {
      return failure(
        state,
        patch.revision !== transaction.expectedRevision
          ? "STALE_REVISION"
          : "STALE_SOURCE_HASH",
      );
    }
    if (
      !Number.isSafeInteger(patch.range.from) ||
      !Number.isSafeInteger(patch.range.to) ||
      patch.range.from < 0 ||
      patch.range.to < patch.range.from ||
      patch.range.to > state.source.length
    ) {
      return failure(state, "INVALID_RANGE");
    }
    if (
      previous &&
      (patch.range.from < previous.range.to ||
        (patch.range.from === previous.range.from &&
          patch.range.to === previous.range.to))
    ) {
      return failure(state, "OVERLAPPING_RANGES");
    }
    if (
      state.source.slice(patch.range.from, patch.range.to) !==
      patch.expectedText
    ) {
      return failure(state, "EXPECTED_TEXT_MISMATCH");
    }
    previous = patch;
  }

  let nextSource = state.source;
  for (let index = patches.length - 1; index >= 0; index -= 1) {
    const patch = patches[index]!;
    nextSource = `${nextSource.slice(0, patch.range.from)}${patch.insert}${nextSource.slice(patch.range.to)}`;
  }
  const nextAssets = applyAssetDelta(state.assets, transaction.assetDelta);
  const references = assetReferencesFromMarkdown(nextSource);
  // Existing assets crossed the full validation boundary when the document was
  // opened or when they were last changed. Source-only typing only needs the
  // cheap referential-integrity check; decoding and hashing every embedded
  // asset on every keystroke would make large documents unusable.
  const findings = transaction.assetDelta
    ? validateAssetSet(nextAssets, references)
    : validateAssetReferences(nextAssets, references);
  if (findings.some((finding) => finding.severity === "error")) {
    return failure(state, "ASSET_SET_INVALID", findings);
  }

  let offset = 0;
  const changedRanges = patches.map((patch) => {
    const after = {
      from: patch.range.from + offset,
      to: patch.range.from + offset + patch.insert.length,
    };
    offset += patch.insert.length - (patch.range.to - patch.range.from);
    return { after, before: patch.range };
  });
  const nextRevision = state.revision + 1;
  const nextSourceHash = sourceHash(nextSource);
  const nextState: DocumentTransactionState = {
    assets: nextAssets,
    revision: nextRevision,
    source: nextSource,
    sourceHash: nextSourceHash,
  };
  const currentById = new Map(state.assets.map((asset) => [asset.id, asset]));
  const nextById = new Map(nextAssets.map((asset) => [asset.id, asset]));
  const added = nextAssets
    .filter((asset) => !currentById.has(asset.id))
    .map((asset) => asset.id);
  const removed = state.assets
    .filter((asset) => !nextById.has(asset.id))
    .map((asset) => asset.id);
  const replaced = nextAssets
    .filter((asset) => {
      const current = currentById.get(asset.id);
      return current !== undefined && !sameAsset(current, asset);
    })
    .map((asset) => asset.id);

  return {
    assetChanges: { added, removed, replaced },
    assets: nextAssets,
    changedRanges,
    inverse: createDocumentReplacement(
      nextState,
      state.source,
      state.assets,
      `undo:${transaction.operation}`,
    ),
    ok: true,
    operation: transaction.operation,
    revision: nextRevision,
    source: nextSource,
    sourceHash: nextSourceHash,
    undoEntries: 1,
  };
}
