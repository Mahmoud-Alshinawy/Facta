import { describe, expect, it } from "vitest";
import { SharedSync } from "./engine";
import { emptySharedState, encodeSharedState, sharedStorageKey } from "./state";
import { memoryStore } from "../storage";
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
