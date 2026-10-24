// One synced collection: the in-memory list, its hydrated IndexedDB cache,
// and its share of the shared write queue.
//
// The cache only ever holds live records, in the shape the widgets read.
// Pending deletes live in the queue as tombstone snapshots.

import {
  mergePulled,
  withLocalFields,
  type RowMeta,
  type SyncRecord,
} from "@/lib/sync/merge";
import type { QueueTables, TableName, WriteQueue } from "@/lib/sync/queue";
import type { RemoteResult, SyncError, TableRemote } from "@/lib/sync/remote";
import { readJson, type KeyValueStore } from "@/lib/sync/storage";
import { toMillis } from "@/lib/sync/time";

export interface CollectionSpec<
  K extends TableName,
  T extends SyncRecord,
  R extends RowMeta,
> {
  table: K;
  /** Cache key prefix; the cache lives at `${cacheKeyBase}_${userId}`. */
  cacheKeyBase: string;
  toWrite(
    record: T,
    userId: string,
    updatedAt: string,
    deletedAt: string | null,
  ): QueueTables[K];
  fromRow(row: R): T;
  /** Fields that stay on this device: never sent, kept across merges. */
  localOnly: readonly (keyof T)[];
  prepare?(record: T, previous?: T): T;
  /** Optional identity within the owning user's collection (diary calendar date). */
  naturalKey?(record: T): string;
  writeKey?(write: QueueTables[K]): string;
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
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

export class CollectionSync<
  K extends TableName,
  T extends SyncRecord,
  R extends RowMeta,
> {
  private records: T[] = [];
  private readonly cacheKey: string;
  private readonly aliases = new Map<string, string>();
  private readonly naturalEdits = new Map<string, number>();

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
    if (!Array.isArray(cached))
      throw new Error(
        "Saved planner collection is invalid; original data has been retained",
      );
    const list = cached;
    const stamp = new Date(this.ctx.now()).toISOString();
    let migrated = false;
    this.records = list.map((cached) => {
      const rec = this.spec.prepare?.(cached) ?? cached;
      if (rec.updatedAt) return rec;
      migrated = true;
      const next: T = { ...rec, updatedAt: stamp };
      this.ctx.queue.put(
        this.spec.table,
        this.spec.toWrite(next, this.ctx.userId, stamp, null),
      );
      return next;
    });
    if (migrated) {
      this.writeCache();
      this.ctx.onQueued();
    }
  }

  getSnapshot = (): T[] => this.records;

  get(id: string): T | undefined {
    return this.records.find((r) => r.id === (this.aliases.get(id) ?? id));
  }

  /** Creates or replaces a record locally and queues it. */
  upsert(record: T): T {
    const prev =
      this.get(record.id) ??
      (this.spec.naturalKey &&
        this.records.find(
          (r) => this.spec.naturalKey!(r) === this.spec.naturalKey!(record),
        ));
    record = this.spec.prepare?.(record, prev) ?? record;
    if (prev) record = { ...record, id: prev.id };
    const updatedAt = this.nextStamp(prev?.updatedAt, record);
    const next: T = { ...record, updatedAt };
    // Validate/serialize BEFORE mutating the cache or queue.
    const write = this.spec.toWrite(next, this.ctx.userId, updatedAt, null);
    this.rememberNatural(next, updatedAt);
    this.records = prev
      ? this.records.map((r) => (r.id === record.id ? next : r))
      : [...this.records, next];
    this.commit();
    this.ctx.queue.put(this.spec.table, write);
    this.ctx.onQueued();
    return next;
  }

  /** Removes a record locally and queues its tombstone. */
  remove(id: string): void {
    const prev = this.get(id);
    if (!prev) return;
    id = prev.id;
    const stamp = this.nextStamp(prev.updatedAt, prev);
    const write = this.spec.toWrite(prev, this.ctx.userId, stamp, stamp);
    this.rememberNatural(prev, stamp);
    this.records = this.records.filter((r) => r.id !== id);
    this.commit();
    this.ctx.queue.put(this.spec.table, write);
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
    for (const batch of chunks(
      this.ctx.queue.entries(this.spec.table),
      BATCH,
    )) {
      const ok = await this.sendBatch(batch, userId);
      if (!ok) return false;
    }
    return true;
  }

  private async sendBatch(
    batch: QueueTables[K][],
    userId: string,
  ): Promise<boolean> {
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
      const row =
        written.get(sent.id) ??
        (this.spec.naturalKey &&
          res.data.find(
            (r) =>
              this.spec.naturalKey!(this.spec.fromRow(r)) ===
              this.spec.writeKey?.(sent),
          ));
      if (!row) {
        skipped.push(sent);
        continue;
      }
      this.adoptId(sent.id, row);
      if (row.deleted_at !== null) {
        this.ctx.queue.drop(this.spec.table, row.id);
        this.applyServerRow(row);
        if (!sent.deleted_at) this.ctx.onServerWon(this.spec.table, "deleted");
      } else if (
        this.ctx.queue.settle(this.spec.table, row.id, sent.updated_at)
      ) {
        this.applyServerRow(row);
        // The diary RPC returns the stored winner even for a skipped tie.
        // Report changed content without treating clock clamping as another
        // device's edit, and never notify over a held newer edit.
        if (this.spec.naturalKey) {
          const canonical = this.spec.toWrite(
            this.spec.fromRow(row),
            userId,
            row.updated_at,
            row.deleted_at,
          ) as Record<string, unknown>;
          const metadata = new Set([
            "id",
            "user_id",
            "created_at",
            "updated_at",
          ]);
          if (
            Object.entries(sent).some(
              ([key, value]) =>
                !metadata.has(key) &&
                JSON.stringify(value) !== JSON.stringify(canonical[key]),
            )
          )
            this.ctx.onServerWon(this.spec.table, "changed");
        }
      }
    }
    if (skipped.length === 0) return true;

    // The server kept its own version: fetch it and let it win.
    const fetched = await this.unwrap(
      this.remote.fetchByIds(skipped.map((s) => s.id)),
    );
    if (!this.ctx.isCurrent(userId)) return false;
    const byId = new Map(fetched.map((r) => [r.id, r]));
    for (const sent of skipped) {
      const row = byId.get(sent.id);
      if (!row) {
        this.ctx.queue.fail(
          this.spec.table,
          sent,
          "The server did not accept this change.",
        );
        continue;
      }
      if (!this.ctx.queue.settle(this.spec.table, sent.id, sent.updated_at))
        continue;
      this.applyServerRow(row);
      // A retry of a write that already landed comes back skipped too; that
      // isn't a conflict. Anything else means another device won.
      const sameWrite =
        toMillis(row.updated_at) === toMillis(sent.updated_at) ||
        (row.deleted_at !== null && sent.deleted_at != null);
      if (!sameWrite)
        this.ctx.onServerWon(
          this.spec.table,
          row.deleted_at !== null ? "deleted" : "changed",
        );
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

    // Reconcile offline UUIDs before the ordinary ID-based merge. A known
    // UUID tombstone always wins over a new live entry for that date.
    if (this.spec.naturalKey) {
      for (const row of rows)
        this.rememberNatural(
          this.spec.fromRow(row),
          row.updated_at,
          row.deleted_at,
        );
      for (const local of [...this.records]) {
        if (rows.some((row) => row.id === local.id)) continue;
        const matches = rows.filter(
          (row) =>
            this.spec.naturalKey!(this.spec.fromRow(row)) ===
            this.spec.naturalKey!(local),
        );
        const canonical =
          matches.find((row) => row.deleted_at === null) ??
          matches
            .filter(
              (row) =>
                Math.max(
                  toMillis(row.updated_at),
                  toMillis(row.deleted_at ?? undefined),
                ) >= toMillis(local.updatedAt),
            )
            .sort(
              (a, b) =>
                Math.max(
                  toMillis(b.updated_at),
                  toMillis(b.deleted_at ?? undefined),
                ) -
                Math.max(
                  toMillis(a.updated_at),
                  toMillis(a.deleted_at ?? undefined),
                ),
            )[0];
        if (canonical) this.adoptId(local.id, canonical);
      }
    }

    const result = mergePulled(this.records, rows, {
      isHeld: (id) => this.ctx.queue.isHeld(this.spec.table, id),
      fromRow: this.spec.fromRow,
      localOnly: this.spec.localOnly,
    });
    for (const id of result.tombstoned)
      this.ctx.queue.drop(this.spec.table, id);
    if (result.changed) {
      this.records = result.records;
      this.commit();
    }
    // The server lost (or never got) these: push them again rather than lose data.
    for (const id of result.unknownToServer) {
      const rec = this.get(id);
      if (!rec) continue;
      const stamp = rec.updatedAt ?? new Date(this.ctx.now()).toISOString();
      this.ctx.queue.put(
        this.spec.table,
        this.spec.toWrite(rec, userId, stamp, null),
      );
    }
    if (result.unknownToServer.length > 0) this.ctx.onQueued();
    return true;
  }

  /** Server version wins: replace or remove the local record. */
  private applyServerRow(row: R): void {
    if (this.spec.naturalKey)
      this.rememberNatural(
        this.spec.fromRow(row),
        row.updated_at,
        row.deleted_at,
      );
    const local = this.get(row.id);
    if (row.deleted_at !== null) {
      if (!local) return;
      this.records = this.records.filter((r) => r.id !== row.id);
      this.commit();
      return;
    }
    const incoming = withLocalFields(
      this.spec.fromRow(row),
      local,
      this.spec.localOnly,
    );
    this.records = local
      ? this.records.map((r) => (r.id === row.id ? incoming : r))
      : [...this.records, incoming];
    this.commit();
  }

  private adoptId(from: string, row: R): void {
    if (from === row.id) return;
    this.aliases.set(from, row.id);
    for (const [alias, id] of this.aliases)
      if (id === from) this.aliases.set(alias, row.id);
    this.ctx.queue.remap(this.spec.table, from, row.id);
    const local = this.records.find((record) => record.id === from);
    if (local) {
      const canonical = this.get(row.id);
      const winner =
        canonical && toMillis(canonical.updatedAt) >= toMillis(local.updatedAt)
          ? canonical
          : { ...local, id: row.id };
      this.records = [
        ...this.records.filter(
          (record) => record.id !== from && record.id !== row.id,
        ),
        winner,
      ];
      this.commit();
    }
  }

  private async unwrap<V>(p: Promise<RemoteResult<V>>): Promise<V> {
    const res = await p;
    if (!res.ok) throw new SyncFailure(res.error);
    return res.data;
  }

  /** A new edit time, strictly later than the previous one for this record. */
  private nextStamp(prev: string | undefined, record?: T): string {
    let last = toMillis(prev);
    if (record && this.spec.naturalKey && this.spec.writeKey) {
      const key = this.spec.naturalKey(record);
      last = Math.max(last, this.naturalEdits.get(key) ?? -Infinity);
      for (const row of [
        ...this.ctx.queue.entries(this.spec.table),
        ...this.ctx.queue
          .failedEntries(this.spec.table)
          .map((entry) => entry.row),
      ]) {
        if (this.spec.writeKey(row) === key)
          last = Math.max(last, toMillis(row.updated_at));
      }
    }
    const ms = Math.max(this.ctx.now(), last + 1);
    return new Date(ms).toISOString();
  }

  private rememberNatural(
    record: T,
    ...stamps: (string | null | undefined)[]
  ): void {
    if (!this.spec.naturalKey) return;
    const key = this.spec.naturalKey(record);
    this.naturalEdits.set(
      key,
      Math.max(
        this.naturalEdits.get(key) ?? -Infinity,
        ...stamps.map(toMillis),
      ),
    );
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
