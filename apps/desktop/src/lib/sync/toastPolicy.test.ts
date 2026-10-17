import { describe, expect, it } from "vitest";
import type { SyncStatus } from "@/lib/sync/engine";
import { decideSyncToast } from "@/lib/sync/toastPolicy";

const base: SyncStatus = { state: "idle", pending: 0, failed: 0, lastError: null, lastSyncedAt: null };
const st = (over: Partial<SyncStatus>): SyncStatus => ({ ...base, ...over });

/** Feeds a sequence of statuses through the policy, like the effect does. */
function run(statuses: SyncStatus[]) {
  let shown: string | null = null;
  const shownToasts: string[] = [];
  const clears: number[] = [];
  statuses.forEach((s, i) => {
    const d = decideSyncToast(shown, s);
    shown = d.shown;
    if (d.show) shownToasts.push(`${d.show.id}: ${d.show.message}`);
    if (d.clear) clears.push(i);
  });
  return { shownToasts, clears };
}

const missingTable = st({ state: "error", pending: 3, lastError: "Could not find the table (PGRST205)" });
const offline = st({ state: "offline", pending: 1, lastError: "Can't reach the server" });
const syncing = st({ state: "syncing", pending: 3 });

describe("decideSyncToast", () => {
  it("shows one toast for an error that repeats on every retry", () => {
    // error -> retry (syncing) -> same error -> retry -> same error …
    const { shownToasts } = run([missingTable, syncing, missingTable, syncing, missingTable, syncing, missingTable]);
    expect(shownToasts).toEqual(["sync-error: Could not find the table (PGRST205)"]);
  });

  it("does the same while offline", () => {
    expect(run([offline, syncing, offline, syncing, offline]).shownToasts).toEqual(["sync-offline: Can't reach the server"]);
  });

  it("shows the problem again only after sync has recovered", () => {
    const { shownToasts, clears } = run([missingTable, syncing, base, missingTable]);
    expect(shownToasts).toHaveLength(2);
    expect(clears).toEqual([2]);
  });

  it("uses a fixed id per kind, so a changed message replaces rather than stacks", () => {
    const other = st({ state: "error", lastError: "Internal Server Error (HTTP 500)" });
    const { shownToasts } = run([missingTable, syncing, other]);
    expect(shownToasts.map((t) => t.split(":")[0])).toEqual(["sync-error", "sync-error"]);
  });

  it("parked rows get the sync-failed toast, and a new count updates it", () => {
    const one = st({ state: "error", failed: 1, lastError: "1 change was rejected by the server: check" });
    const two = st({ state: "error", failed: 2, lastError: "2 changes were rejected by the server: check" });
    const { shownToasts } = run([one, syncing, one, two]);
    expect(shownToasts.map((t) => t.split(":")[0])).toEqual(["sync-failed", "sync-failed"]);
  });

  it("moves between kinds when the problem changes", () => {
    const { shownToasts } = run([offline, syncing, missingTable]);
    expect(shownToasts.map((t) => t.split(":")[0])).toEqual(["sync-offline", "sync-error"]);
  });

  it("does nothing when idle from the start, or in local-only mode", () => {
    expect(run([base, base, st({ state: "local-only" })])).toEqual({ shownToasts: [], clears: [] });
  });
});
