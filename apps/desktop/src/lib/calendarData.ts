// What the calendar views show for a day, from the goal and event records.
// Pure: the views pass in the records and the day.

import { eventDayRanges, eventInAllDayBand, parseClock, shiftDate } from "@facta/calendar";
import type { CalendarEvent, Goal } from "@/types/planner";
import { goalsForDay, isCompletedToday, toggleGoalCompletion } from "@/lib/goalDates";

/** Noon of a "yyyy-MM-dd" day: safe for date-fns "today" checks across DST. */
export function noonOf(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function keyOf(d: Date): string {
  const p = (n: number) => (n < 10 ? "0" : "") + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface DayGoal {
  goal: Goal;
  done: boolean;
  /** Minutes since midnight, or null for an untimed goal. */
  at: number | null;
}

export function goalsOn(goals: readonly Goal[], key: string): DayGoal[] {
  const noon = noonOf(key);
  return goalsForDay(goals, noon).map((goal) => ({ goal, done: isCompletedToday(goal, noon), at: parseClock(goal.time ?? "") }));
}

/** The goal after ticking it on a given day (repeating goals keep per-day ticks). */
export function toggledOn(goal: Goal, key: string): Partial<Goal> {
  const next = toggleGoalCompletion(goal, noonOf(key));
  return { completed: next.completed, completedDates: next.completedDates };
}

export interface TimedEvent {
  /** Stable layout key; the record id is always event.id. */
  id: string;
  event: CalendarEvent;
  start: number;
  end: number;
}

/** End of an event in minutes; "23:59" means the end of the day. */
export function eventMinutes(e: Pick<CalendarEvent, "startTime" | "endTime">): { start: number; end: number } {
  const start = parseClock(e.startTime) ?? 0;
  let end = e.endTime === "23:59" ? 24 * 60 : parseClock(e.endTime) ?? start + 60;
  if (end <= start) end = Math.min(24 * 60, start + 30);
  return { start, end };
}

export function splitDay(events: readonly CalendarEvent[], day?: string, spanningBand = false): { allDay: CalendarEvent[]; timed: TimedEvent[] } {
  const allDay: CalendarEvent[] = [];
  const timed: TimedEvent[] = [];
  for (const e of events) {
    if (e.allDay || (spanningBand && eventInAllDayBand(e))) allDay.push(e);
    else {
      const ranges = day ? eventDayRanges(e, day) : [eventMinutes(e)];
      ranges.forEach(range => timed.push({id:ranges.length === 1 ? e.id : `${e.id}:${range.start}`,event:e,...range}));
    }
  }
  timed.sort((a, b) => a.start - b.start || b.end - a.end);
  return { allDay, timed };
}

/** "HH:mm" for a minute count; the end of the day is written "23:59". */
export function clockValue(min: number): string {
  if (min >= 24 * 60) return "23:59";
  const p = (n: number) => (n < 10 ? "0" : "") + n;
  return `${p(Math.floor(min / 60))}:${p(min % 60)}`;
}

/** "1h 30m", "45m", "2h". */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}

/** ISO week number of a day. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

export interface AllDaySpan {
  id: string;
  first: string;
  last: string;
  event: CalendarEvent;
}

/**
 * All-day events across a row of days, one span per run of consecutive days
 * an event covers (a repeating all-day event becomes one bar). Looks one day
 * past each end, so spanLanes can tell when a bar carries on.
 */
export function allDaySpans(keys: readonly string[], eventsOn: (key: string) => readonly CalendarEvent[]): AllDaySpan[] {
  if (!keys.length) return [];
  const before = shiftDate(keys[0], -1);
  const after = shiftDate(keys[keys.length - 1], 1);
  const days = [before, ...keys, after];
  const runs = new Map<string, AllDaySpan>();
  const out: AllDaySpan[] = [];
  days.forEach((key, i) => {
    for (const e of eventsOn(key)) {
      if (!eventInAllDayBand(e)) continue;
      const open = runs.get(e.id);
      if (open && open.last === days[i - 1]) {
        open.last = key;
      } else {
        const span = { id: `${e.id}:${key}`, first: key, last: key, event: e };
        runs.set(e.id, span);
        out.push(span);
      }
    }
  });
  // Runs that only touch the look-ahead days aren't visible.
  return out.filter((s) => !(s.last === before || s.first === after));
}
