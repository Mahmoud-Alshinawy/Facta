import type {
  SharedCommand,
  SharedOutcome,
  HistoryRange,
} from "@/types/sharedGoals";
import {
  assert,
  freeze,
  parseCommand,
  validateDraft,
  isUuid,
} from "@/lib/sharedGoals/contracts";
import { defaultHistoryRange } from "@/lib/sharedGoals/dates";
import { reconcileSnapshot, forgetGroup } from "@/lib/sharedGoals/cache";
import type { KeyValueStore } from "../storage";
import { storageErrorMessage } from "../indexedDbStore";
import { SharedRemoteError, type SharedRemote } from "./remote";
import {
  acknowledge,
  appendCheckin,
  prepareCheckin,
  type CheckinInput,
} from "./outbox";
import {
  decodeSharedState,
  emptySharedState,
  encodeSharedState,
  sharedStorageKey,
  type SharedState,
  type SharedLocalDraft,
} from "./state";

export interface SharedStatus {
  state:
    | "local-only"
    | "idle"
    | "syncing"
    | "offline"
    | "unavailable"
    | "error"
    | "paused";
  pending: number;
  failed: number;
  storageError: boolean;
  lastError: string | null;
  lastSyncedAt: number | null;
}
export interface SharedSyncOptions {
  userId: string;
  store: KeyValueStore;
  remote: SharedRemote | null;
  currentUserId(): string | null;
  now?: () => number;
  isOnline?: () => boolean;
  onCacheWrite?: () => void;
  intervalMs?: number;
  debounceMs?: number;
}

/** Separate from PlannerSync's full-row queue. Local changes and acknowledgements
 * publish only after their single account record commits. Network work never
 * owns the local mutation chain, so edits remain possible during a slow RPC. */
export class SharedSync {
  readonly userId: string;
  private state: SharedState;
  private staged: SharedState | null = null;
  private readonly hidden: SharedState;
  private readonly paused: SharedStatus = {
    state: "paused",
    pending: 0,
    failed: 0,
    storageError: false,
    lastError: null,
    lastSyncedAt: null,
  };
  private status: SharedStatus;
  private loaded = false;
  private disposed = false;
  private started = false;
  private localChain: Promise<unknown> = Promise.resolve();
  private networkChain: Promise<unknown> = Promise.resolve();
  private inFlight: Promise<void> | null = null;
  private ranges = new Map<string, HistoryRange>();
  private activeRange: string | null = null;
  private listeners = new Set<() => void>();
  private teardown: (() => void)[] = [];
  private controller = new AbortController();
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private failures = 0;

  constructor(private readonly options: SharedSyncOptions) {
    this.userId = options.userId;
    assert(!options.remote || options.remote.userId === this.userId);
    this.state = freeze(emptySharedState(this.userId));
    this.hidden = this.state;
    this.status = {
      ...this.paused,
      state: options.remote ? "idle" : "local-only",
    };
    const unsubscribe = options.store.subscribeErrors?.((error) =>
      this.storageFailure(error),
    );
    if (unsubscribe) this.teardown.push(unsubscribe);
  }
  private current = () =>
    !this.disposed && this.options.currentUserId() === this.userId;
  private now = () => (this.options.now ?? Date.now)();
  private online = () =>
    this.options.isOnline?.() ??
    (typeof navigator === "undefined" || navigator.onLine);
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = (): SharedState => (this.current() ? this.state : this.hidden);
  getStatus = (): SharedStatus => (this.current() ? this.status : this.paused);
  private emit() {
    if (this.current()) for (const listener of this.listeners) listener();
  }
  private patch(patch: Partial<SharedStatus>) {
    if (!this.current()) return;
    this.status = {
      ...this.status,
      ...patch,
      pending: this.state.outbox.filter((e) => e.phase !== "failed").length,
      failed: this.state.outbox.filter((e) => e.phase === "failed").length,
    };
    this.emit();
  }
  private storageFailure(error: unknown) {
    this.patch({
      state: "error",
      storageError: true,
      lastError: storageErrorMessage(error),
    });
  }

