import { describe, expect, it } from "vitest";
import { SharedSync } from "./engine";
import { emptySharedState, encodeSharedState, sharedStorageKey } from "./state";
import { memoryStore } from "../storage";
import { SharedRemoteError, type SharedRemote } from "./remote";
import { decideSharedToast } from "../toastPolicy";
import { mapSnapshot } from "@/lib/sharedGoals/contracts";
import { reconcileSnapshot } from "@/lib/sharedGoals/cache";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_GROUP,
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
  const harness = (remote: Partial<SharedRemote>) => {
    const engine = new SharedSync({
      userId: SHARED_USER,
      store: seeded(),
      remote: { userId: SHARED_USER, ...remote } as SharedRemote,
      currentUserId: () => SHARED_USER,
      now: () => SHARED_NOW,
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
});
