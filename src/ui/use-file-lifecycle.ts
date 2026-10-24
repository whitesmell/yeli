import { useCallback, useEffect, useRef, useState } from "react";

import { sha256Bytes } from "../document/freshness.ts";
import { indexFrontmatter } from "../document/frontmatter.ts";
import {
  createDocumentPayload,
  decodeMarkdown,
  type YeliAsset,
} from "../document/model.ts";
import type { SourcePatch } from "../editor/source-ranges.ts";
import { createAssetDeltaForPatch } from "../document/transactions.ts";
import { DEFAULT_FORMAT_BUDGETS } from "../document/schema.ts";
import type { DocumentSnapshot, DocumentStore } from "../document/store.ts";
import { createMarkdownExport } from "../export/markdown.ts";
import { printStaticHtml } from "../export/print.ts";
import {
  createFreshOpenedDocument,
  openYeliArtifact,
  type OpenedYeliDocument,
  type OpenEmbeddedResult,
} from "../format/open.ts";
import {
  createSavedArtifact,
  downloadText,
  safeDocumentFilename,
  type SavedArtifactResult,
} from "../format/save.ts";
import {
  createStaticHtmlExport,
  type StaticHtmlExport,
} from "../format/static-preview.ts";
import { measureTransportProfiles } from "../format/assets.ts";
import type { Labels } from "../i18n/en.ts";
import {
  writeArtifactToHandle,
  type FileHandleLike,
} from "../storage/file-handles.ts";
import {
  IndexedDbStorageAdapter,
  LocalDocumentRepository,
  MemoryStorageAdapter,
  type LocalInstance,
  type RecoverySnapshot,
  type StoredVersion,
  type VersionSnapshot,
} from "../storage/recovery.ts";
import { persistentRecoveryAllowed } from "../storage/recovery-policy.ts";

interface LifecycleOptions {
  initialResult: OpenEmbeddedResult;
  labels: Labels;
  notify: (message: string) => void;
  snapshot: DocumentSnapshot;
  store: DocumentStore;
}

interface PickerWindow extends Window {
  showOpenFilePicker?: (options?: unknown) => Promise<FileHandleLike[]>;
}

interface InvalidFileRequest {
  error: string;
  filename: string;
  recovery: NonNullable<Extract<OpenEmbeddedResult, { ok: false }>["recovery"]>;
  releaseTemplate?: string;
}

interface ReconnectRequest {
  candidates: LocalInstance[];
  opened: OpenedYeliDocument;
  reason: "open" | "save";
}

const EDITABLE_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

export interface SaveDisclosure {
  currentBytes: number | null;
  currentFileFits: boolean | null;
  documentFingerprint: string | null;
  projectedBytes: number | null;
  projectedFileFits: boolean | null;
  sourceHash: string;
}

export type SaveStatus = "error" | "idle" | "saving";

function newDocId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `yeli-${Date.now()}`;
}

function currentFilename(): string {
  const segment = globalThis.location?.pathname.split("/").at(-1);
  return segment ? decodeURIComponent(segment) : "document.yeli.html";
}

function fitsLocalFileBudget(bytes: number): boolean {
  const [profile] = measureTransportProfiles(bytes, [
    {
      maxBytes: DEFAULT_FORMAT_BUDGETS.maxFileBytes,
      name: "local-yeli-file",
    },
  ]).profiles;
  return profile?.fits ?? false;
}

function repositoryForEnvironment(): LocalDocumentRepository {
  const storage = !persistentRecoveryAllowed()
    ? new MemoryStorageAdapter()
    : new IndexedDbStorageAdapter();
  return new LocalDocumentRepository(storage, { versionLimit: 30 });
}

export function versionSnapshotForOpenedDocument(
  opened: OpenedYeliDocument,
  reason: "open" | "save",
): VersionSnapshot {
  const summary = opened.freshness.agentSummary;
  const change =
    summary.status === "fresh"
      ? {
          actorLabel: summary.value.updatedBy,
          origin: "external-agent" as const,
          ...(summary.value.changeSummary?.trim()
            ? { summary: summary.value.changeSummary.trim() }
            : {}),
        }
      : { origin: "system" as const };
  return {
    assets: opened.payload.assets,
    change,
    reason,
    revision: opened.payload.revision,
    source: opened.markdown,
    sourceHash: opened.freshness.sourceHash,
  };
}

