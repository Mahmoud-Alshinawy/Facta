import { describe, expect, it } from "vitest";
import {
  goalsForDay, isActiveToday, isCompletedToday, isExpiredOverdueGoal, isOverdueGoal, localDay, overdueGoals, planDay, toggleGoalCompletion,
} from "@/lib/goalDates";
import { makeGoal } from "@/test/harness";

// vitest.config.ts runs this file in Asia/Riyadh (UTC+3, no DST) and again
// in America/New_York (DST). `at` builds a wall-clock time in whichever zone
// is active, so every test means the same local moment in both.
function at(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`bad local time ${local}`);
  const [, y, mo, d, h, mi, sec] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, sec);
}

describe("time zone pin", () => {
  it("runs in the zone vitest.config.ts asked for", () => {
    const tz = process.env.TZ;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz);
    const expected: Record<string, number> = { "Asia/Riyadh": -180, "America/New_York": 240 };
    expect(new Date("2026-10-16T12:00:00Z").getTimezoneOffset()).toBe(expected[tz ?? ""]);
  });
});

describe("local day around midnight", () => {
  it("uses the local calendar day, not the UTC one", () => {
    // 23:30 local on the 16th is 20:30 UTC on the 16th; 00:30 local on the 17th is 21:30 UTC on the 16th.
    expect(localDay(at("2026-10-16T23:30:00"))).toBe("2026-10-16");
    expect(localDay(at("2026-10-17T00:30:00"))).toBe("2026-10-17");
  });

  it("ticks a repeating goal off for the local day, just before midnight", () => {
    const g = makeGoal({ repeat: "daily", date: "2026-10-01" });
    const ticked = toggleGoalCompletion(g, at("2026-10-16T23:59:59"));
    expect(ticked.completedDates).toEqual(["2026-10-16"]);
    expect(isCompletedToday(ticked, at("2026-10-16T23:59:59"))).toBe(true);
    // One second later it's a new day and the goal is open again.
    expect(isCompletedToday(ticked, at("2026-10-17T00:00:00"))).toBe(false);
  });

  it("unticks only today's date", () => {
    const g = makeGoal({ repeat: "daily", date: "2026-10-01", completedDates: ["2026-10-15", "2026-10-16"] });
    expect(toggleGoalCompletion(g, at("2026-10-16T08:00:00")).completedDates).toEqual(["2026-10-15"]);
  });

  it("toggles the plain flag for one-off goals", () => {
    const g = makeGoal();
    expect(toggleGoalCompletion(g, at("2026-10-16T08:00:00")).completed).toBe(true);
    expect(isCompletedToday({ ...g, completed: true }, at("2026-10-20T08:00:00"))).toBe(true);
  });
});

describe("isActiveToday", () => {
  // 2026-10-16 is a Friday, 2026-10-17 a Saturday.
  it("daily goals start on their start date", () => {
    const g = makeGoal({ repeat: "daily", date: "2026-10-17" });
    expect(isActiveToday(g, at("2026-10-16T23:59:00"))).toBe(false);
    expect(isActiveToday(g, at("2026-10-17T00:01:00"))).toBe(true);
  });

  it("weekdays switches off at local midnight on Friday night", () => {
    const g = makeGoal({ repeat: "weekdays", date: "2026-10-01" });
    expect(isActiveToday(g, at("2026-10-16T23:59:00"))).toBe(true);
    expect(isActiveToday(g, at("2026-10-17T00:01:00"))).toBe(false);
  });

  it("weekly repeats on the start date's weekday", () => {
    const g = makeGoal({ repeat: "weekly", date: "2026-10-09" }); // a Friday
    expect(isActiveToday(g, at("2026-10-16T12:00:00"))).toBe(true);
    expect(isActiveToday(g, at("2026-10-17T12:00:00"))).toBe(false);
  });

  it("custom repeats on the chosen weekdays", () => {
    const g = makeGoal({ repeat: "custom", date: "2026-10-01", repeatDays: [6] }); // Saturdays
    expect(isActiveToday(g, at("2026-10-16T23:59:00"))).toBe(false);
    expect(isActiveToday(g, at("2026-10-17T00:00:00"))).toBe(true);
  });

  it("one-off goals are never 'active today'", () => {
    expect(isActiveToday(makeGoal({ date: "2026-10-16" }), at("2026-10-16T12:00:00"))).toBe(false);
  });
});

