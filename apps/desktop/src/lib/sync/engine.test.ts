import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goalToRow } from "@/lib/sync/mappers";
import { memoryStore } from "@/lib/sync/storage";
import { OTHER_USER, USER, makeGoal, setup } from "@/test/harness";

beforeEach(() => {
  // Keep the engine's debounce and retry timers from firing on their own.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const NETWORK_DOWN = { message: "Can't reach the server", kind: "offline" as const };

describe("offline queue", () => {
  it("keeps edits queued while offline and sends them on reconnect", async () => {
    const h = setup();
    h.server.goals.nextError = NETWORK_DOWN;
    const g = h.engine.goals.upsert(makeGoal({ title: "offline edit" }));

    await h.engine.syncNow();
    expect(h.engine.getStatus().state).toBe("offline");
    expect(h.engine.getStatus().pending).toBe(1);
    expect(h.server.goals.rows.size).toBe(0);

    h.server.goals.nextError = null; // back online
    await h.engine.syncNow();
    expect(h.engine.getStatus()).toMatchObject({ state: "idle", pending: 0, lastError: null });
    expect(h.server.goals.rows.get(g.id)?.title).toBe("offline edit");
  });

  it("retries with backoff after a transient failure", async () => {
    const h = setup();
    h.server.goals.nextError = NETWORK_DOWN;
    h.engine.goals.upsert(makeGoal());
    await h.engine.syncNow();
    h.server.goals.nextError = null;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.engine.getStatus().pending).toBe(0);
    expect(h.server.goals.rows.size).toBe(1);
  });

  it("persists the queue, so a restart still sends it", async () => {
    const store = memoryStore();
    const first = setup({ store });
    first.server.goals.nextError = NETWORK_DOWN;
    const g = first.engine.goals.upsert(makeGoal());
    await first.engine.syncNow();
    first.engine.dispose();

    const second = setup({ store });
    expect(second.engine.getStatus().pending).toBe(1);
    await second.engine.syncNow();
    expect(second.server.goals.rows.has(g.id)).toBe(true);
  });

  it("parks rows the server rejects without blocking the rest", async () => {
    const h = setup();
    const good = h.engine.goals.upsert(makeGoal({ title: "good" }));
    const bad = h.engine.goals.upsert(makeGoal({ title: "bad" }));
    h.server.goals.rejectIds.add(bad.id);

    await h.engine.syncNow();
    expect(h.server.goals.rows.has(good.id)).toBe(true);
    expect(h.engine.getStatus()).toMatchObject({ state: "error", pending: 0, failed: 1 });
    expect(h.engine.getStatus().lastError).toContain("violates check constraint");
    // Still shown locally; a pull doesn't re-queue it.
    expect(h.engine.goals.get(bad.id)?.title).toBe("bad");

    h.server.goals.rejectIds.clear();
    await h.engine.retryFailed();
    expect(h.engine.getStatus()).toMatchObject({ state: "idle", failed: 0 });
    expect(h.server.goals.rows.has(bad.id)).toBe(true);
  });

  it("discarding a rejected write takes the server's version", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal({ title: "v1" }));
    await h.engine.syncNow();
    h.clock.advance(1_000);
    h.engine.goals.upsert({ ...g, title: "v2" });
    h.server.goals.rejectIds.add(g.id);
    await h.engine.syncNow();
    expect(h.engine.getStatus().failed).toBe(1);

    await h.engine.discardFailed();
    expect(h.engine.goals.get(g.id)?.title).toBe("v1");
    expect(h.engine.getStatus()).toMatchObject({ failed: 0, lastError: null });
  });
});

