// PlannerSync: the per-user sync engine for goals and events.
//
// It owns the shared write queue and both collections, and schedules work:
//   * local edits flush (debounced) right away;
//   * a full pull, preceded by a flush, runs on start, on window focus, on
//     reconnect and on an interval;
//   * transient failures retry with backoff.
// Flushes and pulls never overlap, so a pull can't resurrect a record whose
// delete was just confirmed. Status changes are published to subscribers;
// the engine itself never touches the UI.

import type { CalendarEvent, Goal, Note, DiaryEntry } from "@/types/planner";
import {
  eventFromRow,
  eventToRow,
  goalFromRow,
  goalToRow,
  type EventRow,
  type EventWrite,
  type GoalRow,
  type GoalWrite,
  type NoteRow,
  type NoteWrite,
  type DiaryRow,
  type DiaryWrite,
} from "@/lib/sync/mappers";
import { CollectionSync, SyncFailure } from "@/lib/sync/collection";
import {
  WriteQueue,
  queueStorageKey,
  TABLES,
  type TableName,
} from "@/lib/sync/queue";
import type { TableRemote } from "@/lib/sync/remote";
import type { KeyValueStore } from "@/lib/sync/storage";

import { noteSpec, diarySpec } from "./specs";
import { storageErrorMessage } from "./indexedDbStore";

export type SyncState = "local-only" | "idle" | "syncing" | "offline" | "error";

export interface SyncStatus {
  state: SyncState;
  /** Writes waiting to go out. */
  pending: number;
  /** Writes the server rejected; kept until retried or discarded. */
  failed: number;
  lastError: string | null;
  lastSyncedAt: number | null;
  storageError?: boolean;
}

export interface PlannerRemotes {
  goals: TableRemote<GoalWrite, GoalRow>;
  events: TableRemote<EventWrite, EventRow>;
  notes: TableRemote<NoteWrite, NoteRow>;
  diary_entries: TableRemote<DiaryWrite, DiaryRow>;
}

export interface PlannerSyncOptions {
  userId: string;
  store: KeyValueStore;
  /** null when Supabase isn't configured: everything stays local. */
  remotes: PlannerRemotes | null;
  /** The signed-in user right now; results for anyone else are dropped. */
  currentUserId(): string | null;
  now?: () => number;
  onCacheWrite?: () => void;
  /** A local edit was replaced by the server's version during a flush. */
  onServerWon?: (table: TableName, outcome: "changed" | "deleted") => void;
  flushDelayMs?: number;
  pullIntervalMs?: number;
}

const MAX_BACKOFF_MS = 60_000;
// Only show "syncing" if a run takes longer than this, so quick runs don't flash.
const SYNCING_DELAY_MS = 300;

export class PlannerSync {
  readonly goals: CollectionSync<"goals", Goal, GoalRow>;
  readonly events: CollectionSync<"events", CalendarEvent, EventRow>;
  readonly notes: CollectionSync<"notes", Note, NoteRow>;
  readonly diaryEntries: CollectionSync<"diary_entries", DiaryEntry, DiaryRow>;
  readonly userId: string;

  private readonly queue: WriteQueue;
  private readonly opts: PlannerSyncOptions;
  private status: SyncStatus;
  private readonly listeners = new Set<() => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private storageFailure: string | null = null;
  private syncInFlight: Promise<void> | null = null;
  private teardown: (() => void)[] = [];

