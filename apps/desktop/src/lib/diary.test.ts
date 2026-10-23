import { describe, expect, it } from "vitest";
import {
  diaryDays,
  diaryMonth,
  diaryMonthCells,
  diaryOnThisDay,
  diaryStreak,
  diaryTimeline,
  lineLength,
  searchDiary,
} from "./diary";
import { noonOf } from "./calendarData";
import type { DiaryEntry } from "@/types/planner";

const entry = (date: string, patch: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id: date,
  date,
  oneLine: "A quiet walk",
  mood: 3,
  body: null,
  tags: [],
  createdAt: `${date}T12:00:00.000Z`,
  ...patch,
});

describe("diary streaks", () => {
  it("keeps yesterday's run alive until today ends", () => {
    const days = [
      entry("2026-10-20"),
      entry("2026-10-21"),
      entry("2026-10-22"),
    ];
    expect(diaryStreak(days, "2026-10-23")).toMatchObject({
      current: 3,
      best: 3,
      paused: false,
    });
    expect(diaryStreak(days, "2026-10-24")).toMatchObject({
      current: 0,
      best: 3,
      lastRun: 3,
      paused: true,
    });
  });
  it("crosses years and leap days without elapsed-hour arithmetic", () => {
    expect(
      diaryStreak([entry("2025-12-31"), entry("2026-01-01")], "2026-01-01")
        .current,
    ).toBe(2);
    expect(
      diaryStreak(
        [entry("2024-02-28"), entry("2024-02-29"), entry("2024-03-01")],
        "2024-03-01",
      ).current,
    ).toBe(3);
    expect(
      diaryStreak(
        [entry("2026-03-07"), entry("2026-03-08"), entry("2026-03-09")],
        "2026-03-09",
      ).current,
    ).toBe(3);
  });
  it("derives best across gaps; future entries cannot extend runs", () => {
    const days = [1, 2, 3, 6, 7, 9].map((d) => entry(`2026-10-0${d}`));
    expect(diaryStreak(days, "2026-10-07")).toMatchObject({
      current: 2,
      best: 3,
    });
    expect(diaryStreak([], "2026-10-07")).toMatchObject({
      current: 0,
      best: 0,
      paused: false,
    });
  });
});
describe("diary written counts and history", () => {
  it("counts unique dates and uses deterministic newer-wins history", () => {
    const a = entry("2026-10-01", { id: "a", mood: 1 });
    const b = entry("2026-10-01", {
      id: "b",
      mood: 5,
      updatedAt: "2026-10-02T00:00:00Z",
    });
    expect(diaryDays([b, a])).toEqual([b]);
    expect(diaryDays([a, b])).toEqual([b]);
    expect(
      diaryMonth([a, b], noonOf("2026-10-01"), "2026-10-23"),
    ).toMatchObject({ written: 1, possible: 23, average: 5 });
  });
  it("uses elapsed/current, full/past and zero/future month denominators", () => {
    expect(
      diaryMonth([entry("2026-10-24")], noonOf("2026-10-01"), "2026-10-23"),
    ).toMatchObject({ written: 0, possible: 23, average: null });
    expect(diaryMonth([], noonOf("2024-02-01"), "2026-10-23").possible).toBe(
      29,
    );
    expect(diaryMonth([], noonOf("2026-11-01"), "2026-10-23").possible).toBe(0);
  });
  it("ignores invalid date strings", () => {
    expect(
      diaryDays([entry("2026-02-30"), entry("yesterday"), entry("2026-2-01")]),
    ).toEqual([]);
  });
  it("compares timestamps as instants and breaks equal-time ties consistently", () => {
    const a = entry("2026-10-01", {
      id: "a",
      updatedAt: "2026-10-02T03:00:00+03:00",
    });
    const b = entry("2026-10-01", {
      id: "b",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
    expect(diaryDays([a, b])).toEqual([b]);
    expect(diaryDays([b, a])).toEqual([b]);
  });
  it("recalls the same day in previous months as drawn, newest first", () => {
    const days = [
      "2026-10-17",
      "2026-09-17",
      "2026-08-17",
      "2025-10-17",
      "2026-09-16",
    ].map((d) => entry(d));
    expect(diaryOnThisDay(days, "2026-10-17").map((e) => e.date)).toEqual([
      "2026-09-17",
      "2026-08-17",
      "2025-10-17",
    ]);
  });
  it("limits gap rows to the selected month and real history", () => {
    expect(
      diaryTimeline(
        [entry("2026-10-21")],
        noonOf("2026-10-01"),
        "2026-10-23",
      ).map((r) => [r.date, !!r.entry]),
    ).toEqual([
      ["2026-10-23", false],
      ["2026-10-22", false],
      ["2026-10-21", true],
    ]);
    expect(diaryTimeline([], noonOf("2026-10-01"), "2026-10-23")).toEqual([]);
  });
});
describe("diary search and calendar", () => {
  it("searches line, longer text and tags; OR moods, AND tags", () => {
    const days = [
      entry("2026-10-01", {
        mood: 2,
        tags: ["walk", "home"],
        body: "Saw a KINGFISHER",
      }),
      entry("2026-10-02", { mood: 4, tags: ["walk"] }),
    ];
    expect(searchDiary(days, "kingfisher", [2, 4], ["walk", "home"])).toEqual([
      days[0],
    ]);
    expect(searchDiary(days, "HOME", [], [])).toEqual([days[0]]);
    expect(searchDiary(days, "quiet", [4], [])).toEqual([days[1]]);
    expect(searchDiary(days, "", [], ["missing"])).toEqual([]);
  });
  it.each([0, 1, 6] as const)(
    "aligns month cells to week-start %s",
    (start) => {
      const weeks = diaryMonthCells(noonOf("2026-10-01"), start);
      expect(noonOf(weeks[0][0]).getDay()).toBe(start);
      expect(weeks.flat().filter((d) => d.startsWith("2026-10"))).toHaveLength(
        31,
      );
      expect(weeks.every((w) => w.length === 7)).toBe(true);
    },
  );
  it("includes year-crossing cells and all leap-month days", () => {
    const cells = diaryMonthCells(noonOf("2024-02-01"), 1).flat();
    expect(cells.filter((d) => d.startsWith("2024-02"))).toHaveLength(29);
    expect(diaryMonthCells(noonOf("2026-01-01"), 0)[0][0]).toBe("2025-12-28");
  });
  it("counts Unicode characters like PostgreSQL char_length", () => {
    expect(lineLength("a🙂é")).toBe(3);
  });
});
