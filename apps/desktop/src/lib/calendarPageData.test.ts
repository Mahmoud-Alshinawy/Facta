import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS } from "@facta/calendar";
import { calendarHeading, quickEventDraft, shiftCalendar } from "./calendarPageData";
import { keyOf } from "./calendarData";

describe("calendar period navigation", () => {
  it("clamps month ends and crosses year boundaries without changing the source", () => {
    const date = new Date(2026, 0, 31, 12);
    expect(keyOf(shiftCalendar(date, "month", 1))).toBe("2026-02-28");
    expect(keyOf(shiftCalendar(date, "month", -1))).toBe("2025-12-31");
    expect(keyOf(date)).toBe("2026-01-31");
  });
  it("moves the actual view interval", () => {
    const date = new Date(2026, 11, 30, 12);
    expect(keyOf(shiftCalendar(date, "week", 1))).toBe("2027-01-06");
    expect(keyOf(shiftCalendar(date, "day", -1))).toBe("2026-12-29");
    expect(keyOf(shiftCalendar(date, "agenda", 1))).toBe("2027-01-13");
  });
  it("headings follow the chosen week start", () => {
    const day = new Date(2026, 9, 18, 12);
    expect(calendarHeading(day, day, "week", { ...DEFAULT_PREFS, weekStart: 1 }).subtitle).toBe("WEEK 42 · 12–18 OCT");
    expect(calendarHeading(day, day, "week", { ...DEFAULT_PREFS, weekStart: 0 }).subtitle).toBe("WEEK 43 · 18–24 OCT");
    expect(calendarHeading(day, day, "week", { ...DEFAULT_PREFS, weekStart: 6 }).subtitle).toBe("WEEK 43 · 17–23 OCT");
  });
});

describe("header quick add to dialog/storage", () => {
  const now = new Date(2026, 9, 21, 12), anchor = new Date(2026, 10, 4, 12);
  it("uses the selected date unless text names a different day", () => {
    expect(quickEventDraft("Lunch 1pm", now, anchor).draft).toMatchObject({ date: "2026-11-04", title: "Lunch", startTime: "13:00", endTime: "14:00" });
    expect(quickEventDraft("Lunch Fri 1pm", now, anchor).draft.date).toBe("2026-10-23");
  });
  it("opens incomplete lines as drafts and retains all-day state", () => {
    expect(quickEventDraft("Lunch", now, anchor).complete).toBe(false);
    expect(quickEventDraft("Holiday all day", now, anchor)).toMatchObject({ complete: true, draft: { title: "Holiday", allDay: true, startTime: undefined } });
  });
  it("uses 23:59 for the end-of-day storage boundary", () => {
    expect(quickEventDraft("Read 11:30pm for 90 min", now, anchor).draft.endTime).toBe("23:59");
  });
});
