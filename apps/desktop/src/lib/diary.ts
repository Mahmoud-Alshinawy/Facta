import {
  addDays,
  differenceInCalendarDays,
  getDaysInMonth,
  startOfMonth,
} from "date-fns";
import type { WeekStart } from "@facta/calendar";
import type { DiaryEntry } from "@/types/planner";
import { keyOf, noonOf } from "./calendarData";

export const MOODS = [
  { value: 1, label: "Rough" },
  { value: 2, label: "Low" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Great" },
] as const;
export const DIARY_PROMPTS = [
  "What stood out today?",
  "What made today different?",
  "What are you glad you noticed?",
  "What would you like to remember?",
  "What felt good, or felt difficult?",
];
export const lineLength = (text: string) => Array.from(text).length;
export const dayUnit = (count: number) => (count === 1 ? "day" : "days");
export const diaryDayState = (
  date: string,
  firstDate: string | undefined,
  written: boolean,
) =>
  written ? "written" : !firstDate || date < firstDate ? "neutral" : "missed";

function validDate(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && keyOf(noonOf(key)) === key;
}

/** Natural-key safety for aggregates, including legacy/offline snapshots. */
export function diaryDays(entries: readonly DiaryEntry[]): DiaryEntry[] {
  const days = new Map<string, DiaryEntry>();
  for (const entry of entries) {
    if (!validDate(entry.date)) continue;
    const previous = days.get(entry.date);
    const time = (e: DiaryEntry) => Date.parse(e.updatedAt ?? e.createdAt) || 0;
    if (
      !previous ||
      time(entry) > time(previous) ||
      (time(entry) === time(previous) && entry.id > previous.id)
    )
      days.set(entry.date, entry);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Today can still be written: a run ending yesterday remains current. */
export function diaryStreak(entries: readonly DiaryEntry[], today: string) {
  const days = diaryDays(entries)
    .filter((e) => e.date <= today)
    .map((e) => e.date)
    .reverse();
  let best = 0,
    run = 0;
  days.forEach((day, i) => {
    run =
      i && differenceInCalendarDays(noonOf(day), noonOf(days[i - 1])) === 1
        ? run + 1
        : 1;
    best = Math.max(best, run);
  });
  const latest = days.at(-1);
  const paused =
    !!latest && differenceInCalendarDays(noonOf(today), noonOf(latest)) > 1;
  return { current: paused ? 0 : run, best, lastRun: run, paused, latest };
}

/** Elapsed days this month, all days in a past month, zero in a future month. */
export function diaryMonth(
  entries: readonly DiaryEntry[],
  month: Date,
  today: string,
) {
  const prefix = keyOf(startOfMonth(month)).slice(0, 7);
  const nowMonth = today.slice(0, 7);
  const possible =
    prefix < nowMonth
      ? getDaysInMonth(month)
      : prefix === nowMonth
        ? Number(today.slice(8))
        : 0;
  const written = diaryDays(entries).filter(
    (e) => e.date.startsWith(prefix) && e.date <= today,
  );
  return {
    entries: written,
    written: written.length,
    possible,
    average: written.length
      ? written.reduce((sum, e) => sum + e.mood, 0) / written.length
      : null,
  };
}

/** The board recalls the same day number in earlier months (e.g. 17 Sep/17 Aug). */
export function diaryOnThisDay(
  entries: readonly DiaryEntry[],
  today: string,
  limit = 3,
) {
  return diaryDays(entries)
    .filter((e) => e.date < today && e.date.slice(8) === today.slice(8))
    .slice(0, limit);
}

export function searchDiary(
  entries: readonly DiaryEntry[],
  query: string,
  moods: readonly number[],
  tags: readonly string[],
) {
  const q = query.trim().toLocaleLowerCase();
  return diaryDays(entries).filter(
    (e) =>
      (!q ||
        [e.oneLine, e.body ?? "", ...e.tags].some((v) =>
          v.toLocaleLowerCase().includes(q),
        )) &&
      (!moods.length || moods.includes(e.mood)) &&
      tags.every((tag) => e.tags.includes(tag)),
  );
}

export function diaryMonthCells(month: Date, weekStart: WeekStart): string[][] {
  const start = startOfMonth(month);
  const offset = (start.getDay() - weekStart + 7) % 7;
  const count = Math.ceil((offset + getDaysInMonth(month)) / 7) * 7;
  return Array.from({ length: count / 7 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) =>
      keyOf(addDays(start, row * 7 + col - offset)),
    ),
  );
}

/** Bounded to one month; gaps before the first-ever entry are not missed days. */
export function diaryTimeline(
  entries: readonly DiaryEntry[],
  month: Date,
  today: string,
) {
  const days = diaryDays(entries);
  const byDate = new Map(days.map((e) => [e.date, e]));
  const first = days.at(-1)?.date;
  return Array.from({ length: getDaysInMonth(month) }, (_, i) =>
    keyOf(addDays(startOfMonth(month), i)),
  )
    .filter((date) => first && date >= first && date <= today)
    .reverse()
    .map((date) => ({ date, entry: byDate.get(date) }));
}
