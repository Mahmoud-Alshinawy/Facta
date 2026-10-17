// One synced collection (goals or events): the in-memory list, its
// localStorage cache, and its share of the shared write queue.
//
// The cache only ever holds live records, in the shape the widgets read.
// Pending deletes live in the queue as tombstone snapshots.

import { mergePulled, withLocalFields, type RowMeta, type SyncRecord } from "@/lib/sync/merge";
import type { QueueTables, TableName, WriteQueue } from "@/lib/sync/queue";
import type { RemoteResult, SyncError, TableRemote } from "@/lib/sync/remote";
import { readJson, type KeyValueStore } from "@/lib/sync/storage";
import { toMillis } from "@/lib/sync/time";

export interface CollectionSpec<K extends TableName, T extends SyncRecord, R extends RowMeta> {
  table: K;
  /** Cache key prefix; the cache lives at `${cacheKeyBase}_${userId}`. */
  cacheKeyBase: string;
  toWrite(record: T, userId: string, updatedAt: string, deletedAt: string | null): QueueTables[K];
  fromRow(row: R): T;
  /** Fields that stay on this device: never sent, kept across merges. */
  localOnly: readonly (keyof T)[];
}

export interface CollectionContext {
  userId: string;
  store: KeyValueStore;
  queue: WriteQueue;
  /** Current time in ms. */
  now(): number;
  /** False once the signed-in user changed or the engine was disposed. */
  isCurrent(userId: string): boolean;
  /** Called after every cache write (used to refresh the widgets). */
  onCacheWrite(): void;
  onChange(): void;
  /** Called after a write is queued, so the engine can schedule a flush. */
  onQueued(): void;
  /** A local edit lost to the server's version (changed or deleted elsewhere). */
  onServerWon(table: TableName, outcome: "changed" | "deleted"): void;
  onStorageError(error: unknown): void;
}

/** Thrown out of flush/pull when the server could not be reached or refused. */
export class SyncFailure extends Error {
  constructor(readonly error: SyncError) {
    super(error.message);
  }
}

