import { describe, expect, it } from "vitest";
import { SharedSync } from "./engine";
import { emptySharedState, encodeSharedState, sharedStorageKey } from "./state";
import { memoryStore } from "../storage";
import { SharedRemoteError, type SharedRemote } from "./remote";
import { decideSharedToast } from "../toastPolicy";
import { mapSnapshot } from "@/lib/sharedGoals/contracts";
import { reconcileSnapshot } from "@/lib/sharedGoals/cache";
import { sharedGroupView } from "@/lib/sharedGoals/view";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_GROUP,
  SHARED_MEMBER,
  SHARED_RANGE,
  SHARED_NOW,
} from "@/test/sharedFixtures";

describe("shared sync local interface", () => {
  it("restores saved intent/drafts and stops exposing or mutating an old account", async () => {
    const seed = emptySharedState(SHARED_USER);
    seed.cache = reconcileSnapshot(
      null,
      mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE),
      SHARED_RANGE,
      SHARED_NOW,
    );
    const store = memoryStore({
      [sharedStorageKey(SHARED_USER)]: encodeSharedState(seed),
    });
    let current: string | null = SHARED_USER;
    const options = {
      userId: SHARED_USER,
      store,
      remote: null,
      currentUserId: () => current,
      now: () => SHARED_NOW,
    };
    const first = new SharedSync(options);
    first.load();
    await first.enqueueCheckin({
      groupId: SHARED_GROUP,
      date: "2026-10-20",
      completed: true,
    });
    await first.saveDraft({
      id: crypto.randomUUID(),
      fields: { name: "A draft", template: "gym" },
      updatedAt: SHARED_NOW,
    });
    expect(first.getStatus()).toMatchObject({
      state: "local-only",
      pending: 1,
    });
    first.dispose();
    const second = new SharedSync(options);
    second.load();
    expect(second.getSnapshot().outbox).toHaveLength(1);
    expect(second.getSnapshot().drafts[0].fields.name).toBe("A draft");
    const before = store.get(sharedStorageKey(SHARED_USER));
    current = null;
    expect(second.getSnapshot().cache).toBeNull();
    await expect(
      second.enqueueCheckin({
        groupId: SHARED_GROUP,
        date: "2026-10-20",
        completed: false,
      }),
    ).rejects.toThrow();
    expect(store.get(sharedStorageKey(SHARED_USER))).toBe(before);
    second.dispose();
  });
  it("retains corrupt saved bytes and reports an isolated shared error", async () => {
    const store = memoryStore({ [sharedStorageKey(SHARED_USER)]: "corrupt" });
    const engine = new SharedSync({
      userId: SHARED_USER,
      store,
      remote: null,
      currentUserId: () => SHARED_USER,
    });
    engine.load();
    await engine.syncNow();
    expect(engine.getStatus()).toMatchObject({
      state: "error",
      storageError: true,
    });
    expect(store.get(sharedStorageKey(SHARED_USER))).toBe("corrupt");
    engine.dispose();
  });
});

