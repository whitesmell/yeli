import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { sha256Bytes } from "../document/freshness.ts";
import { indexFrontmatter } from "../document/frontmatter.ts";
import {
  createDocumentPayload,
  decodeMarkdown,
  type YeliAsset,
  type YeliDocumentPayload,
} from "../document/model.ts";
import type { SourcePatch } from "../editor/source-ranges.ts";
import { createAssetDeltaForPatch } from "../document/transactions.ts";
import { DEFAULT_FORMAT_BUDGETS } from "../document/schema.ts";
import type { DocumentSnapshot, DocumentStore } from "../document/store.ts";
import { createMarkdownExport } from "../export/markdown.ts";
import { printStaticHtml } from "../export/print.ts";
import {
  createFreshOpenedDocument,
  type OpenedYeliDocument,
} from "../format/open.ts";
import type { HostOpenResult, YeliHost } from "../host/contracts.ts";
import type { WebTemplateFailure } from "../host/web-template.ts";
import { projectShell } from "../integrity/shell-projection.ts";
import { parseYeliArtifact } from "../format/parse.ts";
import { saveFilenameForHost, saveKindForHost } from "../host/host.ts";
import {
  markdownFingerprint,
  markdownSaveDisclosure,
  newLocalDocumentId,
  openMarkdownFile,
  readMarkdownFile,
} from "../host/markdown-files.ts";
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
  writeMarkdownToHandle,
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
import type { WebSession, WebSessionSummary } from "../storage/web-sessions.ts";
import { persistentRecoveryAllowed } from "../storage/recovery-policy.ts";

interface LifecycleOptions {
  host: YeliHost;
  labels: Labels;
  notify: (message: string) => void;
  snapshot: DocumentSnapshot;
  store: DocumentStore;
}

interface MarkdownSaveResult {
  kind: "markdown";
  target?: {
    generation: number;
    localInstanceId: string | null;
    session: WebSession | null;
  };
  payload: YeliDocumentPayload;
  snapshot: DocumentSnapshot;
}

type SaveConflict =
  MarkdownSaveResult | (SavedArtifactResult & { kind: "artifact" });

