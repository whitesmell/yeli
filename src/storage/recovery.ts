import type { YeliAsset } from "../document/model.ts";
import type { DocumentMutationBlockKind } from "../document/store.ts";

export interface StorageAdapter {
  delete(key: string): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  keys(prefix: string): Promise<string[]>;
  set<T>(key: string, value: T): Promise<void>;
}

export class MemoryStorageAdapter implements StorageAdapter {
  readonly #values = new Map<string, unknown>();

  delete(key: string): Promise<void> {
    this.#values.delete(key);
    return Promise.resolve();
  }

  get<T>(key: string): Promise<T | null> {
    const value = this.#values.get(key) as T | undefined;
    return Promise.resolve(value === undefined ? null : structuredClone(value));
  }

  keys(prefix: string): Promise<string[]> {
    return Promise.resolve(
      [...this.#values.keys()].filter((key) => key.startsWith(prefix)),
    );
  }

  set<T>(key: string, value: T): Promise<void> {
    this.#values.set(key, structuredClone(value));
    return Promise.resolve();
  }
}

interface StoredEntry {
  key: string;
  value: unknown;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed")),
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed")),
    );
  });
}

export class IndexedDbStorageAdapter implements StorageAdapter {
  readonly #databaseName: string;
  #database: Promise<IDBDatabase> | null = null;

  constructor(databaseName = "yeli-local-v1") {
    this.#databaseName = databaseName;
  }

  async #open(): Promise<IDBDatabase> {
    this.#database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.#databaseName, 1);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains("entries")) {
          request.result.createObjectStore("entries", { keyPath: "key" });
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("IndexedDB open failed")),
      );
    });
    return this.#database;
  }

  async delete(key: string): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction("entries", "readwrite");
    const complete = transactionComplete(transaction);
    await requestResult(transaction.objectStore("entries").delete(key));
    await complete;
  }

  async get<T>(key: string): Promise<T | null> {
    const database = await this.#open();
    const transaction = database.transaction("entries", "readonly");
    const entry = await requestResult<unknown>(
      transaction.objectStore("entries").get(key),
    );
    return entry ? ((entry as StoredEntry).value as T) : null;
  }

  async keys(prefix: string): Promise<string[]> {
    const database = await this.#open();
    const transaction = database.transaction("entries", "readonly");
    const keys = await requestResult(
      transaction.objectStore("entries").getAllKeys(),
    );
    return keys
      .filter((key): key is string => typeof key === "string")
      .filter((key) => key.startsWith(prefix));
  }

  async set<T>(key: string, value: T): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction("entries", "readwrite");
    const complete = transactionComplete(transaction);
    await requestResult(transaction.objectStore("entries").put({ key, value }));
    await complete;
  }
}

export interface LocalInstance {
  createdAt: number;
  docId: string;
  fingerprint: string;
  localInstanceId: string;
  updatedAt: number;
}

export interface RecoverySnapshot {
  assets?: YeliAsset[];
  revision: number;
  source: string;
  sourceHash: string;
  updatedAt?: number;
}

export interface VersionSnapshot extends RecoverySnapshot {
  change?: {
    actorLabel?: string;
    blockKinds?: DocumentMutationBlockKind[];
    operation?: string;
    origin: "yeli-editor" | "external-agent" | "system";
    summary?: string;
  };
  id?: string;
  reason: "edit" | "open" | "restore" | "save";
}

export type StoredVersion = VersionSnapshot &
  Required<Pick<VersionSnapshot, "id" | "updatedAt">>;

interface RepositoryOptions {
  now?: () => number;
  randomId?: () => string;
  versionLimit?: number;
}

const instanceKey = (id: string) => `instance:${id}`;
const recoveryKey = (id: string) => `recovery:${id}`;
const versionPrefix = (id: string) => `version:${id}:`;

export class LocalDocumentRepository {
  readonly #now: () => number;
  readonly #randomId: () => string;
  readonly #storage: StorageAdapter;
  readonly #versionLimit: number;

