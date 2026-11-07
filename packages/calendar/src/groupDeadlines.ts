/** A shared group's day boundary, shown in the viewer's own clock. */
import { formatClock, type TimeFormat } from "./prefs";
import { DAY, dateMs, wall, zoneMidnight } from "./zoneTime";

export { zoneMidnight } from "./zoneTime";

const nextDate = (date: string, days = 1) =>
  new Date(dateMs(date) + days * DAY).toISOString().slice(0, 10);
const viewerDate = (instant: number, zone: string) =>
  new Date(wall(instant, zone)).toISOString().slice(0, 10);
/** The viewer's wall time, in the app's 12h/24h setting. */
const clock = (instant: number, zone: string, format: TimeFormat) =>
  formatClock((wall(instant, zone) % DAY) / 60_000, format);
const weekday = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(dateMs(date));
/** "Wed 4 Nov" for a calendar date. */
const dayLabel = (date: string) =>
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
  timeFormat,
  viewerZone = viewerTimeZone(),
}: {
  /** The group's local date. */
  today: string;
  timeZone: string;
  /** Exclusive end date of the active round, or null without one. */
  roundEnd: string | null;
  now: number;
  timeFormat: TimeFormat;
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
        : `${weekday(closeDay)} at`;
  const subject =
    today === viewerToday
      ? "Today's check-in"
      : `Check-in for ${dayLabel(today)}`;
  const lines = [
    `${subject} closes ${when} ${clock(close, viewerZone, timeFormat)} your time (midnight ${timeZone})`,
  ];
  // With the date, a round ending exactly a week away is not ambiguous.
  if (end !== null)
    lines.push(
      `Round ends ${dayLabel(viewerDate(end, viewerZone))} at ${clock(end, viewerZone, timeFormat)} your time`,
    );
  return lines;
}
