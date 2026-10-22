import { describe, expect, it } from "vitest";
import { eventForm, eventFormError, goalForm, goalFormError, nextHour } from "./dialogState";
import { makeGoal } from "@/test/harness";

describe("dialog drafts and reset state", () => {
  it("keeps a drag's end time, title, all-day state and colour", () => {
    expect(eventForm(null, "2026-10-21", { title: "Read", startTime: "13:00", endTime: "13:30", allDay: true, color: "pink" }))
      .toMatchObject({ title: "Read", startTime: "13:00", endTime: "13:30", allDay: true, color: "pink" });
  });
  it("resets all non-record state when a new form is created", () => {
    const old = goalForm(makeGoal({ time: "13:00", notificationsEnabled: true, repeat: "custom", repeatDays: [1] }), "2026-10-21");
    old.addToCalendar = true;
    expect(goalForm(null, "2026-10-22")).toMatchObject({ title: "", date: "2026-10-22", time: "", reminder: false, addToCalendar: false, message: "", repeat: "none", repeatDays: [] });
    expect(old.reminder).toBe(true);
  });
  it("disables a legacy reminder without a time and preserves quick goal drafts", () => {
    expect(goalForm(makeGoal({ notificationsEnabled: true }), "2026-10-21").reminder).toBe(false);
    expect(goalForm(null, "2026-10-21", { title: "Gym", category: "should-do", repeat: "custom", repeatDays: [1, 3] }))
      .toMatchObject({ title: "Gym", category: "should-do", repeat: "custom", repeatDays: [1, 3] });
  });
  it("never rolls a default end time into the next day", () => {
    expect(nextHour("23:30")).toBe("23:59");
    expect(nextHour("09:15")).toBe("10:15");
  });
});

describe("blocked dialog submission", () => {
  it("rejects blank titles, invalid dates and empty custom repeats", () => {
    const form = goalForm(null, "2026-10-21");
    expect(goalFormError(form)).toMatch(/title/);
    form.title = "Gym"; form.date = "2026-02-31";
    expect(goalFormError(form)).toMatch(/date/);
    form.date = "2026-10-21"; form.repeat = "custom";
    expect(goalFormError(form)).toMatch(/repeat day/);
    form.repeatDays = [1];
    expect(goalFormError(form)).toBe("");
  });
  it("requires a time for reminders", () => {
    const form = goalForm(null, "2026-10-21", { title: "Gym" });
    form.reminder = true;
    expect(goalFormError(form)).toMatch(/time/);
    form.time = "18:00";
    expect(goalFormError(form)).toBe("");
  });
  it("rejects equal/backwards event times but accepts all-day events", () => {
    const form = eventForm(null, "2026-10-21", { title: "Lunch", startTime: "13:00", endTime: "13:00" });
    expect(eventFormError(form)).toMatch(/after/);
    form.endTime = "12:00";
    expect(eventFormError(form)).toMatch(/after/);
    form.allDay = true;
    expect(eventFormError(form)).toBe("");
    form.repeat = "custom";
    expect(eventFormError(form)).toMatch(/repeat day/);
  });
});
