import {
  createFrontmatterPropertyPatch,
  projectMarkdown,
  transitionProjection,
  type BlockProjection,
  type ProjectionStatus,
  type SourceBlock,
  type SourceBlockKind,
} from "../editor/block-projection.ts";
import {
  createSourcePatch,
  type SourcePatch,
} from "../editor/source-ranges.ts";
import type { MetadataValue } from "./frontmatter.ts";
import type { YeliAsset } from "./model.ts";
import {
  applyDocumentTransaction,
  createDocumentReplacement,
  type DocumentTransaction,
  type DocumentTransactionResult,
} from "./transactions.ts";

export type ProjectionScheduler = (job: () => void) => void;

export type DocumentMutationBlockKind = SourceBlockKind | "image";

export interface DocumentMutation {
  blockKinds: DocumentMutationBlockKind[];
  operation: string;
}

export interface DocumentSnapshot {
  assets: readonly YeliAsset[];
  canRedo: boolean;
  canUndo: boolean;
  dirty: boolean;
  lastMutation: DocumentMutation | null;
  mode: BlockProjection["mode"];
  primaryMode: BlockProjection["primaryMode"];
  projection: BlockProjection;
  projectionStatus: ProjectionStatus;
  revision: number;
  source: string;
  sourceHash: string;
}

const defaultScheduler: ProjectionScheduler = (job) => queueMicrotask(job);

function sameBlockContent(left: SourceBlock, right: SourceBlock): boolean {
  return left.kind === right.kind && left.expectedText === right.expectedText;
}

function retainUnchangedBlockIds(
  previous: readonly SourceBlock[],
  next: readonly SourceBlock[],
): SourceBlock[] {
  const output = next.map((block) => ({
    ...block,
    id: `${block.revision}:${block.id}`,
  }));
  let prefix = 0;
  while (
    prefix < previous.length &&
    prefix < next.length &&
    sameBlockContent(previous[prefix]!, next[prefix]!)
  ) {
    output[prefix] = { ...next[prefix]!, id: previous[prefix]!.id };
    prefix += 1;
  }
  let previousSuffix = previous.length - 1;
  let nextSuffix = next.length - 1;
  while (
    previousSuffix >= prefix &&
    nextSuffix >= prefix &&
    sameBlockContent(previous[previousSuffix]!, next[nextSuffix]!)
  ) {
    output[nextSuffix] = {
      ...next[nextSuffix]!,
      id: previous[previousSuffix]!.id,
    };
    previousSuffix -= 1;
    nextSuffix -= 1;
  }
  return output;
}

export class DocumentStore {
  readonly #listeners = new Set<() => void>();
  readonly #schedule: ProjectionScheduler;
  #projectionJob = 0;
  #redo: DocumentTransaction[] = [];
  #snapshot: DocumentSnapshot;
  #undo: DocumentTransaction[] = [];

