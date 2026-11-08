import { describe, expect, it } from "vitest";
import { emptySharedState, type SharedState } from "@/lib/sync/shared/state";
import type { CheckinIntent } from "@/lib/sync/shared/outbox";
import { mapSnapshot } from "./contracts";
import { reconcileSnapshot } from "./cache";
import {
  combineDay,
  sharedDayGoals,
  sharedMineRows,
  sharedSubline,
  sharedTodayItems,
} from "./asGoals";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_GROUP,
  SHARED_MEMBER,
  SHARED_RANGE,
  SHARED_NOW,
} from "@/test/sharedFixtures";

// The fixture group: Gym, 2 days a week, round Mon 19 – Sun 25 Oct, Asia/Riyadh.
// SHARED_NOW is Tue 20 Oct, 12:00 in Riyadh.
type Rows = ReturnType<typeof sharedRpcFixture>;
function state(edit: (rows: Rows) => void = () => {}): SharedState {
  const rows = sharedRpcFixture();
  edit(rows);
  const s = emptySharedState(SHARED_USER);
  s.cache = reconcileSnapshot(
    null,
    mapSnapshot(rows, SHARED_USER, SHARED_RANGE),
    SHARED_RANGE,
    SHARED_NOW,
  );
  return s;
}
const own = (rows: Rows) => rows.scores.find((r) => r.user_id === SHARED_USER)!;
const checkedToday = (rows: Rows, date = "2026-10-20") =>
  rows.checkins.push({
    id: crypto.randomUUID(),
    group_id: SHARED_GROUP,
    user_id: SHARED_USER,
    membership_id: SHARED_MEMBER,
    checkin_date: date,
    completed: true,
    captured_at: "2026-10-20T09:00:00Z",
    created_at: "2026-10-20T09:00:00Z",
    updated_at: "2026-10-20T09:00:00Z",
    revision: 1,
  } as never);
const intent = (patch: Partial<CheckinIntent>): CheckinIntent => ({
  id: crypto.randomUUID(),
  groupId: SHARED_GROUP,
  membershipId: SHARED_MEMBER,
  userId: SHARED_USER,
  date: "2026-10-20",
  capturedAt: new Date(SHARED_NOW).toISOString(),
  completed: true,
  baseRevision: 0,
  after: null,
  command: null,
  phase: "queued",
  failure: null,
  ...patch,
});
const items = (s: SharedState, now = SHARED_NOW) =>
  sharedTodayItems(s, SHARED_USER, now);

