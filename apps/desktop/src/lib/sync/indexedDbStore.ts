import type { KeyValueStore } from "./storage";
import { plannerQuit } from "./quitBarrier";

const DB_NAME = "facta-planner";
const OBJECT_STORE = "kv";
const PREFIXES = [
  "planner_goals",
  "planner_events",
  "planner_notes",
  "planner_diary_entries",
  "facta_sync_queue",
];
export const plannerKeys = (userId: string) =>
  PREFIXES.map((prefix) => `${prefix}_${userId}`);

export interface LegacyStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error("Local database transaction was aborted"));
    tx.onerror = () => {
      /* onabort reports the final transaction result */
    };
  });
}

function open(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () =>
      request.result.createObjectStore(OBJECT_STORE);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(
        new Error("Close other Facta windows and retry opening local storage"),
      );
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      resolve(request.result);
    };
  });
}

/**
 * A synchronous read view hydrated before the engine mounts. Mutations remain
 * optimistic; every cache + queue change in one turn commits in ONE IndexedDB
 * transaction. flush() is the durability barrier before/after any remote work.
 * Failed batches are retained for retry, including edits made while writing.
 */
export class IndexedDbStore implements KeyValueStore {
  private pending = new Map<string, string | null>();
  private running: Promise<void> | null = null;
  private scheduled = false;
  private listeners = new Set<(error: unknown) => void>();
  private failure: unknown = null;
  private unregisterQuit: () => void;

  private constructor(
    private db: IDBDatabase,
    private values: Map<string, string>,
    private allowed: Set<string>,
  ) {
    this.unregisterQuit = plannerQuit.register(this);
    db.onversionchange = () => {
      db.close();
      this.report(
        new Error("Local storage was updated in another window. Reopen Facta."),
      );
    };
    db.onclose = () =>
      this.report(
        new Error(
          "Local storage closed unexpectedly. Keep Facta open and retry.",
        ),
      );
  }

  static async create(
    userId: string,
    options: {
      factory?: IDBFactory;
      legacy?: LegacyStorage;
      name?: string;
    } = {},
  ): Promise<IndexedDbStore> {
    const legacy = options.legacy ?? {
      getItem: (key: string) => localStorage.getItem(key),
      removeItem: (key: string) => localStorage.removeItem(key),
    };
    const keys = plannerKeys(userId);
    const db = await open(
      options.factory ?? indexedDB,
      options.name ?? DB_NAME,
    );
    try {
      const migrationKey = `migrated_local_storage_v1_${userId}`;
      const markerTx = db.transaction(OBJECT_STORE, "readonly");
      const markerDone = completed(markerTx);
      const marker = markerTx.objectStore(OBJECT_STORE).get(migrationKey);
      await markerDone;
      const migrated = marker.result === "1";
      // A denied first read is an error, never an empty successful migration.
      // Subsequent opens do not depend on localStorage at all.
      const originals = new Map(
        keys.map((key) => [key, migrated ? null : legacy.getItem(key)]),
      );
      const values = new Map<string, string>();
      const imported = new Map<string, string>();
      const tx = db.transaction(OBJECT_STORE, "readwrite", {
        durability: "strict",
      });
      const done = completed(tx);
      const store = tx.objectStore(OBJECT_STORE);
      let writeError: unknown;
      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          try {
            const old = originals.get(key);
            // Existing IndexedDB values are authoritative; a retry never
            // overwrites edits with the older localStorage snapshot.
            if (typeof request.result === "string") {
              values.set(key, request.result);
              if (request.result === old) imported.set(key, old);
            } else if (old !== null && old !== undefined) {
              store.put(old, key);
              values.set(key, old);
              imported.set(key, old);
            }
            if (!migrated && key === keys[keys.length - 1])
              store.put("1", migrationKey);
          } catch (error) {
            writeError = error;
            tx.abort();
          }
        };
      }
      try {
        await done;
      } catch (error) {
        throw writeError ?? error;
      }
      // Delete only after the complete event. If cleanup fails or another
      // writer changed a legacy value, retain it; IndexedDB still wins later.
      for (const [key, old] of imported) {
        try {
          if (legacy.getItem(key) === old) legacy.removeItem(key);
        } catch {
          /* safe to retry next run */
        }
      }
      return new IndexedDbStore(db, values, new Set(keys));
    } catch (error) {
      db.close();
      throw error;
    }
  }

  get(key: string): string | null {
    this.checkKey(key);
    return this.values.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.checkKey(key);
    this.values.set(key, value);
    this.enqueue(key, value);
  }
  remove(key: string): void {
    this.checkKey(key);
    this.values.delete(key);
    this.enqueue(key, null);
  }
  subscribeErrors(listener: (error: unknown) => void): () => void {
    this.listeners.add(listener);
    if (this.failure) listener(this.failure);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async close(): Promise<void> {
    await this.flush();
    this.db.close();
    this.unregisterQuit();
  }

  private checkKey(key: string) {
    if (!this.allowed.has(key))
      throw new Error("Storage key does not belong to this planner account");
  }
  private report(error: unknown) {
    this.failure = error;
    for (const listener of this.listeners) listener(error);
  }
  private enqueue(key: string, value: string | null) {
    this.pending.set(key, value);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.flush().catch(() => {});
    });
  }

  async flush(): Promise<void> {
    if (this.running) return this.running;
    const run = async () => {
      while (this.pending.size) {
        const batch = this.pending;
        this.pending = new Map();
        try {
          const tx = this.db.transaction(OBJECT_STORE, "readwrite", {
            durability: "strict",
          });
          const done = completed(tx);
          const store = tx.objectStore(OBJECT_STORE);
          try {
            for (const [key, value] of batch) {
              if (value === null) store.delete(key);
              else store.put(value, key);
            }
          } catch (error) {
            tx.abort();
            await done.catch(() => {});
            throw error;
          }
          await done;
          this.failure = null;
        } catch (error) {
          // Restore only snapshots that have not already been superseded.
          for (const [key, value] of batch)
            if (!this.pending.has(key)) this.pending.set(key, value);
          this.report(error);
          throw error;
        }
      }
    };
    this.running = run().finally(() => {
      this.running = null;
    });
    return this.running;
  }
}

export function storageErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return "Device storage is full. Free disk space, keep Facta open and retry; recent edits are still in memory.";
  return `Couldn't save on this device: ${error instanceof Error ? error.message : String(error)}. Keep Facta open and retry; recent edits may only be in memory.`;
}
