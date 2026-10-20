import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { addDays, format, getISOWeek, isSameDay } from "date-fns";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  blockHeight, formatClock, formatRange, hasOverlap, hiddenHourLabels, initialScrollTop, isWeekend,
  layoutColumns, parseClock, slotRange, clickRange, clampSlot, toClockValue, visualEnd, weekDates,
} from "@facta/calendar";
import { useEvents, type CalendarEvent } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";
import { eventColorVar } from "@/lib/eventColors";
import { goalsForDay, isCompletedToday, toggleGoalCompletion } from "@/lib/goalDates";
import type { Goal } from "@/types/planner";

interface WeekViewProps {
  selectedDate: Date;
  events: CalendarEvent[];
  /** A day header was activated (opens that day). */
  onSelectDate: (date: Date) => void;
  /** New event; endTime is set when a range was dragged or extended with Shift+arrows. */
  onNewEvent: (date: string, startTime: string, endTime?: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  /** Change the week shown (toolbar, PageUp/PageDown, T). */
  onNavigate?: (date: Date) => void;
  onNewGoal?: (date: string) => void;
}

const H = 48; // px per hour
const GUTTER = 56;
const HEAD_H = 56;
const MIN_BLOCK = 18;
const GOAL_MIN = 30;
const NOW_LABEL_GAP = 12;
const DOW_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

type Item =
  | { kind: "event"; key: string; event: CalendarEvent; start: number; end: number; vEnd: number; past: boolean }
  | { kind: "goal"; key: string; goal: Goal; start: number; end: number; vEnd: number; past: boolean; done: boolean };

interface Selection {
  day: number;
  a: number;
  b: number;
  /** Dragging with the mouse (vs. extended from the keyboard). */
  mouse: boolean;
}

export default function WeekView({
  selectedDate, events, onSelectDate, onNewEvent, onEditEvent, onNavigate, onNewGoal,
}: WeekViewProps) {
  const prefs = usePrefs();
  const now = useNow();
  const nowMin = minutesOf(now);
  const { getEventsForDate } = useEvents();
  const { goals, updateGoal } = useGoals();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ day: number; slot: number } | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [live, setLive] = useState("");

  const days = useMemo(() => weekDates(selectedDate, prefs.weekStart), [selectedDate, prefs.weekStart]);
  const todayIdx = days.findIndex((d) => isSameDay(d, now));
  const navigate = useCallback((d: Date) => (onNavigate ?? (() => {}))(d), [onNavigate]);

  // Per-day data: all-day events, timed items laid out in columns, overlap flag.
  const cols = useMemo(() => days.map((date, i) => {
    const key = ymd(date);
    const dayEvents = getEventsForDate(key);
    const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const isPastDay = todayIdx >= 0 ? i < todayIdx : date < now;
    const isToday = i === todayIdx;
    const timed = dayEvents.filter((e) => !e.allDay).map((e): Item => {
      const start = parseClock(e.startTime) ?? 0;
      const end = Math.max(start, parseClock(e.endTime) ?? start);
      return {
        kind: "event", key: `${e.id}:${key}`, event: e, start, end,
        vEnd: visualEnd(start, end, H, MIN_BLOCK), past: isPastDay || (isToday && end <= nowMin),
      };
    });
    const timedGoals = goalsForDay(goals, noon).flatMap((g): Item[] => {
      const start = parseClock(g.time);
      if (start === null) return [];
      return [{
        kind: "goal", key: `goal:${g.id}:${key}`, goal: g, start, end: start + GOAL_MIN, vEnd: start + GOAL_MIN,
        past: isPastDay || (isToday && start < nowMin), done: isCompletedToday(g, noon),
      }];
    });
    const laid = layoutColumns([...timed, ...timedGoals].map((it) => ({ ...it, end: it.vEnd, realEnd: it.end })));
    return {
      date, key, noon, isToday,
      allDay: dayEvents.filter((e) => e.allDay),
      items: laid,
      overlap: hasOverlap(timed.map((t) => ({ start: t.start, end: t.end }))),
    };
  // `events` is listed so edits re-render (getEventsForDate reads the same data).
  }), [days, getEventsForDate, goals, events, todayIdx, nowMin, now]);

