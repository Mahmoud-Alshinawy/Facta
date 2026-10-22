// Month (CalMonth board): the grid starts on the user's week start, all-day
// events are bars spanning days, timed events are chips with "+N more", and
// each day has a goals arc. Clicking a day opens its popover (events, goals
// with checkboxes, Add event, Open day). One tab stop: the grid.

import { useRef } from "react";
import type { CSSProperties } from "react";
import { isWeekend, monthChips, monthMatrix, spanLanes, weekdayOrder, type CalendarPrefs } from "@facta/calendar";
import { useEvents } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import { allDaySpans, goalsOn, isoWeek, keyOf, splitDay, toggledOn } from "@/lib/calendarData";
import { IconClose, IconPlus } from "@/components/shell/Icons";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { Check, Commit, Kbd, addDays, clocks, colorVar, dayLabel, dowLong, dowShort, monthLong, sameDay, useDeletingEvents } from "./common";
import type { CalendarActions } from "./types";

interface Props {
  anchor: Date;
  now: Date;
  prefs: CalendarPrefs;
  actions: CalendarActions;
  onAnchor: (d: Date) => void;
  onOpenDay: (d: Date) => void;
  popOpen: boolean;
  onPop: (open: boolean) => void;
}

export function monthTitle(anchor: Date, prefs: CalendarPrefs) {
  const weeks = monthMatrix(anchor.getFullYear(), anchor.getMonth(), prefs.weekStart);
  const first = weeks[0][3];
  const last = weeks[weeks.length - 1][3];
  return { title: `${monthLong(anchor.getMonth())} ${anchor.getFullYear()}`, subtitle: `WEEKS ${isoWeek(first)}–${isoWeek(last)}` };
}

