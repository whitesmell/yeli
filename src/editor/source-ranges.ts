import { sha256Fallback } from "../document/freshness.ts";

export interface SourceRange {
  /** JavaScript UTF-16 code-unit offset into the canonical source string. */
  from: number;
  /** Exclusive JavaScript UTF-16 code-unit offset into the canonical source. */
  to: number;
}

export interface SourceBinding {
  expectedText: string;
  range: SourceRange;
  revision: number;
  sourceHash: string;
}

export interface SourcePatch extends SourceBinding {
  blockId: string;
  insert: string;
  operation: string;
}

export type SourcePatchFailureCode =
  | "EXPECTED_TEXT_MISMATCH"
  | "INVALID_RANGE"
  | "STALE_REVISION"
  | "STALE_SOURCE_HASH";

export type SourcePatchResult =
  | {
      code: SourcePatchFailureCode;
      ok: false;
      source: string;
    }
  | {
      changedRange: { after: SourceRange; before: SourceRange };
      inverse: SourcePatch;
      ok: true;
      revision: number;
      source: string;
      sourceHash: string;
      undoEntries: 1;
    };

export function sourceHash(source: string): string {
  return sha256Fallback(source);
}

export function createSourcePatch(
  binding: SourceBinding & { id: string },
  insert: string,
  operation: string,
  range: SourceRange = binding.range,
): SourcePatch {
  if (range.from < binding.range.from || range.to > binding.range.to) {
    throw new RangeError("Patch range must stay inside its source block");
  }
  const relativeFrom = range.from - binding.range.from;
  const relativeTo = range.to - binding.range.from;
  return {
    blockId: binding.id,
    expectedText: binding.expectedText.slice(relativeFrom, relativeTo),
    insert,
    operation,
    range,
    revision: binding.revision,
    sourceHash: binding.sourceHash,
  };
}

function failure(
  code: SourcePatchFailureCode,
  source: string,
): SourcePatchResult {
  return { code, ok: false, source };
}

export function applySourcePatch(
  source: string,
  current: { revision: number; sourceHash?: string },
  patch: SourcePatch,
): SourcePatchResult {
  if (current.revision !== patch.revision) {
    return failure("STALE_REVISION", source);
  }
  const currentHash = current.sourceHash ?? sourceHash(source);
  if (
    currentHash !== patch.sourceHash ||
    sourceHash(source) !== patch.sourceHash
  ) {
    return failure("STALE_SOURCE_HASH", source);
  }
  if (
    !Number.isSafeInteger(patch.range.from) ||
    !Number.isSafeInteger(patch.range.to) ||
    patch.range.from < 0 ||
    patch.range.to < patch.range.from ||
    patch.range.to > source.length
  ) {
    return failure("INVALID_RANGE", source);
  }
  if (source.slice(patch.range.from, patch.range.to) !== patch.expectedText) {
    return failure("EXPECTED_TEXT_MISMATCH", source);
  }

  const nextSource = `${source.slice(0, patch.range.from)}${patch.insert}${source.slice(patch.range.to)}`;
  const nextRevision = current.revision + 1;
  const nextHash = sourceHash(nextSource);
  const after = {
    from: patch.range.from,
    to: patch.range.from + patch.insert.length,
  };
  return {
    changedRange: { before: patch.range, after },
    inverse: {
      blockId: patch.blockId,
      expectedText: patch.insert,
      insert: patch.expectedText,
      operation: `undo:${patch.operation}`,
      range: after,
      revision: nextRevision,
      sourceHash: nextHash,
    },
    ok: true,
    revision: nextRevision,
    source: nextSource,
    sourceHash: nextHash,
    undoEntries: 1,
  };
}

export function sourceDiffRange(
  before: string,
  after: string,
): { after: SourceRange; before: SourceRange } | null {
  if (before === after) return null;
  let prefix = 0;
  const sharedLength = Math.min(before.length, after.length);
  while (prefix < sharedLength && before[prefix] === after[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < sharedLength - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) {
    suffix += 1;
  }
  return {
    before: { from: prefix, to: before.length - suffix },
    after: { from: prefix, to: after.length - suffix },
  };
}
