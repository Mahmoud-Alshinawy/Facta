import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedDbStore, plannerKeys } from "./indexedDbStore";
import { plannerQuit, QuitBarrier } from "./quitBarrier";

afterEach(() => vi.useRealTimers());

describe("quit durability barrier", () => {
  it("commits the queued cache and queue before quit acknowledges completion", async () => {
    const factory = new IDBFactory();
    const legacy = { getItem: () => null, removeItem: () => {} };
    const store = await IndexedDbStore.create("quit-user", { factory, legacy });
    const keys = plannerKeys("quit-user");
    store.set(keys[2], "new note body");
    store.set(keys[4], "pending note write");
    expect(await plannerQuit.flush()).toBe("flushed");
    // Read through another connection before closing the first one: close()
    // must not be responsible for persisting the batch in this assertion.
    const reopened = await IndexedDbStore.create("quit-user", {
      factory,
      legacy,
    });
    expect(reopened.get(keys[2])).toBe("new note body");
    expect(reopened.get(keys[4])).toBe("pending note write");
    await store.close();
    await reopened.close();
  });

  it("waits for every account's store even if another store fails", async () => {
    const barrier = new QuitBarrier();
    let complete!: () => void;
    const writing = new Promise<void>((resolve) => {
      complete = resolve;
    });
    barrier.register({ flush: () => Promise.reject(new Error("disk full")) });
    barrier.register({ flush: () => writing });
    let done = false;
    const result = barrier.flush().then((value) => {
      done = true;
      return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    complete();
    expect(await result).toBe("failed");
  });

  it("bounds a stalled flush at two seconds", async () => {
    vi.useFakeTimers();
    const barrier = new QuitBarrier();
    barrier.register({ flush: () => new Promise(() => {}) });
    let done = false;
    const result = barrier.flush().then((value) => {
      done = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe("timed-out");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops tracking stores only after their owner unregisters them", async () => {
    const barrier = new QuitBarrier();
    const unregister = barrier.register({
      flush: () => Promise.reject(new Error("closed")),
    });
    expect(await barrier.flush()).toBe("failed");
    unregister();
    expect(await barrier.flush()).toBe("flushed");
  });
});