export default function MonthView({ anchor, now, prefs, actions, onAnchor, onOpenDay, popOpen, onPop }: Props) {
  const { getEventsForDate } = useEvents();
  const { goals, updateGoal } = useGoals();
  const deleting = useDeletingEvents();
  const C = clocks(prefs);
  const gridRef = useRef<HTMLDivElement>(null);
  const Y = anchor.getFullYear();
  const M = anchor.getMonth();
  // Only the weeks that hold days of this month (4 to 6 rows).
  const weeks = monthMatrix(Y, M, prefs.weekStart).filter((w) => w.some((d) => d.getMonth() === M));
  const eventsOn = (key: string) => getEventsForDate(key).filter((e) => !deleting.has(e.id));
  const today = now;

  const rows = weeks.map((days) => {
    const keys = days.map(keyOf);
    const spans = spanLanes(allDaySpans(keys, eventsOn), keys);
    return { days, keys, spans, lanes: spans.lanes };
  });
  const monthEmpty = rows.every((r) => r.keys.every((k, i) => r.days[i].getMonth() !== M || (eventsOn(k).length === 0 && goalsOn(goals, k).length === 0)));

  let popPos: { w: number; i: number } | null = null;
  rows.forEach((r, w) => r.days.forEach((d, i) => { if (sameDay(d, anchor)) popPos = { w, i }; }));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== gridRef.current) return;
    const k = e.key;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (k in step) { e.preventDefault(); onAnchor(addDays(anchor, step[k])); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); onPop(!popOpen); }
    else if (k === "Escape" && popOpen) { e.preventDefault(); onPop(false); }
  };

  return (
    <div ref={gridRef} className="mgrid" role="grid" tabIndex={0} onKeyDown={onKey}
      aria-label={`${monthLong(M)} ${Y}. Arrow keys move by day and week, Enter opens the day, Page Up and Page Down change month.`}
      aria-activedescendant={`mc-${keyOf(anchor)}`}>
      <div className="mdow" aria-hidden="true">
        {weekdayOrder(prefs.weekStart).map((d) => <span key={d} className="mono">{dowShort(d)}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.keys[0]} className="mw" role="row" style={{ gridTemplateRows: `28px ${r.lanes ? `repeat(${r.lanes}, 22px) ` : ""}1fr` }}>
          {r.days.map((dt, i) => {
            const key = r.keys[i];
            const { timed } = splitDay(eventsOn(key));
            const gs = goalsOn(goals, key);
            const out = dt.getMonth() !== M;
            const isToday = sameDay(dt, today);
            const sel = sameDay(dt, anchor);
            const done = gs.filter((g) => g.done).length;
            const past = dt <= today;
            const chips = monthChips(timed.length, r.lanes);
            const allDayCount = r.spans.segments.filter((s) => s.from <= i && s.to >= i).length;
            const total = timed.length + allDayCount;
            return (
              <div key={key} id={`mc-${key}`} role="gridcell" aria-selected={sel}
                aria-label={`${dayLabel(dt)}, ${total} event${total === 1 ? "" : "s"}, ${done} of ${gs.length} goals done${isToday ? ", today" : ""}`}
                className={`mc${isWeekend(dt.getDay(), prefs) ? " is-wk" : ""}${out ? " out" : ""}${isToday ? " is-today" : ""}${sel && popOpen ? " is-sel" : ""}${sel && !popOpen ? " is-cur" : ""}`}
                style={{ paddingTop: 6, ["--lanes" as string]: r.lanes, gridColumn: i + 1, gridRow: `1 / span ${r.lanes + 2}` } as CSSProperties}
                onClick={() => { const again = sel && popOpen; onAnchor(dt); onPop(!again); gridRef.current?.focus({ preventScroll: true }); }}
                onDoubleClick={() => actions.newEvent({ date: key })}>
                <span className="top">
                  <span className="dn">{dt.getDate()}</span>
                  {gs.length > 0 && !out && (
                    <span className="arc mono" title={`${done} of ${gs.length} goals`}>
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--border-strong)" strokeWidth="2" />
                        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"
                          strokeDasharray={`${(past ? done / gs.length : 0) * 37.7} 37.7`} transform="rotate(-90 8 8)" />
                      </svg>{done}/{gs.length}
                    </span>
                  )}
                  <button type="button" className="addb" tabIndex={-1} aria-label={`New event on ${dayLabel(dt)}`}
                    onClick={(e) => { e.stopPropagation(); actions.newEvent({ date: key }); }}><IconPlus size={13} /></button>
                </span>
                {timed.slice(0, chips.shown).map((t) => (
                  <span key={t.event.id} className="chip" style={{ ["--c" as string]: colorVar(t.event.color) }}>
                    <span className="evdot" /><span className="t">{C.chip(t.start)} {t.event.title}</span>
                  </span>
                ))}
                {chips.more > 0 && (
                  <button type="button" className="mmore" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onAnchor(dt); onPop(true); }}>+{chips.more} more</button>
                )}
              </div>
            );
          })}
          {r.spans.segments.map((s) => (
            <button key={s.item.id} type="button" tabIndex={-1}
              className={`bar${s.contL ? " cl" : ""}${s.contR ? " cr" : ""}`}
              title={s.item.event.title}
              style={{ ["--c" as string]: colorVar(s.item.event.color), gridColumn: `${s.from + 1} / span ${s.to - s.from + 1}`, gridRow: s.lane + 2, pointerEvents: "auto" }}
              onClick={(e) => { e.stopPropagation(); actions.editEvent(s.item.event); }}>
              <span className="ee" aria-hidden="true" /><span className="t">{s.item.event.title}</span>
            </button>
          ))}
        </div>
      ))}

      {popOpen && popPos && (
        <DayPopover
          day={anchor}
          pos={popPos}
          rows={rows.length}
          prefsClocks={C}
          events={eventsOn(keyOf(anchor))}
          goals={goalsOn(goals, keyOf(anchor))}
          onToggle={(g) => updateGoal(g.goal.id, toggledOn(g.goal, keyOf(anchor)))}
          onEdit={actions.editEvent}
          onAdd={() => actions.newEvent({ date: keyOf(anchor) })}
          onOpenDay={() => onOpenDay(anchor)}
          onClose={() => { onPop(false); gridRef.current?.focus({ preventScroll: true }); }}
          today={sameDay(anchor, now)}
        />
      )}

      {monthEmpty && (
        <div className="mempty empty-pass">
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>A quiet month</h2>
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>Nothing scheduled yet. Click a day to add something, or type a line above.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Commit keyHint="N" onClick={() => actions.newEvent({ date: keyOf(anchor) })}>New event</Commit>
            <button type="button" className="ctl" onClick={() => actions.newGoal(keyOf(anchor))}>New goal <Kbd>G</Kbd></button>
          </div>
        </div>
      )}
    </div>
  );
}

