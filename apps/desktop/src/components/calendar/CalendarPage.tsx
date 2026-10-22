import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import MiniCalendar from "@/components/MiniCalendar";
import { FootHints } from "@/components/shell/Shortcuts";
import { IconClose } from "@/components/shell/Icons";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";
import { useEvents } from "@/hooks/useEvents";
import { calendarHeading, quickEventDraft, shiftCalendar } from "@/lib/calendarPageData";
import { keyOf } from "@/lib/calendarData";
import { startOfWeekFor } from "@facta/calendar";
import CalendarHeader, { QUICK_ADD_ID } from "./CalendarHeader";
import WeekView from "./WeekView";
import DayView from "./DayView";
import MonthView from "./MonthView";
import AgendaView, { type AgendaFilter } from "./AgendaView";
import type { CalendarActions, CalendarView } from "./types";

interface Props {
  anchor: Date;
  view: CalendarView;
  onAnchor: (date: Date) => void;
  onView: (view: CalendarView) => void;
  actions: CalendarActions;
  keyboardBlocked: boolean;
}

export default function CalendarPage({ anchor, view, onAnchor, onView, actions, keyboardBlocked }: Props) {
  const prefs = usePrefs(), now = useNow();
  const { addEvent } = useEvents();
  const [miniOpen, setMiniOpen] = useState(false);
  const [miniMonth, setMiniMonth] = useState(anchor);
  const [popOpen, setPopOpen] = useState(false);
  const [filter, setFilter] = useState<AgendaFilter>("both");
  const [quickVisible, setQuickVisible] = useState(false);
  const [live, setLive] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setMiniMonth(anchor); }, [anchor]);
  useEffect(() => {
    if (!miniOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.calendar-mini [role="gridcell"][tabindex="0"]')?.focus());
    return () => { cancelAnimationFrame(frame); if (opener?.isConnected) opener.focus(); };
  }, [miniOpen]);
  const heading = calendarHeading(anchor, now, view, prefs);
  const say = useCallback((text: string) => { setLive(text); toast.message(text); }, []);
  const focusCanvas = useCallback(() => root.current?.querySelector<HTMLElement>('.calendar-body [role="grid"]:not(.date-grid), .calendar-body .ag')?.focus({ preventScroll: true }), []);
  const moveAnchor = useCallback((date: Date) => {
    const fromCanvas = document.activeElement?.matches('.wk-scroll, .dscroll, .mgrid, .ag');
    onAnchor(date);
    // Period keys remount a view; keep arrow navigation in the new grid.
    if (fromCanvas) requestAnimationFrame(focusCanvas);
  }, [onAnchor, focusCanvas]);
  const go = useCallback((date: Date) => { setPopOpen(false); moveAnchor(date); setMiniMonth(date); }, [moveAnchor]);
  const changeView = useCallback((next: CalendarView) => {
    const fromCanvas = document.activeElement?.matches('.wk-scroll, .dscroll, .mgrid, .ag');
    setPopOpen(false); onView(next);
    if (fromCanvas) requestAnimationFrame(focusCanvas);
  }, [onView, focusCanvas]);
  const openDay = (date: Date) => { go(date); onView("day"); requestAnimationFrame(focusCanvas); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (keyboardBlocked || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey
        || target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const key = e.key.toLowerCase();
      const views: Record<string, CalendarView> = { "1": "day", "2": "week", "3": "month", "4": "agenda" };
      if (views[key]) { e.preventDefault(); changeView(views[key]); }
      else if (key === "n") { e.preventDefault(); actions.newEvent({ date: keyOf(anchor) }); }
      else if (key === "g") { e.preventDefault(); actions.newGoal(keyOf(anchor)); }
      else if (key === "t") { e.preventDefault(); go(new Date()); }
      else if (key === "pageup" || key === "pagedown") { e.preventDefault(); go(shiftCalendar(anchor, view, key === "pageup" ? -1 : 1)); }
      else if (key === "[") { e.preventDefault(); setMiniOpen((open) => !open); }
      else if (key === "q") {
        e.preventDefault(); setQuickVisible(true);
        requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>(`#${QUICK_ADD_ID}`)?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, view, keyboardBlocked, actions, changeView, go]);

  const periodKey = view === "week" ? keyOf(startOfWeekFor(anchor, prefs.weekStart))
    : view === "month" ? `${anchor.getFullYear()}-${anchor.getMonth()}` : keyOf(anchor);
  return (
    <div ref={root} className="calendar-page flex min-h-0 flex-1 flex-col">
      <CalendarHeader {...heading} view={view} onView={changeView} quickAddVisible={quickVisible}
        prevLabel={`Previous ${view === "agenda" ? "two weeks" : view}`} nextLabel={`Next ${view === "agenda" ? "two weeks" : view}`}
        onPrev={() => go(shiftCalendar(anchor, view, -1))} onNext={() => go(shiftCalendar(anchor, view, 1))}
        onToday={() => go(new Date())} onNewEvent={() => actions.newEvent({ date: keyOf(anchor) })}
        onQuickAdd={(text) => {
          const { complete, draft } = quickEventDraft(text, now, anchor);
          if (!complete) { actions.newEvent(draft); return true; }
          const saved = addEvent({ title: draft.title!, date: draft.date!, startTime: draft.startTime ?? "00:00", endTime: draft.endTime ?? "23:59", color: draft.color!, allDay: draft.allDay, repeat: "none" });
          if (!saved) { say("Your planner is still loading. Try again shortly."); return false; }
          say(`Event added · ${saved.title}`); return true;
        }} />
      <div className="calendar-body relative flex min-h-0 flex-1">
        {miniOpen && <aside className="side-panel calendar-mini" aria-label="Mini calendar">
          <div className="flex items-center justify-between"><span className="sec">JUMP TO DATE</span>
            <button type="button" className="b b-icon" aria-label="Hide mini calendar ([)" onClick={() => setMiniOpen(false)}><IconClose /></button>
          </div>
          <MiniCalendar currentMonth={miniMonth} selectedDate={anchor} onMonthChange={setMiniMonth}
            onSelectDate={(date) => { go(date); }} />
        </aside>}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === "week" && <WeekView key={periodKey} anchor={anchor} now={now} prefs={prefs} actions={actions} onAnchor={moveAnchor} onOpenDay={openDay} say={say} />}
          {view === "day" && <DayView key={periodKey} anchor={anchor} now={now} prefs={prefs} actions={actions} onAnchor={moveAnchor} say={say} />}
          {view === "month" && <MonthView key={periodKey} anchor={anchor} now={now} prefs={prefs} actions={actions} onAnchor={moveAnchor} onOpenDay={openDay} popOpen={popOpen} onPop={setPopOpen} />}
          {view === "agenda" && <AgendaView key={periodKey} start={anchor} now={now} prefs={prefs} actions={actions} filter={filter} onFilter={setFilter} />}
        </div>
      </div>
      <FootHints view={view} />
      <div className="sr-only" aria-live="polite">{live}</div>
    </div>
  );
}