  const allDayLanes = Math.max(0, ...cols.map((c) => c.allDay.length));
  const anyItems = cols.some((c) => c.items.length > 0 || c.allDay.length > 0);

  // ---- initial scroll: now minus 2 h, applied once the grid has real height ----
  const scrolled = useRef(false);
  const scrollToNow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return false;
    if (el.clientHeight === 0 || el.scrollHeight <= el.clientHeight) return false;
    el.scrollTop = initialScrollTop(minutesOf(new Date()), H);
    return true;
  }, []);
  useLayoutEffect(() => {
    if (scrolled.current) return;
    if (scrollToNow()) { scrolled.current = true; return; }
    // Not laid out yet (e.g. hidden or still sizing): wait for a real size.
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!scrolled.current && scrollToNow()) { scrolled.current = true; ro.disconnect(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollToNow]);

  const ensureVisible = (slot: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const sticky = HEAD_H + 34 + allDayLanes * 22 + 8;
    const y = (slot * H) / 2;
    if (y < el.scrollTop) el.scrollTop = Math.max(0, y - 8);
    else if (y + H / 2 + sticky > el.scrollTop + el.clientHeight) el.scrollTop = y + H / 2 + sticky - el.clientHeight + 8;
  };

  // ---- mouse drag-create ----
  const slotAt = (e: ReactMouseEvent<HTMLElement> | MouseEvent, col: HTMLElement) => {
    const r = col.getBoundingClientRect();
    return clampSlot(Math.floor((e.clientY - r.top) / (H / 2)));
  };
  const dragCol = useRef<HTMLElement | null>(null);
  const moved = useRef(false);

  const commit = useCallback((s: Selection, plainClick: boolean) => {
    const range = plainClick ? clickRange(s.a) : slotRange(s.a, s.b);
    setSel(null);
    onNewEvent(ymd(days[s.day]), toClockValue(range.start), range.end >= 1440 ? "23:59" : toClockValue(range.end));
  }, [days, onNewEvent]);

  useEffect(() => {
    if (!sel?.mouse) return;
    const onMove = (e: MouseEvent) => {
      if (!dragCol.current) return;
      const slot = slotAt(e, dragCol.current);
      if (slot !== sel.b) { moved.current = true; setSel((s) => (s ? { ...s, b: slot } : s)); }
    };
    const onUp = () => { const s = sel; dragCol.current = null; if (s) commit(s, !moved.current && s.a === s.b); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); dragCol.current = null; setSel(null); } };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [sel, commit]);

  const onColDown = (e: ReactMouseEvent<HTMLDivElement>, day: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const slot = slotAt(e, e.currentTarget);
    dragCol.current = e.currentTarget;
    moved.current = false;
    setCursor({ day, slot });
    setSel({ day, a: slot, b: slot, mouse: true });
  };

  // ---- keyboard ----
  const toggleGoal = (g: Goal, noon: Date) => {
    const next = toggleGoalCompletion(g, noon);
    updateGoal(g.id, { completed: next.completed, completedDates: next.completedDates });
  };

  const cur = cursor ?? { day: Math.max(0, todayIdx), slot: clampSlot(Math.floor(nowMin / 30)) };
  const describe = (day: number, slot: number) => `${format(days[day], "EEEE d MMMM")}, ${formatClock(slot * 30, prefs.timeFormat)}`;

  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const done = () => { e.preventDefault(); e.stopPropagation(); };
    let { day, slot } = cur;
    const kbSel = sel && !sel.mouse ? sel : null;
    if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      done();
      const base = kbSel ?? { day, a: slot, b: slot, mouse: false };
      const b = clampSlot(base.b + (e.key === "ArrowDown" ? 1 : -1));
      const next = { ...base, b };
      setSel(next);
      setCursor({ day: base.day, slot: b });
      ensureVisible(b);
      const r = slotRange(next.a, next.b);
      setLive(`New event ${formatRange(r.start, r.end, prefs.timeFormat)}. Enter creates it, Escape cancels.`);
      return;
    }
    switch (e.key) {
      case "ArrowLeft": day = Math.max(0, day - 1); break;
      case "ArrowRight": day = Math.min(6, day + 1); break;
      case "ArrowUp": slot = clampSlot(slot - 1); break;
      case "ArrowDown": slot = clampSlot(slot + 1); break;
      case "PageUp": done(); setSel(null); navigate(addDays(days[0], -7)); return;
      case "PageDown": done(); setSel(null); navigate(addDays(days[0], 7)); return;
      case "t":
      case "T": done(); setSel(null); navigate(now); setCursor(null); requestAnimationFrame(() => scrollToNow()); return;
      case "Escape": if (sel) { done(); setSel(null); setLive("Cancelled."); } return;
      case "Enter": {
        done();
        if (kbSel) { commit(kbSel, false); return; }
        const c = cols[day];
        const t0 = slot * 30;
        const goalHit = c.items.find((it) => it.kind === "goal" && it.start >= t0 && it.start < t0 + 30);
        if (goalHit && goalHit.kind === "goal") {
          toggleGoal(goalHit.goal, c.noon);
          setLive(`${goalHit.done ? "Not done" : "Done"}: ${goalHit.goal.title}`);
          return;
        }
        const evHit = c.items.find((it) => it.kind === "event" && it.start <= t0 && it.realEnd > t0);
        if (evHit && evHit.kind === "event") { onEditEvent(evHit.event); return; }
        commit({ day, a: slot, b: slot, mouse: false }, true);
        return;
      }
      default: return;
    }
    done();
    setSel(null);
    setCursor({ day, slot });
    ensureVisible(slot);
    setLive(describe(day, slot));
  };

  // ---- rendering helpers ----
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const hiddenHours = todayIdx >= 0 ? hiddenHourLabels(hours, nowMin, H, NOW_LABEL_GAP) : new Set<number>();
  const colW = `((100% - ${GUTTER}px) / 7)`;
  const m0 = days[0];
  const m6 = days[6];
  const title =
    m0.getMonth() === m6.getMonth() ? `${m0.getDate()} – ${m6.getDate()} ${format(m6, "MMM yyyy")}`
    : m0.getFullYear() === m6.getFullYear() ? `${format(m0, "d MMM")} – ${format(m6, "d MMM yyyy")}`
    : `${format(m0, "d MMM yyyy")} – ${format(m6, "d MMM yyyy")}`;
  const selRange = sel ? slotRange(sel.a, sel.b) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-10 pb-8 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3.5">
          <h2 className="m-0 text-2xl font-semibold tracking-[-0.03em]">{title}</h2>
          <span className="font-mono text-xs tracking-[0.04em] text-subtle">WEEK {getISOWeek(days[3])}</span>
        </div>
        <div role="group" aria-label="Change week" className="flex items-center gap-2">
          <button type="button" className="cal-ctl w-9 px-0" aria-label="Previous week" title="Previous week (PageUp)" onClick={() => navigate(addDays(days[0], -7))}>
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          <button type="button" className="cal-ctl" title="This week (T)" onClick={() => { navigate(now); requestAnimationFrame(() => scrollToNow()); }}>
            Today <kbd className="cal-kbd">T</kbd>
          </button>
          <button type="button" className="cal-ctl w-9 px-0" aria-label="Next week" title="Next week (PageDown)" onClick={() => navigate(addDays(days[0], 7))}>
            <ChevronRight aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[14px] border border-border bg-card">
        <div
          ref={scrollRef}
          role="grid"
          tabIndex={0}
          aria-label={`Week of ${title}. Arrow keys move between days and half hours. Shift with Up or Down extends a new event. Enter opens an event, toggles a timed goal or creates an event. Page Up and Page Down change week, T goes to today.`}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown PageUp PageDown T Enter Escape"
          onKeyDown={onGridKey}
          onFocus={() => { if (!cursor) setLive(describe(cur.day, cur.slot)); }}
          className="week-grid absolute inset-0 overflow-y-auto overflow-x-hidden"
        >
          <span className="sr-only" role="status" aria-live="polite">{live}</span>

          {/* Sticky day headers */}
          <div role="row" className="sticky top-0 z-[6] grid border-b border-border bg-card" style={{ gridTemplateColumns: `${GUTTER}px repeat(7, minmax(0, 1fr))`, height: HEAD_H }}>
            <span role="presentation" />
            {cols.map((c) => (
              <div
                key={c.key}
                role="columnheader"
                aria-label={`${format(c.date, "EEEE d MMMM")}${c.isToday ? ", today" : ""}${c.overlap ? ", has overlapping events" : ""}`}
                className={`week-head ${isWeekend(c.date.getDay(), prefs) ? "cal-weekend" : ""} ${c.isToday ? "is-today" : ""}`}
              >
                <span className="font-mono text-[11px] tracking-[0.06em] text-subtle">{DOW_SHORT[c.date.getDay()]}</span>
                <span className="flex items-center gap-2">
                  <button type="button" tabIndex={-1} className="week-daynum font-mono" onClick={() => onSelectDate(c.date)} title="Open this day">
                    {c.date.getDate()}
                  </button>
                  {c.overlap && <span className="week-tag">OVERLAP</span>}
                </span>
              </div>
            ))}
          </div>

          {/* Sticky all-day strip: one lane per all-day event on the busiest day */}
          <div role="row" className="sticky z-[5] grid border-b border-border-strong bg-card" style={{ top: HEAD_H, gridTemplateColumns: `${GUTTER}px minmax(0, 1fr)`, minHeight: 34 }}>
            <span className="flex items-center justify-end whitespace-nowrap pr-2 font-mono text-[9.5px] tracking-[0.04em] text-subtle">ALL DAY</span>
            <div className="relative py-1.5">
              <div aria-hidden="true" className="absolute inset-0 grid grid-cols-7">
                {cols.map((c) => <span key={c.key} className={`border-l border-border ${isWeekend(c.date.getDay(), prefs) ? "cal-weekend" : ""}`} />)}
              </div>
              <div className="relative grid grid-cols-7" style={{ gridAutoRows: "22px", minHeight: 22 }}>
                {cols.flatMap((c, i) => c.allDay.map((ev, lane) => (
                  <button
                    key={`${ev.id}:${c.key}`}
                    type="button"
                    tabIndex={-1}
                    className="week-allday"
                    title={`${ev.title}, all day`}
                    style={{ "--c": eventColorVar(ev.color), gridColumn: i + 1, gridRow: lane + 1 } as React.CSSProperties}
                    onClick={() => onEditEvent(ev)}
                  >
                    {ev.title}
                  </button>
                )))}
              </div>
            </div>
          </div>

          {/* Hour grid */}
          <div className="relative grid" style={{ gridTemplateColumns: `${GUTTER}px repeat(7, minmax(0, 1fr))`, height: 24 * H }}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
              {hours.map((h) => (
                <Fragment key={h}>
                  <div className="week-line" style={{ top: h * H }} />
                  <div className="week-line is-half" style={{ top: h * H + H / 2 }} />
                </Fragment>
              ))}
            </div>
            <div aria-hidden="true" className="relative z-[2]">
              {hours.map((h) => (
                <span
                  key={h}
                  className="absolute right-2.5 font-mono text-[10px] text-subtle"
                  style={{ top: h === 0 ? 4 : h * H - 7, visibility: hiddenHours.has(h) ? "hidden" : "visible" }}
                >
                  {formatClock(h * 60, prefs.timeFormat, "hour")}
                </span>
              ))}
            </div>

            {cols.map((c, di) => (
              <div
                key={c.key}
                role="gridcell"
                aria-label={`${format(c.date, "EEEE d MMMM")}${c.isToday ? ", today" : ""}`}
                className={`week-col ${isWeekend(c.date.getDay(), prefs) ? "cal-weekend" : ""}`}
                onMouseDown={(e) => onColDown(e, di)}
              >
                {c.items.map((it) => {
                  const top = (it.start / 60) * H;
                  const pos: React.CSSProperties = {
                    top,
                    left: `calc(${(it.col / it.cols) * 100}% + 2px)`,
                    width: `calc(${100 / it.cols}% - 4px)`,
                  };
                  if (it.kind === "goal") {
                    const label = `${it.done ? "Mark not done" : "Mark done"}: ${it.goal.title}, ${formatClock(it.start, prefs.timeFormat)}`;
                    return (
                      <div key={it.key} className={`week-goal ${it.past ? "is-past" : ""}`} style={{ ...pos, height: H / 2 - 1 }} onMouseDown={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          role="checkbox"
                          tabIndex={-1}
                          aria-checked={it.done}
                          aria-label={label}
                          title={label}
                          onClick={() => toggleGoal(it.goal, c.noon)}
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] p-0 hover:border-primary ${it.done ? "border-primary bg-primary" : "border-input"}`}
                        >
                          {it.done && <Check aria-hidden="true" size={9} strokeWidth={3.6} className="text-primary-foreground" />}
                        </button>
                        <span className={`min-w-0 flex-1 truncate ${it.done ? "line-through decoration-subtle" : ""}`}>{it.goal.title}</span>
                        <span className="week-meta">{formatClock(it.start, prefs.timeFormat, "short")}</span>
                      </div>
                    );
                  }
                  // 1px gap below each block, but never under the minimum height.
                  const h = Math.max(MIN_BLOCK, blockHeight(it.realEnd - it.start, H, MIN_BLOCK) - 1);
                  const range = formatRange(it.start, it.realEnd, prefs.timeFormat);
                  const aria = `${it.event.title}, ${range}${it.past ? ", past" : ""}`;
                  const tall = h >= 38;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      tabIndex={-1}
                      aria-label={aria}
                      title={aria}
                      className={`week-ev ${it.past ? "is-past" : ""} ${tall ? "is-tall" : ""}`}
                      style={{ ...pos, height: h, "--c": eventColorVar(it.event.color) } as React.CSSProperties}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onEditEvent(it.event)}
                    >
                      <span className={`week-ev-title ${it.cols > 1 && tall ? "is-wrap" : ""}`}>{it.event.title}</span>
                      <span className="week-meta week-ev-time">{tall ? formatRange(it.start, it.realEnd, prefs.timeFormat, "short") : formatClock(it.start, prefs.timeFormat, "short")}</span>
                    </button>
                  );
                })}
                {sel && sel.day === di && selRange && (
                  <div
                    className="week-ghost"
                    style={{ top: (selRange.start / 60) * H, height: ((selRange.end - selRange.start) / 60) * H - 1 }}
                  >
                    <span className="font-mono text-[11px] font-medium">{formatRange(selRange.start, selRange.end, prefs.timeFormat)}</span>
                    <span className="text-[11px] text-text-2">New event</span>
                  </div>
                )}
              </div>
            ))}

            {todayIdx >= 0 && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[3]">
                <div className="absolute h-0.5 bg-foreground" style={{ top: (nowMin / 60) * H - 1, left: `calc(${GUTTER}px + ${colW} * ${todayIdx})`, width: `calc(${colW})` }} />
                <div className="absolute h-[9px] w-[9px] rounded-full bg-foreground" style={{ top: (nowMin / 60) * H - 4.5, left: `calc(${GUTTER}px + ${colW} * ${todayIdx} - 4px)` }} />
                <div className="absolute left-0 flex h-[18px] items-center justify-end pr-1.5" style={{ top: (nowMin / 60) * H - 9, width: GUTTER }}>
                  <span className="inline-flex h-[18px] items-center rounded-[9px] bg-foreground px-1.5 font-mono text-[10px] font-semibold text-card">
                    {formatClock(nowMin, prefs.timeFormat, "short")}
                  </span>
                </div>
              </div>
            )}

            {/* Keyboard cursor, shown while the grid has keyboard focus */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[4]">
              <div
                className="week-cursor"
                data-day={cur.day}
                data-slot={cur.slot}
                style={{
                  left: `calc(${GUTTER}px + ${colW} * ${cur.day} + 1px)`,
                  width: `calc(${colW} - 2px)`,
                  top: (cur.slot * H) / 2,
                  height: H / 2,
                }}
              />
            </div>
          </div>
        </div>

        {!anyItems && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto flex flex-col items-center gap-3.5 rounded-[14px] border border-border-strong bg-raised px-7 py-[22px]">
              <span className="text-[15px] font-semibold">Nothing planned this week</span>
              <div className="flex gap-2">
                <button type="button" className="cal-ctl" onClick={() => onNewGoal?.(ymd(days[Math.max(0, todayIdx)]))}>Add goal</button>
                <button type="button" className="cal-ctl" onClick={() => onNewEvent(ymd(days[Math.max(0, todayIdx)]), "09:00")}>Add event</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