  constructor(opts: PlannerSyncOptions) {
    this.opts = opts;
    this.userId = opts.userId;
    const now = opts.now ?? Date.now;
    const onStorageError = (e: unknown) => this.reportStorageError(e);
    this.queue = new WriteQueue(
      opts.store,
      queueStorageKey(opts.userId),
      onStorageError,
    );

    const ctx = {
      userId: opts.userId,
      store: opts.store,
      queue: this.queue,
      now,
      isCurrent: (uid: string) =>
        !this.disposed && opts.currentUserId() === uid,
      onCacheWrite: () => opts.onCacheWrite?.(),
      onChange: () => this.emit(),
      onQueued: () => this.scheduleFlush(),
      onServerWon: (table: TableName, outcome: "changed" | "deleted") =>
        opts.onServerWon?.(table, outcome),
      onStorageError,
    };
    this.goals = new CollectionSync(
      {
        table: "goals",
        cacheKeyBase: "planner_goals",
        toWrite: goalToRow,
        fromRow: goalFromRow,
        localOnly: ["lastNotifiedDate"],
      },
      opts.remotes?.goals ?? null,
      ctx,
    );
    this.events = new CollectionSync(
      {
        table: "events",
        cacheKeyBase: "planner_events",
        toWrite: eventToRow,
        fromRow: eventFromRow,
        localOnly: [],
      },
      opts.remotes?.events ?? null,
      ctx,
    );
    this.notes = new CollectionSync(noteSpec, opts.remotes?.notes ?? null, ctx);
    this.diaryEntries = new CollectionSync(
      diarySpec,
      opts.remotes?.diary_entries ?? null,
      ctx,
    );
    this.status = {
      state: opts.remotes ? "idle" : "local-only",
      pending: 0,
      failed: 0,
      lastError: null,
      lastSyncedAt: null,
      storageError: false,
    };
    const unsubscribe = opts.store.subscribeErrors?.(onStorageError);
    if (unsubscribe) this.teardown.push(unsubscribe);
  }

  /** Loads the caches. Call once, before reading any data. */
  load(): void {
    this.goals.load();
    this.events.load();
    this.notes.load();
    this.diaryEntries.load();
    this.refreshCounts();
  }

  /** Starts background syncing: an initial sync, focus/online listeners, the interval. */
  start(): void {
    if (!this.opts.remotes) return;
    void this.syncNow();
    if (typeof window !== "undefined") {
      const onWake = () => {
        void this.syncNow();
      };
      window.addEventListener("focus", onWake);
      window.addEventListener("online", onWake);
      this.teardown.push(() => {
        window.removeEventListener("focus", onWake);
        window.removeEventListener("online", onWake);
      });
    }
    this.pullTimer = setInterval(() => {
      void this.syncNow();
    }, this.opts.pullIntervalMs ?? 60_000);
  }

  dispose(): void {
    this.disposed = true;
    for (const fn of this.teardown) fn();
    this.teardown = [];
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pullTimer) clearInterval(this.pullTimer);
    this.listeners.clear();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getStatus = (): SyncStatus => this.status;