  constructor(source: string, revision?: number);
  constructor(source: string, revision: number, schedule: ProjectionScheduler);
  constructor(
    source: string,
    revision: number,
    assets: readonly YeliAsset[],
    schedule?: ProjectionScheduler,
  );
  constructor(
    source: string,
    revision = 1,
    assetsOrSchedule: readonly YeliAsset[] | ProjectionScheduler = [],
    schedule: ProjectionScheduler = defaultScheduler,
  ) {
    const assets =
      typeof assetsOrSchedule === "function" ? [] : [...assetsOrSchedule];
    const projection = projectMarkdown(source, revision);
    this.#schedule =
      typeof assetsOrSchedule === "function" ? assetsOrSchedule : schedule;
    this.#snapshot = {
      assets,
      canRedo: false,
      canUndo: false,
      dirty: false,
      lastMutation: null,
      mode: projection.mode,
      primaryMode: projection.primaryMode,
      projection,
      projectionStatus: projection.status,
      revision,
      source,
      sourceHash: projection.sourceHash,
    };
  }

  getSnapshot = (): DocumentSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  setPrimaryMode(mode: "edit" | "read"): void {
    const projection = transitionProjection(this.#snapshot.projection, mode);
    this.#publish({
      ...this.#snapshot,
      mode: projection.mode,
      primaryMode: projection.primaryMode,
      projection,
    });
  }

  openAdvancedSource(): void {
    const projection = transitionProjection(
      this.#snapshot.projection,
      "advanced-source-open",
    );
    this.#publish({ ...this.#snapshot, mode: projection.mode, projection });
  }

  closeAdvancedSource(): void {
    const projection = transitionProjection(
      this.#snapshot.projection,
      "advanced-source-close",
    );
    this.#publish({ ...this.#snapshot, mode: projection.mode, projection });
  }

  applyTransaction(
    transaction: DocumentTransaction,
  ): DocumentTransactionResult {
    const result = applyDocumentTransaction(this.#snapshot, transaction);
    if (!result.ok) return result;
    this.#undo.push(result.inverse);
    this.#redo = [];
    this.#acceptTransactionResult(result);
    return result;
  }

  applyPatch(patch: SourcePatch): DocumentTransactionResult {
    return this.applyTransaction({
      expectedRevision: patch.revision,
      expectedSourceHash: patch.sourceHash,
      operation: patch.operation,
      patches: [patch],
    });
  }

  replaceDocument(
    source: string,
    assets: readonly YeliAsset[],
    operation = "replace-document",
  ): DocumentTransactionResult | null {
    const transaction = createDocumentReplacement(
      this.#snapshot,
      source,
      assets,
      operation,
    );
    if (transaction.patches.length === 0 && !transaction.assetDelta)
      return null;
    return this.applyTransaction(transaction);
  }

  replaceSource(
    source: string,
    operation = "replace-source",
  ): DocumentTransactionResult | null {
    if (source === this.#snapshot.source) return null;
    const patch = createSourcePatch(
      {
        expectedText: this.#snapshot.source,
        id: "document",
        range: { from: 0, to: this.#snapshot.source.length },
        revision: this.#snapshot.revision,
        sourceHash: this.#snapshot.sourceHash,
      },
      source,
      operation,
    );
    return this.applyPatch(patch);
  }

  patchMetadata(
    key: string,
    value: MetadataValue | undefined,
  ): DocumentTransactionResult {
    const currentProjection = projectMarkdown(
      this.#snapshot.source,
      this.#snapshot.revision,
    );
    return this.applyPatch(
      createFrontmatterPropertyPatch(currentProjection, key, value),
    );
  }

  appendMarkdown(
    markdown: string,
    operation = "append-markdown",
  ): DocumentTransactionResult {
    const separator =
      this.#snapshot.source.length === 0 || this.#snapshot.source.endsWith("\n")
        ? ""
        : "\n";
    const insert = `${separator}${markdown}`;
    const offset = this.#snapshot.source.length;
    return this.applyPatch(
      createSourcePatch(
        {
          expectedText: "",
          id: "document:end",
          range: { from: offset, to: offset },
          revision: this.#snapshot.revision,
          sourceHash: this.#snapshot.sourceHash,
        },
        insert,
        operation,
      ),
    );
  }

  undo(): DocumentTransactionResult | null {
    const transaction = this.#undo.pop();
    if (!transaction) return null;
    const result = this.#applyHistoryTransaction(transaction);
    if (!result.ok) {
      this.#undo.push(transaction);
      return result;
    }
    this.#redo.push(result.inverse);
    this.#acceptTransactionResult(result);
    return result;
  }

  redo(): DocumentTransactionResult | null {
    const transaction = this.#redo.pop();
    if (!transaction) return null;
    const result = this.#applyHistoryTransaction(transaction);
    if (!result.ok) {
      this.#redo.push(transaction);
      return result;
    }
    this.#undo.push(result.inverse);
    this.#acceptTransactionResult(result);
    return result;
  }

  markClean(): void {
    this.#publish({ ...this.#snapshot, dirty: false });
  }

  loadSource(
    source: string,
    revision: number,
    assets: readonly YeliAsset[] = [],
  ): void {
    this.#projectionJob += 1;
    this.#undo = [];
    this.#redo = [];
    const projection = projectMarkdown(source, revision);
    this.#publish({
      assets: [...assets],
      canRedo: false,
      canUndo: false,
      dirty: false,
      lastMutation: null,
      mode: projection.mode,
      primaryMode: projection.primaryMode,
      projection,
      projectionStatus: projection.status,
      revision,
      source,
      sourceHash: projection.sourceHash,
    });
  }

  #applyHistoryTransaction(
    transaction: DocumentTransaction,
  ): DocumentTransactionResult {
    // Validate the original binding before rebasing store-owned history.
    for (const patch of transaction.patches) {
      if (
        patch.revision !== transaction.expectedRevision ||
        patch.sourceHash !== transaction.expectedSourceHash
      ) {
        return {
          assets: this.#snapshot.assets,
          code:
            patch.revision !== transaction.expectedRevision
              ? "STALE_REVISION"
              : "STALE_SOURCE_HASH",
          ok: false,
          source: this.#snapshot.source,
        };
      }
    }
    return applyDocumentTransaction(this.#snapshot, {
      ...transaction,
      expectedRevision: this.#snapshot.revision,
      patches: transaction.patches.map((patch) => ({
        ...patch,
        revision: this.#snapshot.revision,
      })),
    });
  }

  #acceptTransactionResult(
    result: Extract<DocumentTransactionResult, { ok: true }>,
  ): void {
    const blockKinds: DocumentMutationBlockKind[] = [
      ...new Set(
        this.#snapshot.projection.blocks
          .filter((block) =>
            result.changedRanges.some(({ before }) =>
              before.from === before.to
                ? block.range.from <= before.from && block.range.to >= before.to
                : block.range.from < before.to && block.range.to > before.from,
            ),
          )
          .map((block) => block.kind),
      ),
    ];
    if (
      result.assetChanges.added.length > 0 ||
      result.assetChanges.removed.length > 0 ||
      result.assetChanges.replaced.length > 0
    ) {
      blockKinds.push("image");
    }
    const job = (this.#projectionJob += 1);
    const pendingProjection: BlockProjection = {
      ...this.#snapshot.projection,
      revision: result.revision,
      source: result.source,
      sourceHash: result.sourceHash,
      status: "pending",
    };
    this.#publish({
      ...this.#snapshot,
      assets: result.assets,
      canRedo: this.#redo.length > 0,
      canUndo: this.#undo.length > 0,
      dirty: true,
      lastMutation: {
        blockKinds: [...new Set(blockKinds)],
        operation: result.operation,
      },
      projection: pendingProjection,
      projectionStatus: "pending",
      revision: result.revision,
      source: result.source,
      sourceHash: result.sourceHash,
    });

    const source = result.source;
    const revision = result.revision;
    this.#schedule(() => {
      if (job !== this.#projectionJob || this.#snapshot.revision !== revision) {
        return;
      }
      try {
        const next = projectMarkdown(source, revision);
        const projection: BlockProjection = {
          ...next,
          blocks: retainUnchangedBlockIds(
            this.#snapshot.projection.blocks,
            next.blocks,
          ),
          mode: this.#snapshot.mode,
          primaryMode: this.#snapshot.primaryMode,
        };
        this.#publish({
          ...this.#snapshot,
          projection,
          projectionStatus: projection.status,
        });
      } catch {
        this.#publish({
          ...this.#snapshot,
          projection: { ...this.#snapshot.projection, status: "blocked" },
          projectionStatus: "blocked",
        });
      }
    });
  }

  #publish(snapshot: DocumentSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
}
