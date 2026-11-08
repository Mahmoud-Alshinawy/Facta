/** Plain status lines for a shared group on Today and in the Progress widget. */
import { groupDeadlineText, viewerTimeZone } from "./groupDeadlines";
import { formatClock, type TimeFormat } from "./prefs";
import type { ProgressPhase, SharedProgress } from "./sharedProgress";
import { DAY, wall } from "./zoneTime";

export interface ProgressStatusLine {
  text: string;
  /** A local-time deadline line from groupDeadlineText. */
  deadline?: boolean;
}

/** Used when the app gave no reason, e.g. a widget file aged while Facta was closed. */
const PHASE_TEXT: Record<Exclude<ProgressPhase, "active">, string> = {
  waiting: "Starts once two people have joined.",
  paused: "Paused. It restarts at the start of a week with two people in.",
  archived: "Archived",
  unconfirmed: "Connect to the internet to update this group.",
};

const viewerDay = (instant: number, zone: string) =>
  new Date(wall(instant, zone)).toISOString().slice(0, 10);

/** "Sun 18 Oct" for a viewer-local calendar date. */
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(Date.parse(`${date}T12:00:00Z`))
    .replace(",", "");

/** "Last updated 12:00", or with the day when the read is from another day. */
export function lastUpdatedText(
  confirmedAt: number,
  {
    now,
    timeFormat,
    viewerZone = viewerTimeZone(),
  }: { now: number; timeFormat: TimeFormat; viewerZone?: string },
): string {
  const clock = formatClock(
      (wall(confirmedAt, viewerZone) % DAY) / 60_000,
      timeFormat,
    ),
    day = viewerDay(confirmedAt, viewerZone);
  return `Last updated ${day === viewerDay(now, viewerZone) ? clock : `${dayLabel(day)} ${clock}`}`;
}

/**
 * Nothing while all is normal: no round dates, zone or confirmation time.
 * One plain line only when there is something to know or do.
 */
export function progressStatusLines(
  group: SharedProgress,
  {
    now,
    timeFormat,
    viewerZone = viewerTimeZone(),
  }: { now: number; timeFormat: TimeFormat; viewerZone?: string },
): ProgressStatusLine[] {
  const lines: ProgressStatusLine[] = [];
  if (group.phase === "active") {
    if (group.round?.active)
      for (const text of groupDeadlineText({
        today: group.today,
        timeZone: group.timeZone,
        roundEnd: group.round.end,
        now,
        timeFormat,
        viewerZone,
      }))
        lines.push({ text, deadline: true });
    if (group.reason) lines.push({ text: group.reason });
  } else lines.push({ text: group.reason ?? PHASE_TEXT[group.phase] });
  if (!group.rows.length) lines.push({ text: "No scores yet." });
  if (group.pending) lines.push({ text: "Not synced yet" });
  if (group.stale && group.confirmedAt !== null)
    lines.push({
      text: lastUpdatedText(group.confirmedAt, { now, timeFormat, viewerZone }),
    });
  return lines;
}
