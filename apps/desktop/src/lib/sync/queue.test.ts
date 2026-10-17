import { describe, expect, it } from "vitest";
import { WriteQueue } from "@/lib/sync/queue";
import { goalToRow } from "@/lib/sync/mappers";
import { memoryStore } from "@/lib/sync/storage";
import { USER, makeGoal } from "@/test/harness";

const KEY = "q";
const snap = (id: string, t: string, deleted: string | null = null) =>
  goalToRow(makeGoal({ id }), USER, t, deleted);

describe("WriteQueue", () => {
  it("holds one latest snapshot per id", () => {
    const q = new WriteQueue(memoryStore(), KEY);
    q.put("goals", snap("a", "2026-10-16T09:00:00.000Z"));
    q.put("goals", snap("a", "2026-10-16T09:00:01.000Z", "2026-10-16T09:00:01.000Z"));
    expect(q.entries("goals")).toHaveLength(1);
    expect(q.get("goals", "a")?.deleted_at).toBe("2026-10-16T09:00:01.000Z");
  });

  it("settles only the snapshot that was sent", () => {
    const q = new WriteQueue(memoryStore(), KEY);
    q.put("goals", snap("a", "2026-10-16T09:00:00.000Z"));
    q.put("goals", snap("a", "2026-10-16T09:00:05.000Z"));
    expect(q.settle("goals", "a", "2026-10-16T09:00:00.000Z")).toBe(false);
    expect(q.pendingCount).toBe(1);
    expect(q.settle("goals", "a", "2026-10-16T09:00:05.000Z")).toBe(true);
    expect(q.pendingCount).toBe(0);
  });

  it("survives a restart", () => {
    const store = memoryStore();
    new WriteQueue(store, KEY).put("events", {
      id: "e", user_id: USER, title: "x", date: "2026-10-16", start_time: "09:00", end_time: "10:00",
      updated_at: "2026-10-16T09:00:00.000Z",
    });
    const reloaded = new WriteQueue(store, KEY);
    expect(reloaded.get("events", "e")?.title).toBe("x");
    expect(reloaded.isHeld("events", "e")).toBe(true);
    expect(reloaded.isHeld("goals", "e")).toBe(false);
  });

  it("parks rejected writes and can retry or discard them", () => {
    const q = new WriteQueue(memoryStore(), KEY);
    const s = snap("a", "2026-10-16T09:00:00.000Z");
    q.put("goals", s);
    expect(q.fail("goals", s, "bad")).toBe(true);
    expect(q.pendingCount).toBe(0);
    expect(q.failedCount).toBe(1);
    expect(q.isHeld("goals", "a")).toBe(true);
    q.retryFailed();
    expect(q.pendingCount).toBe(1);
    q.fail("goals", s, "bad");
    expect(q.discardFailed()).toEqual({ goals: ["a"], events: [] });
    expect(q.isHeld("goals", "a")).toBe(false);
  });

  it("doesn't park a write that a newer edit replaced", () => {
    const q = new WriteQueue(memoryStore(), KEY);
    const old = snap("a", "2026-10-16T09:00:00.000Z");
    q.put("goals", old);
    q.put("goals", snap("a", "2026-10-16T09:00:02.000Z"));
    expect(q.fail("goals", old, "bad")).toBe(false);
    expect(q.failedCount).toBe(0);
    expect(q.pendingCount).toBe(1);
  });

  it("a new edit clears an earlier rejection", () => {
    const q = new WriteQueue(memoryStore(), KEY);
    const s = snap("a", "2026-10-16T09:00:00.000Z");
    q.put("goals", s);
    q.fail("goals", s, "bad");
    q.put("goals", snap("a", "2026-10-16T09:00:03.000Z"));
    expect(q.failedCount).toBe(0);
    expect(q.pendingCount).toBe(1);
  });

  it("starts empty from corrupt storage", () => {
    const q = new WriteQueue(memoryStore({ [KEY]: "{not json" }), KEY);
    expect(q.pendingCount).toBe(0);
  });
});
