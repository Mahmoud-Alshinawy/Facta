/** A shared group's day boundary, shown in the viewer's own clock. */
const DAY = 86_400_000;
const wallFormatters = new Map<string, Intl.DateTimeFormat>();

function dateMs(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 10) !== date
  )
    throw new Error("Invalid group date");
  return ms;
}
const nextDate = (date: string, days = 1) =>
  new Date(dateMs(date) + days * DAY).toISOString().slice(0, 10);

/** Wall-clock reading of an instant in a zone, encoded as a UTC millisecond. */
function wall(instant: number, zone: string): number {
  let formatter = wallFormatters.get(zone);
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
    wallFormatters.set(zone, formatter);
  }
  const p = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((x) => [x.type, x.value]),
  );
  return Date.parse(
    `${p.year.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
  );
}

// Match PostgreSQL's local timestamp conversion: the later (standard-time)
// occurrence at a fold, and the forward-shifted instant at a midnight gap.
export function zoneMidnight(date: string, zone: string): number {
  const target = dateMs(date);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = target + hours * 3_600_000;
    offsets.add(wall(sample, zone) - sample);
  }
  const candidates = [...offsets].map((offset) => target - offset);
  const exact = candidates.filter((t) => wall(t, zone) === target);
  if (exact.length) return Math.max(...exact);
  const forward = candidates
    .filter((t) => wall(t, zone) > target)
    .sort((a, b) => wall(a, zone) - wall(b, zone));
  if (!forward.length) throw new Error("Could not resolve group midnight");
  return forward[0];
}

const viewerDate = (instant: number, zone: string) =>
  new Date(wall(instant, zone)).toISOString().slice(0, 10);
const clock = (instant: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(instant)
    .replace(/\s*([AP])M$/, (_, p: string) => `${p.toLowerCase()}m`);
const weekday = (instant: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }).format(
    instant,
  );
const groupDay = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(dateMs(date))
    .replace(",", "");

export const viewerTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/**
 * When today's check-in closes and the round ends, in the viewer's clock.
 * Both deadlines are the group's own local midnights. Empty when the viewer's
 * clock reads that midnight anyway, so same-zone members see no extra lines.
 */
export function groupDeadlineText({
  today,
  timeZone,
  roundEnd,
  now,
  viewerZone = viewerTimeZone(),
}: {
  /** The group's local date. */
  today: string;
  timeZone: string;
  /** Exclusive end date of the active round, or null without one. */
  roundEnd: string | null;
  now: number;
  viewerZone?: string;
}): string[] {
  const close = zoneMidnight(nextDate(today), timeZone);
  const end = roundEnd === null ? null : zoneMidnight(roundEnd, timeZone);
  const readsAsMidnight = (instant: number, date: string) =>
    wall(instant, viewerZone) === dateMs(date);
  if (
    readsAsMidnight(close, nextDate(today)) &&
    (end === null || readsAsMidnight(end, roundEnd!))
  )
    return [];
  const viewerToday = viewerDate(now, viewerZone),
    closeDay = viewerDate(close, viewerZone);
  const when =
    closeDay === viewerToday
      ? "at"
      : closeDay === nextDate(viewerToday)
        ? "tomorrow at"
        : `${weekday(close, viewerZone)} at`;
  const subject =
    today === viewerToday
      ? "Today's check-in"
      : `Check-in for ${groupDay(today)}`;
  const lines = [
    `${subject} closes ${when} ${clock(close, viewerZone)} your time (midnight ${timeZone})`,
  ];
  if (end !== null)
    lines.push(
      `Round ends ${weekday(end, viewerZone)} ${clock(end, viewerZone)} your time`,
    );
  return lines;
}
