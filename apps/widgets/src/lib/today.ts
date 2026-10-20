// Today's goals and events from widgets.json. The file holds the app's own
// records (camelCase); "today" is always the local calendar day.

import { parseClock, parsePrefs, type CalendarPrefs } from "@facta/calendar";

export interface WidgetGoal {
  id: string;
  title: string;
  date: string;
  time?: string;
  completed: boolean;
  completedDates?: string[];
  repeat?: string;
  repeatDays?: number[];
}

export interface WidgetEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  color: string;
  allDay?: boolean;
  repeat?: string;
  repeatDays?: number[];
}

export function localDay(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dowOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};

function repeatsOn(repeat: string | undefined, startDate: string, repeatDays: number[] | undefined, day: string): boolean {
  const r = repeat ?? "none";
  if (r === "none") return startDate === day;
  if (day < startDate) return false;
  const dow = dowOf(day);
  if (r === "daily") return true;
  if (r === "weekdays") return dow >= 1 && dow <= 5;
  if (r === "weekly") return dowOf(startDate) === dow;
  if (r === "custom") return (repeatDays ?? []).includes(dow);
  return false;
}

export function goalsToday(goals: WidgetGoal[], now: Date = new Date()): WidgetGoal[] {
  const day = localDay(now);
  return goals.filter((g) => repeatsOn(g.repeat, g.date, g.repeatDays, day));
}

export function isDoneToday(g: WidgetGoal, now: Date = new Date()): boolean {
  if ((g.repeat ?? "none") === "none") return !!g.completed;
  return (g.completedDates ?? []).includes(localDay(now));
}

export function eventsToday(events: WidgetEvent[], now: Date = new Date()): WidgetEvent[] {
  const day = localDay(now);
  return events.filter((e) => repeatsOn(e.repeat, e.date, e.repeatDays, day));
}

export function prefsFrom(config: unknown): CalendarPrefs {
  const c = config && typeof config === "object" ? (config as { prefs?: unknown }) : {};
  return parsePrefs(c.prefs);
}

export { parseClock };
