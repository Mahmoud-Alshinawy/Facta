import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { addDays, addMonths, format, isSameDay, isSameMonth } from "date-fns";
import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  formatClock, formatRange, isWeekend, monthMatrix, parseClock, popoverPlacement, weekdayOrder,
} from "@facta/calendar";
import { useEvents, type CalendarEvent } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";
import { eventColorVar } from "@/lib/eventColors";
import { dayAriaLabel } from "@/lib/calendarText";
import { goalsForDay, isCompletedToday, localDay, toggleGoalCompletion } from "@/lib/goalDates";
import type { Goal } from "@/types/planner";

interface MonthViewProps {
  currentMonth: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  onSelectDate: (date: Date) => void;
  onNewEvent: (date: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  /** Move to another date (keyboard, toolbar); may change the month shown. */
  onNavigate?: (date: Date) => void;
  onNewGoal?: (date: string) => void;
}

const DOW_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MAX_CHIPS = 3;
const RING_C = 2 * Math.PI * 5.5;

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

function sortEvents(list: CalendarEvent[]): CalendarEvent[] {
  return [...list].sort((a, b) => {
    if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
    return a.startTime.localeCompare(b.startTime);
  });
}

export default function MonthView({
  currentMonth, selectedDate, events, onSelectDate, onNewEvent, onEditEvent, onNavigate, onNewGoal,
}: MonthViewProps) {
  const prefs = usePrefs();
  const now = useNow();
  const { getEventsForDate } = useEvents();
  const { goals, updateGoal } = useGoals();
  const [popOpen, setPopOpen] = useState(false);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const gridRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);

  const navigate = useCallback((d: Date) => (onNavigate ?? onSelectDate)(d), [onNavigate, onSelectDate]);

  const rows = useMemo(
    () => monthMatrix(currentMonth.getFullYear(), currentMonth.getMonth(), prefs.weekStart),
    [currentMonth, prefs.weekStart],
  );
  const order = weekdayOrder(prefs.weekStart);

  // Everything each cell shows, from the real data. `events` is a dependency
  // so edits re-render; repeats are expanded by getEventsForDate.
  const cells = useMemo(() => rows.map((row) => row.map((date) => {
    const inMonth = isSameMonth(date, currentMonth);
    const dayEvents = inMonth ? sortEvents(getEventsForDate(ymd(date))) : [];
    const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const dayGoals = inMonth ? goalsForDay(goals, noon) : [];
    const done = dayGoals.filter((g) => isCompletedToday(g, noon)).length;
    return { date, key: ymd(date), inMonth, events: dayEvents, goals: dayGoals, done, noon };
  })), [rows, currentMonth, getEventsForDate, goals, events]);

  const flat = cells.flat();
  const monthEvents = flat.reduce((n, c) => n + c.events.length, 0);
  const monthGoals = flat.reduce((n, c) => n + c.goals.length, 0);
  const isEmpty = monthEvents === 0 && monthGoals === 0;

