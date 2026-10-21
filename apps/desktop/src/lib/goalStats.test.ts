import { describe, expect, it } from "vitest";
import {
  goalCompletionDays,
  goalStats,
  goalStreak,
  reminderPending,
} from "./goalStats";
import type { Goal } from "@/types/planner";

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: crypto.randomUUID(),
  title: "Read",
  category: "should-do",
  date: "2026-10-19",
  completed: false,
  repeat: "none",
  notificationsEnabled: false,
  notificationMessage: "",
  ...over,
});
const now = new Date(2026, 9, 21, 12);

describe("weekly scheduled occurrences", () => {
  const goals = [
    goal({
      repeat: "daily",
      completedDates: ["2026-10-19", "2026-10-21", "2026-10-22"],
    }),
    goal({ date: "2026-10-20", completed: true }),
  ];
  it.each([
    { weekStart: 0 as const, total: 7 },
    { weekStart: 1 as const, total: 8 },
    { weekStart: 6 as const, total: 6 },
  ])("respects week start $weekStart", ({ weekStart, total }) => {
    const stats = goalStats(goals, now, { weekStart });
    expect(stats.week).toMatchObject({
      done: 4,
      total,
      percent: Math.round(400 / total),
    });
    expect(stats.week.days[0].date.getDay()).toBe(weekStart);
  });
  it("counts a repeating goal only after its start date", () => {
    expect(
      goalStats([goal({ date: "2026-10-23", repeat: "daily" })], now, {
        weekStart: 0,
      }).week.total,
    ).toBe(2);
  });
  it("handles a week spanning a year and counts completed one-offs on their date", () => {
    const stats = goalStats(
      [
        goal({
          date: "2026-12-29",
          repeat: "daily",
          completedDates: ["2026-12-31", "2027-01-01"],
        }),
        goal({ date: "2027-01-02", completed: true }),
        goal({ date: "2027-01-03", completed: true }),
      ],
      new Date(2027, 0, 1, 12),
      { weekStart: 0 },
    );
    expect(stats.week).toMatchObject({ done: 3, total: 6, percent: 50 });
    expect(stats.week.days.map((day) => day.key)).toEqual([
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });
  it("respects custom and weekday schedules and ignores off-schedule ticks", () => {
    const stats = goalStats(
      [
        goal({ repeat: "weekdays", completedDates: ["2026-10-24"] }),
        goal({
          repeat: "custom",
          repeatDays: [1, 3],
          completedDates: ["2026-10-19", "2026-10-21"],
        }),
      ],
      now,
      { weekStart: 1 },
    );
    expect(stats.week).toMatchObject({ done: 2, total: 7 });
  });
  it("does not count a repeating completed flag without a dated occurrence", () => {
    expect(
      goalStats([goal({ repeat: "daily", completed: true })], now, {
        weekStart: 1,
      }).week.done,
    ).toBe(0);
  });
  it("returns zero for an empty planner and selects timed next-up before untimed goals", () => {
    expect(goalStats([], now, { weekStart: 1 }).week.percent).toBe(0);
    const early = goal({ title: "Early", date: "2026-10-21", time: "09:00" });
    expect(
      goalStats(
        [goal({ date: "2026-10-21", category: "must-do" }), early],
        now,
        { weekStart: 1 },
      ).next?.id,
    ).toBe(early.id);
  });
});

describe("completion history and streaks", () => {
  it("dates one-off history on the goal date and ignores completedDates for one-offs", () => {
    expect(
      goalCompletionDays(
        goal({ completed: true, completedDates: ["2026-10-20"] }),
      ),
    ).toEqual(["2026-10-19"]);
    expect(
      goalCompletionDays(
        goal({ completed: false, completedDates: ["2026-10-20"] }),
      ),
    ).toEqual([]);
  });
  it("deduplicates repeat history and ignores invalid day keys", () => {
    expect(
      goalCompletionDays(
        goal({
          repeat: "daily",
          completedDates: ["2026-10-19", "2026-10-19", "2026-02-31", "bad"],
        }),
      ),
    ).toEqual(["2026-10-19"]);
  });
  it("does not let an unfinished today break yesterday's run", () => {
    const goals = [
      goal({ completed: true }),
      goal({ date: "2026-10-20", completed: true }),
    ];
    expect(goalStreak(goals, now)).toEqual({ current: 2, best: 2 });
    expect(goalStreak(goals, new Date(2026, 9, 22, 0, 0))).toEqual({
      current: 0,
      best: 2,
    });
  });
  it("counts one day once across goals and combines one-off and repeating history", () => {
    expect(
      goalStreak(
        [
          goal({ completed: true }),
          goal({
            repeat: "daily",
            completedDates: ["2026-10-19", "2026-10-20", "2026-10-21"],
          }),
        ],
        now,
      ),
    ).toEqual({ current: 3, best: 3 });
  });
  it("finds the best historical run, excluding future completion dates", () => {
    expect(
      goalStreak(
        [
          goal({
            repeat: "daily",
            completedDates: [
              "2026-10-01",
              "2026-10-02",
              "2026-10-03",
              "2026-10-20",
              "2026-10-22",
              "2026-10-23",
              "2026-10-24",
              "2026-10-25",
            ],
          }),
        ],
        now,
      ),
    ).toEqual({ current: 1, best: 3 });
  });
  it.each([
    [2026, 2, 9, ["2026-03-07", "2026-03-08", "2026-03-09"]],
    [2026, 10, 2, ["2026-10-31", "2026-11-01", "2026-11-02"]],
  ] as const)(
    "uses calendar days across DST at %i-%i-%i",
    (year, month, day, dates) => {
      expect(
        goalStreak(
          [goal({ repeat: "daily", completedDates: [...dates] })],
          new Date(year, month, day, 12),
        ),
      ).toEqual({ current: 3, best: 3 });
    },
  );
});

describe("unsent reminder state", () => {
  const due = goal({
    date: "2026-10-21",
    time: "12:00",
    notificationsEnabled: true,
  });
  it("appears at the reminder time and clears after sending or completion", () => {
    expect(reminderPending(due, new Date(2026, 9, 21, 11, 59))).toBe(false);
    expect(reminderPending(due, now)).toBe(true);
    expect(
      reminderPending({ ...due, lastNotifiedDate: "2026-10-21" }, now),
    ).toBe(false);
    expect(reminderPending({ ...due, completed: true }, now)).toBe(false);
  });
  it("requires a time, enabled reminder and an active recurring occurrence", () => {
    expect(reminderPending({ ...due, time: undefined }, now)).toBe(false);
    expect(reminderPending({ ...due, notificationsEnabled: false }, now)).toBe(
      false,
    );
    expect(
      reminderPending({ ...due, repeat: "custom", repeatDays: [1] }, now),
    ).toBe(false);
    expect(
      reminderPending(
        { ...due, repeat: "daily", completedDates: ["2026-10-21"] },
        now,
      ),
    ).toBe(false);
  });
});
