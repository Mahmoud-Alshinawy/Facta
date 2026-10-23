import { parseClock } from "./prefs";

/** Structural shape shared by desktop records and widgets.json. */
export interface ScheduledEvent {
  date: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  repeat?: string;
  repeatDays?: number[];
}
const DAY = 86_400_000;
/** Calendar-day arithmetic, independent of the host timezone and DST. */
export function dayIndex(key: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
  const value = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(value) &&
    new Date(value).toISOString().slice(0, 10) === key
    ? value / DAY
    : NaN;
}
export const shiftDate = (key: string, days: number): string =>
  new Date((dayIndex(key) + days) * DAY).toISOString().slice(0, 10);
export const eventSpanDays = (
  event: Pick<ScheduledEvent, "date" | "endDate">,
): number =>
  Math.max(0, dayIndex(event.endDate ?? event.date) - dayIndex(event.date)) ||
  0;
export function eventDurationMinutes(event: ScheduledEvent): number {
  if (event.allDay) return (eventSpanDays(event) + 1) * 1440;
  return (
    eventSpanDays(event) * 1440 +
    (event.endTime === "23:59" ? 1440 : (parseClock(event.endTime) ?? 0)) -
    (parseClock(event.startTime) ?? 0)
  );
}

function startsOn(event: ScheduledEvent, index: number): boolean {
  if (index < dayIndex(event.date)) return false;
  const dow = (((index + 4) % 7) + 7) % 7;
  switch (event.repeat ?? "none") {
    case "none":
      return index === dayIndex(event.date);
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekly":
      return dow === (((dayIndex(event.date) + 4) % 7) + 7) % 7;
    case "custom":
      return (event.repeatDays ?? []).includes(dow);
    default:
      return false;
  }
}

export interface EventOccurrence {
  date: string;
  endDate: string;
  /** This occurrence's portion of the requested day, in minutes. */
  start: number;
  end: number;
}
export function eventOccurrencesOn(
  event: ScheduledEvent,
  day: string,
): EventOccurrence[] {
  const index = dayIndex(day),
    first = dayIndex(event.date),
    length = eventSpanDays(event);
  if (!Number.isFinite(index) || !Number.isFinite(first) || index < first)
    return [];
  const start = parseClock(event.startTime) ?? 0;
  let end =
    event.endTime === "23:59"
      ? 1440
      : (parseClock(event.endTime) ?? start + 30);
  if (!length && end <= start) end = Math.min(1440, start + 30); // legacy invalid times
  const repeating = (event.repeat ?? "none") !== "none";
  // Rules repeat every seven days. The latest two starts per weekday cover
  // every possible intersection/overlap, even for spans lasting many years.
  const candidates = repeating
    ? Array.from({ length: Math.min(length, 13) + 1 }, (_, i) => index - i)
    : [first];
  return candidates
    .filter(
      (candidate) =>
        startsOn(event, candidate) &&
        candidate <= index &&
        candidate + length >= index,
    )
    .map((candidate) => ({
      date: new Date(candidate * DAY).toISOString().slice(0, 10),
      endDate: new Date((candidate + length) * DAY).toISOString().slice(0, 10),
      start: event.allDay || candidate < index ? 0 : start,
      end: event.allDay || candidate + length > index ? 1440 : end,
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Select the scheduled occurrence covering the selected day/time. */
export function eventOccurrenceAt(
  event: ScheduledEvent,
  day: string,
  minute?: number,
): EventOccurrence | undefined {
  const occurrences = eventOccurrencesOn(event, day);
  const matching =
    minute === undefined
      ? occurrences
      : occurrences.filter((o) => o.start <= minute && o.end > minute);
  return matching[matching.length - 1] ?? occurrences[occurrences.length - 1];
}

/** Union overlapping occurrences, without losing separated overnight pieces. */
export function eventDayRanges(
  event: ScheduledEvent,
  day: string,
): { start: number; end: number }[] {
  const ranges = eventOccurrencesOn(event, day).sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end)
      last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}
export const eventOccursOn = (event: ScheduledEvent, day: string): boolean =>
  eventDayRanges(event, day).length > 0;