interface RefreshHistoryPanelOptions {
  listVersions: (localInstanceId: string) => Promise<StoredVersion[]>;
  localInstanceId: string | null;
  onFailure: () => void;
  onOpen: () => void;
  onVersions: (versions: StoredVersion[]) => void;
}

export async function refreshHistoryPanel({
  listVersions,
  localInstanceId,
  onFailure,
  onOpen,
  onVersions,
}: RefreshHistoryPanelOptions): Promise<void> {
  onOpen();
  if (!localInstanceId) return;
  try {
    onVersions(await listVersions(localInstanceId));
  } catch {
    onFailure();
  }
}

export function useFileLifecycle({
  initialResult,
  labels,
  notify,
  snapshot,
  store,
}: LifecycleOptions) {
  const initialDocument = initialResult.ok ? initialResult.document : undefined;
  const [document, setDocument] = useState<OpenedYeliDocument | undefined>(
    initialDocument,
  );
  const [fileName, setFileName] = useState(currentFilename);
  const [fileHandle, setFileHandle] = useState<FileHandleLike | null>(null);
  const [conflict, setConflict] = useState<SavedArtifactResult | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<StoredVersion[]>([]);
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null);
  const [reconnect, setReconnect] = useState<ReconnectRequest | null>(null);
  const [invalidFile, setInvalidFile] = useState<InvalidFileRequest | null>(
    !initialResult.ok && initialResult.recovery
      ? {
          error: initialResult.error,
          filename: currentFilename(),
          recovery: {
            ...initialResult.recovery,
            recovery: {
              ...initialResult.recovery.recovery,
              originalBytes:
                initialResult.releaseTemplate ??
                initialResult.recovery.recovery.originalBytes,
            },
          },
          ...(initialResult.releaseTemplate
            ? { releaseTemplate: initialResult.releaseTemplate }
            : {}),
        }
      : null,
  );
  const [exportPreview, setExportPreview] = useState<StaticHtmlExport | null>(
    null,
  );
  const [saveDisclosure, setSaveDisclosure] = useState<SaveDisclosure | null>(
    null,
  );
  const [saveDisclosureLoading, setSaveDisclosureLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [recoveryAvailable, setRecoveryAvailable] = useState(() =>
    persistentRecoveryAllowed(),
  );
  const repositoryRef = useRef(repositoryForEnvironment());
  const launchReleaseTemplateRef = useRef(
    initialResult.ok
      ? initialResult.document.releaseTemplate
      : (initialResult.releaseTemplate ?? ""),
  );
  const [localInstanceId, setLocalInstanceId] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);
  const recoveryWarningRef = useRef(false);
  const artifactSizeRef = useRef<{
    bytes: number;
    fingerprint: string;
  } | null>(
    initialDocument
      ? {
          bytes: new TextEncoder().encode(initialDocument.artifact).byteLength,
          fingerprint: initialDocument.fingerprint,
        }
      : null,
  );

  const degradeRecovery = useCallback(() => {
    setRecoveryAvailable(false);
    setLocalInstanceId(null);
    setRecovery(null);
    setVersions([]);
    if (!recoveryWarningRef.current) {
      recoveryWarningRef.current = true;
      notify(labels.recoveryUnavailable);
    }
  }, [labels.recoveryUnavailable, notify]);

  useEffect(() => {
    if (recoveryAvailable || recoveryWarningRef.current) return;
    recoveryWarningRef.current = true;
    // Recovery can be unavailable before the first file event, so surface the
    // degradation at boot rather than waiting for a silent storage failure.
    notify(labels.recoveryUnavailable);
  }, [labels.recoveryUnavailable, notify, recoveryAvailable]);

  const activateLocalInstance = useCallback(
    async (
      opened: OpenedYeliDocument,
      instance: LocalInstance,
      reason: "open" | "save",
      revealRecovery: boolean,
    ) => {
      const repository = repositoryRef.current;
      setLocalInstanceId(instance.localInstanceId);
      const candidate = revealRecovery
        ? await repository.getRecovery(instance.localInstanceId)
        : null;
      if (
        candidate &&
        candidate.sourceHash !== opened.freshness.sourceHash &&
        candidate.updatedAt !== undefined
      ) {
        setRecovery(candidate);
      } else {
        setRecovery(null);
      }
      await repository.recordVersion(
        instance.localInstanceId,
        versionSnapshotForOpenedDocument(opened, reason),
      );
      setVersions(await repository.listVersions(instance.localInstanceId));
    },
    [],
  );

  const attachLocalInstance = useCallback(
    async (opened: OpenedYeliDocument, reason: "open" | "save" = "open") => {
      if (!recoveryAvailable) {
        setLocalInstanceId(null);
        return;
      }
      try {
        const repository = repositoryRef.current;
        const matches = await repository.findByFingerprint(opened.fingerprint);
        if (matches.length > 0) {
          setLocalInstanceId(null);
          setRecovery(null);
          setVersions([]);
          setReconnect({ candidates: matches, opened, reason });
          return;
        }
        const instance = await repository.createInstance(
          opened.payload.docId,
          opened.fingerprint,
        );
        await activateLocalInstance(opened, instance, reason, false);
      } catch {
        degradeRecovery();
      }
    },
    [activateLocalInstance, degradeRecovery, recoveryAvailable],
  );

  useEffect(() => {
    if (!initialDocument || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void attachLocalInstance(initialDocument);
  }, [attachLocalInstance, initialDocument]);

  useEffect(() => {
    if (!snapshot.dirty || !localInstanceId || !recoveryAvailable) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const repository = repositoryRef.current;
          await repository.saveRecovery(localInstanceId, {
            assets: [...snapshot.assets],
            revision: snapshot.revision,
            source: snapshot.source,
            sourceHash: snapshot.sourceHash,
          });
          await repository.recordVersion(localInstanceId, {
            assets: [...snapshot.assets],
            change: {
              blockKinds: snapshot.lastMutation?.blockKinds ?? [],
              ...(snapshot.lastMutation?.operation
                ? { operation: snapshot.lastMutation.operation }
                : {}),
              origin: "yeli-editor",
            },
            reason: "edit",
            revision: snapshot.revision,
            source: snapshot.source,
            sourceHash: snapshot.sourceHash,
          });
          const latest = await repository.listVersions(localInstanceId);
          if (!cancelled) setVersions(latest);
        } catch {
          if (!cancelled) degradeRecovery();
        }
      })();
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    degradeRecovery,
    localInstanceId,
    recoveryAvailable,
    snapshot.dirty,
    snapshot.lastMutation,
    snapshot.revision,
    snapshot.source,
    snapshot.sourceHash,
    snapshot.assets,
  ]);

  const openFile = async (file: File, handle: FileHandleLike | null = null) => {
    try {
      const content = await file.text();
      if (/\.md$/iu.test(file.name) && !/\.yeli\.html$/iu.test(file.name)) {
        const payload = await createDocumentPayload(content, {
          docId: newDocId(),
          revision: 1,
          subtle: null,
        });
        const opened = createFreshOpenedDocument({
          artifact: content,
          artifactKind: "markdown",
          fingerprint: payload.manifest.sourceHash,
          markdown: content,
          payload,
          releaseTemplate: launchReleaseTemplateRef.current,
        });
        setDocument(opened);
        setFileName(file.name);
        setFileHandle(null);
        setInvalidFile(null);
        setSaveStatus("idle");
        store.loadSource(content, 1, []);
        await attachLocalInstance(opened);
        notify(labels.fileOpened);
        return;
      }
      const result = await openYeliArtifact(content, content);
      if (!result.ok) {
        if (result.recovery) {
          setInvalidFile({
            error: result.error,
            filename: file.name,
            recovery: {
              ...result.recovery,
              recovery: {
                ...result.recovery.recovery,
                originalBytes: content,
              },
            },
            ...(result.releaseTemplate
              ? { releaseTemplate: result.releaseTemplate }
              : {}),
          });
        } else {
          notify(labels.fileInvalid);
        }
        return;
      }
      setDocument(result.document);
      artifactSizeRef.current = {
        bytes: new TextEncoder().encode(content).byteLength,
        fingerprint: result.document.fingerprint,
      };
      setFileName(file.name);
      setFileHandle(handle);
      setInvalidFile(null);
      setSaveStatus("idle");
      store.loadSource(
        result.document.markdown,
        result.document.payload.revision,
        result.document.payload.assets,
      );
      await attachLocalInstance(result.document);
      notify(labels.fileOpened);
    } catch {
      notify(labels.fileOpenFailed);
    }
  };

  const chooseFile = async (fallback: () => void) => {
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (!picker) {
      fallback();
      return;
    }
    try {
      const [handle] = await picker({
        excludeAcceptAllOption: false,
        multiple: false,
        types: [
          {
            accept: {
              "text/html": [".yeli.html", ".html"],
              "text/markdown": [".md"],
            },
            description: "Yeli / Markdown",
          },
        ],
      });
      if (!handle) return;
      const file = await handle.getFile();
      await openFile(file as File, handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify(labels.fileOpenFailed);
    }
  };

  const embedImage = async (
    file: File,
    createPatch: (destination: string) => SourcePatch,
  ): Promise<boolean> => {
    if (!document || !EDITABLE_IMAGE_TYPES.has(file.type)) {
      notify(labels.imageUnsupported);
      return false;
    }
    if (file.size > DEFAULT_FORMAT_BUDGETS.maxDecodedAssetBytes) {
      notify(labels.imageTooLarge);
      return false;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const asset: YeliAsset = {
        data: encodeBase64(bytes),
        id: `sha256:${await sha256Bytes(bytes)}`,
        mimeType: file.type,
      };
      const patch = createPatch(`yeli-asset:${asset.id}`);
      const upsert = snapshot.assets.some(
        (candidate) => candidate.id === asset.id,
      )
        ? []
        : [asset];
      const replacedAssetId = patch.expectedText.startsWith("yeli-asset:")
        ? patch.expectedText.slice("yeli-asset:".length)
        : undefined;
      const assetDelta = createAssetDeltaForPatch(snapshot, patch, {
        ...(replacedAssetId ? { pruneAssetIds: [replacedAssetId] } : {}),
        upsert,
      });
      const result = store.applyTransaction({
        ...(assetDelta ? { assetDelta } : {}),
        expectedRevision: patch.revision,
        expectedSourceHash: patch.sourceHash,
        operation: patch.operation,
        patches: [patch],
      });
      if (!result.ok) {
        const budgetFailure = result.findings?.some(
          (finding) =>
            finding.code.includes("BUDGET") ||
            finding.code.includes("TOO_LARGE"),
        );
        notify(budgetFailure ? labels.imageTooLarge : labels.imageUnsupported);
        return false;
      }
      notify(labels.imageEmbedded);
      return true;
    } catch {
      notify(labels.imageUnsupported);
      return false;
    }
  };

  const buildCurrentPayload = async () => {
    const payload = document?.payload;
    return createDocumentPayload(snapshot.source, {
      ...(payload?.agentSummary ? { agentSummary: payload.agentSummary } : {}),
      assets: [...snapshot.assets],
      docId: payload?.docId ?? newDocId(),
      revision: snapshot.revision,
      settings: payload?.settings ?? {},
      subtle: null,
    });
  };

  const buildCurrentArtifact = async () => {
    if (!document?.releaseTemplate) return null;
    return createSavedArtifact({
      payload: { ...document.payload, assets: [...snapshot.assets] },
      releaseTemplate: document.releaseTemplate,
      revision: snapshot.revision,
      source: snapshot.source,
    });
  };

  const prepareSaveDisclosure = async () => {
    setSaveDisclosureLoading(true);
    try {
      const result = await buildCurrentArtifact();
      if (!result) {
        setSaveDisclosure(null);
        return;
      }
      const hasCurrentYeli = document?.artifactKind === "yeli";
      const cachedArtifactSize = artifactSizeRef.current;
      const currentBytes =
        hasCurrentYeli &&
        cachedArtifactSize?.fingerprint === document.fingerprint
          ? cachedArtifactSize.bytes
          : hasCurrentYeli
            ? new TextEncoder().encode(document.artifact).byteLength
            : null;
      if (
        hasCurrentYeli &&
        currentBytes !== null &&
        cachedArtifactSize?.fingerprint !== document.fingerprint
      ) {
        artifactSizeRef.current = {
          bytes: currentBytes,
          fingerprint: document.fingerprint,
        };
      }
      const projectedBytes =
        !hasCurrentYeli || snapshot.dirty ? result.bytes : null;
      setSaveDisclosure({
        currentBytes,
        currentFileFits:
          currentBytes === null ? null : fitsLocalFileBudget(currentBytes),
        documentFingerprint: document?.fingerprint ?? null,
        projectedBytes,
        projectedFileFits:
          projectedBytes === null ? null : fitsLocalFileBudget(projectedBytes),
        sourceHash: snapshot.sourceHash,
      });
    } catch {
      setSaveDisclosure(null);
      notify(labels.aboutFileSizeUnavailable);
    } finally {
      setSaveDisclosureLoading(false);
    }
  };

  const completeDirectSave = async (
    result: SavedArtifactResult,
    fingerprint: string,
  ) => {
    const source = decodeMarkdown(result.payload.markdown);
    const nextDocument = createFreshOpenedDocument({
      artifact: result.artifact,
      artifactKind: "yeli",
      fingerprint,
      markdown: source,
      payload: result.payload,
      releaseTemplate: document!.releaseTemplate,
    });
    setDocument(nextDocument);
    artifactSizeRef.current = {
      bytes: result.bytes,
      fingerprint,
    };
    if (store.getSnapshot().sourceHash === result.payload.manifest.sourceHash) {
      store.markClean();
    }
    if (localInstanceId) {
      try {
        await repositoryRef.current.updateFingerprint(
          localInstanceId,
          fingerprint,
        );
        await repositoryRef.current.discardRecovery(localInstanceId);
        await repositoryRef.current.recordVersion(localInstanceId, {
          assets: result.payload.assets,
          change: {
            blockKinds: snapshot.lastMutation?.blockKinds ?? [],
            ...(snapshot.lastMutation?.operation
              ? { operation: snapshot.lastMutation.operation }
              : {}),
            origin: "yeli-editor",
          },
          reason: "save",
          revision: result.payload.revision,
          source,
          sourceHash: result.payload.manifest.sourceHash,
        });
      } catch {
        degradeRecovery();
      }
    }
    setConflict(null);
    notify(labels.saveComplete);
  };

  const downloadCopy = async (result: SavedArtifactResult) => {
    downloadText(
      result.artifact,
      safeDocumentFilename(
        result.payload.manifest.metadata.title,
        ".yeli.html",
      ),
      "text/html;charset=utf-8",
    );
    setFileHandle(null);
    const source = decodeMarkdown(result.payload.markdown);
    setDocument(
      createFreshOpenedDocument({
        artifact: result.artifact,
        artifactKind: "yeli",
        fingerprint: result.fingerprint,
        markdown: source,
        payload: result.payload,
        releaseTemplate: document!.releaseTemplate,
      }),
    );
    if (recoveryAvailable) {
      try {
        const repository = repositoryRef.current;
        const fork = localInstanceId
          ? await repository.forkInstance(localInstanceId, result.fingerprint)
          : await repository.createInstance(
              result.payload.docId,
              result.fingerprint,
            );
        setLocalInstanceId(fork.localInstanceId);
        await repository.saveRecovery(fork.localInstanceId, {
          assets: result.payload.assets,
          revision: result.payload.revision,
          source,
          sourceHash: result.payload.manifest.sourceHash,
        });
        await repository.recordVersion(fork.localInstanceId, {
          assets: result.payload.assets,
          change: {
            blockKinds: snapshot.lastMutation?.blockKinds ?? [],
            ...(snapshot.lastMutation?.operation
              ? { operation: snapshot.lastMutation.operation }
              : {}),
            origin: "yeli-editor",
          },
          reason: "save",
          revision: result.payload.revision,
          source,
          sourceHash: result.payload.manifest.sourceHash,
        });
        setVersions(await repository.listVersions(fork.localInstanceId));
      } catch {
        degradeRecovery();
      }
    }
    setConflict(null);
    notify(labels.saveDownloaded);
  };

  const save = async (copy = false) => {
    setSaveStatus("saving");
    try {
      const result = await buildCurrentArtifact();
      if (!result) {
        setSaveStatus("error");
        notify(labels.saveUnavailable);
        return;
      }
      if (!copy && fileHandle) {
        const written = await writeArtifactToHandle(
          fileHandle,
          result.artifact,
          document!.fingerprint,
        );
        if (!written.ok) {
          setSaveStatus("error");
          if (written.reason === "external-conflict") {
            setConflict(result);
          } else {
            notify(
              written.reason === "permission-denied"
                ? labels.savePermissionDenied
                : labels.saveWriteFailed,
            );
          }
          return;
        }
        await completeDirectSave(result, written.fingerprint);
        setSaveStatus("idle");
        return;
      }
      await downloadCopy(result);
      setSaveStatus("idle");
    } catch {
      setSaveStatus("error");
      notify(labels.saveFailedNotice);
    }
  };

  const confirmOverwrite = async () => {
    if (!conflict || !fileHandle || !document) return;
    setSaveStatus("saving");
    try {
      const written = await writeArtifactToHandle(
        fileHandle,
        conflict.artifact,
        document.fingerprint,
        true,
      );
      if (!written.ok) {
        setSaveStatus("error");
        notify(
          written.reason === "permission-denied"
            ? labels.savePermissionDenied
            : labels.saveWriteFailed,
        );
        return;
      }
      await completeDirectSave(conflict, written.fingerprint);
      setSaveStatus("idle");
    } catch {
      setSaveStatus("error");
      notify(labels.saveWriteFailed);
    }
  };

  const reloadExternal = async () => {
    if (!fileHandle) return;
    try {
      const file = await fileHandle.getFile();
      setConflict(null);
      await openFile(file as File, fileHandle);
    } catch {
      notify(labels.fileOpenFailed);
    }
  };

  const saveConflictCopy = async () => {
    if (!conflict) return;
    setSaveStatus("saving");
    try {
      await downloadCopy(conflict);
      setSaveStatus("idle");
    } catch {
      setSaveStatus("error");
      notify(labels.saveFailedNotice);
    }
  };

  const exportMarkdown = () => {
    const output = createMarkdownExport(
      snapshot.source,
      indexFrontmatter(snapshot.source).metadata.title,
    );
    downloadText(
      output.content,
      output.filename,
      "text/markdown;charset=utf-8",
    );
  };

  const generateStaticExport = async () => {
    try {
      const payload = await buildCurrentPayload();
      setExportPreview(
        createStaticHtmlExport(payload, snapshot.source, labels),
      );
    } catch {
      notify(labels.exportFailed);
    }
  };

  const downloadStaticExport = () => {
    if (!exportPreview) return;
    downloadText(
      exportPreview.html,
      exportPreview.filename,
      "text/html;charset=utf-8",
    );
  };

  const print = async () => {
    try {
      const payload = await buildCurrentPayload();
      printStaticHtml(
        createStaticHtmlExport(payload, snapshot.source, labels).html,
      );
    } catch {
      notify(labels.printFailed);
    }
  };

  const openHistory = async () => {
    await refreshHistoryPanel({
      listVersions: (instanceId) =>
        repositoryRef.current.listVersions(instanceId),
      localInstanceId,
      onFailure: degradeRecovery,
      onOpen: () => setHistoryOpen(true),
      onVersions: setVersions,
    });
  };

  const recordRestore = async () => {
    if (!localInstanceId || !recoveryAvailable) return;
    const current = store.getSnapshot();
    try {
      await repositoryRef.current.recordVersion(localInstanceId, {
        assets: [...current.assets],
        change: {
          blockKinds: current.lastMutation?.blockKinds ?? [],
          operation: "history:restore",
          origin: "yeli-editor",
        },
        reason: "restore",
        revision: current.revision,
        source: current.source,
        sourceHash: current.sourceHash,
      });
    } catch {
      degradeRecovery();
    }
  };

  const restoreVersion = async (
    version: StoredVersion,
    expected: { revision: number; sourceHash: string },
  ): Promise<boolean> => {
    let current = store.getSnapshot();
    if (
      current.revision !== expected.revision ||
      current.sourceHash !== expected.sourceHash
    ) {
      notify(labels.historyStale);
      return false;
    }
    let available = version;
    if (localInstanceId) {
      try {
        const repository = repositoryRef.current;
        const latest = await repository.listVersions(localInstanceId);
        setVersions(latest);
        const found = latest.find((candidate) => candidate.id === version.id);
        if (!found) {
          notify(labels.historyUnavailable);
          return false;
        }
        available = found;
      } catch {
        degradeRecovery();
        return false;
      }
    }
    current = store.getSnapshot();
    if (
      current.revision !== expected.revision ||
      current.sourceHash !== expected.sourceHash
    ) {
      notify(labels.historyStale);
      return false;
    }
    const result = store.replaceDocument(
      available.source,
      available.assets ?? current.assets,
      "history:restore",
    );
    if (!result?.ok) {
      notify(
        result?.code === "STALE_REVISION" ||
          result?.code === "STALE_SOURCE_HASH"
          ? labels.historyStale
          : labels.historyRestoreRejected,
      );
      return false;
    }
    setHistoryOpen(false);
    void recordRestore();
    return true;
  };

  const restoreRecovery = () => {
    if (!recovery) return;
    const result = store.replaceDocument(
      recovery.source,
      recovery.assets ?? snapshot.assets,
      "recovery:restore",
    );
    if (result && !result.ok) {
      notify(labels.recoveryRestoreRejected);
      return;
    }
    setRecovery(null);
    if (result?.ok) void recordRestore();
  };

  const discardRecovery = async () => {
    if (localInstanceId) {
      try {
        await repositoryRef.current.discardRecovery(localInstanceId);
      } catch {
        degradeRecovery();
      }
    }
    setRecovery(null);
  };

  const reconnectPrevious = async () => {
    if (!reconnect) return;
    const request = reconnect;
    setReconnect(null);
    try {
      await activateLocalInstance(
        request.opened,
        request.candidates[0]!,
        request.reason,
        true,
      );
    } catch {
      degradeRecovery();
    }
  };

  const keepSeparate = async () => {
    if (!reconnect) return;
    const request = reconnect;
    setReconnect(null);
    try {
      const instance = await repositoryRef.current.createInstance(
        request.opened.payload.docId,
        request.opened.fingerprint,
      );
      await activateLocalInstance(
        request.opened,
        instance,
        request.reason,
        false,
      );
    } catch {
      degradeRecovery();
    }
  };

  const downloadInvalidOriginal = () => {
    if (!invalidFile) return;
    downloadText(
      invalidFile.recovery.recovery.originalBytes,
      invalidFile.filename,
      "text/html;charset=utf-8",
    );
  };

  const recoverInvalidMarkdown = async () => {
    const source = invalidFile?.recovery.recovery.extractableMarkdown;
    if (source === undefined || !invalidFile) return;
    try {
      const payload = await createDocumentPayload(source, {
        docId: newDocId(),
        revision: 1,
        subtle: null,
      });
      const opened = createFreshOpenedDocument({
        artifact: source,
        artifactKind: "markdown",
        fingerprint: payload.manifest.sourceHash,
        markdown: source,
        payload,
        releaseTemplate:
          invalidFile.releaseTemplate ?? document?.releaseTemplate ?? "",
      });
      setDocument(opened);
      setFileName(invalidFile.filename);
      setFileHandle(null);
      setInvalidFile(null);
      setSaveStatus("idle");
      store.loadSource(source, 1, []);
      if (recoveryAvailable) {
        const instance = await repositoryRef.current.createInstance(
          opened.payload.docId,
          opened.fingerprint,
        );
        await activateLocalInstance(opened, instance, "open", false);
      }
      notify(labels.fileOpened);
    } catch {
      notify(labels.fileOpenFailed);
    }
  };

  return {
    canDirectSave: fileHandle !== null,
    chooseFile,
    conflict,
    confirmOverwrite,
    discardRecovery,
    document,
    downloadInvalidOriginal,
    downloadStaticExport,
    exportMarkdown,
    exportPreview,
    fileName,
    embedImage,
    generateStaticExport,
    historyOpen,
    invalidFile,
    keepSeparate,
    openFile,
    openHistory,
    print,
    prepareSaveDisclosure,
    reconnect,
    reconnectPrevious,
    recovery,
    recoveryAvailable,
    recoverInvalidMarkdown,
    reloadExternal,
    restoreRecovery,
    restoreVersion,
    save,
    saveConflictCopy,
    saveDisclosure:
      saveDisclosure?.sourceHash === snapshot.sourceHash &&
      saveDisclosure.documentFingerprint === (document?.fingerprint ?? null)
        ? saveDisclosure
        : null,
    saveDisclosureLoading,
    saveStatus,
    setExportPreview,
    setHistoryOpen,
    setInvalidFile,
    versions,
  };
}
