// Layout maths for the Month grid, the Week grid and the Day widget. Pure:
// every position comes from data, nothing is a hand-placed constant.

import type { WeekStart } from "./prefs";
import { startOfWeekFor } from "./prefs";

// ---------------------------------------------------------------------------
// Overlapping items side by side
// ---------------------------------------------------------------------------

export interface Interval {
  start: number;
  end: number;
}

export type Columned<T> = T & { col: number; cols: number };

/**
 * Lays out intervals so overlapping ones sit in columns. Items that overlap
 * (directly or through a chain) form a cluster; each takes the first column
 * that is free at its start, and everything in the cluster shares the
 * cluster's column count. `end` should already include any minimum length,
 * so a short item that is drawn taller still claims the space it covers.
 * Returns new objects in start order; the input is not changed.
 */
export function layoutColumns<T extends Interval>(items: readonly T[]): Columned<T>[] {
  const sorted = items
    .map((it, index) => ({ it, index }))
    .sort((a, b) => a.it.start - b.it.start || b.it.end - a.it.end || a.index - b.index)
    .map(({ it }) => ({ ...it, col: 0, cols: 1 }));

  let cluster: Columned<T>[] = [];
  let clusterEnd = -Infinity;
  let columnEnds: number[] = [];
  const flush = () => {
    for (const it of cluster) it.cols = columnEnds.length;
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };
  for (const it of sorted) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= it.start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(it.end);
    } else {
      columnEnds[col] = it.end;
    }
    it.col = col;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return sorted;
}

/** True when any two intervals overlap (touching end-to-start does not count). */
export function hasOverlap(items: readonly Interval[]): boolean {
  return layoutColumns(items).some((it) => it.cols > 1);
}

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

/** Pixel height of a block, never below the minimum. */
export function blockHeight(minutes: number, pxPerHour: number, minPx: number): number {
  return Math.max(minPx, (minutes / 60) * pxPerHour);
}

/** The end (in minutes) a block really occupies once it is drawn at its minimum height. */
export function visualEnd(start: number, end: number, pxPerHour: number, minPx: number): number {
  return Math.max(end, start + (minPx / pxPerHour) * 60);
}

/** Top offset in px of a time, relative to a window that starts at windowStart. */
export function topOf(minutes: number, windowStart: number, pxPerHour: number): number {
  return ((minutes - windowStart) / 60) * pxPerHour;
}

// ---------------------------------------------------------------------------
// The "now" marker and hour labels
// ---------------------------------------------------------------------------

/**
 * Hours (0–24) whose label should be hidden because the now label sits
 * within `thresholdPx` of it.
 */
export function hiddenHourLabels(
  hours: readonly number[],
  nowMinutes: number,
  pxPerHour: number,
  thresholdPx: number,
): Set<number> {
  const nowPx = (nowMinutes / 60) * pxPerHour;
  return new Set(hours.filter((h) => Math.abs(h * pxPerHour - nowPx) < thresholdPx));
}

/** Initial scroll for a 24-hour grid: `leadMinutes` before now, never negative. */
export function initialScrollTop(nowMinutes: number, pxPerHour: number, leadMinutes = 120): number {
  return Math.max(0, ((nowMinutes - leadMinutes) / 60) * pxPerHour);
}

// ---------------------------------------------------------------------------
// Day widget window
// ---------------------------------------------------------------------------

export interface DayWindow {
  /** Whole hours, inclusive start, exclusive end, within 0–24. */
  startHour: number;
  endHour: number;
}

/**
 * The widget shows from 2 hours before now to 8 hours after, snapped to
 * whole hours and clamped to the day: early in the morning it starts at
 * 00:00, late at night it ends at 24:00, always `before + after` hours long.
 */
export function dayWindow(nowMinutes: number, beforeHours = 2, afterHours = 8): DayWindow {
  const span = beforeHours + afterHours;
  const start = Math.max(0, Math.min(24 - span, Math.floor(nowMinutes / 60) - beforeHours));
  return { startHour: start, endHour: start + span };
}

// ---------------------------------------------------------------------------
// Lanes by pixel (Day widget: fixed-height tasks next to events)
// ---------------------------------------------------------------------------

export interface PxBox {
  top: number;
  height: number;
}

/** Side-by-side lanes for boxes that overlap on screen. */
export function pixelLanes<T extends PxBox>(items: readonly T[]): Columned<T>[] {
  const laid = layoutColumns(items.map((it, i) => ({ start: it.top, end: it.top + it.height, i })));
  return laid.map((l) => ({ ...items[l.i], col: l.col, cols: l.cols }));
}

// ---------------------------------------------------------------------------
// Month grid and week columns
// ---------------------------------------------------------------------------

/** Rows of 7 dates covering the month, starting on weekStart. 4–6 rows. */
export function monthMatrix(year: number, month: number, weekStart: WeekStart): Date[][] {
  const first = startOfWeekFor(new Date(year, month, 1), weekStart);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = Math.round((new Date(year, month, 1).getTime() - first.getTime()) / 86_400_000);
  const rows = Math.ceil((lead + daysInMonth) / 7);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + r * 7 + c)),
  );
}

/** The seven dates of the week containing `date`. */
export function weekDates(date: Date, weekStart: WeekStart): Date[] {
  const first = startOfWeekFor(date, weekStart);
  return Array.from({ length: 7 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
}

// ---------------------------------------------------------------------------
// Month popover placement
// ---------------------------------------------------------------------------

export interface PopoverPlacement {
  /** Open to the right of the cell, or to its left. */
  side: "right" | "left";
  /** Pin to the cell's row top, or to the grid's bottom edge. */
  anchor: "row-top" | "bottom";
}

/**
 * Opens away from the nearest edge: right of cells in the left half, left of
 * cells in the right half. In the bottom two rows it pins to the bottom of
 * the grid so it grows upwards; otherwise it starts at the cell's row and
 * never covers the rows above.
 */
export function popoverPlacement(col: number, row: number, rows: number): PopoverPlacement {
  return { side: col <= 3 ? "right" : "left", anchor: row >= rows - 2 ? "bottom" : "row-top" };
}

// ---------------------------------------------------------------------------
// Week grid slots (half hours) and drag-create
// ---------------------------------------------------------------------------

export const SLOTS_PER_DAY = 48;

export function clampSlot(slot: number): number {
  return Math.max(0, Math.min(SLOTS_PER_DAY - 1, slot));
}

/** The time range covered by slots a..b (either order, inclusive). */
export function slotRange(a: number, b: number): { start: number; end: number } {
  const lo = clampSlot(Math.min(a, b));
  const hi = clampSlot(Math.max(a, b));
  return { start: lo * 30, end: (hi + 1) * 30 };
}

/** A click (no drag) creates a one-hour event starting on the hour or half hour clicked. */
export function clickRange(slot: number): { start: number; end: number } {
  const s = clampSlot(slot);
  return { start: s * 30, end: Math.min(1440, s * 30 + 60) };
}