describe("shared sync problems reach the user once", () => {
  const seeded = () => {
    const seed = emptySharedState(SHARED_USER);
    seed.cache = reconcileSnapshot(
      null,
      mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE),
      SHARED_RANGE,
      SHARED_NOW,
    );
    return memoryStore({
      [sharedStorageKey(SHARED_USER)]: encodeSharedState(seed),
    });
  };
  const fresh = () =>
    mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE);
  const harness = (
    remote: Partial<SharedRemote>,
    now: () => number = () => SHARED_NOW,
  ) => {
    const engine = new SharedSync({
      userId: SHARED_USER,
      store: seeded(),
      remote: { userId: SHARED_USER, ...remote } as SharedRemote,
      currentUserId: () => SHARED_USER,
      now,
      isOnline: () => true,
    });
    engine.load();
    let shown: string | null = null;
    const toasts: string[] = [];
    let clears = 0;
    const errors: (string | null)[] = [];
    engine.subscribe(() => {
      const status = engine.getStatus();
      errors.push(status.lastError);
      const decision = decideSharedToast(shown, status);
      shown = decision.shown;
      if (decision.show) toasts.push(decision.show.id);
      if (decision.clear) clears++;
    });
    return { engine, toasts, errors, clears: () => clears };
  };

  it("shows one offline toast over repeated failures, keeps the message steady and clears on recovery", async () => {
    let online = false;
    const { engine, toasts, errors, clears } = harness({
      snapshot: async () => {
        if (!online) throw new SharedRemoteError("offline");
        return fresh();
      },
    });
    for (let n = 0; n < 4; n++) await engine.syncNow();
    expect(toasts).toEqual(["shared-offline"]);
    const first = errors.findIndex(Boolean);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(errors.slice(first)).not.toContain(null);
    online = true;
    await engine.syncNow();
    expect(engine.getStatus()).toMatchObject({
      state: "idle",
      lastError: null,
    });
    expect(clears()).toBe(1);
    expect(toasts).toEqual(["shared-offline"]);
    engine.dispose();
  });

  it("keeps one toast for a rejected check-in across syncs; retry and discard both clear it", async () => {
    let accept = false;
    const { engine, toasts, clears } = harness({
      snapshot: async () => fresh(),
      command: async () =>
        (accept
          ? {
              ok: true,
              code: "checked",
              id: crypto.randomUUID(),
              revision: 1,
              completed: true,
            }
          : { ok: false, code: "invalid_date" }) as never,
    });
    const check = () =>
      engine.enqueueCheckin({
        groupId: SHARED_GROUP,
        date: "2026-10-20",
        completed: true,
      });
    const failed = () =>
      engine.getSnapshot().outbox.filter((e) => e.phase === "failed");
    await check();
    for (let n = 0; n < 3; n++) await engine.syncNow();
    expect(failed()).toHaveLength(1);
    expect(toasts).toEqual(["shared-failed"]);
    await engine.discardFailed(failed()[0].id);
    await engine.syncNow();
    expect(engine.getSnapshot().outbox).toHaveLength(0);
    expect(clears()).toBe(1);

    await check();
    await engine.syncNow();
    expect(toasts).toEqual(["shared-failed", "shared-failed"]);
    accept = true;
    await engine.retryFailed(failed()[0].id);
    await engine.syncNow();
    expect(engine.getSnapshot().outbox).toHaveLength(0);
    expect(engine.getStatus()).toMatchObject({ state: "idle", failed: 0 });
    expect(clears()).toBe(2);
    engine.dispose();
  });

  // The owner's case: the device clock ran more than 5 minutes ahead, the
  // server refused, and the owner set the clock right before Try again.
  const AHEAD = 6 * 60_000;
  const refusedAhead = async (aheadAt: number, correctedAt: number) => {
    let clock = aheadAt;
    let accept = false;
    const sent: string[] = [];
    const { engine } = harness(
      {
        snapshot: async () => fresh(),
        command: async (command) => {
          sent.push((command.payload as { captured_at: string }).captured_at);
          return (
            accept
              ? {
                  ok: true,
                  code: "checked",
                  id: crypto.randomUUID(),
                  revision: 1,
                  completed: true,
                }
              : { ok: false, code: "invalid_date" }
          ) as never;
        },
      },
      () => clock,
    );
    const date = sharedGroupView(
      engine.getSnapshot(),
      SHARED_USER,
      SHARED_GROUP,
      aheadAt,
    )!.today;
    await engine.enqueueCheckin({
      groupId: SHARED_GROUP,
      date,
      completed: true,
    });
    await engine.syncNow();
    const failed = engine
      .getSnapshot()
      .outbox.find((e) => e.phase === "failed")!;
    expect(failed.failure).toBe("invalid_date");
    clock = correctedAt;
    accept = true;
    return { engine, failed, sent };
  };

  it("re-stamps a refused check-in with the corrected clock when it is still the same day", async () => {
    const { engine, failed, sent } = await refusedAhead(
      SHARED_NOW + AHEAD,
      SHARED_NOW,
    );
    await engine.retryFailed(failed.id);
    await engine.syncNow();
    expect(engine.getSnapshot().outbox).toHaveLength(0);
    expect(sent.at(-1)).toBe(new Date(SHARED_NOW).toISOString());
    engine.dispose();
  });

  it("keeps a check-in stamped for a day that hasn't started and says to discard it", async () => {
    // Asia/Riyadh is UTC+3: 21:03Z is 00:03 on the 21st, 20:58Z is 23:58 on the 20th.
    const { engine, failed } = await refusedAhead(
      Date.parse("2026-10-20T21:03:00Z"),
      Date.parse("2026-10-20T20:58:00Z"),
    );
    expect(failed.date).toBe("2026-10-21");
    await expect(engine.retryFailed(failed.id)).rejects.toThrow(
      /Discard it, then check in again/,
    );
    expect(engine.getSnapshot().outbox).toEqual([failed]);
    engine.dispose();
  });

  it("keeps the original stamp of a genuine offline check-in on retry", async () => {
    const earlier = SHARED_NOW - 60 * 60_000;
    const { engine, failed, sent } = await refusedAhead(earlier, SHARED_NOW);
    await engine.retryFailed(failed.id);
    await engine.syncNow();
    expect(engine.getSnapshot().outbox).toHaveLength(0);
    expect(sent.at(-1)).toBe(new Date(earlier).toISOString());
    engine.dispose();
  });
});