describe("shared goals on Today", () => {
  it("lists a group you're in as an item, with week progress and the others' names", () => {
    expect(items(state())).toEqual([
      expect.objectContaining({
        id: `shared:${SHARED_GROUP}`,
        groupId: SHARED_GROUP,
        title: "Exercise",
        day: "2026-10-20",
        done: false,
        pending: false,
        canCheck: true,
        weekDone: 0,
        weekTarget: 2,
        others: ["Person 1"],
        failed: [],
      }),
    ]);
  });

  it("makes a weekly-count goal optional until the days left only just cover the target", () => {
    // Tue: 6 days left (20–25 Oct) for 2 needed.
    expect(items(state())[0].due).toBe("optional");
    // Sat 24 Oct, 12:00 in Riyadh: 2 days left for 2 needed.
    expect(items(state(), Date.parse("2026-10-24T09:00:00Z"))[0].due).toBe(
      "due",
    );
  });

  it("marks the week's target as met, and doesn't count today's own check-in twice", () => {
    expect(items(state((r) => (own(r).completed_days = 2)))[0].due).toBe("met");
    const today = items(
      state((r) => {
        own(r).completed_days = 1;
        checkedToday(r);
      }),
    )[0];
    expect(today).toMatchObject({ done: true, weekDone: 1, due: "optional" });
  });

  it("is due every scheduled day for a fixed-days goal, and absent on its rest days", () => {
    const fixed = (weekdays: number[]) =>
      state((r) => {
        Object.assign(r.groups[0], {
          template: "custom",
          schedule_kind: "days",
          weekdays,
        });
      });
    // 20 Oct 2026 is a Tuesday (2).
    expect(items(fixed([1, 2, 4]))[0].due).toBe("due");
    expect(items(fixed([1, 4]))).toEqual([]);
  });

  it("counts a queued check-in as done and shows it as not synced yet", () => {
    const s = state();
    s.outbox = [intent({})];
    expect(items(s)[0]).toMatchObject({
      done: true,
      pending: true,
      weekDone: 1,
    });
  });

  it("falls back to the saved state for a refused check-in and carries it for Try again or Discard", () => {
    const s = state();
    const refused = intent({ phase: "failed", failure: "invalid_date" });
    s.outbox = [refused];
    expect(items(s)[0]).toMatchObject({
      done: false,
      pending: false,
      canCheck: false,
      failed: [refused],
    });
  });

  it("leaves out groups that are waiting, paused, archived or that you left", () => {
    const waiting = state((r) => {
      r.rounds = [];
      r.scores = [];
      for (const m of r.memberships) m.eligible_round = "2026-10-26";
    });
    expect(items(waiting)).toEqual([]);
    const archived = state(
      (r) =>
        ((r.groups[0] as { archived_at: string | null }).archived_at =
          "2026-10-20T08:00:00Z"),
    );
    expect(items(archived)).toEqual([]);
    const left = structuredClone(state());
    left.cache!.snapshot.memberships.find(
      (m) => m.userId === SHARED_USER,
    )!.leftAt = "2026-10-20T08:00:00Z";
    expect(items(left)).toEqual([]);
    // After the round's last instant the week can't be confirmed offline.
    expect(items(state(), Date.parse("2026-10-25T21:00:00Z"))).toEqual([]);
  });
});

describe("the shared row's subline", () => {
  const item = { ...items(state())[0], due: "due" as const };
  it("names who it's with and the week so far", () => {
    expect(sharedSubline(item, "2026-10-20")).toBe(
      "with Person 1 · 0 of 2 this week",
    );
    expect(
      sharedSubline(
        { ...item, others: ["Ana", "Ben", "Cy", "Di"] },
        "2026-10-20",
      ),
    ).toBe("with Ana, Ben +2 · 0 of 2 this week");
    expect(sharedSubline({ ...item, others: [] }, "2026-10-20")).toBe(
      "0 of 2 this week",
    );
  });
  it("names the group's day when it differs from yours", () => {
    expect(sharedSubline(item, "2026-10-19")).toBe(
      "with Person 1 · 0 of 2 this week · for Tue 20 Oct",
    );
  });
  it("says when the target is already met or today is optional", () => {
    expect(sharedSubline({ ...item, due: "met" }, "2026-10-20")).toBe(
      "with Person 1 · 0 of 2 this week · target met this week",
    );
    expect(sharedSubline({ ...item, due: "optional" }, "2026-10-20")).toBe(
      "with Person 1 · 0 of 2 this week · optional today",
    );
  });
});

describe("N of M done today", () => {
  const item = items(state())[0];
  it("counts due shared goals, and optional or met ones only once ticked", () => {
    const day = combineDay({ done: 1, total: 2 }, [
      { ...item, id: "a", due: "due", done: false },
      { ...item, id: "b", due: "optional", done: true },
      { ...item, id: "c", due: "optional", done: false },
      { ...item, id: "d", due: "met", done: false },
      { ...item, id: "e", due: "met", done: true },
    ]);
    expect(day).toEqual({ done: 3, total: 5, counted: ["a", "b", "e"] });
  });
  it("leaves the personal plan alone when there are no shared goals", () => {
    expect(combineDay({ done: 0, total: 0 }, [])).toEqual({
      done: 0,
      total: 0,
      counted: [],
    });
  });
});

