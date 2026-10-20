import { describe, expect, it } from "vitest";
import {
  blockHeight, clickRange, dayWindow, hasOverlap, hiddenHourLabels, initialScrollTop, layoutColumns,
  monthMatrix, pixelLanes, popoverPlacement, slotRange, topOf, visualEnd, weekDates,
} from "./layout";

const iv = (id: string, start: number, end: number) => ({ id, start, end });
const placed = (items: ReturnType<typeof layoutColumns<ReturnType<typeof iv>>>) =>
  Object.fromEntries(items.map((i) => [i.id, `${i.col}/${i.cols}`]));

describe("layoutColumns (overlaps side by side)", () => {
  it("leaves separate items full width", () => {
    expect(placed(layoutColumns([iv("a", 60, 120), iv("b", 120, 180)]))).toEqual({ a: "0/1", b: "0/1" });
  });

  it("puts two overlapping items in two columns", () => {
    expect(placed(layoutColumns([iv("a", 60, 180), iv("b", 120, 240)]))).toEqual({ a: "0/2", b: "1/2" });
  });

  it("reuses a freed column and shares the cluster's width", () => {
    // a 9-12 spans the cluster; b 9-10 and c 10-11 can share column 1.
    const r = layoutColumns([iv("a", 540, 720), iv("b", 540, 600), iv("c", 600, 660)]);
    expect(placed(r)).toEqual({ a: "0/2", b: "1/2", c: "1/2" });
  });

  it("chains: c doesn't overlap a but joins the cluster through b", () => {
    const r = layoutColumns([iv("a", 0, 60), iv("b", 30, 120), iv("c", 90, 150)]);
    expect(placed(r)).toEqual({ a: "0/2", b: "1/2", c: "0/2" });
  });

  it("handles a busy day with three at once", () => {
    const r = layoutColumns([iv("gp", 810, 960), iv("rev", 840, 930), iv("gym", 900, 960), iv("call", 960, 990)]);
    expect(placed(r)).toEqual({ gp: "0/3", rev: "1/3", gym: "2/3", call: "0/1" });
  });

  it("is stable for identical intervals and doesn't mutate the input", () => {
    const input = [iv("x", 60, 120), iv("y", 60, 120)];
    const copy = input.map((x) => ({ ...x }));
    expect(placed(layoutColumns(input))).toEqual({ x: "0/2", y: "1/2" });
    expect(input).toEqual(copy);
  });

  it("hasOverlap", () => {
    expect(hasOverlap([iv("a", 0, 60), iv("b", 60, 90)])).toBe(false);
    expect(hasOverlap([iv("a", 0, 61), iv("b", 60, 90)])).toBe(true);
  });
});

describe("minimum height", () => {
  it("never draws below the minimum", () => {
    expect(blockHeight(10, 48, 18)).toBe(18);
    expect(blockHeight(90, 48, 18)).toBe(72);
  });

  it("a short event claims the space it is drawn in, so the next one moves aside", () => {
    // 10:00-10:05 drawn 18px tall at 48px/h covers until 10:22:30.
    const end = visualEnd(600, 605, 48, 18);
    expect(end).toBeCloseTo(622.5);
    const r = layoutColumns([iv("short", 600, end), iv("next", 610, 660)]);
    expect(placed(r)).toEqual({ short: "0/2", next: "1/2" });
  });

  it("topOf measures from the window start", () => {
    expect(topOf(13 * 60 + 30, 11 * 60, 30)).toBe(75);
  });
});

describe("now marker vs hour labels", () => {
  const hours = Array.from({ length: 25 }, (_, h) => h);

  it("hides the hour label the now pill would collide with", () => {
    // 13:12 at 48px/h is 9.6px below 13:00.
    expect([...hiddenHourLabels(hours, 13 * 60 + 12, 48, 12)]).toEqual([13]);
    // 13:30 is 24px from both 13:00 and 14:00.
    expect([...hiddenHourLabels(hours, 13 * 60 + 30, 48, 12)]).toEqual([]);
  });

  it("hides exactly on the hour, and only that hour", () => {
    expect([...hiddenHourLabels(hours, 13 * 60, 30, 14)]).toEqual([13]);
  });

  it("uses the threshold strictly", () => {
    // 14px from 13:00 at 30px/h is 28 minutes.
    expect([...hiddenHourLabels(hours, 13 * 60 + 28, 30, 14)]).toEqual([]);
    expect([...hiddenHourLabels(hours, 13 * 60 + 27, 30, 14)]).toEqual([13]);
  });

  it("initial scroll is now minus two hours, never negative", () => {
    expect(initialScrollTop(13 * 60, 48)).toBe(11 * 48);
    expect(initialScrollTop(60, 48)).toBe(0);
  });
});

