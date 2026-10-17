import { describe, expect, it } from "vitest";
import { mergePulled } from "@/lib/sync/merge";
import { goalFromRow, goalToRow, type GoalRow } from "@/lib/sync/mappers";
import type { Goal } from "@/types/planner";
import { USER, makeGoal } from "@/test/harness";

const OLD = "2026-10-16T08:00:00.000Z";
const NEW = "2026-10-16T10:00:00.000Z";

function row(goal: Goal, updatedAt: string, deletedAt: string | null = null): GoalRow {
  return {
    ...goalToRow(goal, USER, updatedAt, deletedAt),
    time: goal.time ? `${goal.time}:00` : null,
    completed: goal.completed,
    completed_dates: goal.completedDates ?? [],
    repeat: goal.repeat ?? "none",
    repeat_days: goal.repeatDays ?? [],
    notifications_enabled: goal.notificationsEnabled,
    notification_message: goal.notificationMessage,
    created_at: OLD,
    deleted_at: deletedAt,
  };
}

const merge = (local: Goal[], remote: GoalRow[], held: string[] = []) =>
  mergePulled(local, remote, { isHeld: (id) => held.includes(id), fromRow: goalFromRow, localOnly: ["lastNotifiedDate"] });

describe("mergePulled", () => {
  it("takes the remote version when it is newer", () => {
    const g = makeGoal({ title: "old", updatedAt: OLD });
    const r = merge([g], [row({ ...g, title: "new" }, NEW)]);
    expect(r.records[0].title).toBe("new");
    expect(r.changed).toBe(true);
  });

  it("keeps the local version when it is newer", () => {
    const g = makeGoal({ title: "mine", updatedAt: NEW });
    expect(merge([g], [row({ ...g, title: "theirs" }, OLD)]).records[0].title).toBe("mine");
  });

  it("lets the server win a tie", () => {
    const g = makeGoal({ title: "mine", updatedAt: NEW });
    expect(merge([g], [row({ ...g, title: "theirs" }, NEW)]).records[0].title).toBe("theirs");
  });

  it("compares microsecond server timestamps numerically", () => {
    const g = makeGoal({ title: "mine", updatedAt: "2026-10-16T10:00:00.900Z" });
    const r = merge([g], [row({ ...g, title: "theirs" }, "2026-10-16T10:00:00.123456+00:00")]);
    expect(r.records[0].title).toBe("mine");
  });

  it("keeps a record with a pending write, even if the remote is newer", () => {
    const g = makeGoal({ title: "mine", updatedAt: OLD });
    expect(merge([g], [row({ ...g, title: "theirs" }, NEW)], [g.id]).records[0].title).toBe("mine");
  });

  it("keeps lastNotifiedDate when the remote version replaces the local one", () => {
    const g = makeGoal({ title: "old", updatedAt: OLD, lastNotifiedDate: "2026-10-16" });
    const merged = merge([g], [row({ ...g, title: "new" }, NEW)]).records[0];
    expect(merged.title).toBe("new");
    expect(merged.lastNotifiedDate).toBe("2026-10-16");
  });

  it("removes records the server has tombstoned and reports them", () => {
    const g = makeGoal({ updatedAt: OLD });
    const r = merge([g], [row(g, NEW, NEW)], [g.id]);
    expect(r.records).toEqual([]);
    expect(r.tombstoned).toEqual([g.id]);
  });

  it("never adds tombstones to the cache", () => {
    const g = makeGoal();
    const r = merge([], [row(g, NEW, NEW)]);
    expect(r.records).toEqual([]);
    expect(r.tombstoned).toEqual([g.id]);
  });

  it("keeps a pending local delete absent", () => {
    const g = makeGoal();
    expect(merge([], [row(g, NEW)], [g.id]).records).toEqual([]);
  });

  it("adds new remote records and reports local ones the server doesn't know", () => {
    const remoteOnly = makeGoal({ title: "from laptop" });
    const localOnly = makeGoal({ title: "lost", updatedAt: OLD });
    const r = merge([localOnly], [row(remoteOnly, NEW)]);
    expect(r.records.map((g) => g.title)).toEqual(["lost", "from laptop"]);
    expect(r.unknownToServer).toEqual([localOnly.id]);
  });
});