  load(): void {
    if (!this.current()) return;
    try {
      const raw = this.options.store.get(sharedStorageKey(this.userId));
      this.state =
        raw === null
          ? freeze(emptySharedState(this.userId))
          : decodeSharedState(raw, this.userId);
      this.loaded = true;
      this.patch({
        state: this.options.remote ? "idle" : "local-only",
        lastError: null,
        storageError: false,
        lastSyncedAt: this.state.cache?.confirmedAt ?? null,
      });
    } catch {
      this.loaded = false;
      this.storageFailure(
        new Error(
          "Saved shared goals are incompatible or damaged. Their original data has been retained.",
        ),
      );
    }
  }
  start(): void {
    if (this.started || !this.loaded || !this.current() || !this.options.remote)
      return;
    this.started = true;
    if (typeof window !== "undefined") {
      const wake = () => {
        void this.syncNow();
      };
      window.addEventListener("focus", wake);
      window.addEventListener("online", wake);
      this.teardown.push(() => {
        window.removeEventListener("focus", wake);
        window.removeEventListener("online", wake);
      });
    }
    this.interval = setInterval(() => {
      void this.syncNow();
    }, this.options.intervalMs ?? 60_000);
    void this.syncNow();
  }
  dispose(): void {
    this.disposed = true;
    this.controller.abort();
    this.teardown.forEach((fn) => fn());
    this.teardown = [];
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.interval) clearInterval(this.interval);
    this.listeners.clear();
    this.ranges.clear();
  }

  private mutate(change: (state: SharedState) => SharedState): Promise<void> {
    const run = this.localChain.then(async () => {
      if (!this.current()) throw new Error("The shared account changed");
      if (!this.loaded)
        throw new Error("Saved shared goals must be recovered before editing");
      try {
        try {
          await this.options.store.flush?.();
        } catch (error) {
          this.storageFailure(error);
          throw error;
        }
        if (!this.current()) throw new Error("The shared account changed");
        if (this.staged) {
          this.state = this.staged;
          this.staged = null;
          this.options.onCacheWrite?.();
        }
        const next = freeze(change(this.state));
        if (next !== this.state) {
          try {
            this.options.store.set(
              sharedStorageKey(this.userId),
              encodeSharedState(next),
            );
          } catch (error) {
            this.storageFailure(error);
            throw error;
          }
          this.staged = next;
          await this.options.store.flush?.();
          if (!this.current()) throw new Error("The shared account changed");
          this.state = next;
          this.staged = null;
          this.options.onCacheWrite?.();
        }
        this.patch({
          storageError: false,
          ...(this.status.storageError
            ? {
                state: this.options.remote
                  ? ("idle" as const)
                  : ("local-only" as const),
                lastError: null,
              }
            : {}),
        });
      } catch (error) {
        if (this.current() && (this.staged || this.status.storageError))
          this.storageFailure(error);
        throw error;
      }
    });
    this.localChain = run.catch(() => {});
    return run;
  }
  async retrySaving(): Promise<void> {
    if (!this.loaded) this.load();
    await this.mutate((state) => state);
    this.scheduleWake();
  }
  async enqueueCheckin(input: CheckinInput): Promise<void> {
    await this.mutate((state) => {
      assert(state.cache);
      return {
        ...state,
        outbox: appendCheckin(
          state.outbox,
          state.receipts,
          state.cache.snapshot,
          this.userId,
          input,
          this.now(),
        ),
      };
    });
    this.scheduleWake();
  }
  saveDraft(draft: SharedLocalDraft): Promise<void> {
    assert(isUuid(draft.id));
    const fields = validateDraft(draft.fields);
    return this.mutate((state) => ({
      ...state,
      drafts: [
        ...state.drafts.filter((d) => d.id !== draft.id),
        { id: draft.id, fields, updatedAt: this.now() },
      ],
    }));
  }
  removeDraft(id: string): Promise<void> {
    return this.mutate((state) => ({
      ...state,
      drafts: state.drafts.filter((d) => d.id !== id),
    }));
  }
  discardFailed(id: string): Promise<void> {
    return this.mutate((state) => {
      assert(state.outbox.some((e) => e.id === id && e.phase === "failed"));
      return {
        ...state,
        outbox: state.outbox
          .filter((e) => e.id !== id)
          .map((e) =>
            e.after === id && !e.command
              ? { ...e, phase: "failed", failure: "dependency_failed" }
              : e,
          ),
      };
    });
  }
  async retryFailed(id: string): Promise<void> {
    await this.syncNow();
    await this.mutate((state) => {
      const old = state.outbox.find((e) => e.id === id && e.phase === "failed");
      assert(old && state.cache);
      const member = state.cache.snapshot.memberships.find(
        (m) => m.id === old.membershipId && !m.leftAt && !m.deletedAt,
      );
      assert(member);
      const rest = state.outbox.filter((e) => e.id !== id);
      assert(!rest.some((e) => e.after === id));
      return {
        ...state,
        outbox: appendCheckin(
          rest,
          state.receipts,
          state.cache.snapshot,
          this.userId,
          {
            groupId: old.groupId,
            date: old.date,
            capturedAt: old.capturedAt,
            completed: old.completed,
          },
          this.now(),
        ),
      };
    });
    this.scheduleWake();
  }
  private network<T>(work: () => Promise<T>): Promise<T> {
    const run = this.networkChain.then(work);
    this.networkChain = run.catch(() => {});
    return run;
  }
  async previewInvite(token: string) {
    if (!this.current() || !this.options.remote || !this.online())
      throw new SharedRemoteError("offline");
    const value = await this.options.remote.preview(
      token,
      this.controller.signal,
    );
    if (!this.current()) throw new Error("The shared account changed");
    return value;
  }
  async pendingInvites() {
    if (!this.current() || !this.options.remote || !this.online())
      throw new SharedRemoteError("offline");
    const value = await this.options.remote.pendingInvites(
      this.controller.signal,
    );
    if (!this.current()) throw new Error("The shared account changed");
    return value;
  }
  /** Online control operations are not silently queued. Caller retains this
   * immutable packet for an uncertain reply. Tokens remain only in memory. */
  executeOnline(value: SharedCommand): Promise<SharedOutcome> {
    const command = parseCommand(value);
    assert(command.operation !== "set_checkin");
    return this.network(async () => {
      if (!this.current() || !this.options.remote || !this.online())
        throw new SharedRemoteError("offline");
      await this.mutate((state) => state);
      const outcome = await this.options.remote.command(
        command,
        this.controller.signal,
      );
      if (!this.current()) throw new Error("The shared account changed");
      if (outcome.ok)
        await this.mutate((state) => ({
          ...state,
          needsRefresh: true,
          cache:
            outcome.code === "left" && outcome.groupId
              ? forgetGroup(state.cache, outcome.groupId, this.userId)
              : state.cache,
        }));
      this.scheduleWake();
      return outcome;
    });
  }

  syncNow(
    range: HistoryRange = defaultHistoryRange(this.now()),
  ): Promise<void> {
    if (!this.current() || !this.loaded) return Promise.resolve();
    const key = `${range.from}:${range.until}`;
    if (key !== this.activeRange) this.ranges.set(key, range);
    if (this.inFlight) return this.inFlight;
    let success = false;
    const run = this.network(async () => {
      await this.mutate((state) => state);
      if (!this.options.remote) {
        this.ranges.clear();
        this.patch({ state: "local-only" });
        return;
      }
      if (!this.online()) throw new SharedRemoteError("offline");
      this.patch({ state: "syncing", lastError: null });
      while (this.current() && this.ranges.size) {
        const [rangeKey, next] = this.ranges.entries().next().value!;
        this.ranges.delete(rangeKey);
        this.activeRange = rangeKey;
        await this.pull(next);
        let changed = false;
        const tried = new Set<string>();
        while (this.current()) {
          const intent = this.state.outbox.find(
            (e) => e.phase !== "failed" && !tried.has(e.id),
          );
          if (!intent) break;
          tried.add(intent.id);
          await this.mutate((state) => {
            const entry = state.outbox.find((e) => e.id === intent.id);
            assert(entry && state.cache);
            const predecessorFailed =
              entry.after &&
              state.outbox.some(
                (e) => e.id === entry.after && e.phase === "failed",
              );
            const prepared =
              predecessorFailed && !entry.command
                ? freeze({
                    ...entry,
                    phase: "failed" as const,
                    failure: "dependency_failed",
                  })
                : prepareCheckin(
                    entry,
                    state.receipts,
                    state.cache.snapshot,
                    this.now(),
                  );
            return prepared === entry
              ? state
              : {
                  ...state,
                  outbox: state.outbox.map((e) =>
                    e.id === entry.id ? prepared : e,
                  ),
                };
          });
          if (!this.current()) return;
          const prepared = this.state.outbox.find((e) => e.id === intent.id);
          if (!prepared?.command || prepared.phase === "failed") continue;
          let outcome: SharedOutcome;
          try {
            outcome = await this.options.remote.command(
              prepared.command,
              this.controller.signal,
            );
          } catch (error) {
            if (
              error instanceof SharedRemoteError &&
              error.kind === "rejected"
            ) {
              await this.mutate((state) => ({
                ...state,
                outbox: state.outbox.map((e) =>
                  e.id === intent.id
                    ? { ...e, phase: "failed", failure: "invalid_command" }
                    : e,
                ),
              }));
              continue;
            }
            throw error;
          }
          if (!this.current()) return;
          await this.mutate((state) => ({
            ...state,
            ...acknowledge(
              state.outbox,
              state.receipts,
              prepared,
              outcome,
              this.now(),
            ),
            needsRefresh: state.needsRefresh || outcome.ok,
          }));
          changed = true;
        }
        if (changed && this.current()) await this.pull(next);
      }
      this.failures = 0;
      success = true;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      this.patch({
        state: this.state.outbox.some((e) => e.phase === "failed")
          ? "error"
          : "idle",
        lastError: this.state.outbox.some((e) => e.phase === "failed")
          ? "Some shared check-ins need review. Their intent has been retained."
          : null,
      });
    })
      .catch((error) => {
        if (!this.current()) return;
        if (!this.status.storageError) {
          const e =
            error instanceof SharedRemoteError
              ? error
              : new SharedRemoteError("server");
          this.patch({
            state:
              e.kind === "offline"
                ? "offline"
                : e.kind === "unavailable"
                  ? "unavailable"
                  : "error",
            lastError: e.message,
          });
        }
        this.scheduleRetry();
      })
      .finally(() => {
        this.activeRange = null;
        if (this.inFlight === run) this.inFlight = null;
        if (success && this.state.outbox.some((e) => e.phase !== "failed"))
          this.scheduleWake();
      });
    this.inFlight = run;
    return run;
  }
  private async pull(range: HistoryRange) {
    const fresh = await this.options.remote!.snapshot(
      range,
      this.controller.signal,
    );
    if (!this.current()) return;
    await this.mutate((state) => ({
      ...state,
      cache: reconcileSnapshot(state.cache, fresh, range, this.now()),
      needsRefresh: false,
    }));
    this.patch({ lastSyncedAt: this.state.cache?.confirmedAt ?? null });
  }
  private scheduleWake() {
    if (!this.options.remote || !this.current() || this.wakeTimer) return;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      void this.syncNow();
    }, this.options.debounceMs ?? 300);
  }
  private scheduleRetry() {
    if (!this.options.remote || !this.current() || this.retryTimer) return;
    const delay = Math.min(2_000 * 2 ** Math.min(this.failures++, 5), 60_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, delay);
  }
}