  /** Runs after anything is queued: flushes soon, without pulling. */
  private scheduleFlush(): void {
    this.refreshCounts();
    if (!this.opts.remotes || this.disposed) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.runFlush(true);
    }, this.opts.flushDelayMs ?? 800);
  }

  /** Sends queued writes. */
  flush(): Promise<void> {
    return this.runFlush(false);
  }

  /** quiet: the debounced flush after an edit never shows "syncing". */
  private runFlush(quiet: boolean): Promise<void> {
    return this.exclusive(
      async () => {
        if (!(await this.goals.flush())) return;
        if (!(await this.events.flush())) return;
        if (!(await this.notes.flush())) return;
        await this.diaryEntries.flush();
      },
      { quiet },
    );
  }

  /**
   * Sends queued writes, then pulls everything. Calls made while a sync is
   * already waiting or running share it (focus events come in bursts).
   */
  syncNow(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;
    const run = this.fullSync().finally(() => {
      if (this.syncInFlight === run) this.syncInFlight = null;
    });
    this.syncInFlight = run;
    return run;
  }

  private fullSync(): Promise<void> {
    return this.exclusive(
      async () => {
        if (!(await this.goals.flush())) return;
        if (!(await this.events.flush())) return;
        if (!(await this.notes.flush())) return;
        if (!(await this.diaryEntries.flush())) return;
        if (!(await this.goals.pull())) return;
        if (!(await this.events.pull())) return;
        if (!(await this.notes.pull())) return;
        await this.diaryEntries.pull();
      },
      { isPull: true },
    );
  }

  /** Puts rejected writes back in the queue and tries again. */
  retryFailed(): Promise<void> {
    this.queue.retryFailed();
    this.refreshCounts();
    return this.fullSync();
  }

  /** Drops rejected writes and takes the server's version of those records. */
  discardFailed(): Promise<void> {
    const ids = this.queue.discardFailed();
    this.goals.forget(ids.goals);
    this.events.forget(ids.events);
    this.notes.forget(ids.notes);
    this.diaryEntries.forget(ids.diary_entries);
    this.setStatus({ lastError: null });
    return this.fullSync();
  }

  private exclusive(
    work: () => Promise<void>,
    { isPull = false, quiet = false } = {},
  ): Promise<void> {
    const run = async () => {
      if (this.disposed) return;
      const showSyncing = quiet
        ? null
        : setTimeout(() => {
            if (!this.disposed) this.setStatus({ state: "syncing" });
          }, SYNCING_DELAY_MS);
      try {
        if (this.opts.store.flush) {
          await this.opts.store.flush();
          this.storageFailure = null;
        }
        await work();
        if (this.opts.store.flush) {
          await this.opts.store.flush();
          this.storageFailure = null;
        }
        if (this.disposed) return;
        this.failures = 0;
        this.refreshCounts();
        const failed = this.queue.failedCount;
        this.setStatus({
          state: failed > 0 ? "error" : "idle",
          lastError: failed > 0 ? this.failedMessage(failed) : null,
          lastSyncedAt:
            isPull && this.opts.remotes
              ? (this.opts.now ?? Date.now)()
              : this.status.lastSyncedAt,
        });
        // Edits made during this run are flushed by their own scheduled flush.
      } catch (e) {
        if (this.disposed) return;
        this.refreshCounts();
        const err =
          e instanceof SyncFailure
            ? e.error
            : { message: errorMessage(e), kind: "server" as const };
        this.setStatus({
          state: err.kind === "offline" ? "offline" : "error",
          lastError: err.message,
        });
        // Row errors are parked inside the run, so whatever reaches here is
        // sync-wide: keep everything queued and try again later.
        this.scheduleRetry();
      } finally {
        if (showSyncing) clearTimeout(showSyncing);
      }
    };
    const next = this.chain.then(run);
    this.chain = next.catch(() => {});
    return next;
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.disposed) return;
    this.failures += 1;
    const delay = Math.min(2_000 * 2 ** (this.failures - 1), MAX_BACKOFF_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, delay);
  }

  private failedMessage(n: number): string {
    const first = TABLES.flatMap((table) => this.queue.failedEntries(table))[0];
    const reason = first ? `: ${first.error}` : "";
    return n === 1
      ? `1 change was rejected by the server${reason}`
      : `${n} changes were rejected by the server${reason}`;
  }

  private reportStorageError(e: unknown): void {
    this.storageFailure = storageErrorMessage(e);
    this.setStatus({
      state: "error",
      lastError: this.storageFailure,
      storageError: true,
    });
  }

  private refreshCounts(): void {
    this.setStatus({
      pending: this.queue.pendingCount,
      failed: this.queue.failedCount,
    });
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    const next = {
      ...this.status,
      ...patch,
      storageError: this.storageFailure !== null,
    };
    if (this.storageFailure) {
      next.state = "error";
      next.lastError = this.storageFailure;
    }
    if (!this.opts.remotes)
      next.state = next.state === "error" ? "error" : "local-only";
    const prev = this.status;
    if (
      next.state === prev.state &&
      next.pending === prev.pending &&
      next.failed === prev.failed &&
      next.storageError === prev.storageError &&
      next.lastError === prev.lastError &&
      next.lastSyncedAt === prev.lastSyncedAt
    )
      return;
    this.status = next;
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
