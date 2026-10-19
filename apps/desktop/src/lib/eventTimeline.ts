// Today's events as a timeline with a "now" marker. Pure: takes the time.

import type { CalendarEvent } from "@/types/planner";

export type EventStatus = "ended" | "now" | "upcoming";

export interface TimelineEvent {
  event: CalendarEvent;
  status: EventStatus;
  /** Length in minutes (0 for all-day). */
  minutes: number;
  /** Minutes until it starts (upcoming) or until it ends (now). */
  minutesAway: number;
}

export interface Timeline {
  allDay: CalendarEvent[];
  timed: TimelineEvent[];
  /** Where the "now" marker goes among `timed`: before the item at this index. */
  nowIndex: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function buildTimeline(events: readonly CalendarEvent[], now: Date = new Date()): Timeline {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const allDay = events.filter((e) => e.allDay);
  const timed = events
    .filter((e) => !e.allDay)
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime))
    .map((event): TimelineEvent => {
      const start = toMinutes(event.startTime);
      const end = Math.max(toMinutes(event.endTime), start);
      const status: EventStatus = start > nowMin ? "upcoming" : nowMin < end ? "now" : "ended";
      return {
        event,
        status,
        minutes: end - start,
        minutesAway: status === "upcoming" ? start - nowMin : status === "now" ? end - nowMin : 0,
      };
    });
  // The marker sits after everything that has started.
  const firstUpcoming = timed.findIndex((t) => t.status === "upcoming");
  return { allDay, timed, nowIndex: firstUpcoming === -1 ? timed.length : firstUpcoming };
}

/** "45m", "1h", "1h 30m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
