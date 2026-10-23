import { describe, expect, it } from "vitest";
import {
  dayIndex,
  eventDayRanges,
  eventDurationMinutes,
  eventOccurrencesOn,
  eventOccurrenceAt,
  eventOccursOn,
  eventSpanDays,
  shiftDate,
  type ScheduledEvent,
} from "./eventSchedule";

const event = (patch: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  date: "2026-10-22",
  startTime: "20:00",
  endTime: "09:00",
  endDate: "2026-10-24",
  ...patch,
});
describe("inclusive event dates", () => {
  it("validates calendar keys and crosses month, leap, year and DST boundaries", () => {
    expect(Number.isNaN(dayIndex("2026-02-30"))).toBe(true);
    expect(Number.isNaN(dayIndex("2026-2-01"))).toBe(true);
    expect(shiftDate("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
  });
  it("includes every all-day date, including the final date", () => {
    const e = event({ allDay: true });
    expect(
      [21, 22, 23, 24, 25].map((d) => eventOccursOn(e, `2026-10-${d}`)),
    ).toEqual([false, true, true, true, false]);
    expect(eventDayRanges(e, "2026-10-24")).toEqual([{ start: 0, end: 1440 }]);
    expect(eventDurationMinutes(e)).toBe(4320);
  });
  it("clips continuous timed spans at both boundaries", () => {
    const e = event();
    expect(eventDayRanges(e, "2026-10-22")).toEqual([
      { start: 1200, end: 1440 },
    ]);
    expect(eventDayRanges(e, "2026-10-23")).toEqual([{ start: 0, end: 1440 }]);
    expect(eventDayRanges(e, "2026-10-24")).toEqual([{ start: 0, end: 540 }]);
    expect(eventDurationMinutes(e)).toBe(2220);
    expect(eventDayRanges(e, "2026-10-25")).toEqual([]);
  });
  it("midnight ends have no zero-length portion on the final day", () => {
    const e = event({ endDate: "2026-10-23", endTime: "00:00" });
    expect(eventOccursOn(e, "2026-10-23")).toBe(false);
    expect(eventDayRanges(e, "2026-10-22")).toEqual([
      { start: 1200, end: 1440 },
    ]);
  });
  it("preserves old same-day records and tolerates a stale reversed range", () => {
    const e = event({
      endDate: undefined,
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(eventDayRanges(e, "2026-10-22")).toEqual([{ start: 600, end: 660 }]);
    expect(eventOccursOn(e, "2026-10-23")).toBe(false);
    expect(eventSpanDays(event({ endDate: "2026-10-01" }))).toBe(0);
    expect(eventDayRanges({ ...e, endTime: "09:00" }, "2026-10-22")).toEqual([
      { start: 600, end: 630 },
    ]);
  });
});
describe("recurring spans", () => {
  it("selects the occurrence behind a morning or evening detail popover", () => {
    const e = event({ repeat: "daily", endDate: "2026-10-23" });
    expect(eventOccurrenceAt(e, "2026-10-23", 60)?.date).toBe("2026-10-22");
    expect(eventOccurrenceAt(e, "2026-10-23", 1260)?.date).toBe("2026-10-23");
    expect(eventOccurrenceAt(e, "2026-10-20", 60)).toBeUndefined();
  });
  it("weekly spans continue through days that are not starts", () => {
    const e = event({ repeat: "weekly" });
    expect(eventOccursOn(e, "2026-10-30")).toBe(true);
    expect(eventOccurrencesOn(e, "2026-10-30")).toMatchObject([
      { date: "2026-10-29", endDate: "2026-10-31", start: 0, end: 1440 },
    ]);
    expect(eventOccursOn(e, "2026-11-01")).toBe(false);
    expect(eventOccursOn(e, "2026-10-21")).toBe(false);
  });
  it("weekday occurrences can extend into the weekend", () => {
    expect(
      eventOccursOn(
        event({ repeat: "weekdays", endDate: "2026-10-23" }),
        "2026-10-24",
      ),
    ).toBe(true);
    expect(
      eventOccursOn(
        event({ repeat: "weekdays", endDate: "2026-10-23" }),
        "2026-10-25",
      ),
    ).toBe(false);
  });
  it("custom starts are respected; an empty rule has no occurrences", () => {
    expect(
      eventOccursOn(event({ repeat: "custom", repeatDays: [4] }), "2026-10-24"),
    ).toBe(true);
    expect(
      eventOccursOn(event({ repeat: "custom", repeatDays: [] }), "2026-10-22"),
    ).toBe(false);
  });
  it("keeps two separated overnight pieces with a daily rule", () => {
    expect(
      eventDayRanges(
        event({ repeat: "daily", endDate: "2026-10-23" }),
        "2026-10-23",
      ),
    ).toEqual([
      { start: 0, end: 540 },
      { start: 1200, end: 1440 },
    ]);
  });
  it("merges overlapping or adjacent occurrences", () => {
    expect(eventDayRanges(event({ repeat: "daily" }), "2026-10-24")).toEqual([
      { start: 0, end: 1440 },
    ]);
    expect(
      eventDayRanges(
        event({ repeat: "daily", endDate: "2026-10-23", endTime: "20:00" }),
        "2026-10-23",
      ),
    ).toEqual([{ start: 0, end: 1440 }]);
  });
  it("bounded evaluation matches exhaustive starts for long spans and every rule", () => {
    for (const repeat of ["daily", "weekdays", "weekly", "custom"]) {
      for (const days of [1, 2, 7, 8, 14, 35, 100]) {
        const e = event({
          date: "2026-01-01",
          endDate: shiftDate("2026-01-01", days),
          repeat,
          repeatDays: [0, 3, 6],
        });
        for (const target of [0, 1, 6, 13, 50, 110]) {
          const date = shiftDate(e.date, target);
          const expected = new Set<number>();
          for (let i = 0; i <= target; i++) {
            const start = shiftDate(e.date, i);
            const dow = new Date(start + "T12:00:00Z").getUTCDay();
            const scheduled =
              repeat === "daily" ||
              (repeat === "weekdays" && dow >= 1 && dow <= 5) ||
              (repeat === "weekly" && dow === 4) ||
              (repeat === "custom" && [0, 3, 6].includes(dow));
            if (!scheduled || i + days < target) continue;
            const lo = i === target ? 1200 : 0,
              hi = i + days === target ? 540 : 1440;
            for (let m = lo; m < hi; m++) expected.add(m);
          }
          const actual = new Set(
            eventDayRanges(e, date).flatMap((r) =>
              Array.from({ length: r.end - r.start }, (_, i) => r.start + i),
            ),
          );
          expect(actual, `${repeat}/${days}/${date}`).toEqual(expected);
        }
      }
    }
  });
});
