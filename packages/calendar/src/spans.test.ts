import { describe, expect, it } from "vitest";
import { conflicts, minutesAt, monthChips, moveBlock, resizeBlock, snap, spanLanes } from "./spans";

const WEEK = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"];

describe("spanLanes", () => {
  it("cuts spans to the visible days and marks the edges that carry on", () => {
    const { segments, lanes } = spanLanes([{ id: "x", first: "2026-10-09", last: "2026-10-12" }], WEEK);
    expect(lanes).toBe(1);
    expect(segments[0]).toMatchObject({ from: 0, to: 1, contL: true, contR: false, lane: 0 });
    const r = spanLanes([{ id: "y", first: "2026-10-16", last: "2026-10-20" }], WEEK);
    expect(r.segments[0]).toMatchObject({ from: 5, to: 6, contL: false, contR: true });
  });

  it("stacks overlapping spans and reuses free lanes", () => {
    const { segments, lanes } = spanLanes([
      { id: "ex", first: "2026-10-12", last: "2026-10-15" },
      { id: "hk", first: "2026-10-14", last: "2026-10-16" },
      { id: "dl", first: "2026-10-15", last: "2026-10-15" },
      { id: "sat", first: "2026-10-17", last: "2026-10-17" },
    ], WEEK);
    const lane = Object.fromEntries(segments.map((s) => [s.item.id, s.lane]));
    expect(lane).toEqual({ ex: 0, hk: 1, dl: 2, sat: 0 });
    expect(lanes).toBe(3);
  });

  it("drops spans outside the row and treats a reversed span as one day", () => {
    expect(spanLanes([{ id: "a", first: "2026-10-01", last: "2026-10-02" }], WEEK).segments).toEqual([]);
    const r = spanLanes([{ id: "b", first: "2026-10-13", last: "2026-10-01" }], WEEK);
    expect(r.segments[0]).toMatchObject({ from: 2, to: 2 });
    expect(spanLanes([], []).lanes).toBe(0);
  });
});

describe("moving and resizing", () => {
  it("snaps to 15 minutes", () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(52)).toBe(45);
    expect(minutesAt(52 * 2.5, 52)).toBe(150);
    expect(minutesAt(-10, 52)).toBe(0);
    expect(minutesAt(99999, 52)).toBe(1440);
  });

  it("moves keep the length and stay inside the day", () => {
    expect(moveBlock(900, 1020, 61)).toEqual({ start: 960, end: 1080 });
    expect(moveBlock(900, 1020, -2000)).toEqual({ start: 0, end: 120 });
    expect(moveBlock(900, 1020, 2000)).toEqual({ start: 1320, end: 1440 });
  });

  it("resizes snap, never invert and keep at least 15 minutes", () => {
    expect(resizeBlock(900, 960, "end", 1003)).toEqual({ start: 900, end: 1005 });
    expect(resizeBlock(900, 960, "end", 880)).toEqual({ start: 900, end: 915 });
    expect(resizeBlock(900, 960, "start", 852)).toEqual({ start: 855, end: 960 });
    expect(resizeBlock(900, 960, "start", 990)).toEqual({ start: 945, end: 960 });
    expect(resizeBlock(900, 960, "end", 2000)).toEqual({ start: 900, end: 1440 });
  });
});

describe("conflicts", () => {
  it("finds overlapping events and the first overlap", () => {
    const r = conflicts([
      { id: "lab", start: 780, end: 900 },
      { id: "fair", start: 750, end: 840 },
      { id: "gym", start: 1080, end: 1140 },
    ]);
    expect([...r.ids].sort()).toEqual(["fair", "lab"]);
    expect(r.first).toEqual({ start: 780, end: 840 });
  });

  it("touching events don't conflict", () => {
    expect(conflicts([{ id: "a", start: 600, end: 660 }, { id: "b", start: 660, end: 720 }]).ids.size).toBe(0);
  });
});

describe("monthChips", () => {
  it("three lines fit, two under two lanes of bars, the last becomes +N more", () => {
    expect(monthChips(3, 0)).toEqual({ shown: 3, more: 0 });
    expect(monthChips(4, 1)).toEqual({ shown: 2, more: 2 });
    expect(monthChips(2, 2)).toEqual({ shown: 2, more: 0 });
    expect(monthChips(5, 2)).toEqual({ shown: 1, more: 4 });
  });
});