describe("migration not applied yet", () => {
  const MISSING_TABLE = { code: "PGRST205", message: "Could not find the table 'public.goals' in the schema cache" };

  it("keeps every write queued and parks nothing when the table doesn't exist", async () => {
    const legacy = [makeGoal({ title: "old 1" }), makeGoal({ title: "old 2" })];
    const store = memoryStore({ [`planner_goals_${USER}`]: JSON.stringify(legacy) });
    const h = setup({ store });
    h.server.goals.failWith(MISSING_TABLE, 404);
    h.server.events.failWith(MISSING_TABLE, 404);
    h.engine.goals.upsert(makeGoal({ title: "new" }));

    await h.engine.syncNow();
    expect(h.engine.getStatus()).toMatchObject({ state: "error", pending: 3, failed: 0 });
    expect(h.engine.getStatus().lastError).toContain("PGRST205");
    expect(Object.keys(h.queueData().failed.goals)).toEqual([]);
    expect(h.engine.goals.getSnapshot().map((g) => g.title).sort()).toEqual(["new", "old 1", "old 2"]);

    // Discard has nothing to delete: no local data can be lost this way.
    await h.engine.discardFailed();
    expect(h.engine.goals.getSnapshot()).toHaveLength(3);
    expect(h.engine.getStatus().pending).toBe(3);

    // Once the migration is applied, the scheduled retry uploads everything.
    h.server.goals.nextError = null;
    h.server.events.nextError = null;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.server.goals.rows.size).toBe(3);
    expect(h.engine.getStatus()).toMatchObject({ state: "idle", pending: 0, failed: 0 });
  });

  it("treats a stale schema cache (PGRST204) the same way", async () => {
    const h = setup();
    h.server.goals.failWith({ code: "PGRST204", message: "Could not find the 'deleted_at' column of 'goals' in the schema cache" }, 400);
    h.engine.goals.upsert(makeGoal());
    await h.engine.syncNow();
    expect(h.engine.getStatus()).toMatchObject({ state: "error", pending: 1, failed: 0 });
  });

  it("treats a missing grant (permission denied for table) as sync-wide", async () => {
    const h = setup();
    h.server.goals.failWith({ code: "42501", message: "permission denied for table goals" }, 403);
    h.engine.goals.upsert(makeGoal());
    await h.engine.syncNow();
    expect(h.engine.getStatus()).toMatchObject({ pending: 1, failed: 0 });
  });
});

describe("cache", () => {
  it("holds live records only; deletes wait in the queue", () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal());
    h.engine.goals.remove(g.id);
    expect(h.cachedGoals()).toEqual([]);
    expect(h.queueData().pending.goals[g.id].deleted_at).not.toBeNull();
  });

  it("removes a record when a pull returns its tombstone", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal());
    await h.engine.syncNow();
    h.clock.advance(1_000);
    h.server.goals.write(goalToRow(g, USER, new Date(h.clock.now()).toISOString(), new Date(h.clock.now()).toISOString()));

    await h.engine.syncNow();
    expect(h.engine.goals.get(g.id)).toBeUndefined();
    expect(h.cachedGoals()).toEqual([]);
  });
});

