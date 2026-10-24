// Supabase implementation of the collection remotes. Every query is scoped to
// the signed-in user explicitly, on top of RLS.

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import type {
  EventRow,
  EventWrite,
  GoalRow,
  GoalWrite,
  NoteRow,
  NoteWrite,
  DiaryRow,
  DiaryWrite,
} from "@/lib/sync/mappers";
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
  if (res.error)
    return { ok: false, error: classifyError(res.error, res.status) };
  return { ok: true, data: res.data ?? [] };
}

async function inChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<PostgrestLike<T[]>>,
): Promise<RemoteResult<T[]>> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const res = toResult(await run(ids.slice(i, i + ID_CHUNK)));
    if (!res.ok) return res;
    out.push(...res.data);
  }
  return { ok: true, data: out };
}

async function paged<T>(
  page: (from: number, to: number) => PromiseLike<PostgrestLike<T[]>>,
): Promise<RemoteResult<T[]>> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const res = toResult(await page(from, from + PAGE_SIZE - 1));
    if (!res.ok) return res;
    out.push(...res.data);
    if (res.data.length < PAGE_SIZE) return { ok: true, data: out };
  }
}

export function createSupabaseRemotes(
  userId: string,
  client: SupabaseClient<Database> = supabase,
): PlannerRemotes {
  return {
    notes: {
      upsert: async (rows: NoteWrite[]) =>
        toResult(
          await client
            .from("notes")
            .upsert(rows, { onConflict: "id" })
            .select(),
        ),
      fetchByIds: (ids) =>
        inChunks<NoteRow>(ids, (chunk) =>
          client
            .from("notes")
            .select("*")
            .eq("user_id", userId)
            .in("id", chunk),
        ),
      fetchAll: () =>
        paged<NoteRow>((from, to) =>
          client
            .from("notes")
            .select("*")
            .eq("user_id", userId)
            .order("id")
            .range(from, to),
        ),
    },
    diary_entries: {
      upsert: async (rows: DiaryWrite[]) => {
        const canonical: DiaryRow[] = [];
        for (const row of rows) {
          if (row.user_id !== userId)
            return {
              ok: false,
              error: {
                kind: "row",
                message: "Diary owner does not match this account",
              },
            };
          const result = toResult(
            await client.rpc("facta_write_diary", {
              entry: row as unknown as import("@/lib/database.types").Json,
            }),
          );
          if (!result.ok) return result;
          if (result.data.length !== 1)
            return {
              ok: false,
              error: {
                kind: "server",
                message:
                  "Diary reconciliation returned no canonical row; retrying",
              },
            };
          canonical.push(result.data[0]);
        }
        return { ok: true, data: canonical };
      },
      fetchByIds: (ids) =>
        inChunks<DiaryRow>(ids, (chunk) =>
          client
            .from("diary_entries")
            .select("*")
            .eq("user_id", userId)
            .in("id", chunk),
        ),
      fetchAll: () =>
        paged<DiaryRow>((from, to) =>
          client
            .from("diary_entries")
            .select("*")
            .eq("user_id", userId)
            .order("id")
            .range(from, to),
        ),
    },
    goals: {
      upsert: async (rows: GoalWrite[]) =>
        toResult(
          await client
            .from("goals")
            .upsert(rows, { onConflict: "id" })
            .select(),
        ),
      fetchByIds: (ids: string[]) =>
        inChunks<GoalRow>(ids, (chunk) =>
          client
            .from("goals")
            .select("*")
            .eq("user_id", userId)
            .in("id", chunk),
        ),
      fetchAll: () =>
        paged<GoalRow>((from, to) =>
          client
            .from("goals")
            .select("*")
            .eq("user_id", userId)
            .order("id")
            .range(from, to),
        ),
    },
    events: {
      upsert: async (rows: EventWrite[]) =>
        toResult(
          await client
            .from("events")
            .upsert(rows, { onConflict: "id" })
            .select(),
        ),
      fetchByIds: (ids: string[]) =>
        inChunks<EventRow>(ids, (chunk) =>
          client
            .from("events")
            .select("*")
            .eq("user_id", userId)
            .in("id", chunk),
        ),
      fetchAll: () =>
        paged<EventRow>((from, to) =>
          client
            .from("events")
            .select("*")
            .eq("user_id", userId)
            .order("id")
            .range(from, to),
        ),
    },
  };
}
