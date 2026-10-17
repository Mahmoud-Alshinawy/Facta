import { describe, expect, it } from "vitest";
import { classifyError } from "@/lib/sync/remote";

describe("classifyError", () => {
  it.each([
    // Migration not applied / schema out of date: sync-wide, never park rows.
    [{ code: "PGRST205", message: "Could not find the table 'public.goals' in the schema cache" }, 404, "server"],
    [{ code: "PGRST204", message: "Could not find the 'deleted_at' column of 'goals' in the schema cache" }, 400, "server"],
    [{ code: "PGRST301", message: "JWT expired" }, 401, "server"],
    [{ code: "42P01", message: 'relation "public.goals" does not exist' }, 404, "server"],
    [{ code: "42703", message: 'column "deleted_at" does not exist' }, 400, "server"],
    [{ code: "42501", message: "permission denied for table goals" }, 403, "server"],
    [{ message: "Forbidden" }, 403, "server"],
    [{ code: "", message: "Internal Server Error" }, 500, "server"],
    [null, 502, "server"],
    // The row itself was refused: park it.
    [{ code: "23514", message: 'new row for relation "goals" violates check constraint "goals_category_check"' }, 400, "row"],
    [{ code: "23502", message: 'null value in column "title" violates not-null constraint' }, 400, "row"],
    [{ code: "22P02", message: 'invalid input syntax for type uuid: "x"' }, 400, "row"],
    [{ code: "22007", message: 'invalid input syntax for type date: "2026-13-40"' }, 400, "row"],
    [{ code: "42501", message: 'new row violates row-level security policy for table "goals"' }, 403, "row"],
    // Network.
    [{ code: "", message: "TypeError: Failed to fetch" }, 0, "offline"],
    [{ message: "Load failed" }, 0, "offline"],
  ] as const)("%j (HTTP %i) -> %s", (error, status, kind) => {
    expect(classifyError(error, status).kind).toBe(kind);
  });
});