describe("dayWindow (now-2h to now+8h, clamped to the day)", () => {
  it.each([
    [13 * 60 + 12, 11, 21],
    [13 * 60, 11, 21],
    [8 * 60 + 5, 6, 16],
    [60, 0, 10],
    [0, 0, 10],
    [21 * 60 + 45, 14, 24],
    [23 * 60 + 59, 14, 24],
  ])("now %i min -> %i:00 to %i:00", (now, start, end) => {
    expect(dayWindow(now)).toEqual({ startHour: start, endHour: end });
  });
});

describe("pixelLanes (Day widget)", () => {
  it("puts a task chip next to an event it would cover", () => {
    const r = pixelLanes([{ id: "ev", top: 0, height: 45 }, { id: "task", top: 30, height: 28 }]);
    expect(r.map((x) => [x.id, x.col, x.cols])).toEqual([["ev", 0, 2], ["task", 1, 2]]);
  });

  it("keeps touching boxes full width", () => {
    const r = pixelLanes([{ id: "a", top: 0, height: 28 }, { id: "b", top: 28, height: 28 }]);
    expect(r.every((x) => x.cols === 1)).toBe(true);
  });
});

describe("monthMatrix / weekDates (week-start rotation)", () => {
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("October 2026 from Sunday: 5 rows, starts 27 Sep", () => {
    const m = monthMatrix(2026, 9, 0);
    expect(m).toHaveLength(5);
    expect(ymd(m[0][0])).toBe("2026-09-27");
    expect(ymd(m[4][6])).toBe("2026-10-31");
  });

  it("from Monday and Saturday the first column moves", () => {
    expect(ymd(monthMatrix(2026, 9, 1)[0][0])).toBe("2026-09-28");
    expect(ymd(monthMatrix(2026, 9, 6)[0][0])).toBe("2026-09-26");
    expect(monthMatrix(2026, 9, 6).every((row) => row[0].getDay() === 6)).toBe(true);
  });

  it("February 2026 from Sunday fits exactly 4 rows; August 2026 needs 6", () => {
    expect(monthMatrix(2026, 1, 0)).toHaveLength(4);
    expect(monthMatrix(2026, 7, 0)).toHaveLength(6);
  });

  it("every cell is one day after the previous, across DST changes", () => {
    for (const [y, mo] of [[2026, 2], [2026, 10]] as const) {
      const days = monthMatrix(y, mo, 1).flat();
      for (let i = 1; i < days.length; i++) {
        const prev = days[i - 1];
        const next = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1);
        expect(ymd(days[i])).toBe(ymd(next));
      }
    }
  });

  it("weekDates starts on the chosen day and contains the date", () => {
    const tue = new Date(2026, 9, 20);
    expect(weekDates(tue, 0).map(ymd)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(ymd(weekDates(tue, 1)[0])).toBe("2026-10-19");
    expect(ymd(weekDates(tue, 6)[0])).toBe("2026-10-17");
    // A Sunday with a Monday start belongs to the week before.
    expect(ymd(weekDates(new Date(2026, 9, 25), 1)[0])).toBe("2026-10-19");
  });
});

describe("popoverPlacement", () => {
  it("opens away from the nearest edge", () => {
    expect(popoverPlacement(0, 0, 5)).toEqual({ side: "right", anchor: "row-top" });
    expect(popoverPlacement(3, 1, 5)).toEqual({ side: "right", anchor: "row-top" });
    expect(popoverPlacement(4, 1, 5)).toEqual({ side: "left", anchor: "row-top" });
    expect(popoverPlacement(6, 2, 5)).toEqual({ side: "left", anchor: "row-top" });
  });

  it("pins to the bottom in the last two rows, so it grows upwards", () => {
    expect(popoverPlacement(2, 3, 5).anchor).toBe("bottom");
    expect(popoverPlacement(2, 4, 5).anchor).toBe("bottom");
    expect(popoverPlacement(2, 4, 6).anchor).toBe("bottom");
    expect(popoverPlacement(2, 3, 6).anchor).toBe("row-top");
  });
});

describe("slots and drag-create", () => {
  it("covers both ends in either drag direction", () => {
    expect(slotRange(28, 30)).toEqual({ start: 840, end: 930 });
    expect(slotRange(30, 28)).toEqual({ start: 840, end: 930 });
  });

  it("clamps to the day", () => {
    expect(slotRange(-3, 60)).toEqual({ start: 0, end: 1440 });
  });

  it("a plain click makes a one-hour block", () => {
    expect(clickRange(27)).toEqual({ start: 810, end: 870 });
    expect(clickRange(47)).toEqual({ start: 1410, end: 1440 });
  });
});
