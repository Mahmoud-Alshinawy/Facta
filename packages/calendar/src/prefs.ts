// Calendar settings shared by every view: Month, Week, the sidebar calendar
// and the widgets. One source, so they can't disagree.

/** 0 = Sunday, 1 = Monday, 6 = Saturday (JS getDay numbering). */
export type WeekStart = 0 | 1 | 6;
export type TimeFormat = "24h" | "12h";
/** Which two days are tinted as the weekend. */
export type Weekend = "sat-sun" | "fri-sat";

export interface CalendarPrefs {
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  weekend: Weekend;
}

export const DEFAULT_PREFS: CalendarPrefs = { weekStart: 0, timeFormat: "24h", weekend: "sat-sun" };

export const WEEK_START_OPTIONS: readonly { value: WeekStart; label: string }[] = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 6, label: "Saturday" },
];

/** Reads prefs from anything (storage, widgets.json), falling back field by field. */
export function parsePrefs(raw: unknown): CalendarPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const ws = o.weekStart;
  return {
    weekStart: ws === 0 || ws === 1 || ws === 6 ? ws : DEFAULT_PREFS.weekStart,
    timeFormat: o.timeFormat === "12h" || o.timeFormat === "24h" ? o.timeFormat : DEFAULT_PREFS.timeFormat,
    weekend: o.weekend === "fri-sat" || o.weekend === "sat-sun" ? o.weekend : DEFAULT_PREFS.weekend,
  };
}

/** Day numbers (getDay) of the weekend. */
export function weekendDays(prefs: Pick<CalendarPrefs, "weekend">): readonly number[] {
  return prefs.weekend === "fri-sat" ? [5, 6] : [6, 0];
}

export function isWeekend(dow: number, prefs: Pick<CalendarPrefs, "weekend">): boolean {
  return weekendDays(prefs).includes(dow);
}

/** The seven getDay numbers in display order, starting at weekStart. */
export function weekdayOrder(weekStart: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
}

/** Local midnight of the first day of the week containing `date`. */
export function startOfWeekFor(date: Date, weekStart: WeekStart): Date {
  const back = (date.getDay() - weekStart + 7) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);
}

// ---------------------------------------------------------------------------
// Times. Minutes since midnight in, text out.
// ---------------------------------------------------------------------------

/**
 * "full":  24h "09:05" · 12h "9:05 AM"
 * "hour":  24h "09:00" · 12h "9 AM"     (hour-grid labels)
 * "short": 24h "09:05" · 12h "9:05a", "9a" (chips where space is tight)
 */
export type ClockStyle = "full" | "hour" | "short";

const pad = (n: number) => String(n).padStart(2, "0");

export function formatClock(minutes: number, format: TimeFormat, style: ClockStyle = "full"): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (format === "24h") return `${pad(h)}:${pad(m)}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const am = h < 12;
  if (style === "hour") return `${h12} ${am ? "AM" : "PM"}`;
  if (style === "short") return `${h12}${m ? `:${pad(m)}` : ""}${am ? "a" : "p"}`;
  return `${h12}:${pad(m)} ${am ? "AM" : "PM"}`;
}

export function formatRange(start: number, end: number, format: TimeFormat, style: ClockStyle = "full"): string {
  // 24:00 reads as the end of the day, not 00:00.
  const endText = end >= 1440 && format === "24h" ? "24:00" : formatClock(end, format, style);
  return `${formatClock(start, format, style)}–${endText}`;
}

/** "HH:mm" (or "H:mm", "HH:mm:ss") to minutes; null if it isn't a time. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** Minutes to "HH:mm" for storage, whatever the display format. */
export function toClockValue(minutes: number): string {
  const total = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
