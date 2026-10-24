// The offline write queue: one per user, shared by goals and events.
//
// Each entry is the latest full-row snapshot for a record, keyed by id, and is
// sent as an idempotent upsert. A delete is the same upsert with deleted_at
// set. There are no op types and nothing is collapsed: a newer snapshot simply
// replaces the older one. After a send, an entry is removed only if it still
// holds the snapshot that was sent (same updated_at), so edits made while a
// request is in flight are never lost.

import type {
  EventWrite,
  GoalWrite,
  NoteWrite,
  DiaryWrite,
} from "@/lib/sync/mappers";
import { compareTimestamps } from "./time";
import { readJson, type KeyValueStore } from "@/lib/sync/storage";

export interface QueueTables {
  goals: GoalWrite;
  events: EventWrite;
  notes: NoteWrite;
  diary_entries: DiaryWrite;
}
export type TableName = keyof QueueTables;

export interface FailedWrite<W> {
  row: W;
  error: string;
}

type Pending = { [K in TableName]: Record<string, QueueTables[K]> };
type Failed = { [K in TableName]: Record<string, FailedWrite<QueueTables[K]>> };

interface QueueData {
  pending: Pending;
  failed: Failed;
}

export const TABLES: readonly TableName[] = [
  "goals",
  "events",
  "notes",
  "diary_entries",
];

function emptyData(): QueueData {
  return {
    pending: { goals: {}, events: {}, notes: {}, diary_entries: {} },
    failed: { goals: {}, events: {}, notes: {}, diary_entries: {} },
  };
}

export function queueStorageKey(userId: string) {
  return `facta_sync_queue_${userId}`;
}

export class WriteQueue {
  private data: QueueData;

  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string,
    private readonly onStorageError: (error: unknown) => void = () => {},
  ) {
    const loaded = readJson<Partial<QueueData>>(store, key, {});
    const isMap = (value: unknown) =>
      typeof value === "object" && value !== null && !Array.isArray(value);
    if (
      !isMap(loaded) ||
      (loaded.pending !== undefined && !isMap(loaded.pending)) ||
      (loaded.failed !== undefined && !isMap(loaded.failed))
    )
      throw new Error(
        "Saved sync queue is invalid; original data has been retained",
      );
    const data = emptyData();
    for (const t of TABLES) {
      if (
        (loaded.pending?.[t] !== undefined && !isMap(loaded.pending[t])) ||
        (loaded.failed?.[t] !== undefined && !isMap(loaded.failed[t]))
      )
        throw new Error(
          "Saved sync queue is invalid; original data has been retained",
        );
      Object.assign(data.pending[t], loaded.pending?.[t] ?? {});
      Object.assign(data.failed[t], loaded.failed?.[t] ?? {});
    }
    this.data = data;
  }

  /** Stores the latest snapshot for a record, replacing any older one. */
  put<K extends TableName>(table: K, row: QueueTables[K]): void {
    const pending: Record<string, QueueTables[K]> = this.data.pending[table];
    pending[row.id] = row;
    // A fresh local edit supersedes a write the server rejected earlier.
    const failed: Record<string, FailedWrite<QueueTables[K]>> = this.data
      .failed[table];
    delete failed[row.id];
    this.persist();
  }

  get<K extends TableName>(table: K, id: string): QueueTables[K] | undefined {
    const pending: Record<string, QueueTables[K]> = this.data.pending[table];
    return pending[id];
  }

  entries<K extends TableName>(table: K): QueueTables[K][] {
    const pending: Record<string, QueueTables[K]> = this.data.pending[table];
    return Object.values(pending);
  }

  /** True while the record has a write waiting to go out, or one the server rejected. */
  isHeld(table: TableName, id: string): boolean {
    return id in this.data.pending[table] || id in this.data.failed[table];
  }

  /**
   * Removes the entry if it still holds the snapshot that was sent. Returns
   * false when a newer local edit replaced it in the meantime.
   */
  settle(table: TableName, id: string, sentUpdatedAt: string): boolean {
    const pending = this.data.pending[table];
    const current = pending[id];
    if (!current || current.updated_at !== sentUpdatedAt) return false;
    delete pending[id];
    this.persist();
    return true;
  }

  /** Unconditionally forgets a record (e.g. the server says it is deleted). */
  drop(table: TableName, id: string): void {
    delete this.data.pending[table][id];
    delete this.data.failed[table][id];
    this.persist();
  }

  /** Adopt the server's canonical UUID without losing an in-flight local edit. */
  remap(table: TableName, from: string, to: string): void {
    if (from === to) return;
    const incoming = this.data.pending[table][from];
    const current = this.data.pending[table][to];
    if (
      incoming &&
      (!current ||
        (!current.deleted_at &&
          (incoming.deleted_at ||
            compareTimestamps(incoming.updated_at, current.updated_at) > 0)))
    )
      this.data.pending[table][to] = { ...incoming, id: to };
    const failed = this.data.failed[table][from];
    if (failed && !this.data.failed[table][to] && !this.data.pending[table][to])
      this.data.failed[table][to] = {
        ...failed,
        row: { ...failed.row, id: to },
      };
    delete this.data.pending[table][from];
    delete this.data.failed[table][from];
    this.persist();
  }

  /** Parks a write the server rejected, if it is still the latest snapshot. */
  fail<K extends TableName>(
    table: K,
    row: QueueTables[K],
    error: string,
  ): boolean {
    if (!this.settle(table, row.id, row.updated_at)) return false;
    const failed: Record<string, FailedWrite<QueueTables[K]>> = this.data
      .failed[table];
    failed[row.id] = { row, error };
    this.persist();
    return true;
  }

  failedEntries<K extends TableName>(table: K): FailedWrite<QueueTables[K]>[] {
    const failed: Record<string, FailedWrite<QueueTables[K]>> = this.data
      .failed[table];
    return Object.values(failed);
  }

  /** Moves every rejected write back into the pending queue. */
  retryFailed(): void {
    for (const t of TABLES) this.retryFailedIn(t);
    this.persist();
  }

  private retryFailedIn<K extends TableName>(table: K): void {
    const failed: Record<string, FailedWrite<QueueTables[K]>> = this.data
      .failed[table];
    const pending: Record<string, QueueTables[K]> = this.data.pending[table];
    for (const [id, entry] of Object.entries(failed)) {
      pending[id] = entry.row;
      delete failed[id];
    }
  }

  /** Forgets every rejected write; returns their ids per table. */
  discardFailed(): { [K in TableName]: string[] } {
    const out = Object.fromEntries(
      TABLES.map((table) => [table, Object.keys(this.data.failed[table])]),
    ) as { [K in TableName]: string[] };
    this.data.failed = emptyData().failed;
    this.persist();
    return out;
  }

  get pendingCount(): number {
    return TABLES.reduce(
      (n, t) => n + Object.keys(this.data.pending[t]).length,
      0,
    );
  }

  get failedCount(): number {
    return TABLES.reduce(
      (n, t) => n + Object.keys(this.data.failed[t]).length,
      0,
    );
  }

  private persist(): void {
    try {
      this.store.set(this.key, JSON.stringify(this.data));
    } catch (e) {
      // The in-memory queue still holds the write; it just won't survive a restart.
      this.onStorageError(e);
    }
  }
}