describe("conflicts", () => {
  it("a delete made while its create is in flight still deletes", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal());
    const held = h.server.goals.hold();
    const flushing = h.engine.flush();
    await held.arrived;

    h.clock.advance(10);
    h.engine.goals.remove(g.id); // user deletes while the create is on the wire
    held.release();
    await flushing;

    // The create landed, but the tombstone is still queued (its updated_at changed).
    expect(h.server.goals.rows.get(g.id)?.deleted_at).toBeNull();
    expect(h.engine.getStatus().pending).toBe(1);
    expect(h.engine.goals.get(g.id)).toBeUndefined();

    await h.engine.syncNow();
    expect(h.server.goals.rows.get(g.id)?.deleted_at).not.toBeNull();
    expect(h.engine.getStatus().pending).toBe(0);
    expect(h.engine.goals.get(g.id)).toBeUndefined();
  });

  it("a delete is never resurrected by a newer offline edit (sticky delete)", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal({ title: "v1" }));
    await h.engine.syncNow();

    // Another device deletes it…
    h.clock.advance(1_000);
    const deletedAt = new Date(h.clock.now()).toISOString();
    h.server.goals.write(goalToRow(g, USER, deletedAt, deletedAt));
    // …and later this device, still offline, edits it.
    h.clock.advance(5_000);
    h.engine.goals.upsert({ ...g, title: "edited later" });

    await h.engine.syncNow();
    expect(h.server.goals.rows.get(g.id)).toMatchObject({ title: "v1", deleted_at: deletedAt });
    expect(h.engine.goals.get(g.id)).toBeUndefined();
    expect(h.engine.getStatus()).toMatchObject({ pending: 0, failed: 0 });
    expect(h.serverWon).toEqual(["goals:deleted"]);
  });

  it("a stale edit loses to a newer server version", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal({ title: "v1" }));
    await h.engine.syncNow();

    h.clock.advance(1_000);
    h.engine.goals.upsert({ ...g, title: "older local edit" }); // edit at t+1s
    h.clock.advance(1_000);
    // The laptop's edit at t+2s reaches the server first.
    h.server.goals.write(goalToRow({ ...g, title: "newer laptop edit" }, USER, new Date(h.clock.now()).toISOString(), null));

    await h.engine.flush();
    expect(h.server.goals.rows.get(g.id)?.title).toBe("newer laptop edit");
    expect(h.engine.goals.get(g.id)?.title).toBe("newer laptop edit");
    expect(h.engine.getStatus().pending).toBe(0);
    expect(h.serverWon).toEqual(["goals:changed"]);
  });

  it("a retry of a write that already landed isn't reported as a conflict", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal({ title: "v1" }));
    h.server.goals.loseNextResponse = true;
    await h.engine.flush();
    expect(h.engine.getStatus()).toMatchObject({ state: "offline", pending: 1 });

    await h.engine.flush(); // same snapshot again: the server skips it
    expect(h.engine.getStatus().pending).toBe(0);
    expect(h.engine.goals.get(g.id)?.title).toBe("v1");
    expect(h.serverWon).toEqual([]);
  });

  it("a newer local edit wins over an older server version", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal({ title: "v1" }));
    await h.engine.syncNow();
    h.clock.advance(1_000);
    h.engine.goals.upsert({ ...g, title: "v2" });
    await h.engine.syncNow();
    expect(h.server.goals.rows.get(g.id)?.title).toBe("v2");
  });

  it("a fast clock can't win forever: the server clamps edit times", async () => {
    const h = setup();
    const g = makeGoal();
    // This device's clock is an hour ahead.
    h.engine.goals.upsert(g);
    const future = new Date(h.clock.now() + 3_600_000).toISOString();
    h.server.goals.write(goalToRow(g, USER, future, null));
    expect(Date.parse(h.server.goals.rows.get(g.id)!.updated_at)).toBe(h.clock.now());
  });
});

describe("local-only fields", () => {
  it("markNotified-style patches don't bump updatedAt or queue anything", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal());
    await h.engine.syncNow();
    const before = h.engine.goals.get(g.id)!;

    h.engine.goals.patchLocal(g.id, { lastNotifiedDate: "2026-10-16" });
    const after = h.engine.goals.get(g.id)!;
    expect(after.lastNotifiedDate).toBe("2026-10-16");
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(h.engine.getStatus().pending).toBe(0);
    expect(h.cachedGoals()[0].lastNotifiedDate).toBe("2026-10-16");
  });

  it("a pull keeps lastNotifiedDate when the record changed elsewhere", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal({ title: "v1" }));
    await h.engine.syncNow();
    h.engine.goals.patchLocal(g.id, { lastNotifiedDate: "2026-10-16" });

    h.clock.advance(1_000);
    h.server.goals.write(goalToRow({ ...g, title: "renamed on laptop" }, USER, new Date(h.clock.now()).toISOString(), null));
    await h.engine.syncNow();

    expect(h.engine.goals.get(g.id)).toMatchObject({ title: "renamed on laptop", lastNotifiedDate: "2026-10-16" });
  });

  it("patchLocal ignores synced fields", () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal({ title: "v1" }));
    h.engine.goals.patchLocal(g.id, { title: "sneaky", lastNotifiedDate: "2026-10-16" });
    expect(h.engine.goals.get(g.id)?.title).toBe("v1");
  });
});