  // The roving tab stop: the selected day if it is in this month, else the 1st.
  const focusKey = isSameMonth(selectedDate, currentMonth)
    ? ymd(selectedDate)
    : ymd(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
  const focusCell = flat.find((c) => c.key === focusKey);

  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    cellRefs.current.get(focusKey)?.focus();
  }, [focusKey, currentMonth]);

  const moveTo = (d: Date, opts: { focus?: boolean; open?: boolean } = {}) => {
    if (opts.focus !== false) wantFocus.current = true;
    if (opts.open !== undefined) setPopOpen(opts.open);
    navigate(d);
  };

  const closePop = (focusBack = true) => {
    setPopOpen(false);
    if (focusBack) {
      wantFocus.current = true;
      // Same key: run the focus now, the layout effect won't re-run.
      requestAnimationFrame(() => cellRefs.current.get(focusKey)?.focus());
    }
  };

  // Click outside the popover (and not on a day) closes it.
  useEffect(() => {
    if (!popOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.("[data-month-cell]")) return;
      setPopOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [popOpen]);

  // Move focus into the popover when it opens.
  useEffect(() => {
    if (popOpen) popRef.current?.focus();
  }, [popOpen, focusKey]);

  const shiftMonth = (dir: number) => {
    const target = addMonths(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1), dir);
    const sameMonthAsToday = isSameMonth(target, now);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const day = sameMonthAsToday ? now.getDate() : Math.min(selectedDate.getDate(), last);
    return new Date(target.getFullYear(), target.getMonth(), day);
  };

  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const base = isSameMonth(selectedDate, currentMonth) ? selectedDate : new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const handled = (fn: () => void) => { e.preventDefault(); e.stopPropagation(); fn(); };
    switch (e.key) {
      case "ArrowLeft": return handled(() => moveTo(addDays(base, -1)));
      case "ArrowRight": return handled(() => moveTo(addDays(base, 1)));
      case "ArrowUp": return handled(() => moveTo(addDays(base, -7)));
      case "ArrowDown": return handled(() => moveTo(addDays(base, 7)));
      case "PageUp": return handled(() => moveTo(shiftMonth(-1)));
      case "PageDown": return handled(() => moveTo(shiftMonth(1)));
      case "Home": return handled(() => moveTo(addDays(base, -order.indexOf(base.getDay()))));
      case "End": return handled(() => moveTo(addDays(base, 6 - order.indexOf(base.getDay()))));
      case "t":
      case "T": return handled(() => moveTo(now));
      case "Enter":
      case " ": return handled(() => { onSelectDate(base); setPopOpen(true); });
      case "Escape": if (popOpen) handled(() => closePop()); return;
    }
  };

  const toggleGoal = (goal: Goal, day: Date) => {
    const next = toggleGoalCompletion(goal, day);
    updateGoal(goal.id, { completed: next.completed, completedDates: next.completedDates });
  };

  // Popover for the selected day.
  const popCell = popOpen ? flat.find((c) => c.key === ymd(selectedDate)) : undefined;
  const popIndex = popCell ? flat.indexOf(popCell) : -1;
  const placement = popIndex >= 0 ? popoverPlacement(popIndex % 7, Math.floor(popIndex / 7), rows.length) : null;
  const popStyle: React.CSSProperties = {};
  if (placement && popIndex >= 0) {
    const col = popIndex % 7;
    const row = Math.floor(popIndex / 7);
    if (placement.side === "right") popStyle.left = `calc(${((col + 1) / 7) * 100}% + 6px)`;
    else popStyle.right = `calc(${((7 - col) / 7) * 100}% + 6px)`;
    if (placement.anchor === "bottom") {
      popStyle.bottom = 8;
      popStyle.maxHeight = "calc(100% - 16px)";
    } else {
      popStyle.top = `calc(${(row / rows.length) * 100}% + 4px)`;
      popStyle.maxHeight = `calc(${100 - (row / rows.length) * 100}% - 12px)`;
    }
  }

  const todayKey = localDay(now);
  const title = format(currentMonth, "MMMM yyyy");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-10 pb-8 pt-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3.5">
          <h2 className="m-0 text-2xl font-semibold tracking-[-0.03em]">{title}</h2>
          {!isEmpty && (
            <span className="font-mono text-xs text-subtle">
              {monthEvents} {monthEvents === 1 ? "event" : "events"}
            </span>
          )}
        </div>
        <div role="group" aria-label="Change month" className="flex items-center gap-2">
          <button type="button" className="cal-ctl w-9 px-0" aria-label="Previous month" title="Previous month (PageUp)" onClick={() => moveTo(shiftMonth(-1), { focus: false })}>
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          <button type="button" className="cal-ctl" title="Jump to today (T)" onClick={() => moveTo(now, { focus: false })}>
            Today <kbd className="cal-kbd">T</kbd>
          </button>
          <button type="button" className="cal-ctl w-9 px-0" aria-label="Next month" title="Next month (PageDown)" onClick={() => moveTo(shiftMonth(1), { focus: false })}>
            <ChevronRight aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      {/* Month panel */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-card">
        <div aria-hidden="true" className="grid h-8 shrink-0 grid-cols-7 border-b border-border">
          {order.map((dow) => (
            <span
              key={dow}
              className={`flex items-center px-2.5 font-mono text-[11px] tracking-[0.06em] text-subtle ${isWeekend(dow, prefs) ? "cal-weekend" : ""}`}
            >
              {DOW_SHORT[dow]}
            </span>
          ))}
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={gridRef}
            role="grid"
            aria-label={title}
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown PageUp PageDown Home End T Enter Escape"
            onKeyDown={onGridKey}
            className="absolute inset-0 grid"
            style={{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}
          >
            {cells.map((row, r) => (
              <div key={r} role="row" className="grid min-h-0 grid-cols-7">
                {row.map((c, ci) => {
                  const isToday = c.key === todayKey;
                  const selected = popOpen && isSameDay(c.date, selectedDate);
                  const full = c.goals.length > 0 && c.done === c.goals.length;
                  const extra = c.events.length - MAX_CHIPS;
                  const dayLabel = format(c.date, "EEE d MMM");
                  return (
                    <div
                      key={c.key}
                      ref={(el) => { if (el) cellRefs.current.set(c.key, el); else cellRefs.current.delete(c.key); }}
                      role="gridcell"
                      data-month-cell=""
                      tabIndex={c.key === focusCell?.key ? 0 : -1}
                      aria-selected={selected}
                      aria-label={dayAriaLabel(c.date, isToday, c.events.length, c.done, c.goals.length)}
                      onClick={() => { onSelectDate(c.date); setPopOpen(true); }}
                      onDoubleClick={() => onNewEvent(c.key)}
                      className={[
                        "month-cell group",
                        isWeekend(c.date.getDay(), prefs) ? "cal-weekend" : "",
                        ci === 6 ? "border-r-0" : "",
                        r === rows.length - 1 ? "border-b-0" : "",
                        selected ? "is-selected" : "",
                        c.inMonth ? "" : "is-out",
                      ].join(" ")}
                    >
                      <div className="month-cell-body">
                        <div className="flex h-[22px] items-center justify-between">
                          <span className={`month-day font-mono ${isToday ? "is-today" : ""}`}>{c.date.getDate()}</span>
                          <span className="flex items-center gap-1.5">
                            <button
                              type="button"
                              tabIndex={-1}
                              className="month-plus"
                              aria-label={`New event on ${dayLabel}`}
                              onClick={(e) => { e.stopPropagation(); onNewEvent(c.key); }}
                            >
                              <Plus aria-hidden="true" size={12} strokeWidth={2.6} />
                            </button>
                            {c.goals.length > 0 && (
                              <span aria-hidden="true" className="flex items-center gap-1 text-[10px] text-subtle">
                                <svg width="14" height="14" viewBox="0 0 14 14" className="-rotate-90">
                                  <circle cx="7" cy="7" r="5.5" fill="none" strokeWidth="2" className="month-ring-track" />
                                  <circle
                                    cx="7" cy="7" r="5.5" fill="none" strokeWidth="2" strokeLinecap="round"
                                    strokeDasharray={`${(RING_C * c.done) / c.goals.length} ${RING_C}`}
                                    stroke={full ? "var(--accent)" : "var(--text-2)"}
                                  />
                                </svg>
                                <span className="font-mono">{c.done}/{c.goals.length}</span>
                              </span>
                            )}
                          </span>
                        </div>
                        {c.events.slice(0, MAX_CHIPS).map((ev) => {
                          const start = parseClock(ev.startTime) ?? 0;
                          const end = parseClock(ev.endTime) ?? start;
                          const when = ev.allDay ? "all day" : formatClock(start, prefs.timeFormat, "short");
                          return (
                            <div
                              key={ev.id}
                              className="month-chip"
                              style={{ "--c": eventColorVar(ev.color) } as React.CSSProperties}
                              title={ev.allDay ? `${ev.title}, all day` : `${ev.title}, ${formatRange(start, end, prefs.timeFormat)}`}
                            >
                              <span aria-hidden="true" className="month-dot" />
                              <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                              <span className="shrink-0 font-mono text-[10px] text-text-2">{when}</span>
                            </div>
                          );
                        })}
                        {extra > 0 && (
                          <button
                            type="button"
                            tabIndex={-1}
                            className="month-more"
                            onClick={(e) => { e.stopPropagation(); onSelectDate(c.date); setPopOpen(true); }}
                          >
                            +{extra} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {isEmpty && !popOpen && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto flex flex-col items-center gap-3.5 rounded-[14px] border border-border-strong bg-raised px-7 py-[22px]">
                <span className="text-[15px] font-semibold">Nothing planned in {format(currentMonth, "MMMM")}</span>
                <div className="flex gap-2">
                  <button type="button" className="cal-ctl" onClick={() => onNewGoal?.(focusKey)}>Add goal</button>
                  <button type="button" className="cal-ctl" onClick={() => onNewEvent(focusKey)}>Add event</button>
                </div>
              </div>
            </div>
          )}

          {popCell && (
            <DayPopover
              ref={popRef}
              style={popStyle}
              day={popCell.date}
              events={popCell.events}
              goals={popCell.goals}
              noon={popCell.noon}
              timeFormat={prefs.timeFormat}
              onClose={() => closePop()}
              onEditEvent={onEditEvent}
              onToggleGoal={(g) => toggleGoal(g, popCell.noon)}
              onAddGoal={() => { closePop(false); onNewGoal?.(popCell.key); }}
              onAddEvent={() => { closePop(false); onNewEvent(popCell.key); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface DayPopoverProps {
  style: React.CSSProperties;
  day: Date;
  events: CalendarEvent[];
  goals: Goal[];
  noon: Date;
  timeFormat: "24h" | "12h";
  onClose: () => void;
  onEditEvent: (e: CalendarEvent) => void;
  onToggleGoal: (g: Goal) => void;
  onAddGoal: () => void;
  onAddEvent: () => void;
  ref?: React.Ref<HTMLDivElement>;
}

function DayPopover({
  ref, style, day, events, goals, noon, timeFormat, onClose, onEditEvent, onToggleGoal, onAddGoal, onAddEvent,
}: DayPopoverProps) {
  const done = goals.filter((g) => isCompletedToday(g, noon)).length;
  const label = format(day, "EEEE, d MMMM");
  const sub = [
    `${events.length} ${events.length === 1 ? "event" : "events"}`,
    `${goals.length} ${goals.length === 1 ? "goal" : "goals"}`,
    ...(events.length >= 5 ? ["busy day"] : []),
  ].join(" · ");

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={{ ...style, width: 340 }}
      className="month-pop absolute z-20 flex flex-col overflow-hidden rounded-[14px] border border-border-strong bg-raised outline-none"
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
        // Keys typed inside the popover never reach the grid or the app shortcuts.
        else e.stopPropagation();
      }}
    >
      <div className="flex items-start justify-between gap-3 pb-2.5 pl-4 pr-3.5 pt-3.5">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h3 className="m-0 text-base font-semibold tracking-[-0.02em]">{label}</h3>
          <span className="font-mono text-[11px] text-subtle">{sub}</span>
        </div>
        <button type="button" className="cal-ctl h-[30px] w-[30px] border-transparent px-0" aria-label="Close (Esc)" title="Close (Esc)" onClick={onClose}>
          <X aria-hidden="true" size={14} strokeWidth={2.4} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto px-2.5 pb-2">
        {events.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="px-1.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-subtle">EVENTS · {events.length}</span>
            {events.map((ev) => {
              const start = parseClock(ev.startTime) ?? 0;
              const end = parseClock(ev.endTime) ?? start;
              return (
                <button
                  key={ev.id}
                  type="button"
                  className="month-prow text-left"
                  style={{ "--c": eventColorVar(ev.color) } as React.CSSProperties}
                  onClick={() => onEditEvent(ev)}
                >
                  <span aria-hidden="true" className="month-dot" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{ev.title}</span>
                  <span className="font-mono text-[11px] text-text-2">{ev.allDay ? "All day" : formatRange(start, end, timeFormat)}</span>
                </button>
              );
            })}
          </div>
        )}
        {goals.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="px-1.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-subtle">GOALS · {done}/{goals.length}</span>
            {goals.map((g) => {
              const isDone = isCompletedToday(g, noon);
              const t = parseClock(g.time);
              return (
                <div key={g.id} className="month-prow">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={`${isDone ? "Mark not done" : "Mark done"}: ${g.title}`}
                    onClick={() => onToggleGoal(g)}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] p-0 hover:border-primary ${isDone ? "border-primary bg-primary" : "border-input"}`}
                  >
                    {isDone && <Check aria-hidden="true" size={10} strokeWidth={3.4} className="text-primary-foreground" />}
                  </button>
                  <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${isDone ? "line-through decoration-subtle" : ""}`}>{g.title}</span>
                  {t !== null && <span className="font-mono text-[11px] text-text-2">{formatClock(t, timeFormat)}</span>}
                </div>
              );
            })}
          </div>
        )}
        {events.length === 0 && goals.length === 0 && (
          <span className="px-1.5 pb-2 pt-1 text-[13px] text-text-2">Nothing on this day yet.</span>
        )}
      </div>

      <div className="flex gap-2 border-t border-border-strong px-3.5 pb-3.5 pt-2.5">
        <button type="button" className="cal-ctl flex-1" onClick={onAddGoal}>Add goal</button>
        <button type="button" className="cal-ctl flex-1" onClick={onAddEvent}>Add event</button>
      </div>
    </div>
  );
}