function DayPopover({ day, pos, rows, prefsClocks: C, events, goals, onToggle, onEdit, onAdd, onOpenDay, onClose, today }: {
  day: Date; pos: { w: number; i: number }; rows: number; prefsClocks: ReturnType<typeof clocks>;
  events: ReturnType<ReturnType<typeof useEvents>["getEventsForDate"]>; goals: ReturnType<typeof goalsOn>;
  onToggle: (g: ReturnType<typeof goalsOn>[number]) => void; onEdit: (e: (typeof events)[number]) => void;
  onAdd: () => void; onOpenDay: () => void; onClose: () => void; today: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, true);
  const { allDay, timed } = splitDay(events);
  // Flip away from the nearest edges: right of the cell in the left half,
  // left of it otherwise; from the top in the first rows, else from the bottom.
  const hz: CSSProperties = pos.i <= 3 ? { left: `calc(${((pos.i + 1) / 7) * 100}% + 6px)` } : { right: `calc(${((7 - pos.i) / 7) * 100}% + 6px)` };
  const vt: CSSProperties = pos.w <= 1 || rows <= 2 ? { top: 40 } : { bottom: 12 };
  const items = [
    ...timed.map((t) => ({ at: t.start, kind: "ev" as const, t })),
    ...goals.map((g) => ({ at: g.at ?? 1440, kind: "goal" as const, g })),
  ].sort((a, b) => a.at - b.at);
  return (
    <div ref={ref} className="pop mpop" role="dialog" aria-label={dayLabel(day)} tabIndex={-1} style={{ ...hz, ...vt }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
        else if ((e.key === "n" || e.key === "N") && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); e.stopPropagation(); onAdd(); }
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 8px 4px 16px" }}>
        <div style={{ flex: 1 }}>
          <div className="mono sec">{dowLong(day.getDay()).toUpperCase()}{today ? " · TODAY" : ""}</div>
          <h3 style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 600 }}>{dayLabel(day)}</h3>
        </div>
        <button type="button" className="b b-icon" aria-label="Close" onClick={onClose}><IconClose /></button>
      </div>
      <ul style={{ overflowY: "auto" }}>
        {allDay.map((a) => (
          <li key={a.id}><span className="evdot" style={{ ["--c" as string]: colorVar(a.color) }} />
            <button type="button" className="gt mpop-btn" onClick={() => onEdit(a)}>{a.title}</button><span className="em">All day</span></li>
        ))}
        {items.map((it) => it.kind === "ev" ? (
          <li key={it.t.event.id}><span className="evdot" style={{ ["--c" as string]: colorVar(it.t.event.color) }} />
            <button type="button" className="gt mpop-btn" onClick={() => onEdit(it.t.event)}>{it.t.event.title}</button>
            <span className="em">{C.chipRange(it.t.start, it.t.end)}</span></li>
        ) : (
          <li key={it.g.goal.id}>
            <Check done={it.g.done} label={it.g.goal.title} onToggle={() => onToggle(it.g)} tabIndex={0} />
            <span className="gt" style={{ textDecoration: it.g.done ? "line-through" : "none" }}>{it.g.goal.title}</span>
            {it.g.at !== null && <span className="em">{C.chip(it.g.at)}</span>}
          </li>
        ))}
        {events.length === 0 && goals.length === 0 && <li style={{ color: "var(--subtle)" }}>Nothing on this day</li>}
      </ul>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--border-strong)", background: "var(--surface)" }}>
        <button type="button" className="ctl" onClick={onAdd}><IconPlus size={13} /> Add event <Kbd>N</Kbd></button>
        <span style={{ flex: 1 }} />
        <button type="button" className="b b-quiet" data-autofocus onClick={onOpenDay}>Open day <Kbd>Enter</Kbd></button>
      </div>
    </div>
  );
}