interface InvalidFileRequest {
  error: string;
  filename: string;
  recovery: NonNullable<Extract<HostOpenResult, { ok: false }>["recovery"]>;
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

const newDocId = newLocalDocumentId;

function currentFilename(host: Pick<YeliHost, "kind">): string {
  if (host.kind === "web") return "document.md";
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
  host,
  labels,
  notify,
  snapshot,
  store,
}: LifecycleOptions) {
  const { initialResult } = host;
  const initialDocument = initialResult.ok ? initialResult.document : undefined;
  const [document, setDocument] = useState<OpenedYeliDocument | undefined>(
    initialDocument,
  );
  const documentRef = useRef(document);
  useLayoutEffect(() => {
    documentRef.current = document;
  }, [document]);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const fileAdapter = host.fileAdapter;
  const webRepository = host.kind === "web" ? host.webSessions : undefined;
  const webSessionRef = useRef<WebSession | null>(null);
  const webGenerationRef = useRef(0);
  const savingRef = useRef(false);
  const webActionsRef = useRef(webRepository ? 1 : 0);
  const discardSwitchRef = useRef(false);
  const [webHasActiveDocument, setWebHasActiveDocument] = useState(false);
  const [webWorking, setWebWorking] = useState(!!webRepository);
  const webFocusPendingRef = useRef(false);
  const webHistoryTimerRef = useRef<number | undefined>(undefined);
  const [localDocuments, setLocalDocuments] = useState<
    WebSessionSummary[] | null
  >(null);
  const [switchRequest, setSwitchRequest] = useState<{
    action: () => Promise<void>;
    generation: number;
  } | null>(null);
  const [webReconnect, setWebReconnect] = useState<{
    opened: OpenedYeliDocument;
    filename: string;
    handle: FileHandleLike | null;
    candidates: WebSessionSummary[];
  } | null>(null);
  const [diskChoice, setDiskChoice] = useState<{
    session: WebSession;
    opened: OpenedYeliDocument;
    disk: OpenedYeliDocument;
    handle: FileHandleLike;
  } | null>(null);
  const [fileName, setFileName] = useState(() => currentFilename(host));
  const [fileHandle, setFileHandle] = useState<FileHandleLike | null>(null);
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<StoredVersion[]>([]);
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null);
  const [reconnect, setReconnect] = useState<ReconnectRequest | null>(null);
  const [invalidFile, setInvalidFile] = useState<InvalidFileRequest | null>(
    !initialResult.ok && initialResult.recovery
      ? {
          error: initialResult.error,
          filename: currentFilename(host),
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
  const repositoryRef = useRef(
    webRepository?.local ?? repositoryForEnvironment(),
  );
  const launchReleaseTemplate = host.releaseTemplate;
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

  useEffect(() => {
    if (webWorking || !webFocusPendingRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      webFocusPendingRef.current = false;
      if (
        globalThis.document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      globalThis.document
        .querySelector<HTMLElement>(".document-title-input")
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [document, webWorking]);

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

  const isCurrentWebSession = useCallback(
    (generation: number, instanceId: string | null) =>
      generation === webGenerationRef.current &&
      instanceId === (webSessionRef.current?.localInstanceId ?? null),
    [],
  );

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

  const persistWebSnapshot = useCallback(
    async (
      session: WebSession,
      current: DocumentSnapshot,
      checkpoint = true,
    ) => {
      if (!webRepository) return;
      await webRepository.run(async () => {
        if (current.dirty) {
          await webRepository.local.saveRecovery(session.localInstanceId, {
            assets: [...current.assets],
            revision: current.revision,
            source: current.source,
            sourceHash: current.sourceHash,
          });
          if (checkpoint)
            await webRepository.local.recordVersion(session.localInstanceId, {
              assets: [...current.assets],
              revision: current.revision,
              source: current.source,
              sourceHash: current.sourceHash,
              reason: "edit",
              change: {
                blockKinds: current.lastMutation?.blockKinds ?? [],
                ...(current.lastMutation?.operation
                  ? { operation: current.lastMutation.operation }
                  : {}),
                origin: "yeli-editor",
              },
            });
        }
        await webRepository.touch(session);
      });
    },
    [webRepository],
  );

  const flushWeb = async () => {
    window.clearTimeout(webHistoryTimerRef.current);
    const session = webSessionRef.current;
    const generation = webGenerationRef.current;
    if (webRepository && session && recoveryAvailable) {
      try {
        await persistWebSnapshot(session, store.getSnapshot());
        return true;
      } catch {
        if (isCurrentWebSession(generation, session.localInstanceId))
          degradeRecovery();
        return false;
      }
    }
    return !store.getSnapshot().dirty;
  };

  const activateWeb = async (
    opened: OpenedYeliDocument,
    session: WebSession | null,
    handle: FileHandleLike | null,
  ) => {
    webGenerationRef.current += 1;
    setWebHasActiveDocument(true);
    webSessionRef.current = session;
    setLocalInstanceId(session?.localInstanceId ?? null);
    setRecovery(null);
    setVersions([]);
    setHistoryOpen(false);
    setExportPreview(null);
    setConflict(null);
    setWebReconnect(null);
    setDiskChoice(null);
    setLocalDocuments(null);
    setDocument(opened);
    setFileName(session?.filename ?? handle?.name ?? "document.md");
    setFileHandle(handle);
    setSaveStatus("idle");
    store.loadSource(opened.markdown, opened.payload.revision, []);
    store.setPrimaryMode("edit");
    webFocusPendingRef.current = true;
    if (!session || !webRepository || !recoveryAvailable) return;
    const generation = webGenerationRef.current;
    try {
      await webRepository.run(async () => {
        await webRepository.local.recordVersion(
          session.localInstanceId,
          versionSnapshotForOpenedDocument(opened, "open"),
        );
        await webRepository.touch(session);
      });
      const candidate = await webRepository.local.getRecovery(
        session.localInstanceId,
      );
      const history = await webRepository.local.listVersions(
        session.localInstanceId,
      );
      if (generation !== webGenerationRef.current) return;
      if (candidate && candidate.source !== opened.markdown)
        setRecovery(candidate);
      setVersions(history);
    } catch {
      if (generation === webGenerationRef.current) degradeRecovery();
    }
  };

  const createWebSession = async (
    opened: OpenedYeliDocument,
    filename: string,
    handle: FileHandleLike | null,
  ) => {
    const generation = ++webGenerationRef.current;
    let session: WebSession | null = null;
    let activeHandle = handle;
    if (webRepository && recoveryAvailable) {
      try {
        session = await webRepository.run(() =>
          webRepository.create(opened, filename),
        );
        if (generation !== webGenerationRef.current) return;
        const created = session;
        if (handle) {
          const retained = await webRepository.run(() =>
            generation === webGenerationRef.current
              ? webRepository.retainHandle(created.localInstanceId, handle)
              : Promise.resolve(false),
          );
          if (generation !== webGenerationRef.current) return;
          if (!retained) {
            activeHandle = null;
            notify(labels.webHandleNotRetained);
          }
        }
      } catch {
        if (generation === webGenerationRef.current) degradeRecovery();
      }
    }
    if (generation !== webGenerationRef.current) return;
    await activateWeb(opened, session, activeHandle);
    if (webSessionRef.current?.localInstanceId === session?.localInstanceId)
      setFileName(filename);
  };

  const continueWebSession = async (
    session: WebSession,
    suppliedHandle?: FileHandleLike | null,
  ) => {
    if (!webRepository) return;
    if (!(await flushWeb()) && !discardSwitchRef.current) return;
    const generation = ++webGenerationRef.current;
    try {
      const opened = await webRepository.opened(session);
      let handle: FileHandleLike | null = suppliedHandle ?? null;
      if (!handle) {
        try {
          handle = await webRepository.getHandle(session.localInstanceId);
        } catch {
          notify(labels.webHandleUnavailable);
        }
      }
      if (generation !== webGenerationRef.current) return;
      if (handle) {
        try {
          const file = await handle.getFile();
          const source = file.arrayBuffer
            ? await readMarkdownFile({
                arrayBuffer: file.arrayBuffer.bind(file),
              })
            : await file.text();
          const disk = await openMarkdownFile(source);
          if (generation !== webGenerationRef.current) return;
          if (disk.fingerprint !== session.baseline.fingerprint) {
            setLocalDocuments(null);
            setWebReconnect(null);
            setDiskChoice({ session, opened, disk, handle });
            return;
          }
        } catch {
          handle = null;
          notify(labels.webHandleUnavailable);
        }
      }
      if (generation !== webGenerationRef.current) return;
      if (suppliedHandle) {
        const retained = await webRepository.run(() =>
          generation === webGenerationRef.current
            ? webRepository.retainHandle(
                session.localInstanceId,
                suppliedHandle,
              )
            : Promise.resolve(false),
        );
        if (generation !== webGenerationRef.current) return;
        if (!retained) {
          handle = null;
          notify(labels.webHandleNotRetained);
        }
      }
      if (generation !== webGenerationRef.current) return;
      await activateWeb(opened, session, handle);
    } catch {
      if (generation === webGenerationRef.current) degradeRecovery();
    }
  };

  const runWebAction = async (action: () => Promise<void>) => {
    webActionsRef.current += 1;
    setWebWorking(true);
    try {
      await action();
    } finally {
      webActionsRef.current -= 1;
      setWebWorking(webActionsRef.current > 0);
    }
  };

  const requestWebSwitch = async (action: () => Promise<void>) => {
    if (savingRef.current) {
      notify(labels.webWaitSaving);
      return;
    }
    if (store.getSnapshot().dirty)
      setSwitchRequest(() => ({
        generation: webGenerationRef.current,
        action,
      }));
    else await runWebAction(action);
  };

  const openLocalDocuments = async () => {
    if (!webRepository || !recoveryAvailable) {
      notify(labels.recoveryUnavailable);
      setLocalDocuments([]);
      return;
    }
    const generation = webGenerationRef.current;
    const instanceId = webSessionRef.current?.localInstanceId ?? null;
    try {
      await flushWeb();
      const records = await webRepository.list();
      if (isCurrentWebSession(generation, instanceId))
        setLocalDocuments(records);
    } catch {
      if (isCurrentWebSession(generation, instanceId)) {
        degradeRecovery();
        setLocalDocuments([]);
      }
    }
  };

  const newWebDocument = () =>
    requestWebSwitch(async () => {
      if (!(await flushWeb()) && !discardSwitchRef.current) return;
      await createWebSession(await openMarkdownFile(""), "document.md", null);
    });

  useEffect(() => {
    if (!initialDocument || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    if (webRepository) {
      void (async () => {
        try {
          const sessions = recoveryAvailable ? await webRepository.list() : [];
          setLocalDocuments(sessions);
        } catch {
          degradeRecovery();
          setLocalDocuments([]);
        } finally {
          webActionsRef.current -= 1;
          setWebWorking(webActionsRef.current > 0);
        }
      })();
    } else
      void Promise.resolve().then(() => attachLocalInstance(initialDocument));
    // Boot once per mounted host, including React StrictMode's effect replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocument]);

  useEffect(() => {
    if (!webRepository) return;
    let lastCheckpoint = "";
    const unsubscribe = store.subscribe(() => {
      const session = webSessionRef.current;
      const current = store.getSnapshot();
      if (!recoveryAvailable || !session || !current.dirty) return;
      const generation = webGenerationRef.current;
      const onFailure = () => {
        if (isCurrentWebSession(generation, session.localInstanceId))
          degradeRecovery();
      };
      const checkpoint = `${session.localInstanceId}:${current.revision}`;
      if (checkpoint === lastCheckpoint) return;
      lastCheckpoint = checkpoint;
      void persistWebSnapshot(session, current, false).catch(onFailure);
      window.clearTimeout(webHistoryTimerRef.current);
      webHistoryTimerRef.current = window.setTimeout(() => {
        const latest = store.getSnapshot();
        if (!isCurrentWebSession(generation, session.localInstanceId)) return;
        void persistWebSnapshot(session, latest).catch(onFailure);
      }, 800);
    });
    const flushOnHidden = () => {
      const session = webSessionRef.current;
      const generation = webGenerationRef.current;
      if (recoveryAvailable && session)
        void persistWebSnapshot(session, store.getSnapshot()).catch(() => {
          if (isCurrentWebSession(generation, session.localInstanceId))
            degradeRecovery();
        });
    };
    window.addEventListener("pagehide", flushOnHidden);
    const warnOnUnload = (event: BeforeUnloadEvent) => {
      if (!store.getSnapshot().dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnOnUnload);
    return () => {
      unsubscribe();
      window.clearTimeout(webHistoryTimerRef.current);
      window.removeEventListener("pagehide", flushOnHidden);
      window.removeEventListener("beforeunload", warnOnUnload);
    };
  }, [
    degradeRecovery,
    isCurrentWebSession,
    persistWebSnapshot,
    recoveryAvailable,
    store,
    webRepository,
  ]);

  useEffect(() => {
    if (
      webRepository ||
      !snapshot.dirty ||
      !localInstanceId ||
      !recoveryAvailable
    )
      return;
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
    webRepository,
  ]);

  const openFile = async (file: File, handle: FileHandleLike | null = null) => {
    if (webRepository) {
      await requestWebSwitch(async () => {
        if (!(await flushWeb()) && !discardSwitchRef.current) return;
        const generation = ++webGenerationRef.current;
        try {
          const result = await fileAdapter.openFile(file, handle);
          if (generation !== webGenerationRef.current) return;
          if (!result.ok) {
            notify(labels.fileInvalid);
            return;
          }
          if (recoveryAvailable) {
            let candidates: WebSessionSummary[] = [];
            try {
              candidates = await webRepository.list();
            } catch {
              if (generation === webGenerationRef.current) degradeRecovery();
            }
            if (generation !== webGenerationRef.current) return;
            if (handle?.isSameEntry) {
              for (const candidate of candidates) {
                let same = false;
                try {
                  const retained = await webRepository.getHandle(
                    candidate.localInstanceId,
                  );
                  same = !!retained && (await handle.isSameEntry(retained));
                } catch {
                  /* Compare fingerprints explicitly below. */
                }
                if (generation !== webGenerationRef.current) return;
                if (same) {
                  await continueWebSession(candidate, handle);
                  return;
                }
              }
            }
            const matches = candidates.filter(
              (candidate) =>
                candidate.baseline.fingerprint === result.document.fingerprint,
            );
            if (matches.length) {
              setWebReconnect({
                candidates: matches,
                opened: result.document,
                filename: file.name,
                handle,
              });
              return;
            }
          }
          await createWebSession(result.document, file.name, handle);
          notify(labels.fileOpened);
        } catch {
          notify(labels.fileOpenFailed);
        }
      });
      return;
    }
    if (host.kind === "web") {
      webGenerationRef.current += 1;
      setExportPreview(null);
    }
    try {
      const result = await fileAdapter.openFile(file, handle);
      if (result.ok && result.document.artifactKind === "markdown") {
        const opened = {
          ...result.document,
          releaseTemplate: launchReleaseTemplate,
        };
        setDocument(opened);
        setFileName(file.name);
        setFileHandle(fileAdapter.retainHandleOnOpen(file, handle));
        setInvalidFile(null);
        setSaveStatus("idle");
        store.loadSource(opened.markdown, opened.payload.revision, []);
        await attachLocalInstance(opened);
        notify(labels.fileOpened);
        return;
      }
      if (!result.ok) {
        if (result.recovery) {
          setInvalidFile({
            error: result.error,
            filename: file.name,
            recovery: result.recovery,
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
        bytes: new TextEncoder().encode(result.document.artifact).byteLength,
        fingerprint: result.document.fingerprint,
      };
      setFileName(file.name);
      setFileHandle(fileAdapter.retainHandleOnOpen(file, handle));
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
    try {
      await fileAdapter.chooseFile(fallback, openFile);
    } catch {
      notify(labels.fileOpenFailed);
    }
  };

  const embedImage = async (
    file: File,
    createPatch: (destination: string) => SourcePatch,
  ): Promise<boolean> => {
    if (host.kind === "web") {
      notify(labels.imageEmbeddingUnavailableMarkdown);
      return false;
    }
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
      if (saveKindForHost(host) === "markdown") {
        if (!document) {
          setSaveDisclosure(null);
          return;
        }
        const disclosure = markdownSaveDisclosure(
          document,
          snapshot.source,
          snapshot.dirty,
        );
        setSaveDisclosure({
          currentBytes: disclosure.currentBytes,
          currentFileFits: fitsLocalFileBudget(disclosure.currentBytes),
          documentFingerprint: disclosure.documentFingerprint,
          projectedBytes: disclosure.projectedBytes,
          projectedFileFits:
            disclosure.projectedBytes === null
              ? null
              : fitsLocalFileBudget(disclosure.projectedBytes),
          sourceHash: disclosure.sourceHash,
        });
        return;
      }
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

  const rejectMarkdownAssets = (saved: DocumentSnapshot): boolean => {
    if (saved.assets.length === 0) return false;
    setSaveStatus("error");
    notify(labels.saveMarkdownAssetsUnsupported);
    return true;
  };

  const downloadMarkdownCopy = async (
    result: MarkdownSaveResult,
    fallback = false,
    fork = false,
  ) => {
    if (rejectMarkdownAssets(result.snapshot)) return;
    downloadText(
      result.snapshot.source,
      saveFilenameForHost(host, result.payload),
      "text/markdown;charset=utf-8",
    );
    if (webRepository && fork) {
      await flushWeb();
      const opened = createFreshOpenedDocument({
        artifact: result.snapshot.source,
        artifactKind: "markdown",
        fingerprint: markdownFingerprint(result.snapshot.source),
        markdown: result.snapshot.source,
        payload: result.payload,
        releaseTemplate: "",
      });
      setFileHandle(null);
      setDocument(opened);
      webSessionRef.current = null;
      setLocalInstanceId(null);
      setVersions([]);
      if (recoveryAvailable) {
        try {
          const session = await webRepository.run(() =>
            webRepository.create(opened, fileName),
          );
          webSessionRef.current = session;
          setLocalInstanceId(session.localInstanceId);
          await persistWebSnapshot(session, store.getSnapshot());
          setVersions(
            await webRepository.local.listVersions(session.localInstanceId),
          );
        } catch {
          degradeRecovery();
        }
      }
    }
    setConflict(null);
    setSaveStatus(fallback ? "error" : "idle");
    notify(fallback ? labels.saveDownloadedFallback : labels.saveDownloaded);
  };

  const completeMarkdownSave = async (
    result: MarkdownSaveResult,
    fingerprint: string,
  ) => {
    const saved = result.snapshot;
    const target = result.target;
    const targetId = target?.localInstanceId ?? localInstanceId;
    const isActive = () =>
      !webRepository ||
      !target ||
      (target.generation === webGenerationRef.current &&
        target.localInstanceId ===
          (webSessionRef.current?.localInstanceId ?? null));
    const opened = createFreshOpenedDocument({
      artifact: saved.source,
      artifactKind: "markdown",
      fingerprint,
      markdown: saved.source,
      payload: result.payload,
      releaseTemplate: document!.releaseTemplate,
    });
    if (isActive()) {
      setDocument(opened);
      const current = store.getSnapshot();
      if (
        current.revision === saved.revision &&
        current.sourceHash === saved.sourceHash
      )
        store.markClean();
    }
    if (targetId) {
      try {
        const repository = repositoryRef.current;
        const recordSave = async () => {
          if (webRepository && target?.session) {
            const updated = await webRepository.updateBaseline(
              target.session,
              opened,
            );
            if (isActive()) webSessionRef.current = updated;
          } else await repository.updateFingerprint(targetId, fingerprint);
          const latest = isActive()
            ? store.getSnapshot()
            : await repository.getRecovery(targetId);
          const unchanged =
            latest?.revision === saved.revision &&
            latest.sourceHash === saved.sourceHash;
          if (unchanged) await repository.discardRecovery(targetId);
          else if (webRepository && latest && isActive())
            await repository.saveRecovery(targetId, {
              assets: [...(latest.assets ?? [])],
              revision: latest.revision,
              source: latest.source,
              sourceHash: latest.sourceHash,
            });
          await repository.recordVersion(targetId, {
            assets: [...saved.assets],
            change: {
              blockKinds: saved.lastMutation?.blockKinds ?? [],
              ...(saved.lastMutation?.operation
                ? { operation: saved.lastMutation.operation }
                : {}),
              origin: "yeli-editor",
            },
            reason: "save",
            revision: saved.revision,
            source: saved.source,
            sourceHash: saved.sourceHash,
          });
        };
        if (webRepository) await webRepository.run(recordSave);
        else await recordSave();
        const history = await repository.listVersions(targetId);
        if (isActive()) setVersions(history);
      } catch {
        if (isActive()) degradeRecovery();
      }
    }
    if (isActive()) {
      setConflict(null);
      setSaveStatus("idle");
      notify(labels.saveComplete);
    }
  };

  const writeMarkdown = async (
    result: MarkdownSaveResult,
    overwrite = false,
  ) => {
    if (rejectMarkdownAssets(result.snapshot)) return;
    const written = await writeMarkdownToHandle(
      fileHandle!,
      result.snapshot.source,
      document!.fingerprint,
      overwrite,
    );
    if (!written.ok) {
      if (written.reason === "external-conflict") {
        setConflict(result);
        setSaveStatus("error");
      } else {
        await downloadMarkdownCopy(result, true);
      }
      return;
    }
    await completeMarkdownSave(result, written.fingerprint);
  };

  const save = async (copy = false) => {
    if (savingRef.current) return;
    if (webRepository && webActionsRef.current > 0) return;
    if (
      webRepository &&
      (webActionsRef.current > 0 ||
        localDocuments ||
        diskChoice ||
        webReconnect ||
        switchRequest)
    )
      return;
    savingRef.current = true;
    setSaveStatus("saving");
    try {
      if (webRepository) await flushWeb();
      if (saveKindForHost(host) === "markdown") {
        if (rejectMarkdownAssets(snapshot)) return;
        if (!document) {
          setSaveStatus("error");
          notify(labels.saveUnavailable);
          return;
        }
        const target = webRepository
          ? {
              generation: webGenerationRef.current,
              localInstanceId: webSessionRef.current?.localInstanceId ?? null,
              session: webSessionRef.current,
            }
          : undefined;
        const result: MarkdownSaveResult = {
          kind: "markdown",
          payload: await buildCurrentPayload(),
          snapshot,
          ...(target ? { target } : {}),
        };
        if (!copy && fileHandle) {
          await writeMarkdown(result);
        } else {
          await downloadMarkdownCopy(result, false, copy);
        }
        return;
      }
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
            setConflict({ ...result, kind: "artifact" });
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
    } finally {
      savingRef.current = false;
    }
  };

  const confirmOverwrite = async () => {
    if (!conflict || !fileHandle || !document || savingRef.current) return;
    savingRef.current = true;
    setSaveStatus("saving");
    try {
      if (conflict.kind === "markdown") {
        await writeMarkdown(conflict, true);
        return;
      }
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
    } finally {
      savingRef.current = false;
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
      if (conflict.kind === "markdown") {
        await downloadMarkdownCopy(conflict, false, true);
        return;
      }
      await downloadCopy(conflict);
      setSaveStatus("idle");
    } catch {
      setSaveStatus("error");
      notify(labels.saveFailedNotice);
    }
  };

  const exportMarkdown = () => {
    const current = store.getSnapshot();
    const output = createMarkdownExport(
      current.source,
      indexFrontmatter(current.source).metadata.title,
    );
    downloadText(
      output.content,
      output.filename,
      "text/markdown;charset=utf-8",
    );
  };

  const captureExport = () => {
    const current = store.getSnapshot();
    const payload = documentRef.current?.payload;
    return {
      generation: webGenerationRef.current,
      docId: payload?.docId,
      payload: payload ? structuredClone(payload) : undefined,
      assets: structuredClone([...current.assets]),
      source: current.source,
      revision: current.revision,
      sourceHash: current.sourceHash,
    };
  };
  type ExportSnapshot = ReturnType<typeof captureExport>;
  const sameExportSession = (captured: ExportSnapshot) =>
    mountedRef.current &&
    captured.generation === webGenerationRef.current &&
    captured.docId === documentRef.current?.payload.docId;
  const exportIsCurrent = (captured: ExportSnapshot) => {
    const current = store.getSnapshot();
    return (
      sameExportSession(captured) &&
      current.revision === captured.revision &&
      current.sourceHash === captured.sourceHash &&
      current.source === captured.source
    );
  };
  const acceptExport = (captured: ExportSnapshot) => {
    if (exportIsCurrent(captured)) return true;
    if (sameExportSession(captured)) notify(labels.exportStale);
    return false;
  };
  const buildExportPayload = (captured: ExportSnapshot) =>
    createDocumentPayload(captured.source, {
      ...(captured.payload?.agentSummary
        ? { agentSummary: captured.payload.agentSummary }
        : {}),
      assets: captured.assets,
      docId: captured.docId ?? newDocId(),
      revision: captured.revision,
      settings: captured.payload?.settings ?? {},
      subtle: null,
    });
  const templateFailureLabels: Record<WebTemplateFailure, string> = {
    missing: labels.webTemplateMissing,
    hash: labels.webTemplateHash,
    format: labels.webTemplateFormat,
    version: labels.webTemplateVersion,
    nonempty: labels.webTemplateNonempty,
    shell: labels.webTemplateShell,
  };
  const webTemplate = host.kind === "web" ? host.webTemplate : undefined;
  const yeliExportUnavailable = webTemplate?.available
    ? null
    : templateFailureLabels[webTemplate?.reason ?? "missing"];

  const exportYeli = async () => {
    if (host.kind !== "web") return;
    if (!webTemplate?.available) {
      notify(yeliExportUnavailable!);
      return;
    }
    const captured = captureExport();
    try {
      const payload = captured.payload ?? (await buildExportPayload(captured));
      const result = await createSavedArtifact({
        payload: { ...payload, assets: captured.assets },
        releaseTemplate: webTemplate.artifact,
        revision: captured.revision,
        source: captured.source,
      });
      if (projectShell(result.artifact).hash !== webTemplate.shellHash)
        throw new Error("Export changed the trusted template shell");
      const parsed = await parseYeliArtifact(result.artifact, {}, null);
      if (
        !parsed.ok ||
        parsed.migrated ||
        parsed.freshness.manifest.status !== "fresh"
      )
        throw new Error(
          "The complete export is not a valid current Yeli artifact",
        );
      if (!acceptExport(captured)) return;
      downloadText(
        result.artifact,
        safeDocumentFilename(
          result.payload.manifest.metadata.title,
          ".yeli.html",
        ),
        "text/html;charset=utf-8",
      );
    } catch {
      if (sameExportSession(captured)) notify(labels.exportFailed);
    }
  };

  const generateStaticExport = async () => {
    const captured = captureExport();
    try {
      const payload = await buildExportPayload(captured);
      if (!acceptExport(captured)) return;
      setExportPreview(
        createStaticHtmlExport(payload, captured.source, labels),
      );
    } catch {
      if (sameExportSession(captured)) notify(labels.exportFailed);
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
    const captured = captureExport();
    try {
      const payload = await buildExportPayload(captured);
      if (!acceptExport(captured)) return;
      const result = await printStaticHtml(
        createStaticHtmlExport(payload, captured.source, labels).html,
        globalThis.document,
        () => exportIsCurrent(captured),
      );
      if (result === "stale") acceptExport(captured);
    } catch {
      if (sameExportSession(captured)) notify(labels.printFailed);
    }
  };

  const openHistory = async () => {
    const generation = webGenerationRef.current;
    const instanceId = localInstanceId;
    if (webRepository) await flushWeb();
    const isActive = () =>
      !webRepository || isCurrentWebSession(generation, instanceId);
    if (!isActive()) return;
    await refreshHistoryPanel({
      listVersions: (instanceId) =>
        repositoryRef.current.listVersions(instanceId),
      localInstanceId,
      onFailure: () => {
        if (isActive()) degradeRecovery();
      },
      onOpen: () => setHistoryOpen(true),
      onVersions: (history) => {
        if (isActive()) setVersions(history);
      },
    });
  };

  const recordRestore = async (
    instanceId = localInstanceId,
    expectedGeneration = webGenerationRef.current,
  ) => {
    if (!instanceId || !recoveryAvailable) return;
    if (webRepository && !isCurrentWebSession(expectedGeneration, instanceId))
      return;
    const current = store.getSnapshot();
    try {
      const record = () =>
        repositoryRef.current.recordVersion(instanceId, {
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
      if (webRepository) await webRepository.run(record);
      else await record();
    } catch {
      if (!webRepository || isCurrentWebSession(expectedGeneration, instanceId))
        degradeRecovery();
    }
  };

  const restoreVersion = async (
    version: StoredVersion,
    expected: { revision: number; sourceHash: string },
  ): Promise<boolean> => {
    const generation = webGenerationRef.current;
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
        const instanceId = localInstanceId;
        const latest = await repository.listVersions(instanceId);
        if (
          webRepository &&
          (generation !== webGenerationRef.current ||
            instanceId !== webSessionRef.current?.localInstanceId)
        ) {
          notify(labels.historyStale);
          return false;
        }
        setVersions(latest);
        const found = latest.find((candidate) => candidate.id === version.id);
        if (!found) {
          notify(labels.historyUnavailable);
          return false;
        }
        available = found;
      } catch {
        if (!webRepository || isCurrentWebSession(generation, localInstanceId))
          degradeRecovery();
        return false;
      }
    }
    current = store.getSnapshot();
    if (
      generation !== webGenerationRef.current ||
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
    const restoredInstanceId = localInstanceId;
    void recordRestore(restoredInstanceId, generation);
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
    if (result?.ok)
      void recordRestore(localInstanceId, webGenerationRef.current);
  };

  const discardRecovery = async () => {
    const generation = webGenerationRef.current;
    if (localInstanceId) {
      try {
        if (webRepository)
          await webRepository.run(() =>
            repositoryRef.current.discardRecovery(localInstanceId),
          );
        else await repositoryRef.current.discardRecovery(localInstanceId);
      } catch {
        if (!webRepository || isCurrentWebSession(generation, localInstanceId))
          degradeRecovery();
      }
    }
    if (!webRepository || isCurrentWebSession(generation, localInstanceId))
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
        fingerprint: markdownFingerprint(source),
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
    webWorking,
    webHasActiveDocument,
    localDocuments,
    openLocalDocuments,
    closeLocalDocuments: () => setLocalDocuments(null),
    newWebDocument,
    selectLocalDocument: (session: WebSession) =>
      requestWebSwitch(() => continueWebSession(session)),
    switchRequest: switchRequest !== null,
    cancelWebSwitch: () => setSwitchRequest(null),
    confirmWebSwitch: async () => {
      const pendingSwitch = switchRequest;
      setSwitchRequest(null);
      if (savingRef.current) {
        notify(labels.webWaitSaving);
        return;
      }
      const action =
        pendingSwitch?.generation === webGenerationRef.current
          ? pendingSwitch.action
          : null;
      if (action) {
        discardSwitchRef.current = !recoveryAvailable;
        try {
          await runWebAction(action);
        } finally {
          discardSwitchRef.current = false;
        }
      }
    },
    webReconnect,
    reconnectWebSession: (session: WebSession) => {
      const handle = webReconnect?.handle;
      setWebReconnect(null);
      void runWebAction(() => continueWebSession(session, handle));
    },
    separateWebSession: async () => {
      if (!webReconnect) return;
      const request = webReconnect;
      setWebReconnect(null);
      await runWebAction(() =>
        createWebSession(request.opened, request.filename, request.handle),
      );
    },
    diskChoice,
    useLocalDraft: async () => {
      if (!diskChoice) return;
      const choice = diskChoice;
      await runWebAction(() =>
        activateWeb(choice.opened, choice.session, choice.handle),
      );
    },
    useDiskVersion: async () => {
      if (!diskChoice) return;
      const choice = diskChoice;
      await runWebAction(() =>
        createWebSession(choice.disk, choice.session.filename, choice.handle),
      );
    },
    canEmbedImages: host.kind === "artifact",
    canDirectSave: fileHandle !== null,
    chooseFile,
    conflict,
    confirmOverwrite,
    discardRecovery,
    document,
    downloadInvalidOriginal,
    downloadStaticExport,
    canExportYeli: host.kind === "web" && !!webTemplate?.available,
    yeliExportUnavailable,
    exportYeli,
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