describe("overdue", () => {
  const due = makeGoal({ date: "2026-10-16" });

  it("is not overdue on its due day, even at 23:59", () => {
    expect(isOverdueGoal(due, at("2026-10-16T23:59:59"))).toBe(false);
  });

  it("becomes overdue at local midnight", () => {
    expect(isOverdueGoal(due, at("2026-10-17T00:00:00"))).toBe(true);
  });

  it("expires only after more than 3 full days", () => {
    expect(isExpiredOverdueGoal(due, at("2026-10-19T23:59:59"))).toBe(false);
    expect(isExpiredOverdueGoal(due, at("2026-10-20T00:00:00"))).toBe(true);
  });

  it("ignores completed and repeating goals", () => {
    const later = at("2026-10-30T12:00:00");
    expect(isOverdueGoal({ ...due, completed: true }, later)).toBe(false);
    expect(isExpiredOverdueGoal({ ...due, repeat: "daily" }, later)).toBe(false);
  });
});

// In New York, 2026-03-08 02:00 jumps to 03:00 (a 23-hour day) and
// 2026-11-01 02:00 falls back to 01:00 (a 25-hour day). In Riyadh these are
// ordinary days, and the expected results are the same.
describe("clock changes", () => {
  it("the 25-hour day is still one day for 'done today'", () => {
    const g = makeGoal({ repeat: "daily", date: "2026-10-01" });
    const ticked = toggleGoalCompletion(g, at("2026-11-01T00:30:00"));
    expect(ticked.completedDates).toEqual(["2026-11-01"]);
    // After the fall-back hour, late in the evening, it's still the same day.
    expect(isCompletedToday(ticked, at("2026-11-01T23:59:59"))).toBe(true);
    expect(isCompletedToday(ticked, at("2026-11-02T00:00:00"))).toBe(false);
  });

  it("the repeated 01:30 hour maps to the right day", () => {
    expect(localDay(at("2026-11-01T01:30:00"))).toBe("2026-11-01");
    expect(localDay(new Date(at("2026-11-01T01:30:00").getTime() + 3_600_000))).toBe("2026-11-01");
  });

  it("the 23-hour day: midnight and late evening are still the same day", () => {
    const g = makeGoal({ repeat: "daily", date: "2026-03-01" });
    const ticked = toggleGoalCompletion(g, at("2026-03-08T00:00:00"));
    expect(ticked.completedDates).toEqual(["2026-03-08"]);
    expect(isCompletedToday(ticked, at("2026-03-08T23:59:59"))).toBe(true);
    expect(isCompletedToday(ticked, at("2026-03-09T00:00:00"))).toBe(false);
  });

  it("weekly and weekday repeats keep their weekday across the change", () => {
    const weekly = makeGoal({ repeat: "weekly", date: "2026-10-25" }); // a Sunday
    expect(isActiveToday(weekly, at("2026-11-01T00:30:00"))).toBe(true);
    expect(isActiveToday(weekly, at("2026-11-01T23:30:00"))).toBe(true);
    expect(isActiveToday(weekly, at("2026-11-02T00:30:00"))).toBe(false);
    const weekdays = makeGoal({ repeat: "weekdays", date: "2026-03-01" });
    expect(isActiveToday(weekdays, at("2026-03-08T12:00:00"))).toBe(false); // Sunday
    expect(isActiveToday(weekdays, at("2026-03-09T00:00:00"))).toBe(true); // Monday
  });

  it("overdue expiry counts calendar days, not 24-hour blocks", () => {
    const fallBack = makeGoal({ date: "2026-10-30" });
    expect(isExpiredOverdueGoal(fallBack, at("2026-11-02T23:59:59"))).toBe(false);
    expect(isExpiredOverdueGoal(fallBack, at("2026-11-03T00:00:00"))).toBe(true);
    const springForward = makeGoal({ date: "2026-03-06" });
    expect(isExpiredOverdueGoal(springForward, at("2026-03-09T23:59:59"))).toBe(false);
    expect(isExpiredOverdueGoal(springForward, at("2026-03-10T00:00:00"))).toBe(true);
  });

  it("a goal due on the change day becomes overdue at the next local midnight", () => {
    const due = makeGoal({ date: "2026-11-01" });
    expect(isOverdueGoal(due, at("2026-11-01T23:59:59"))).toBe(false);
    expect(isOverdueGoal(due, at("2026-11-02T00:00:00"))).toBe(true);
  });
});

