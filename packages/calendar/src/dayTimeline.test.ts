import { describe, expect, it } from "vitest";
import { buildDayTimeline } from "./dayTimeline";

const at = (h: number, m = 0) => h * 60 + m;
const H300 = { height: 300 }; // 10 hours at 30px/h

describe("buildDayTimeline", () => {
  it("shows now-2h to now+8h, computed from the height", () => {
    const t = buildDayTimeline([], [], at(13, 12), H300);
    expect([t.startHour, t.endHour, t.pxPerHour]).toEqual([11, 21, 30]);
    expect(t.hours.map((h) => h.hour)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(t.nowTop).toBeCloseTo(66);
  });

  it("clamps the window to the day", () => {
    expect(buildDayTimeline([], [], at(0, 30), H300)).toMatchObject({ startHour: 0, endHour: 10 });
    expect(buildDayTimeline([], [], at(23, 50), H300)).toMatchObject({ startHour: 14, endHour: 24 });
  });

  it("scales with the available height", () => {
    const t = buildDayTimeline([{ id: "t", start: at(14) }], [], at(13, 12), { height: 400 });
    expect(t.pxPerHour).toBe(40);
    expect(t.items[0].top).toBe(120); // 14:00 is 3h after 11:00
  });

  it("top-aligns tasks and events to their start; tasks are fixed, events have a minimum", () => {
    const t = buildDayTimeline(
      [{ id: "task", start: at(14) }],
      [{ id: "long", start: at(16), end: at(17, 30) }, { id: "short", start: at(19), end: at(19, 10) }],
      at(13, 12),
      H300,
    );
    const by = Object.fromEntries(t.items.map((i) => [i.id, i]));
    expect([by.task.top, by.task.height]).toEqual([90, 28]);
    expect([by.long.top, by.long.height]).toEqual([150, 45]);
    expect([by.short.top, by.short.height]).toEqual([240, 28]);
  });

  it("puts overlapping items side by side", () => {
    const t = buildDayTimeline(
      [{ id: "task", start: at(14, 15) }],
      [{ id: "ev", start: at(14), end: at(15) }, { id: "later", start: at(16), end: at(17) }],
      at(13, 12),
      H300,
    );
    const by = Object.fromEntries(t.items.map((i) => [i.id, `${i.col}/${i.cols}`]));
    expect(by).toEqual({ ev: "0/2", task: "1/2", later: "0/1" });
  });

  it("a task chip that runs into the next one moves aside even though their times don't overlap", () => {
    // 28px is 56 minutes at 30px/h: tasks at 14:00 and 14:30 collide on screen.
    const t = buildDayTimeline([{ id: "a", start: at(14) }, { id: "b", start: at(14, 30) }], [], at(13, 12), H300);
    expect(t.items.map((i) => `${i.id}:${i.col}/${i.cols}`)).toEqual(["a:0/2", "b:1/2"]);
  });

  it("drops items outside the window and keeps ones that cross its edge", () => {
    const t = buildDayTimeline(
      [{ id: "early", start: at(8) }],
      [{ id: "crossing", start: at(10), end: at(12) }, { id: "late", start: at(22), end: at(23) }],
      at(13, 12),
      H300,
    );
    expect(t.items.map((i) => i.id)).toEqual(["crossing"]);
    // Cut at the window's top edge so its title stays visible.
    expect(t.items[0].top).toBe(0);
    expect(t.items[0].height).toBe(30);
  });

  it("keeps the minimum height for an event that has almost ended when the window opens", () => {
    const t = buildDayTimeline([], [{ id: "tail", start: at(9), end: at(11, 10) }], at(13, 12), H300);
    expect(t.items[0]).toMatchObject({ top: 0, height: 28 });
  });

  it("hides the hour label within 14px of now", () => {
    const hidden = (now: number) => buildDayTimeline([], [], now, H300).hours.filter((h) => h.hidden).map((h) => h.hour);
    expect(hidden(at(13, 12))).toEqual([13]); // 6px from 13:00
    expect(hidden(at(13, 0))).toEqual([13]);
    expect(hidden(at(13, 30))).toEqual([]); // 15px from both
    expect(hidden(at(13, 28))).toEqual([]); // exactly 14px: shown
    expect(hidden(at(13, 27))).toEqual([13]);
  });
});