describe("an accepted check-in shows at once", () => {
  it("never falls back to the old confirmed state between the reply and the next read", async () => {
    const seed = emptySharedState(SHARED_USER);
    seed.cache = reconcileSnapshot(
      null,
      mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE),
      SHARED_RANGE,
      SHARED_NOW,
    );
    let revision = 0;
    let completed = false;
    let rowId: string | null = null;
    let hold: Promise<void> | null = null;
    let release = () => {};
    let reads = 0;
    const engine = new SharedSync({
      userId: SHARED_USER,
      store: memoryStore({
        [sharedStorageKey(SHARED_USER)]: encodeSharedState(seed),
      }),
      remote: {
        userId: SHARED_USER,
        snapshot: async () => {
          reads++;
          if (hold) await hold;
          const rows = sharedRpcFixture();
          if (rowId)
            rows.checkins = [
              {
                id: rowId,
                group_id: SHARED_GROUP,
                user_id: SHARED_USER,
                membership_id: SHARED_MEMBER,
                checkin_date: "2026-10-20",
                completed,
                captured_at: "2026-10-20T09:00:00Z",
                created_at: "2026-10-20T09:00:00Z",
                updated_at: "2026-10-20T09:00:00Z",
                revision,
              },
            ] as never;
          return mapSnapshot(rows, SHARED_USER, SHARED_RANGE);
        },
        command: async (command) => {
          const body = command.payload as { completed: boolean };
          // Hold the read that follows this reply.
          hold = new Promise((r) => (release = r));
          rowId ??= crypto.randomUUID();
          revision++;
          completed = body.completed;
          return { ok: true, code: "checked", id: rowId, revision, completed };
        },
      } as Partial<SharedRemote> as SharedRemote,
      currentUserId: () => SHARED_USER,
      now: () => SHARED_NOW,
      isOnline: () => true,
      // Only the syncs this test starts.
      debounceMs: 60_000,
    });
    engine.load();
    const labels: string[] = [];
    engine.subscribe(() => {
      const v = sharedGroupView(
        engine.getSnapshot(),
        SHARED_USER,
        SHARED_GROUP,
        SHARED_NOW,
      )!;
      const label = v.pending
        ? v.checked
          ? "pending"
          : "pending undo"
        : v.checked
          ? "checked"
          : "unchecked";
      if (labels.at(-1) !== label) labels.push(label);
    });
    const toggle = async (to: boolean) => {
      labels.length = 0;
      await engine.enqueueCheckin({
        groupId: SHARED_GROUP,
        date: "2026-10-20",
        completed: to,
      });
      const before = reads;
      const sync = engine.syncNow();
      while (reads < before + 2) await new Promise((r) => setTimeout(r, 0));
      expect(engine.getSnapshot().outbox).toHaveLength(0);
      release();
      hold = null;
      await sync;
    };
    await toggle(true);
    expect(labels).toEqual(["pending", "checked"]);
    await toggle(false);
    expect(labels).toEqual(["pending undo", "unchecked"]);
    engine.dispose();
  });
});
