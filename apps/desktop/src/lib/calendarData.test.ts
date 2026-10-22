import { describe, expect, it } from "vitest";
import { allDaySpans, clockValue, durationText, eventMinutes, goalsOn, isoWeek, keyOf, noonOf, splitDay, toggledOn } from "./calendarData";
import type { CalendarEvent, Goal } from "@/types/planner";

const goal = (over: Partial<Goal>): Goal => ({
  id: "g", title: "G", category: "should-do", date: "2026-10-17", completed: false,
  notificationsEnabled: false, notificationMessage: "", ...over,
});
const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e", title: "E", date: "2026-10-17", startTime: "10:00", endTime: "11:30", color: "blue", ...over,
});

describe("calendarData", () => {
  it("days and keys round-trip at local noon", () => {
    expect(keyOf(noonOf("2026-10-17"))).toBe("2026-10-17");
    expect(noonOf("2026-03-29").getHours()).toBe(12);
  });

  it("goals on a day carry their done state and time", () => {
    const daily = goal({ id: "d", repeat: "daily", date: "2026-10-01", completedDates: ["2026-10-16"], time: "18:00" });
    const once = goal({ id: "o", date: "2026-10-17", completed: true });
    const other = goal({ id: "x", date: "2026-10-18" });
    const on16 = goalsOn([daily, once, other], "2026-10-16");
    expect(on16.map((g) => [g.goal.id, g.done, g.at])).toEqual([["d", true, 1080]]);
    const on17 = goalsOn([daily, once, other], "2026-10-17");
    expect(on17.map((g) => [g.goal.id, g.done, g.at])).toEqual([["d", false, 1080], ["o", true, null]]);
  });

  it("ticking a repeating goal marks only that day", () => {
    const daily = goal({ repeat: "daily", date: "2026-10-01", completedDates: [] });
    expect(toggledOn(daily, "2026-10-14").completedDates).toEqual(["2026-10-14"]);
    expect(toggledOn(goal({}), "2026-10-14")).toEqual({ completed: true, completedDates: undefined });
  });

  it("event minutes: 23:59 is the end of the day, a bad end becomes 30 minutes", () => {
    expect(eventMinutes(event({}))).toEqual({ start: 600, end: 690 });
    expect(eventMinutes(event({ startTime: "22:00", endTime: "23:59" }))).toEqual({ start: 1320, end: 1440 });
    expect(eventMinutes(event({ startTime: "10:00", endTime: "09:00" }))).toEqual({ start: 600, end: 630 });
  });

  it("splits all-day from timed, timed sorted by start then longest", () => {
    const r = splitDay([
      event({ id: "b", startTime: "12:00", endTime: "13:00" }),
      event({ id: "ad", allDay: true }),
      event({ id: "a", startTime: "12:00", endTime: "15:00" }),
      event({ id: "c", startTime: "09:00", endTime: "10:00" }),
    ]);
    expect(r.allDay.map((e) => e.id)).toEqual(["ad"]);
    expect(r.timed.map((t) => t.event.id)).toEqual(["c", "a", "b"]);
  });

  it("formats clock values, durations and ISO weeks", () => {
    expect(clockValue(0)).toBe("00:00");
    expect(clockValue(1440)).toBe("23:59");
    expect(clockValue(13 * 60 + 5)).toBe("13:05");
    expect(durationText(90)).toBe("1h 30m");
    expect(durationText(45)).toBe("45m");
    expect(durationText(120)).toBe("2h");
    expect(isoWeek(new Date(2026, 9, 17))).toBe(42);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  });
});

describe("allDaySpans", () => {
  const week = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"];
  it("joins consecutive days of one event and looks past the edges", () => {
    const daily = event({ id: "ex", allDay: true });
    const on = (k: string) => (k >= "2026-10-12" && k <= "2026-10-18" ? [daily] : k === "2026-10-14" ? [] : []);
    const spans = allDaySpans(week, on);
    expect(spans.map((s) => [s.id, s.first, s.last])).toEqual([["ex:2026-10-12", "2026-10-12", "2026-10-18"]]);
  });
  it("breaks a run on a gap, ignores timed events and runs outside the row", () => {
    const e = event({ id: "w", allDay: true });
    const timed = event({ id: "t" });
    const on = (k: string) => (["2026-10-10", "2026-10-12", "2026-10-13", "2026-10-15"].includes(k) ? [e, timed] : []);
    const spans = allDaySpans(week, on);
    expect(spans.map((s) => [s.first, s.last])).toEqual([["2026-10-12", "2026-10-13"], ["2026-10-15", "2026-10-15"]]);
  });
});
