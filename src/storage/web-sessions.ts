import type { OpenedYeliDocument } from "../host/contracts.ts";
import { markdownFingerprint } from "../host/markdown-files.ts";
import { createDocumentPayload } from "../document/model.ts";
import { createFreshOpenedDocument } from "../format/open.ts";
import type { FileHandleLike } from "./file-handles.ts";
import { LocalDocumentRepository, type StorageAdapter } from "./recovery.ts";

export interface WebSession {
  version: 1;
  localInstanceId: string;
  filename: string;
  updatedAt: number;
  baseline: {
    docId: string;
    source: string;
    revision: number;
    fingerprint: string;
  };
}

export interface WebSessionSummary extends WebSession {
  hasDraft: boolean;
}

const sessionKey = (id: string) => `web-session:${id}`;
const handleKey = (id: string) => `web-handle:${id}`;

function validSession(value: unknown, id: string): value is WebSession {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<WebSession>;
  return (
    record.version === 1 &&
    record.localInstanceId === id &&
    typeof record.filename === "string" &&
    typeof record.updatedAt === "number" &&
    Number.isFinite(record.updatedAt) &&
    !!record.baseline &&
    typeof record.baseline.source === "string" &&
    typeof record.baseline.docId === "string" &&
    typeof record.baseline.fingerprint === "string" &&
    Number.isSafeInteger(record.baseline.revision) &&
    record.baseline.revision >= 0
  );
}

/** Browser-local metadata only; portable payloads never select these records. */
export class WebSessionRepository {
  readonly local: LocalDocumentRepository;
  readonly #storage: StorageAdapter;
  #pending: Promise<unknown> = Promise.resolve();

  constructor(storage: StorageAdapter) {
    this.#storage = storage;
    this.local = new LocalDocumentRepository(storage, { versionLimit: 30 });
  }

  // Recovery, baseline and clean-up share this queue to prevent late writes from
  // reviving a discarded draft or erasing a newer edit after a direct save.
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(operation);
    this.#pending = result.catch(() => undefined);
    return result;
  }

  async create(
    opened: OpenedYeliDocument,
    filename: string,
  ): Promise<WebSession> {
    const instance = await this.local.createInstance(
      opened.payload.docId,
      opened.fingerprint,
    );
    const session: WebSession = {
      version: 1,
      localInstanceId: instance.localInstanceId,
      filename,
      updatedAt: Date.now(),
      baseline: {
        docId: opened.payload.docId,
        source: opened.markdown,
        revision: opened.payload.revision,
        fingerprint: opened.fingerprint,
      },
    };
    await this.#storage.set(sessionKey(session.localInstanceId), session);
    return session;
  }

  async get(id: string): Promise<WebSession | null> {
    const value = await this.#storage.get<unknown>(sessionKey(id));
    return validSession(value, id) ? value : null;
  }

  async list(): Promise<WebSessionSummary[]> {
    const keys = await this.#storage.keys("web-session:");
    const records = await Promise.all(
      keys.map(async (key) => {
        const record = await this.get(key.slice("web-session:".length));
        if (!record) return null;
        const draft = await this.local.getRecovery(record.localInstanceId);
        return { ...record, hasDraft: !!draft };
      }),
    );
    return records
      .filter((record): record is WebSessionSummary => record !== null)
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt ||
          left.localInstanceId.localeCompare(right.localInstanceId),
      );
  }

  async updateBaseline(
    session: WebSession,
    opened: OpenedYeliDocument,
  ): Promise<WebSession> {
    const updated: WebSession = {
      ...session,
      updatedAt: Date.now(),
      baseline: {
        docId: opened.payload.docId,
        source: opened.markdown,
        revision: opened.payload.revision,
        fingerprint: opened.fingerprint,
      },
    };
    await this.local.updateFingerprint(
      session.localInstanceId,
      opened.fingerprint,
    );
    await this.#storage.set(sessionKey(session.localInstanceId), updated);
    return updated;
  }

  async touch(session: WebSession): Promise<void> {
    const current = await this.get(session.localInstanceId);
    if (current)
      await this.#storage.set(sessionKey(session.localInstanceId), {
        ...current,
        updatedAt: Date.now(),
      });
  }

  async retainHandle(
    id: string,
    handle: FileHandleLike | null,
  ): Promise<boolean> {
    // Invalidate before cloning so a failed replacement cannot reconnect the
    // previous physical file. A blocked deletion may still allow a tombstone.
    try {
      await this.#storage.delete(handleKey(id));
    } catch {
      await this.#storage.set(handleKey(id), null);
      return false;
    }
    try {
      if (handle) await this.#storage.set(handleKey(id), handle);
      return true;
    } catch {
      return false;
    }
  }

  getHandle(id: string): Promise<FileHandleLike | null> {
    return this.#storage.get(handleKey(id));
  }

  async opened(session: WebSession): Promise<OpenedYeliDocument> {
    return createFreshOpenedDocument({
      artifact: session.baseline.source,
      artifactKind: "markdown",
      fingerprint: markdownFingerprint(session.baseline.source),
      markdown: session.baseline.source,
      releaseTemplate: "",
      payload: await createDocumentPayload(session.baseline.source, {
        docId: session.baseline.docId,
        revision: session.baseline.revision,
        subtle: null,
      }),
    });
  }
}
