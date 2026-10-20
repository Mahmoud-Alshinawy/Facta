import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS, formatClock, formatRange, isWeekend, parseClock, parsePrefs, startOfWeekFor,
  toClockValue, weekdayOrder, weekendDays,
} from "./prefs";

describe("parsePrefs", () => {
  it("defaults to Sunday, 24h and a Sat-Sun weekend", () => {
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toEqual({ weekStart: 0, timeFormat: "24h", weekend: "sat-sun" });
  });

  it("keeps valid fields and replaces invalid ones one by one", () => {
    expect(parsePrefs({ weekStart: 1, timeFormat: "12h", weekend: "fri-sat" })).toEqual({ weekStart: 1, timeFormat: "12h", weekend: "fri-sat" });
    expect(parsePrefs({ weekStart: 3, timeFormat: "12h", weekend: "sun-mon" })).toEqual({ weekStart: 0, timeFormat: "12h", weekend: "sat-sun" });
    expect(parsePrefs("junk")).toEqual(DEFAULT_PREFS);
  });
});

describe("week start and weekend", () => {
  it("rotates the weekday order", () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });

  it("weekend is Sat/Sun by default and can be Fri/Sat", () => {
    expect(weekendDays({ weekend: "sat-sun" })).toEqual([6, 0]);
    expect(isWeekend(5, { weekend: "fri-sat" })).toBe(true);
    expect(isWeekend(0, { weekend: "fri-sat" })).toBe(false);
  });

  it("startOfWeekFor lands on midnight of the right day, including across DST", () => {
    const s = startOfWeekFor(new Date(2026, 10, 3, 15, 30), 0); // Tue 3 Nov, after NY falls back on 1 Nov
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours()]).toEqual([2026, 10, 1, 0]);
    const m = startOfWeekFor(new Date(2026, 2, 10, 1, 0), 1); // after NY springs forward on 8 Mar
    expect([m.getMonth(), m.getDate(), m.getHours()]).toEqual([2, 9, 0]);
  });
});

describe("time formatting (one setting for every view)", () => {
  it("24h", () => {
    expect(formatClock(9 * 60 + 5, "24h")).toBe("09:05");
    expect(formatClock(13 * 60, "24h", "hour")).toBe("13:00");
    expect(formatClock(0, "24h", "short")).toBe("00:00");
  });

  it("12h", () => {
    expect(formatClock(9 * 60 + 5, "12h")).toBe("9:05 AM");
    expect(formatClock(0, "12h", "hour")).toBe("12 AM");
    expect(formatClock(12 * 60, "12h", "hour")).toBe("12 PM");
    expect(formatClock(13 * 60 + 12, "12h", "short")).toBe("1:12p");
    expect(formatClock(16 * 60, "12h", "short")).toBe("4p");
  });

  it("ranges, including an end at midnight", () => {
    expect(formatRange(600, 690, "24h")).toBe("10:00–11:30");
    expect(formatRange(1410, 1440, "24h")).toBe("23:30–24:00");
    expect(formatRange(600, 690, "12h", "short")).toBe("10a–11:30a");
  });

  it("parses and writes stored times", () => {
    expect(parseClock("09:30")).toBe(570);
    expect(parseClock("9:30")).toBe(570);
    expect(parseClock("09:30:00")).toBe(570);
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(toClockValue(570)).toBe("09:30");
    expect(toClockValue(1440)).toBe("23:59");
  });
});
