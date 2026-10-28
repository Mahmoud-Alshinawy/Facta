// Group midnight mirrors PostgreSQL's conversion; it lives in the shared
// package so the widgets resolve the same day boundary. The direct subpath
// keeps this file loadable by Node in the acceptance fixture scripts.
import { zoneMidnight as midnight } from "@facta/calendar/groupDeadlines";

const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "0001-01-01" &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function validInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    validDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}
function dateMs(date: string): number {
  if (!validDate(date)) throw new Error("Invalid group date");
  return Date.parse(`${date}T00:00:00Z`);
}
export function addDays(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error("Invalid date offset");
  const result = new Date(dateMs(date) + days * DAY).toISOString().slice(0, 10);
  if (!validDate(result))
    throw new Error("Group date is outside supported range");
  return result;
}
function parts(instant: string | number, zone: string): Record<string, string> {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(zone, formatter);
  }
  return Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  );
}
export function groupDate(instant: string | number, zone: string): string {
  const p = parts(instant, zone);
  return `${p.year.padStart(4, "0")}-${p.month}-${p.day}`;
}
export function nextRoundDate(
  instant: string | number,
  zone: string,
  weekday: number,
): string {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    throw new Error("Invalid round weekday");
  const today = groupDate(instant, zone);
  const dow = new Date(dateMs(today)).getUTCDay();
  return addDays(today, ((weekday - dow + 6) % 7) + 1);
}
export function roundStart(anchor: string, date: string): string {
  return addDays(
    anchor,
    7 * Math.floor((dateMs(date) - dateMs(anchor)) / DAY / 7),
  );
}
export function eligibleRound(
  anchor: string,
  joinedAt: string,
  zone: string,
): string {
  const next = addDays(roundStart(anchor, groupDate(joinedAt, zone)), 7);
  return next < anchor ? anchor : next;
}

export function roundInterval(
  start: string,
  zone: string,
): { start: string; end: string } {
  return {
    start: new Date(midnight(start, zone)).toISOString(),
    end: new Date(midnight(addDays(start, 7), zone)).toISOString(),
  };
}
export function canReplay(
  capturedAt: string,
  now: string | number,
  date: string,
  zone: string,
): boolean {
  if (!validInstant(capturedAt) || !validDate(date)) return false;
  const current = new Date(now).getTime();
  return (
    Date.parse(capturedAt) <= current &&
    groupDate(capturedAt, zone) === date &&
    date >= addDays(groupDate(now, zone), -7) &&
    date <= groupDate(now, zone)
  );
}
export function defaultHistoryRange(now: number): {
  from: string;
  until: string;
} {
  const today = groupDate(now, "UTC");
  return { from: addDays(today, -56), until: addDays(today, 7) };
}