describe("shared goals in Goals > Mine", () => {
  // The viewer's week starts Monday 19 Oct.
  const rows = (s: SharedState, now = SHARED_NOW) =>
    sharedMineRows(s, SHARED_USER, now, "2026-10-19");

  it("lists an active group today, as a recurring rule with its week, and nothing done yet", () => {
    const out = rows(state());
    expect(out.map((r) => [r.section, r.title])).toEqual([
      ["today", "Exercise"],
      ["rules", "Exercise"],
    ]);
    expect(out[0].today?.id).toBe(`shared:${SHARED_GROUP}`);
    expect(out[1].status).toBe("with Person 1 · 0 of 2 this week");
  });

  it("lists this week's earlier check-ins as done, but not last week's", () => {
    const out = rows(
      state((r) => {
        checkedToday(r, "2026-10-19");
        checkedToday(r, "2026-10-18");
      }),
    );
    expect(
      out.filter((r) => r.section === "done").map((r) => [r.date, r.done]),
    ).toEqual([["2026-10-19", true]]);
  });

  it("gives groups without an active week a plain status and no today row", () => {
    const waiting = state((r) => {
      r.rounds = [];
      r.scores = [];
      for (const m of r.memberships) m.eligible_round = "2026-10-26";
    });
    expect(rows(waiting).map((r) => [r.section, r.status])).toEqual([
      ["rules", "Starts Mon 26 Oct 2026"],
    ]);
    const archived = state(
      (r) =>
        ((r.groups[0] as { archived_at: string | null }).archived_at =
          "2026-10-20T08:00:00Z"),
    );
    expect(rows(archived).map((r) => [r.section, r.status])).toEqual([
      ["rules", "Archived"],
    ]);
  });

  it("leaves out a group you left", () => {
    const left = structuredClone(state());
    left.cache!.snapshot.memberships.find(
      (m) => m.userId === SHARED_USER,
    )!.leftAt = "2026-10-20T08:00:00Z";
    expect(rows(left)).toEqual([]);
  });
});

describe("shared goals on the calendar", () => {
  const on = (s: SharedState, key: string) =>
    sharedDayGoals(s, SHARED_USER, key, SHARED_NOW);
  const fixedDays = (rows: Rows) =>
    Object.assign(rows.groups[0], {
      template: "custom",
      schedule_kind: "days",
      weekdays: [1, 2, 4],
    });

  it("shows today open and checkable, untimed", () => {
    expect(on(state(), "2026-10-20")).toEqual([
      {
        id: `shared:${SHARED_GROUP}:2026-10-20`,
        title: "Exercise",
        done: false,
        at: null,
        shared: { groupId: SHARED_GROUP, canCheck: true },
      },
    ]);
  });

  it("shows past days you checked in on, from this or earlier weeks, and nothing else", () => {
    const s = state((r) => {
      checkedToday(r, "2026-10-19");
      checkedToday(r, "2026-10-18");
    });
    expect(on(s, "2026-10-19")).toMatchObject([
      { done: true, shared: { canCheck: false } },
    ]);
    expect(on(s, "2026-10-18")).toMatchObject([{ done: true }]);
    expect(on(state(), "2026-10-19")).toEqual([]);
  });

  it("shows upcoming scheduled days of this week for a fixed-days goal only", () => {
    // Thu 22 Oct is scheduled; Wed 21 is a rest day; Mon 26 is next week.
    const fixed = state(fixedDays);
    expect(on(fixed, "2026-10-22")).toMatchObject([
      { done: false, shared: { canCheck: false } },
    ]);
    expect(on(fixed, "2026-10-21")).toEqual([]);
    expect(on(fixed, "2026-10-26")).toEqual([]);
    // A weekly-count goal has no fixed days, so nothing ahead of today.
    expect(on(state(), "2026-10-22")).toEqual([]);
  });
});