describe("goalsForDay / planDay", () => {
  const oneOff = (title: string, date: string, over: Partial<ReturnType<typeof makeGoal>> = {}) =>
    makeGoal({ title, date, ...over });

  it("counts one-off goals due today and repeating goals active today", () => {
    const goals = [
      oneOff("due today", "2026-10-16"),
      oneOff("due tomorrow", "2026-10-17"),
      oneOff("overdue", "2026-10-15"),
      makeGoal({ title: "daily", repeat: "daily", date: "2026-10-01" }),
      makeGoal({ title: "weekdays", repeat: "weekdays", date: "2026-10-01" }),
      makeGoal({ title: "saturdays", repeat: "custom", repeatDays: [6], date: "2026-10-01" }),
      makeGoal({ title: "starts later", repeat: "daily", date: "2026-10-20" }),
    ];
    // 2026-10-16 is a Friday.
    expect(goalsForDay(goals, at("2026-10-16T12:00:00")).map((g) => g.title)).toEqual(["due today", "daily", "weekdays"]);
  });

  it("switches days exactly at local midnight", () => {
    const goals = [
      oneOff("friday's goal", "2026-10-16"),
      makeGoal({ title: "weekdays", repeat: "weekdays", date: "2026-10-01" }),
      makeGoal({ title: "saturdays", repeat: "custom", repeatDays: [6], date: "2026-10-01" }),
    ];
    expect(goalsForDay(goals, at("2026-10-16T23:59:59")).map((g) => g.title)).toEqual(["friday's goal", "weekdays"]);
    expect(goalsForDay(goals, at("2026-10-17T00:00:00")).map((g) => g.title)).toEqual(["saturdays"]);
  });

  it("a daily goal ticked just before midnight is open again just after", () => {
    const daily = makeGoal({ title: "daily", repeat: "daily", date: "2026-10-01", completedDates: ["2026-10-16"] });
    expect(planDay([daily], at("2026-10-16T23:59:59"))).toMatchObject({ done: 1, total: 1, next: undefined });
    expect(planDay([daily], at("2026-10-17T00:00:00"))).toMatchObject({ done: 0, total: 1 });
    expect(planDay([daily], at("2026-10-17T00:00:00")).next?.title).toBe("daily");
  });

  it("next up is the first unfinished goal by priority, then time", () => {
    const now = at("2026-10-16T09:00:00");
    const goals = [
      oneOff("nice", "2026-10-16", { category: "nice-to-have" }),
      oneOff("should late", "2026-10-16", { category: "should-do", time: "17:00" }),
      oneOff("should early", "2026-10-16", { category: "should-do", time: "08:00" }),
      oneOff("must done", "2026-10-16", { category: "must-do", completed: true }),
    ];
    const plan = planDay(goals, now);
    expect(plan.next?.title).toBe("should early");
    expect(plan.done).toBe(1);
    expect(plan.total).toBe(4);
    expect(plan.groups.map((g) => g.category)).toEqual(["must-do", "should-do", "nice-to-have"]);
    expect(plan.groups[1].items.map((g) => g.title)).toEqual(["should early", "should late"]);
  });

  it("puts unfinished goals before done ones, timed before untimed", () => {
    const goals = [
      oneOff("done early", "2026-10-16", { time: "07:00", completed: true }),
      oneOff("untimed", "2026-10-16"),
      oneOff("at noon", "2026-10-16", { time: "12:00" }),
    ];
    expect(planDay(goals, at("2026-10-16T09:00:00")).groups[0].items.map((g) => g.title)).toEqual(["at noon", "untimed", "done early"]);
  });

  it("leaves out empty groups and has no next when everything is done", () => {
    const plan = planDay([oneOff("only", "2026-10-16", { completed: true })], at("2026-10-16T09:00:00"));
    expect(plan.groups).toHaveLength(1);
    expect(plan.next).toBeUndefined();
  });
});

describe("overdueGoals", () => {
  it("lists overdue one-off goals, oldest first", () => {
    const goals = [
      makeGoal({ title: "yesterday", date: "2026-10-15" }),
      makeGoal({ title: "two days ago", date: "2026-10-14" }),
      makeGoal({ title: "done", date: "2026-10-14", completed: true }),
      makeGoal({ title: "today", date: "2026-10-16" }),
    ];
    expect(overdueGoals(goals, at("2026-10-16T00:00:00")).map((g) => g.title)).toEqual(["two days ago", "yesterday"]);
  });
});
