import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  IndexedDbStore,
  plannerKeys,
  storageErrorMessage,
} from "./indexedDbStore";
import { memoryStore } from "./storage";
import { PlannerSync } from "./engine";
import { makeGoal, USER, OTHER_USER } from "@/test/harness";

function legacyData(initial: Record<string, string>) {
  const store = memoryStore(initial);
  return { data: store.data, getItem: store.get, removeItem: store.remove };
}

describe("IndexedDB planner storage", () => {
  it("migrates the owning user's cache and full pending/failed queue, leaving other accounts and preferences alone", async () => {
    const keys = plannerKeys(USER);
    const goal = makeGoal();
    const queue = JSON.stringify({
      pending: {
        goals: {
          [goal.id]: { id: goal.id, updated_at: "2026-10-16T09:00:00Z" },
        },
      },
      failed: {
        events: { rejected: { error: "constraint", row: { id: "rejected" } } },
      },
    });
    const legacy = legacyData({
      [keys[0]]: JSON.stringify([goal]),
      [keys[1]]: "[]",
      [keys[4]]: queue,
      [`planner_goals_${OTHER_USER}`]: "other account",
      facta_widget_config: "preferences",
    });
    const factory = new IDBFactory();
    const first = await IndexedDbStore.create(USER, { factory, legacy });
    expect(first.get(keys[0])).toBe(JSON.stringify([goal]));
    expect(first.get(keys[4])).toBe(queue);
    expect(legacy.data.has(keys[0])).toBe(false);
    expect(legacy.data.get(`planner_goals_${OTHER_USER}`)).toBe(
      "other account",
    );
    expect(legacy.data.get("facta_widget_config")).toBe("preferences");
    expect(() => first.get(`planner_goals_${OTHER_USER}`)).toThrow("account");
    await first.close();
    const reloaded = await IndexedDbStore.create(USER, { factory, legacy });
    expect(reloaded.get(keys[4])).toBe(queue);
    await reloaded.close();
  });

  it("never overwrites IndexedDB with stale legacy data after a partial cleanup/restart", async () => {
    const key = plannerKeys(USER)[0],
      factory = new IDBFactory();
    const legacy = legacyData({ [key]: "old" });
    const first = await IndexedDbStore.create(USER, { factory, legacy });
    first.set(key, "new");
    await first.close();
    legacy.data.set(key, "old");
    const second = await IndexedDbStore.create(USER, { factory, legacy });
    expect(second.get(key)).toBe("new");
    await second.close();
    const reopened = await IndexedDbStore.create(USER, {
      factory,
      legacy: {
        getItem() {
          throw new Error("localStorage now blocked");
        },
        removeItem() {},
      },
    });
    expect(reopened.get(key)).toBe("new");
    await reopened.close();
  });

  it("retains legacy values when migration cannot read storage", async () => {
    const key = plannerKeys(USER)[0],
      legacy = legacyData({ [key]: "original" });
    const denied = {
      ...legacy,
      getItem() {
        throw new DOMException("Denied", "SecurityError");
      },
    };
    await expect(
      IndexedDbStore.create(USER, {
        factory: new IDBFactory(),
        legacy: denied,
      }),
    ).rejects.toThrow("Denied");
    expect(legacy.data.get(key)).toBe("original");
  });

  it("retains every legacy key when an IndexedDB migration transaction aborts", async () => {
    const factory = new IDBFactory();
    const name = "broken-schema";
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 1);
      // An incompatible keyPath forces a genuine DataError on store.put.
      request.onupgradeneeded = () =>
        request.result.createObjectStore("kv", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const keys = plannerKeys(USER),
      legacy = legacyData({
        [keys[0]]: "original goals",
        [keys[4]]: "original queue",
      });
    await expect(
      IndexedDbStore.create(USER, { factory, legacy, name }),
    ).rejects.toThrow();
    expect(legacy.data.get(keys[0])).toBe("original goals");
    expect(legacy.data.get(keys[4])).toBe("original queue");
  });

  it("persists more than localStorage's typical quota and restores cache plus queue atomically", async () => {
    const factory = new IDBFactory(),
      legacy = legacyData({}),
      keys = plannerKeys(USER);
    const first = await IndexedDbStore.create(USER, { factory, legacy });
    first.set(keys[2], "x".repeat(11 * 1024 * 1024));
    first.set(keys[4], "pending notes");
    await first.flush();
    await first.close();
    const second = await IndexedDbStore.create(USER, { factory, legacy });
    expect(second.get(keys[2])?.length).toBe(11 * 1024 * 1024);
    expect(second.get(keys[4])).toBe("pending notes");
    await second.close();
  });

  it("surfaces a real failed transaction, keeps edits in memory and never reports sync success", async () => {
    const store = await IndexedDbStore.create(USER, {
      factory: new IDBFactory(),
      legacy: legacyData({}),
    });
    const engine = new PlannerSync({
      userId: USER,
      store,
      remotes: null,
      currentUserId: () => USER,
    });
    engine.load();
    await store.close(); // Subsequent real IDB transactions throw InvalidStateError.
    const goal = engine.goals.upsert(makeGoal());
    await expect(store.flush()).rejects.toThrow();
    expect(engine.goals.get(goal.id)?.title).toBe(goal.title);
    expect(engine.getStatus()).toMatchObject({
      state: "error",
      storageError: true,
      pending: 1,
    });
    expect(engine.getStatus().lastError).toContain("in memory");
    await engine.syncNow();
    expect(engine.getStatus().state).toBe("error");
    engine.dispose();
  });

  it("keeps quota errors actionable and honest", () => {
    expect(
      storageErrorMessage(new DOMException("Quota", "QuotaExceededError")),
    ).toContain("Device storage is full");
    expect(
      storageErrorMessage(new DOMException("Quota", "QuotaExceededError")),
    ).toContain("still in memory");
  });
});
