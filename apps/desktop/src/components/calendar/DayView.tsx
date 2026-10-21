// Day (CalDay board): the day's all-day band, a 24-hour column with events
// side by side and timed goals as chips, and a right panel with the day's
// goals and agenda. One tab stop: the time column. No now line.

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { conflicts, layoutColumns, type CalendarPrefs } from "@facta/calendar";
import { useEvents } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import { goalsOn, keyOf, splitDay, toggledOn } from "@/lib/calendarData";
import type { CalendarEvent } from "@/types/planner";
import { IconWarn } from "@/components/shell/Icons";
import { Check, Commit, Kbd, addDays, clocks, colorVar, dayLabel, deleteEventWithUndo, sameDay, useDeletingEvents } from "./common";
import { DetailPopover, QuickAddPopover } from "./Popovers";
import type { CalendarActions } from "./types";

const H = 64;
const LEFT = 96;
const SLOTS = 48;

interface Props {
  anchor: Date;
  now: Date;
  prefs: CalendarPrefs;
  actions: CalendarActions;
  onAnchor: (d: Date) => void;
  say: (text: string) => void;
}

export default function DayView({ anchor, now, prefs, actions, onAnchor, say }: Props) {
  const { getEventsForDate, addEvent, deleteEvent } = useEvents();
  const { goals, updateGoal } = useGoals();
  const deleting = useDeletingEvents();
  const C = clocks(prefs);
  const key = keyOf(anchor);
  const isToday = sameDay(anchor, now);
  const isPast = !isToday && anchor < now;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const events = getEventsForDate(key).filter((e) => !deleting.has(e.id));
  const { allDay, timed } = splitDay(events);
  const dayGoals = goalsOn(goals, key);
  const [slot, setSlot] = useState(() => Math.min(SLOTS - 1, Math.floor(nowMin / 30)));
  const [qa, setQa] = useState<{ a: number; b: number } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const scRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const scrolled = useRef(false);
  useLayoutEffect(() => {
    const el = scRef.current;
    if (!el || scrolled.current) return;
    const go = () => {
      if (el.clientHeight === 0) return false;
      const at8 = 8 * H - 6;
      const nowY = (nowMin / 60) * H;
      el.scrollTop = isToday && nowY > at8 + el.clientHeight - 2 * H ? Math.max(0, nowY - 2 * H) : at8;
      scrolled.current = true;
      return true;
    };
    if (go()) return;
    const ro = new ResizeObserver(() => { if (go()) ro.disconnect(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isToday, nowMin]);

  const toggle = (g: (typeof dayGoals)[number]) => updateGoal(g.goal.id, toggledOn(g.goal, key));

  // Events side by side; timed goals sit on top at their time.
  const laid = layoutColumns(timed.map((t) => ({ ...t, end: Math.max(t.end, t.start + 30), realEnd: t.end })));
  const clash = conflicts(timed.map((t) => ({ id: t.event.id, start: t.start, end: t.end })));

  const ensureVisible = (s: number) => {
    const el = scRef.current;
    const band = (gridRef.current?.offsetTop ?? 0);
    if (!el) return;
    const y = band + (s * H) / 2;
    if (y < el.scrollTop + band) el.scrollTop = Math.max(0, y - band - 8);
    else if (y + H / 2 > el.scrollTop + el.clientHeight - 8) el.scrollTop = y + H / 2 - el.clientHeight + 8;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== scRef.current) return;
    const k = e.key;
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      const s = k === "ArrowUp" ? Math.max(0, slot - 1) : Math.min(SLOTS - 1, slot + 1);
      setSlot(s);
      ensureVisible(s);
    } else if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      onAnchor(addDays(anchor, k === "ArrowLeft" ? -1 : 1));
    } else if (k === "Escape") {
      if (qa || detail) { e.preventDefault(); setQa(null); setDetail(null); }
    } else if (k === "Enter") {
      e.preventDefault();
      const t0 = slot * 30;
      const gg = dayGoals.find((g) => g.at !== null && g.at >= t0 && g.at < t0 + 30);
      if (gg) { toggle(gg); say(`${gg.done ? "Not done" : "Done"} · ${gg.goal.title}`); return; }
      const hit = timed.find((t) => t.start <= t0 && t.end > t0);
      if (hit) { setDetail(hit.event.id); return; }
      setQa({ a: slot, b: Math.min(SLOTS - 1, slot + 1) });
    }
  };

  const focusGrid = () => scRef.current?.focus({ preventScroll: true });
  const hasNow = isToday;
  const nowTop = (nowMin / 60) * H;
  const done = dayGoals.filter((g) => g.done).length;
  const detailEvent = detail ? events.find((e) => e.id === detail) : undefined;
  const popHoriz: CSSProperties = { left: `calc(${LEFT}px + 40px)` };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
      <div ref={scRef} className="dscroll" role="grid" tabIndex={0} onKeyDown={onKey}
        aria-label={`${dayLabel(anchor)}. Arrow up and down move by half-hours, left and right change day, Enter opens or toggles.`}>
        <div className="dwrap">
          <div className="dband">
            <div className="row">
              <span className="mono sec lbl">ALL DAY</span>
              {allDay.length === 0 && <span style={{ fontSize: 13, color: "var(--subtle)" }}>Nothing all day</span>}
              {allDay.map((a) => (
                <button key={a.id} type="button" className="ad1" tabIndex={-1} style={{ ["--c" as string]: colorVar(a.color) }} onClick={() => setDetail(a.id)}>
                  <span className="ee" aria-hidden="true" />{a.title}
                </button>
              ))}
            </div>
          </div>
          <div ref={gridRef} className="dgrid" style={{ height: 24 * H }}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              if (e.clientX - r.left < LEFT) return;
              const s = Math.max(0, Math.min(SLOTS - 1, Math.floor(((e.clientY - r.top) / H) * 2)));
              setSlot(s);
              setDetail(null);
              setQa({ a: s, b: Math.min(SLOTS - 1, s + 1) });
            }}>
            {Array.from({ length: 23 }, (_, h) => <div key={`l${h}`} className="dl" style={{ top: (h + 1) * H }} />)}
            {Array.from({ length: 24 }, (_, h) => <div key={`m${h}`} className="dl half" style={{ top: h * H + H / 2 }} />)}
            {Array.from({ length: 24 }, (_, h) => (
              <span key={`h${h}`} className="mono dh" style={{ top: h === 0 ? 2 : h * H - 7, opacity: hasNow && Math.abs(h * H - nowTop) < 16 ? 0 : 1 }}>{C.hour(h * 60)}</span>
            ))}
            {laid.map((t) => {
              const h = Math.max(28, ((t.realEnd - t.start) / 60) * H - 2);
              const row = h < 46;
              const past = isPast || (isToday && t.realEnd <= nowMin);
              const cl = clash.ids.has(t.event.id);
              return (
                <button key={t.event.id} type="button" tabIndex={-1}
                  className={`dev${row ? " row" : ""}${past ? " is-past" : ""}${cl ? " clash" : ""}`}
                  aria-label={`${t.event.title}, ${C.range(t.start, t.realEnd)}${cl ? ", overlaps another event" : ""}`}
                  title={`${t.event.title}, ${C.range(t.start, t.realEnd)}`}
                  style={{ top: (t.start / 60) * H + 1, height: h, left: `calc(${LEFT}px + (100% - ${LEFT}px) * ${(t.col / t.cols).toFixed(4)})`, width: `calc((100% - ${LEFT}px) / ${t.cols} - 4px)`, ["--c" as string]: colorVar(t.event.color) }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => { setQa(null); setDetail(t.event.id); }}>
                  <span className="ee" aria-hidden="true" />
                  <span className="in"><span className="et">{t.event.title}</span><span className="em">{C.chipRange(t.start, t.realEnd)}</span></span>
                  {cl && <span className="ci" title="Overlaps another event"><IconWarn size={12} /></span>}
                </button>
              );
            })}
            {dayGoals.filter((g) => g.at !== null).map((g) => {
              const t = g.at!;
              const over = timed.some((x) => x.start <= t && x.end > t);
              const style: CSSProperties = over
                ? { top: (t / 60) * H, left: "calc(100% - 236px)", width: 230, boxShadow: "inset 0 0 0 1px var(--control-border), 0 6px 16px rgba(0,0,0,.35)" }
                : { top: (t / 60) * H + 1, left: `calc(${LEFT}px + 6px)`, width: `calc(100% - ${LEFT + 6}px)` };
              return (
                <div key={g.goal.id} className={`dgc${g.done ? " is-done" : ""}`} style={style} onMouseDown={(e) => e.stopPropagation()}>
                  <Check done={g.done} label={g.goal.title} onToggle={() => toggle(g)} />
                  <span className="gt">{g.goal.title}</span><span className="em">{C.chip(t)}</span>
                </div>
              );
            })}
            {hasNow && <span className="mono dnowP" style={{ top: nowTop - 10 }} aria-hidden="true">{C.full(nowMin)}</span>}
            {!qa && !detail && <div className="dcur" style={{ top: (slot * H) / 2, height: H / 2 }} />}
            {qa && (
              <div className="ghost" style={{ left: LEFT + 3, top: (qa.a * H) / 2 + 1, height: ((qa.b - qa.a + 1) * H) / 2 - 2 }}>
                <span className="gt1">New event</span><span className="gt2">{C.chipRange(qa.a * 30, (qa.b + 1) * 30)}</span>
              </div>
            )}
            {qa && (
              <QuickAddPopover style={{ ...popHoriz, top: Math.max(8, (qa.a * H) / 2 - 20), width: 348 }}
                day={anchor} start={qa.a * 30} end={(qa.b + 1) * 30} now={now} clocks={C}
                onClose={() => { setQa(null); focusGrid(); }}
                onAdd={(ev) => { addEvent(ev); setQa(null); focusGrid(); say(`Event added · ${ev.title}`); }}
                onMore={(draft) => { setQa(null); actions.newEvent(draft); }} />
            )}
            {detailEvent && (
              <DetailPopover event={detailEvent} day={anchor} clocks={C}
                style={{ ...popHoriz, top: Math.max(8, detailEvent.allDay ? 8 : (splitDay([detailEvent]).timed[0].start / 60) * H - 12), width: 330 }}
                onClose={() => { setDetail(null); focusGrid(); }}
                onEdit={() => { setDetail(null); actions.editEvent(detailEvent); }}
                onDelete={() => { setDetail(null); deleteEventWithUndo(detailEvent as CalendarEvent, deleteEvent); focusGrid(); }} />
            )}
            {events.length === 0 && dayGoals.length === 0 && (
              <div className="dempty empty-pass" style={{ position: "absolute", top: 340, left: 0, right: 0, zIndex: 7 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Nothing planned</h2>
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>A free day. Press Enter on any time to start an event, or type a line above.</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <Commit keyHint="N" onClick={() => actions.newEvent({ date: key })}>New event</Commit>
                  <button type="button" className="ctl" onClick={() => actions.newGoal(key)}>New goal <Kbd>G</Kbd></button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <aside className="dpanel side-panel-day" aria-label="Goals and agenda for the day">
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><h2 style={{ flex: 1 }}>Goals</h2><span className="mono" style={{ fontSize: 11, color: "var(--subtle)" }}>{done} of {dayGoals.length}</span></div>
          <div className="dbar" aria-hidden="true"><i style={{ width: `${dayGoals.length ? Math.round((done / dayGoals.length) * 100) : 0}%` }} /></div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            {dayGoals.map((g) => (
              <li key={g.goal.id} className="grow">
                <Check done={g.done} label={g.goal.title} onToggle={() => toggle(g)} tabIndex={0} />
                <span className="gt" style={{ textDecoration: g.done ? "line-through" : "none", color: g.done ? "var(--text-2)" : "var(--text)" }}>{g.goal.title}</span>
                {g.at !== null && <span className="em">{C.chip(g.at)}</span>}
              </li>
            ))}
          </ul>
          {dayGoals.length === 0 && <span style={{ fontSize: 13, color: "var(--subtle)" }}>No goals today. Add one with G.</span>}
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          <h2>Agenda</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            {[...allDay.map((e) => ({ e, at: -1 })), ...timed.map((t) => ({ e: t.event, at: t.start }))].map(({ e, at }) => (
              <li key={e.id} className="grow">
                <span className="evdot" style={{ ["--c" as string]: colorVar(e.color) }} />
                <button type="button" className="gt grow-btn" onClick={() => actions.editEvent(e)}>{e.title}</button>
                <span className="em">{at < 0 ? "All day" : C.chip(at)}</span>
              </li>
            ))}
          </ul>
          {events.length === 0 && <span style={{ fontSize: 13, color: "var(--subtle)" }}>No events</span>}
        </section>
      </aside>
    </div>
  );
}
