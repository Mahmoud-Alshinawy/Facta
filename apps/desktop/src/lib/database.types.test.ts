import { describe, expectTypeOf, it } from "vitest";
import { supabase } from "@/lib/supabase";
import type { EventRow, EventWrite, GoalRow, GoalWrite } from "@/lib/sync/mappers";

// Type-level checks: these fail `tsc --noEmit` (and vitest's typecheck), not
// at runtime. The builders are lazy, so nothing is sent.
describe("typed Supabase client", () => {
  it("types goals upsert/select from the Database type, not never", () => {
    const rows: GoalWrite[] = [];
    const query = supabase.from("goals").upsert(rows, { onConflict: "id" }).select();
    const table = supabase.from("goals");
    expectTypeOf<Parameters<typeof table.upsert>[0]>().not.toBeNever();
    expectTypeOf<GoalWrite[]>().toExtend<Parameters<typeof table.upsert>[0]>();
    expectTypeOf<Awaited<typeof query>["data"]>().toEqualTypeOf<GoalRow[] | null>();
  });

  it("types events the same way", () => {
    const rows: EventWrite[] = [];
    const query = supabase.from("events").upsert(rows, { onConflict: "id" }).select();
    expectTypeOf<Awaited<typeof query>["data"]>().toEqualTypeOf<EventRow[] | null>();
  });

  it("rejects unknown tables and columns", () => {
    // @ts-expect-error: not a table in the schema
    supabase.from("profiles");
    // @ts-expect-error: not a column of goals
    supabase.from("goals").upsert([{ id: "x", title: "t", category: "must-do", date: "2026-10-16", nope: 1 }]);
  });
});
