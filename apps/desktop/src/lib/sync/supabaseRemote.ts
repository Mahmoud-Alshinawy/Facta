// Supabase implementation of the collection remotes. Every query is scoped to
// the signed-in user explicitly, on top of RLS.

import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { EventRow, EventWrite, GoalRow, GoalWrite } from "@/lib/sync/mappers";
import type { PlannerRemotes } from "@/lib/sync/engine";
import { classifyError, type RemoteResult } from "@/lib/sync/remote";

const PAGE_SIZE = 1000; // PostgREST's default max-rows on Supabase
const ID_CHUNK = 150; // keeps `id=in.(…)` URLs short

interface PostgrestLike<T> {
  data: T | null;
  error: PostgrestError | null;
  status: number;
}

function toResult<T>(res: PostgrestLike<T[]>): RemoteResult<T[]> {
  if (res.error) return { ok: false, error: classifyError(res.error, res.status) };
  return { ok: true, data: res.data ?? [] };
}

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<PostgrestLike<T[]>>): Promise<RemoteResult<T[]>> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const res = toResult(await run(ids.slice(i, i + ID_CHUNK)));
    if (!res.ok) return res;
    out.push(...res.data);
  }
  return { ok: true, data: out };
}

async function paged<T>(page: (from: number, to: number) => PromiseLike<PostgrestLike<T[]>>): Promise<RemoteResult<T[]>> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const res = toResult(await page(from, from + PAGE_SIZE - 1));
    if (!res.ok) return res;
    out.push(...res.data);
    if (res.data.length < PAGE_SIZE) return { ok: true, data: out };
  }
}

export function createSupabaseRemotes(userId: string): PlannerRemotes {
  return {
    goals: {
      upsert: async (rows: GoalWrite[]) =>
        toResult(await supabase.from("goals").upsert(rows, { onConflict: "id" }).select()),
      fetchByIds: (ids: string[]) =>
        inChunks<GoalRow>(ids, (chunk) => supabase.from("goals").select("*").eq("user_id", userId).in("id", chunk)),
      fetchAll: () =>
        paged<GoalRow>((from, to) =>
          supabase.from("goals").select("*").eq("user_id", userId).order("id").range(from, to)),
    },
    events: {
      upsert: async (rows: EventWrite[]) =>
        toResult(await supabase.from("events").upsert(rows, { onConflict: "id" }).select()),
      fetchByIds: (ids: string[]) =>
        inChunks<EventRow>(ids, (chunk) => supabase.from("events").select("*").eq("user_id", userId).in("id", chunk)),
      fetchAll: () =>
        paged<EventRow>((from, to) =>
          supabase.from("events").select("*").eq("user_id", userId).order("id").range(from, to)),
    },
  };
}