const BATCH = 100;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class CollectionSync<K extends TableName, T extends SyncRecord, R extends RowMeta> {
  private records: T[] = [];
  private readonly cacheKey: string;

  constructor(
    private readonly spec: CollectionSpec<K, T, R>,
    private readonly remote: TableRemote<QueueTables[K], R> | null,
    private readonly ctx: CollectionContext,
  ) {
    this.cacheKey = `${spec.cacheKeyBase}_${ctx.userId}`;
  }

  /**
   * Loads the cache. Records cached before sync existed have no updatedAt:
   * they get one now and are queued, so they upload on the first flush
   * (no server round trip needed, so this works offline too).
   */
  load(): void {
    const cached = readJson<T[]>(this.ctx.store, this.cacheKey, []);
    const list = Array.isArray(cached) ? cached : [];
    const stamp = new Date(this.ctx.now()).toISOString();
    let migrated = false;
    this.records = list.map((rec) => {
      if (rec.updatedAt) return rec;
      migrated = true;
      const next: T = { ...rec, updatedAt: stamp };
      this.ctx.queue.put(this.spec.table, this.spec.toWrite(next, this.ctx.userId, stamp, null));
      return next;
    });
    if (migrated) {
      this.writeCache();
      this.ctx.onQueued();
    }
  }

  getSnapshot = (): T[] => this.records;

  get(id: string): T | undefined {
    return this.records.find((r) => r.id === id);
  }

  /** Creates or replaces a record locally and queues it. */
  upsert(record: T): T {
    const prev = this.get(record.id);
    const updatedAt = this.nextStamp(prev?.updatedAt);
    const next: T = { ...record, updatedAt };
    this.records = prev
      ? this.records.map((r) => (r.id === record.id ? next : r))
      : [...this.records, next];
    this.commit();
    this.ctx.queue.put(this.spec.table, this.spec.toWrite(next, this.ctx.userId, updatedAt, null));
    this.ctx.onQueued();
    return next;
  }

  /** Removes a record locally and queues its tombstone. */
  remove(id: string): void {
    const prev = this.get(id);
    if (!prev) return;
    const stamp = this.nextStamp(prev.updatedAt);
    this.records = this.records.filter((r) => r.id !== id);
    this.commit();
    this.ctx.queue.put(this.spec.table, this.spec.toWrite(prev, this.ctx.userId, stamp, stamp));
    this.ctx.onQueued();
  }

  /** Changes local-only fields: no new updatedAt, nothing queued. */
  patchLocal(id: string, patch: Partial<T>): void {
    const prev = this.get(id);
    if (!prev) return;
    const next: T = { ...prev };
    for (const key of this.spec.localOnly) {
      if (key in patch) next[key] = patch[key] ?? prev[key];
    }
    this.records = this.records.map((r) => (r.id === id ? next : r));
    this.commit();
  }

  /** Forgets local records with these ids (used when discarding rejected writes). */
  forget(ids: readonly string[]): void {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    this.records = this.records.filter((r) => !drop.has(r.id));
    this.commit();
  }

  /**
   * Sends every queued snapshot. Rows the server wrote are settled; rows it
   * skipped (not newer, or already deleted) are fetched and the server
   * version is applied. Permanent errors park the write as failed.
   * Returns false if the result was dropped because the user changed.
   */
  async flush(): Promise<boolean> {
    if (!this.remote) return true;
    const userId = this.ctx.userId;
    if (!this.ctx.isCurrent(userId)) return false;
    for (const batch of chunks(this.ctx.queue.entries(this.spec.table), BATCH)) {
      const ok = await this.sendBatch(batch, userId);
      if (!ok) return false;
    }
    return true;
  }

  private async sendBatch(batch: QueueTables[K][], userId: string): Promise<boolean> {
    if (!this.remote) return true;
    const res = await this.remote.upsert(batch);
    if (!this.ctx.isCurrent(userId)) return false;
    if (!res.ok) {
      // Only a row-level refusal is about this data. Anything else (missing
      // table, stale schema, network) leaves the queue alone and retries.
      if (res.error.kind !== "row") throw new SyncFailure(res.error);
      // One bad row fails the whole batch; retry singly to isolate it.
      if (batch.length > 1) {
        for (const row of batch) {
          const ok = await this.sendBatch([row], userId);
          if (!ok) return false;
        }
        return true;
      }
      this.ctx.queue.fail(this.spec.table, batch[0], res.error.message);
      return true;
    }

    const written = new Map(res.data.map((r) => [r.id, r]));
    const skipped: QueueTables[K][] = [];
    for (const sent of batch) {
      const row = written.get(sent.id);
      if (!row) {
        skipped.push(sent);
        continue;
      }
      if (this.ctx.queue.settle(this.spec.table, sent.id, sent.updated_at)) this.applyServerRow(row);
    }
    if (skipped.length === 0) return true;

    // The server kept its own version: fetch it and let it win.
    const fetched = await this.unwrap(this.remote.fetchByIds(skipped.map((s) => s.id)));
    if (!this.ctx.isCurrent(userId)) return false;
    const byId = new Map(fetched.map((r) => [r.id, r]));
    for (const sent of skipped) {
      const row = byId.get(sent.id);
      if (!row) {
        this.ctx.queue.fail(this.spec.table, sent, "The server did not accept this change.");
        continue;
      }
      if (!this.ctx.queue.settle(this.spec.table, sent.id, sent.updated_at)) continue;
      this.applyServerRow(row);
      // A retry of a write that already landed comes back skipped too; that
      // isn't a conflict. Anything else means another device won.
      const sameWrite = toMillis(row.updated_at) === toMillis(sent.updated_at)
        || (row.deleted_at !== null && sent.deleted_at != null);
      if (!sameWrite) this.ctx.onServerWon(this.spec.table, row.deleted_at !== null ? "deleted" : "changed");
    }
    return true;
  }

  /** Fetches everything and merges it in. Returns false if the result was dropped. */
  async pull(): Promise<boolean> {
    if (!this.remote) return true;
    const userId = this.ctx.userId;
    if (!this.ctx.isCurrent(userId)) return false;
    const rows = await this.unwrap(this.remote.fetchAll());
    if (!this.ctx.isCurrent(userId)) return false;

    const result = mergePulled(this.records, rows, {
      isHeld: (id) => this.ctx.queue.isHeld(this.spec.table, id),
      fromRow: this.spec.fromRow,
      localOnly: this.spec.localOnly,
    });
    for (const id of result.tombstoned) this.ctx.queue.drop(this.spec.table, id);
    if (result.changed) {
      this.records = result.records;
      this.commit();
    }
    // The server lost (or never got) these: push them again rather than lose data.
    for (const id of result.unknownToServer) {
      const rec = this.get(id);
      if (!rec) continue;
      const stamp = rec.updatedAt ?? new Date(this.ctx.now()).toISOString();
      this.ctx.queue.put(this.spec.table, this.spec.toWrite(rec, userId, stamp, null));
    }
    if (result.unknownToServer.length > 0) this.ctx.onQueued();
    return true;
  }

  /** Server version wins: replace or remove the local record. */
  private applyServerRow(row: R): void {
    const local = this.get(row.id);
    if (row.deleted_at !== null) {
      if (!local) return;
      this.records = this.records.filter((r) => r.id !== row.id);
      this.commit();
      return;
    }
    const incoming = withLocalFields(this.spec.fromRow(row), local, this.spec.localOnly);
    this.records = local
      ? this.records.map((r) => (r.id === row.id ? incoming : r))
      : [...this.records, incoming];
    this.commit();
  }

  private async unwrap<V>(p: Promise<RemoteResult<V>>): Promise<V> {
    const res = await p;
    if (!res.ok) throw new SyncFailure(res.error);
    return res.data;
  }

  /** A new edit time, strictly later than the previous one for this record. */
  private nextStamp(prev: string | undefined): string {
    const ms = Math.max(this.ctx.now(), toMillis(prev) + 1);
    return new Date(ms).toISOString();
  }

  private commit(): void {
    this.writeCache();
    this.ctx.onChange();
  }

  private writeCache(): void {
    try {
      this.ctx.store.set(this.cacheKey, JSON.stringify(this.records));
    } catch (e) {
      this.ctx.onStorageError(e);
    }
    this.ctx.onCacheWrite();
  }
}
