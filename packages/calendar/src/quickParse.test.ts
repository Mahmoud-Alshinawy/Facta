import { describe, expect, it } from "vitest";
import { parseQuickEvent, parseQuickGoal } from "./quickParse";

// Saturday 17 October 2026, 13:12 local.
const NOW = new Date(2026, 9, 17, 13, 12);
const ev = (t: string, def?: Date) => parseQuickEvent(t, NOW, def);
const hm = (h: number, m = 0) => h * 60 + m;

describe("parseQuickEvent", () => {
  it("reads the example on the toolbar", () => {
    expect(ev("Lunch with Alex Fri 1pm")).toEqual({
      title: "Lunch with Alex", date: "2026-10-23", hadDate: true, allDay: false,
      start: hm(13), end: hm(14), complete: true,
    });
  });

  it("day words: today, tonight, tomorrow, weekdays and next weekday", () => {
    expect(ev("Call mum today 8pm").date).toBe("2026-10-17");
    expect(ev("Party tonight 9pm").date).toBe("2026-10-17");
    expect(ev("Dentist tomorrow 10am").date).toBe("2026-10-18");
    expect(ev("Dentist tmrw 10am").date).toBe("2026-10-18");
    // A weekday is the coming one, today included.
    expect(ev("Run sat 7am").date).toBe("2026-10-17");
    expect(ev("Run saturday 7am").date).toBe("2026-10-17");
    expect(ev("Run next sat 7am").date).toBe("2026-10-24");
    expect(ev("Seminar mon 10:00").date).toBe("2026-10-19");
    expect(ev("Seminar next monday 10:00").date).toBe("2026-10-19");
    expect(ev("Review in 3 days 10:00").date).toBe("2026-10-20");
    expect(ev("Review in 2 weeks 10:00").date).toBe("2026-10-31");
  });

  it("dates: day month, month day, numeric (day first) and ISO", () => {
    expect(ev("Exam 24 Oct 9am").date).toBe("2026-10-24");
    expect(ev("Exam 24th October 9am").date).toBe("2026-10-24");
    expect(ev("Exam Oct 24 9am").date).toBe("2026-10-24");
    expect(ev("Exam 24/10 9am").date).toBe("2026-10-24");
    expect(ev("Exam 3/11/2026 9am").date).toBe("2026-11-03");
    expect(ev("Exam 2026-12-01 9am").date).toBe("2026-12-01");
    // A day already gone this year means next year.
    expect(ev("New year party 1 Jan 8pm").date).toBe("2027-01-01");
    expect(ev("Retro 10 Oct 9am").date).toBe("2027-10-10");
  });

  it("times: am/pm, 24-hour, noon, at N and ranges", () => {
    expect(ev("Standup 9:30am").start).toBe(hm(9, 30));
    expect(ev("Standup 9.30 pm").start).toBe(hm(21, 30));
    expect(ev("Standup 12am").start).toBe(0);
    expect(ev("Standup 12pm").start).toBe(hm(12));
    expect(ev("Standup 13:45").start).toBe(hm(13, 45));
    expect(ev("Lunch noon").start).toBe(hm(12));
    expect(ev("Lunch at 7").start).toBe(hm(7));
    const r = ev("Lab 1-3pm");
    expect([r.start, r.end, r.title]).toEqual([hm(13), hm(15), "Lab"]);
    const r2 = ev("Lab 13:00–14:30 tue");
    expect([r2.start, r2.end, r2.date]).toEqual([hm(13), hm(14, 30), "2026-10-20"]);
    const r3 = ev("Lab 11am-1pm");
    expect([r3.start, r3.end]).toEqual([hm(11), hm(13)]);
  });

  it("durations set the end; the default is one hour", () => {
    expect(ev("Gym 6pm for 90 min").end).toBe(hm(19, 30));
    expect(ev("Gym 6pm for 2h").end).toBe(hm(20));
    expect(ev("Gym 6pm for 1.5 hours").end).toBe(hm(19, 30));
    expect(ev("Gym 6pm 1h30").end).toBe(hm(19, 30));
    expect(ev("Gym 6pm").end).toBe(hm(19));
    // Never past midnight.
    expect(ev("Late show 11:30pm for 2h").end).toBe(24 * 60);
  });

  it("all day", () => {
    const r = ev("Fall break all day 24 Oct");
    expect(r).toMatchObject({ title: "Fall break", allDay: true, date: "2026-10-24", start: null, complete: true });
  });

  it("keeps numbers that are part of the title", () => {
    expect(ev("Read 20 pages 9pm").title).toBe("Read 20 pages");
    expect(ev("Room 101 meeting 10am").title).toBe("Room 101 meeting");
  });

  it("tidies joining words left behind", () => {
    expect(ev("Dinner with Sara at 7pm").title).toBe("Dinner with Sara");
    expect(ev("Dinner with Sara on Fri at 7pm").title).toBe("Dinner with Sara");
  });

  it("is incomplete without a time, without a title, or with a date that doesn't exist", () => {
    const noTime = ev("Lunch with Alex Fri");
    expect(noTime).toMatchObject({ complete: false, title: "Lunch with Alex", date: "2026-10-23", start: null });
    expect(ev("Fri 1pm").complete).toBe(false);
    expect(ev("Exam 31 Feb 9am").complete).toBe(false);
    // Looks like a time but isn't one: open the dialog rather than guess.
    expect(ev("Exam 25:00").complete).toBe(false);
    expect(ev("Shift 9pm-8pm").complete).toBe(false);
  });

  it("uses the default day when the text names none", () => {
    const r = ev("Call 3pm", new Date(2026, 9, 21));
    expect([r.date, r.hadDate]).toEqual(["2026-10-21", false]);
  });
});