describe("user switching", () => {
  it("drops flush results if the user changed mid-flight", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal());
    const cacheBefore = h.store.get(`planner_goals_${USER}`);
    const held = h.server.goals.hold();
    const flushing = h.engine.flush();
    await held.arrived;

    h.switchUser(OTHER_USER); // signed out and in as someone else
    held.release();
    await flushing;

    // The server got the write (it was already sent), but nothing was applied
    // locally: the entry stays queued for USER, and nothing touched OTHER_USER.
    expect(h.queueData().pending.goals[g.id]).toBeDefined();
    expect(h.store.get(`planner_goals_${USER}`)).toBe(cacheBefore);
    expect(h.store.get(`planner_goals_${OTHER_USER}`)).toBeNull();
    expect(h.server.goals.upserts[0][0].user_id).toBe(USER);
  });

  it("does nothing once the user is gone", async () => {
    const h = setup();
    h.engine.goals.upsert(makeGoal());
    h.switchUser(null);
    await h.engine.syncNow();
    expect(h.server.goals.upserts).toHaveLength(0);
  });
});

describe("first sign-in with an old local-only cache", () => {
  it("stamps records without updatedAt and queues them, even offline", () => {
    const legacy = makeGoal({ title: "from before sync" });
    const store = memoryStore({ [`planner_goals_${USER}`]: JSON.stringify([legacy]) });
    const h = setup({ store });

    const loaded = h.engine.goals.get(legacy.id)!;
    expect(loaded.updatedAt).toBe(new Date(h.clock.now()).toISOString());
    expect(h.cachedGoals()[0].updatedAt).toBe(loaded.updatedAt);
    expect(h.engine.getStatus().pending).toBe(1);
  });

  it("uploads them on the first sync", async () => {
    const legacy = makeGoal({ title: "from before sync" });
    const store = memoryStore({ [`planner_goals_${USER}`]: JSON.stringify([legacy]) });
    const h = setup({ store });
    await h.engine.syncNow();
    expect(h.server.goals.rows.get(legacy.id)?.title).toBe("from before sync");
  });
});

describe("scheduling", () => {
  it("coalesces overlapping syncNow calls into one run", async () => {
    const h = setup();
    h.engine.goals.upsert(makeGoal());
    await Promise.all([h.engine.syncNow(), h.engine.syncNow(), h.engine.syncNow()]);
    expect(h.server.goals.upserts).toHaveLength(1);
  });

  it("flushes shortly after a local edit, without waiting for a pull", async () => {
    const h = setup();
    const g = h.engine.goals.upsert(makeGoal());
    expect(h.server.goals.rows.has(g.id)).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.server.goals.rows.has(g.id)).toBe(true);
  });
});

describe("syncing indicator", () => {
  it("the debounced flush after an edit never shows 'syncing'", async () => {
    const h = setup();
    const seen = h.statesSeen();
    h.engine.goals.upsert(makeGoal());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.server.goals.rows.size).toBe(1);
    expect(seen).not.toContain("syncing");
  });

  it("a quick full sync doesn't flash 'syncing'", async () => {
    const h = setup();
    const seen = h.statesSeen();
    await h.engine.syncNow();
    expect(seen).not.toContain("syncing");
  });

  it("a slow full sync shows 'syncing' after 300 ms", async () => {
    const h = setup();
    h.engine.goals.upsert(makeGoal());
    const held = h.server.goals.hold();
    const seen = h.statesSeen();
    const running = h.engine.syncNow();
    await held.arrived;
    await vi.advanceTimersByTimeAsync(299);
    expect(seen).not.toContain("syncing");
    await vi.advanceTimersByTimeAsync(1);
    expect(h.engine.getStatus().state).toBe("syncing");
    held.release();
    await running;
    expect(h.engine.getStatus().state).toBe("idle");
  });
});

describe("local-only builds", () => {
  it("keeps working without a server", async () => {
    const h = setup({ online: false });
    h.engine.goals.upsert(makeGoal());
    await h.engine.syncNow();
    expect(h.engine.getStatus().state).toBe("local-only");
    expect(h.cachedGoals()).toHaveLength(1);
  });
});
