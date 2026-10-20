// The Day widget's timeline: which hours show, where each item sits, and
// where the "now" marker goes. Pure: positions come from the data, the time
// and the available height.

import { dayWindow, pixelLanes } from "./layout";

export interface DayTask {
  id: string;
  /** Minutes since midnight. */
  start: number;
}

export interface DayEvent {
  id: string;
  start: number;
  end: number;
}

export interface DayTimelineOptions {
  /** Height of the timeline area in px; ten hours fit in it. */
  height: number;
  /** Fixed height of a task chip. */
  taskHeight?: number;
  /** Minimum height of an event block. */
  minEventHeight?: number;
  /** Hide an hour label when the now pill is closer than this. */
  labelGap?: number;
  beforeHours?: number;
  afterHours?: number;
}

export interface TimelineHour {
  hour: number;
  top: number;
  hidden: boolean;
}

export interface TimelineItem {
  id: string;
  kind: "task" | "event";
  start: number;
  end: number;
  top: number;
  height: number;
  col: number;
  cols: number;
}

export interface DayTimeline {
  startHour: number;
  endHour: number;
  pxPerHour: number;
  hours: TimelineHour[];
  nowTop: number;
  items: TimelineItem[];
}

export function buildDayTimeline(
  tasks: readonly DayTask[],
  events: readonly DayEvent[],
  nowMinutes: number,
  opts: DayTimelineOptions,
): DayTimeline {
  const taskH = opts.taskHeight ?? 28;
  const minEvH = opts.minEventHeight ?? 28;
  const gap = opts.labelGap ?? 14;
  const win = dayWindow(nowMinutes, opts.beforeHours ?? 2, opts.afterHours ?? 8);
  const span = win.endHour - win.startHour;
  const pxPerHour = opts.height / span;
  const winStart = win.startHour * 60;
  const y = (min: number) => ((min - winStart) / 60) * pxPerHour;
  const nowTop = y(nowMinutes);

  const hours: TimelineHour[] = [];
  for (let h = win.startHour; h <= win.endHour; h++) {
    const top = y(h * 60);
    hours.push({ hour: h, top, hidden: Math.abs(top - nowTop) < gap });
  }

  // Tasks and events are both top-aligned to their start. A task is a fixed
  // chip; an event is at least the minimum height.
  const raw = [
    ...tasks.map((t) => ({ id: t.id, kind: "task" as const, start: t.start, end: t.start, top: y(t.start), height: taskH })),
    ...events.map((e) => {
      const end = Math.max(e.start, e.end);
      // An event already running when the window opens is cut at the top
      // edge, so its title stays on screen.
      const top = Math.max(0, y(e.start));
      return {
        id: e.id, kind: "event" as const, start: e.start, end,
        top, height: Math.max(minEvH, y(end) - top),
      };
    }),
  ].filter((it) => (it.kind === "task" ? it.top >= 0 : it.end > winStart) && it.top < opts.height);

  // Anything that overlaps on screen goes side by side, never on top.
  const items = pixelLanes(raw).map((it) => ({ ...it }));
  return { startHour: win.startHour, endHour: win.endHour, pxPerHour, hours, nowTop, items };
}