describe("parseQuickGoal", () => {
  const g = (t: string) => parseQuickGoal(t, NOW);

  it("reads the example in the add row", () => {
    expect(g("Gym daily 18:00 !must")).toEqual({
      title: "Gym", priority: "must", time: "18:00", date: "2026-10-17", hadDate: false,
      repeat: "daily", repeatDays: [], complete: true,
    });
  });

  it("defaults to Should, today, no time, no repeat", () => {
    expect(g("Call grandma")).toMatchObject({ priority: "should", time: "", date: "2026-10-17", repeat: "none", complete: true });
  });

  it("priorities by word or number", () => {
    expect(g("A !nice").priority).toBe("nice");
    expect(g("A !1").priority).toBe("must");
    expect(g("A !3").priority).toBe("nice");
    expect(g("A !SHOULD").priority).toBe("should");
  });

  it("repeats", () => {
    expect(g("Read weekdays 9pm")).toMatchObject({ title: "Read", repeat: "weekdays", time: "21:00" });
    expect(g("Review every week")).toMatchObject({ title: "Review", repeat: "weekly" });
    expect(g("Swim every mon, wed and fri")).toMatchObject({ title: "Swim", repeat: "custom", repeatDays: [1, 3, 5], date: "2026-10-19" });
    // One named day is a weekly repeat starting on that day.
    expect(g("Water the plants every sat")).toMatchObject({ title: "Water the plants", repeat: "weekly", repeatDays: [], date: "2026-10-17" });
    expect(g("Laundry every sunday")).toMatchObject({ repeat: "weekly", date: "2026-10-18" });
  });

  it("same day and time rules as the quick add", () => {
    expect(g("Submit assignment fri !must")).toMatchObject({ title: "Submit assignment", date: "2026-10-23", hadDate: true, priority: "must" });
    expect(g("Dentist 24 Oct 9:30am")).toMatchObject({ title: "Dentist", date: "2026-10-24", time: "09:30" });
  });

  it("is incomplete with no title or an impossible date", () => {
    expect(g("!must 18:00").complete).toBe(false);
    expect(g("Exam 30 Feb").complete).toBe(false);
  });
});
