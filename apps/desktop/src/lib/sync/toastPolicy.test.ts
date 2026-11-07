import { describe, expect, it } from "vitest";
import type { SyncStatus } from "@/lib/sync/engine";
import type { SharedStatus } from "@/lib/sync/shared/engine";
import { decideSharedToast, decideSyncToast } from "@/lib/sync/toastPolicy";

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

describe("decideSharedToast", () => {
  const shared: SharedStatus = { state: "idle", pending: 0, failed: 0, storageError: false, lastError: null, lastSyncedAt: null };
  const sh = (over: Partial<SharedStatus>): SharedStatus => ({ ...shared, ...over });
  const walk = (statuses: SharedStatus[]) => {
    let shown: string | null = null;
    const ids: string[] = [];
    const clears: number[] = [];
    statuses.forEach((s, i) => {
      const d = decideSharedToast(shown, s);
      shown = d.shown;
      if (d.show) ids.push(d.show.id);
      if (d.clear) clears.push(i);
    });
    return { ids, clears };
  };
  const away = sh({ state: "offline", lastError: "Shared goals could not connect." });
  // A status with no message mid-retry must not re-arm the toast either.
  const retrying = sh({ state: "syncing" });

  it("shows one offline toast across repeated failed retries, then clears on recovery", () => {
    expect(walk([away, retrying, away, retrying, away, retrying, shared])).toEqual({ ids: ["shared-offline"], clears: [6] });
  });
  it("shows a server that lacks the feature once", () => {
    const missing = sh({ state: "unavailable", lastError: "Shared goals are unavailable on this server." });
    expect(walk([missing, retrying, missing]).ids).toEqual(["shared-error"]);
  });
  it("shows a rejected check-in once, and again only if the count changes", () => {
    const one = sh({ state: "error", failed: 1, lastError: "Some check-ins weren't saved." });
    const two = sh({ state: "error", failed: 2, lastError: "Some check-ins weren't saved." });
    expect(walk([one, retrying, one, retrying, one, two]).ids).toEqual(["shared-failed", "shared-failed"]);
  });
  it("keeps storage failures distinct and clears when the account is paused", () => {
    const full = sh({ state: "error", storageError: true, lastError: "Device storage is full" });
    expect(walk([full, sh({ state: "paused" })])).toEqual({ ids: ["shared-storage"], clears: [1] });
  });
});
