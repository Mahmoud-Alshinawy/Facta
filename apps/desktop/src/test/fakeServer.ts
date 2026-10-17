// An in-memory stand-in for the goals/events tables, following the same
// rules as the facta_sync_guard trigger in supabase/migrations. Requests can
// be held open (to simulate in-flight writes) or made to fail.

import { classifyError, type PostgrestErrorLike, type RemoteResult, type SyncError, type TableRemote } from "@/lib/sync/remote";
import type { EventRow, EventWrite, GoalRow, GoalWrite } from "@/lib/sync/mappers";
import type { PlannerRemotes } from "@/lib/sync/engine";

interface ServerRowMeta {
  id: string;
  user_id: string;
  updated_at: string;
  deleted_at: string | null;
  created_at: string;
}

type Gate = { promise: Promise<void>; release: () => void };

function gate(): Gate {
  let release = () => {};
  const promise = new Promise<void>((r) => { release = r; });
  return { promise, release };
}

export class FakeTable<W extends { id: string; updated_at: string; user_id: string; deleted_at?: string | null }, R extends ServerRowMeta> {
  readonly rows = new Map<string, R>();
  /** Every upsert batch received, in order. */
  readonly upserts: W[][] = [];
  /** While set, every request fails with this error. */
  nextError: SyncError | null = null;
  /** The next upsert is applied but answers with a network error. */
  loseNextResponse = false;
  /** Rejects any row whose id is listed, as a constraint violation would. */
  readonly rejectIds = new Set<string>();
  private held: Gate | null = null;
  private arrived: Gate | null = null;

  constructor(private readonly toRow: (w: W, prev: R | undefined, now: string) => R, private readonly now: () => number) {}

  /** The next upsert waits until release() is called. */
  hold(): { arrived: Promise<void>; release: () => void } {
    this.held = gate();
    this.arrived = gate();
    const h = this.held;
    return { arrived: this.arrived.promise, release: () => h.release() };
  }

  /** Mirrors facta_sync_guard: clamp, newer wins, deletes always apply and stick. */
  write(w: W): R | null {
    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();
    const clamped = Date.parse(w.updated_at) > nowMs ? nowIso : w.updated_at;
    const prev = this.rows.get(w.id);
    if (prev) {
      if (prev.deleted_at !== null) return null;
      const isDelete = w.deleted_at != null;
      if (!isDelete && Date.parse(clamped) <= Date.parse(prev.updated_at)) return null;
      const updated_at = isDelete && Date.parse(prev.updated_at) > Date.parse(clamped) ? prev.updated_at : clamped;
      const row = this.toRow({ ...w, updated_at }, prev, nowIso);
      this.rows.set(w.id, row);
      return row;
    }
    const row = this.toRow({ ...w, updated_at: clamped }, undefined, nowIso);
    this.rows.set(w.id, row);
    return row;
  }

  remote(): TableRemote<W, R> {
    return {
      upsert: async (rows) => {
        this.upserts.push(rows.map((r) => ({ ...r })));
        if (this.held) {
          const h = this.held;
          this.held = null;
          this.arrived?.release();
          await h.promise;
        }
        const fail = this.takeError();
        if (fail) return fail;
        if (rows.some((r) => this.rejectIds.has(r.id))) {
          return {
            ok: false,
            error: classifyError({ code: "23514", message: 'new row for relation "goals" violates check constraint' }, 400),
          };
        }
        const written: R[] = [];
        for (const w of rows) {
          const row = this.write(w);
          if (row) written.push(row);
        }
        if (this.loseNextResponse) {
          // The write landed, but the reply never made it back.
          this.loseNextResponse = false;
          return { ok: false, error: { kind: "offline", message: "Can't reach the server" } };
        }
        return { ok: true, data: written };
      },
      fetchByIds: async (ids) => this.takeError() ?? { ok: true, data: ids.flatMap((id) => this.rows.get(id) ?? []) },
      fetchAll: async () => this.takeError() ?? { ok: true, data: [...this.rows.values()] },
    };
  }

  /** Makes every request fail the way PostgREST would with this error. */
  failWith(error: PostgrestErrorLike | null, status: number): void {
    this.nextError = classifyError(error, status);
  }

  private takeError(): RemoteResult<R[]> | null {
    return this.nextError ? { ok: false, error: this.nextError } : null;
  }
}

/** Postgres hands `time` back as HH:mm:ss. */
function pgTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length === 5 ? `${t}:00` : t;
}

export function createFakeServer(now: () => number) {
  const goals = new FakeTable<GoalWrite, GoalRow>((w, prev, nowIso) => ({
    id: w.id,
    user_id: w.user_id,
    title: w.title,
    category: w.category,
    date: w.date,
    time: pgTime(w.time),
    completed: w.completed ?? false,
    completed_dates: w.completed_dates ?? [],
    repeat: w.repeat ?? "none",
    repeat_days: w.repeat_days ?? [],
    notifications_enabled: w.notifications_enabled ?? false,
    notification_message: w.notification_message ?? "",
    created_at: prev?.created_at ?? nowIso,
    updated_at: w.updated_at,
    deleted_at: w.deleted_at ?? null,
  }), now);
  const events = new FakeTable<EventWrite, EventRow>((w, prev, nowIso) => ({
    id: w.id,
    user_id: w.user_id,
    title: w.title,
    date: w.date,
    start_time: pgTime(w.start_time) ?? "00:00:00",
    end_time: pgTime(w.end_time) ?? "00:00:00",
    color: w.color ?? "blue",
    description: w.description ?? null,
    all_day: w.all_day ?? false,
    repeat: w.repeat ?? "none",
    repeat_days: w.repeat_days ?? [],
    created_at: prev?.created_at ?? nowIso,
    updated_at: w.updated_at,
    deleted_at: w.deleted_at ?? null,
  }), now);
  const remotes: PlannerRemotes = { goals: goals.remote(), events: events.remote() };
  return { goals, events, remotes };
}