  constructor(storage: StorageAdapter, options: RepositoryOptions = {}) {
    this.#storage = storage;
    this.#now = options.now ?? (() => Date.now());
    this.#randomId =
      options.randomId ??
      (() =>
        globalThis.crypto?.randomUUID?.() ??
        `local-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    this.#versionLimit = options.versionLimit ?? 30;
  }

  async createInstance(
    docId: string,
    fingerprint: string,
  ): Promise<LocalInstance> {
    const now = this.#now();
    const instance: LocalInstance = {
      createdAt: now,
      docId,
      fingerprint,
      localInstanceId: this.#randomId(),
      updatedAt: now,
    };
    await this.#storage.set(instanceKey(instance.localInstanceId), instance);
    return instance;
  }

  async forkInstance(
    sourceInstanceId: string,
    fingerprint: string,
  ): Promise<LocalInstance> {
    const source = await this.getInstance(sourceInstanceId);
    if (!source) throw new Error("Cannot fork an unknown local instance");
    return this.createInstance(source.docId, fingerprint);
  }

  async getInstance(localInstanceId: string): Promise<LocalInstance | null> {
    return this.#storage.get(instanceKey(localInstanceId));
  }

  async updateFingerprint(
    localInstanceId: string,
    fingerprint: string,
  ): Promise<void> {
    const instance = await this.getInstance(localInstanceId);
    if (!instance) throw new Error("Unknown local instance");
    await this.#storage.set(instanceKey(localInstanceId), {
      ...instance,
      fingerprint,
      updatedAt: this.#now(),
    });
  }

  async findByFingerprint(fingerprint: string): Promise<LocalInstance[]> {
    const keys = await this.#storage.keys("instance:");
    const instances = await Promise.all(
      keys.map((key) => this.#storage.get<LocalInstance>(key)),
    );
    return instances
      .filter(
        (instance): instance is LocalInstance =>
          instance !== null && instance.fingerprint === fingerprint,
      )
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt ||
          right.localInstanceId.localeCompare(left.localInstanceId),
      );
  }

  async saveRecovery(
    localInstanceId: string,
    snapshot: RecoverySnapshot,
  ): Promise<void> {
    if (!(await this.getInstance(localInstanceId))) {
      throw new Error("Unknown local instance");
    }
    await this.#storage.set(recoveryKey(localInstanceId), {
      ...snapshot,
      updatedAt: snapshot.updatedAt ?? this.#now(),
    });
  }

  async getRecovery(localInstanceId: string): Promise<RecoverySnapshot | null> {
    return this.#storage.get(recoveryKey(localInstanceId));
  }

  async discardRecovery(localInstanceId: string): Promise<void> {
    await this.#storage.delete(recoveryKey(localInstanceId));
  }

  async recordVersion(
    localInstanceId: string,
    snapshot: VersionSnapshot,
  ): Promise<StoredVersion> {
    if (!(await this.getInstance(localInstanceId))) {
      throw new Error("Unknown local instance");
    }
    const versions = await this.listVersions(localInstanceId);
    const latest = versions[0];
    if (
      latest &&
      latest.sourceHash === snapshot.sourceHash &&
      latest.revision === snapshot.revision
    ) {
      return latest;
    }
    const updatedAt = snapshot.updatedAt ?? this.#now();
    const id = snapshot.id ?? this.#randomId();
    const version: StoredVersion = { ...snapshot, id, updatedAt };
    const sortable = `${String(updatedAt).padStart(16, "0")}:${id}`;
    await this.#storage.set(
      `${versionPrefix(localInstanceId)}${sortable}`,
      version,
    );
    const keys = (await this.#storage.keys(versionPrefix(localInstanceId)))
      .sort()
      .reverse();
    await Promise.all(
      keys.slice(this.#versionLimit).map((key) => this.#storage.delete(key)),
    );
    return version;
  }

  async listVersions(localInstanceId: string): Promise<StoredVersion[]> {
    const keys = (await this.#storage.keys(versionPrefix(localInstanceId)))
      .sort()
      .reverse();
    const versions = await Promise.all(
      keys.map((key) => this.#storage.get<StoredVersion>(key)),
    );
    return versions.filter(
      (version): version is StoredVersion => version !== null,
    );
  }

  async findVersion(
    localInstanceId: string,
    versionId: string,
  ): Promise<StoredVersion | null> {
    const versions = await this.listVersions(localInstanceId);
    return versions.find((version) => version.id === versionId) ?? null;
  }
}
