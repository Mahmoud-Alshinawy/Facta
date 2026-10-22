// Layout for things that cross days (all-day bands in Week and Month) and
// for moving and resizing timed blocks.

/** Something that covers whole days, first to last inclusive ("yyyy-MM-dd"). */
export interface DaySpan {
  id: string;
  first: string;
  last: string;
}

export interface SpanSegment<T extends DaySpan = DaySpan> {
  item: T;
  /** Column of the first and last visible day (0-based, inclusive). */
  from: number;
  to: number;
  /** The span carries on before the first or after the last visible day. */
  contL: boolean;
  contR: boolean;
  lane: number;
}

/**
 * Cuts spans to a row of days (a week, or a Month row) and stacks them in
 * lanes so none overlap. Longer spans that start earlier take the top lanes.
 */
export function spanLanes<T extends DaySpan>(items: readonly T[], days: readonly string[]): { segments: SpanSegment<T>[]; lanes: number } {
  if (!days.length) return { segments: [], lanes: 0 };
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const segs: SpanSegment<T>[] = [];
  for (const item of items) {
    const last = item.last < item.first ? item.first : item.last;
    if (last < firstDay || item.first > lastDay) continue;
    const from = item.first <= firstDay ? 0 : days.indexOf(item.first);
    const to = last >= lastDay ? days.length - 1 : days.indexOf(last);
    if (from < 0 || to < 0) continue;
    segs.push({ item, from, to, contL: item.first < firstDay, contR: last > lastDay, lane: 0 });
  }
  segs.sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from) || a.item.id.localeCompare(b.item.id));
  const laneEnd: number[] = [];
  for (const s of segs) {
    let l = 0;
    while (laneEnd[l] !== undefined && laneEnd[l] >= s.from) l++;
    laneEnd[l] = s.to;
    s.lane = l;
  }
  return { segments: segs, lanes: laneEnd.length };
}

// ---- moving and resizing ----------------------------------------------------

export const SNAP_MINUTES = 15;
export const DAY_MINUTES = 24 * 60;

export function snap(minutes: number, step = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

/** Minutes from a y offset in a column that is `pxPerHour` tall per hour. */
export function minutesAt(y: number, pxPerHour: number): number {
  return Math.max(0, Math.min(DAY_MINUTES, (y / pxPerHour) * 60));
}

/**
 * A block moved by a pointer: keeps its length, snaps its start to 15
 * minutes and stays inside the day.
 */
export function moveBlock(start: number, end: number, deltaMinutes: number, step = SNAP_MINUTES): { start: number; end: number } {
  const len = Math.max(0, end - start);
  const s = Math.max(0, Math.min(DAY_MINUTES - len, snap(start + deltaMinutes, step)));
  return { start: s, end: s + len };
}

/** A block with one edge dragged: snapped, never shorter than one step. */
export function resizeBlock(start: number, end: number, edge: "start" | "end", at: number, step = SNAP_MINUTES): { start: number; end: number } {
  const t = snap(Math.max(0, Math.min(DAY_MINUTES, at)), step);
  if (edge === "end") return { start, end: Math.max(start + step, Math.min(DAY_MINUTES, t)) };
  return { start: Math.min(end - step, Math.max(0, t)), end };
}

// ---- conflicts --------------------------------------------------------------

export interface Timed {
  id: string;
  start: number;
  end: number;
}

/** Ids of events that overlap another, and the first overlapping stretch. */
export function conflicts(items: readonly Timed[]): { ids: Set<string>; first: { start: number; end: number } | null } {
  const ids = new Set<string>();
  let first: { start: number; end: number } | null = null;
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (b.start >= a.end) break;
      const lo = Math.max(a.start, b.start);
      const hi = Math.min(a.end, b.end);
      if (lo < hi) {
        ids.add(a.id);
        ids.add(b.id);
        if (!first || lo < first.start) first = { start: lo, end: hi };
      }
    }
  }
  return { ids, first };
}

// ---- Month cells ------------------------------------------------------------

/**
 * How many event chips a Month cell shows, and the "+N more" count. Three
 * lines fit; with two or more lanes of bars above, two do. When it doesn't
 * all fit, the last line becomes "+N more".
 */
export function monthChips(total: number, lanes: number): { shown: number; more: number } {
  const cap = lanes >= 2 ? 2 : 3;
  if (total <= cap) return { shown: total, more: 0 };
  return { shown: cap - 1, more: total - (cap - 1) };
}
