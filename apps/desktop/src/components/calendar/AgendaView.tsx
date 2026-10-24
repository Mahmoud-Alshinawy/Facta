// Agenda (CalAgenda board): the next 14 days as a two-column timeline (time,
// then the item), filtered to events and goals, events or goals, with an
// "Add to <day>" row under each day. Arrow keys move through the items.

import { useRef, useState } from "react";
import type { CalendarPrefs } from "@facta/calendar";
import { useEvents } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import { durationText, goalsOn, keyOf, splitDay, toggledOn } from "@/lib/calendarData";
import type { CalendarEvent } from "@/types/planner";
import { IconPlus } from "@/components/shell/Icons";
import { Check, Commit, Kbd, addDays, clocks, colorVar, dayLabel, dowLong, monthShort, sameDay, startOfDay, useDeletingEvents } from "./common";
import type { CalendarActions } from "./types";

export type AgendaFilter = "both" | "events" | "goals";
export const AGENDA_DAYS = 14;

export function agendaTitle(start: Date) {
  const end = addDays(start, AGENDA_DAYS - 1);
  const sameMonth = start.getMonth() === end.getMonth();
  return {
    title: `Next ${AGENDA_DAYS} days`,
    subtitle: `AGENDA · ${start.getDate()}${sameMonth ? "" : ` ${monthShort(start.getMonth()).toUpperCase()}`}–${end.getDate()} ${monthShort(end.getMonth()).toUpperCase()} ${end.getFullYear()}`,
  };
}

interface Props {
  start: Date;
  now: Date;
  prefs: CalendarPrefs;
  actions: CalendarActions;
  filter: AgendaFilter;
  onFilter: (f: AgendaFilter) => void;
}

type Row =
  | { kind: "now"; at: number }
  | { kind: "ev"; at: number; event: CalendarEvent; key: string; end: number; allDay: boolean; past: boolean }
  | { kind: "goal"; at: number; g: ReturnType<typeof goalsOn>[number]; key: string; past: boolean };

export default function AgendaView({ start, now, prefs, actions, filter, onFilter }: Props) {
  const { getEventsForDate } = useEvents();
  const { goals, updateGoal } = useGoals();
  const deleting = useDeletingEvents();
  const C = clocks(prefs);
  const [cur, setCur] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const day0 = startOfDay(start);

  const groups: { dt: Date; key: string; rows: Row[] }[] = [];
  let goalsDone = 0;
  let goalsTotal = 0;
  for (let i = 0; i < AGENDA_DAYS; i++) {
    const dt = addDays(day0, i);
    const key = keyOf(dt);
    const isToday = sameDay(dt, now);
    const evs = getEventsForDate(key).filter((e) => !deleting.has(e.id));
    const { allDay, timed } = splitDay(evs, key);
    const gs = goalsOn(goals, key);
    goalsTotal += gs.length;
    goalsDone += gs.filter((g) => g.done).length;
    const rows: Row[] = [];
    if (filter !== "goals") {
      for (const e of allDay) rows.push({ kind: "ev", at: -1, event: e, key, end: 0, allDay: true, past: false });
      for (const t of timed) rows.push({ kind: "ev", at: t.start, event: t.event, key, end: t.end, allDay: false, past: isToday && t.end <= nowMin });
    }
    if (filter !== "events") {
      for (const g of gs) rows.push({ kind: "goal", at: g.at ?? 1439, g, key, past: isToday && g.done });
    }
    rows.sort((a, b) => a.at - b.at);
    if (isToday && rows.length) {
      let ins = rows.findIndex((r) => r.at >= nowMin);
      if (ins < 0) ins = rows.length;
      rows.splice(ins, 0, { kind: "now", at: nowMin });
    }
    if (rows.length) groups.push({ dt, key, rows });
  }
  const flat = groups.flatMap((g) => g.rows.filter((r): r is Exclude<Row, { kind: "now" }> => r.kind !== "now"));
  const total = flat.length;
  const curIdx = Math.min(cur, Math.max(0, total - 1));

  const act = (r: (typeof flat)[number]) => {
    if (r.kind === "ev") actions.editEvent(r.event);
    else updateGoal(r.g.goal.id, toggledOn(r.g.goal, r.key));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== listRef.current) return;
    const k = e.key;
    if (k === "ArrowDown") { e.preventDefault(); setCur(Math.min(total - 1, curIdx + 1)); scrollTo(curIdx + 1); }
    else if (k === "ArrowUp") { e.preventDefault(); setCur(Math.max(0, curIdx - 1)); scrollTo(curIdx - 1); }
    else if (k === "Home") { e.preventDefault(); setCur(0); scrollTo(0); }
    else if (k === "End") { e.preventDefault(); setCur(total - 1); scrollTo(total - 1); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); if (flat[curIdx]) act(flat[curIdx]); }
    else if (k === "f" || k === "F") {
      e.preventDefault();
      const o: AgendaFilter[] = ["both", "events", "goals"];
      onFilter(o[(o.indexOf(filter) + 1) % 3]);
      setCur(0);
    }
  };
  const scrollTo = (i: number) => {
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-ai="${i}"]`)?.scrollIntoView({ block: "nearest" }));
  };

  let idx = 0;
  const FIL: [AgendaFilter, string][] = [["both", "Events and goals"], ["events", "Events"], ["goals", "Goals"]];
  const tomorrow = addDays(startOfDay(now), 1);
  return (
    <div ref={listRef} className="ag" role="list" tabIndex={0} onKeyDown={onKey}
      aria-label="Agenda. Arrow keys move through items, Enter opens or toggles."
      aria-activedescendant={total ? `ai-${curIdx}` : undefined}>
      <div className="agw">
        <div className="agbar">
          <div className="seg" role="radiogroup" aria-label="Show">
            {FIL.map(([id, name]) => (
              <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => { onFilter(id); setCur(0); }}>{name}</button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11.5, color: "var(--subtle)" }}>{total} items · {goalsDone}/{goalsTotal} goals done</span>
        </div>
        {groups.length === 0 && (
          <div className="aempty">
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Nothing in this range</h2>
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>{filter === "goals" ? "No goals in the next two weeks. Add one with G." : "Your next two weeks are clear. Add an event with N or type a line above."}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Commit keyHint="N" onClick={() => actions.newEvent()}>New event</Commit>
              <button type="button" className="ctl" onClick={() => actions.newGoal()}>New goal <Kbd>G</Kbd></button>
            </div>
          </div>
        )}
        {groups.map((g) => {
          const isToday = sameDay(g.dt, now);
          const title = isToday ? "Today" : sameDay(g.dt, tomorrow) ? "Tomorrow" : dowLong(g.dt.getDay());
          return (
            <section key={g.key} className="dgroup" aria-label={dayLabel(g.dt)}>
              <div className={`dh2${isToday ? " is-today" : ""}`}><span className="dd">{title}</span><span className="mono sec">{g.dt.getDate()} {monthShort(g.dt.getMonth()).toUpperCase()}</span></div>
              {g.rows.map((r) => {
                if (r.kind === "now") {
                  return <div key="now" className="nowrow" aria-hidden="true"><span className="mono p">{C.full(r.at)}</span></div>;
                }
                const i = idx++;
                const curCls = i === curIdx ? "cur" : "";
                const time = r.at < 0 ? "All day" : r.kind === "goal" && r.g.at === null ? "" : C.chip(r.at);
                if (r.kind === "ev") {
                  return (
                    <div key={`${r.event.id}:${g.key}:${r.at}`} className={`arow${r.past ? " is-past" : ""}`} role="listitem" id={`ai-${i}`} data-ai={i}>
                      <span className="mono tm">{time}</span>
                      <button type="button" className={`bd ev ${curCls}`} style={{ ["--c" as string]: colorVar(r.event.color) }} tabIndex={-1}
                        aria-label={`${r.event.title}, ${time}`} onClick={() => { setCur(i); actions.editEvent(r.event); }}>
                        <span className="evdot" style={{ ["--c" as string]: colorVar(r.event.color) }} />
                        <span className="t">{r.event.title}</span>
                        <span className="m">{r.allDay ? "" : durationText(r.end - r.at)}</span>
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={`${r.g.goal.id}:${g.key}`} className={`arow${r.past ? " is-past" : ""}`} role="listitem" id={`ai-${i}`} data-ai={i}>
                    <span className="mono tm">{time}</span>
                    <div className={`bd ${curCls}`} onClick={() => setCur(i)}>
                      <Check done={r.g.done} label={r.g.goal.title} onToggle={() => updateGoal(r.g.goal.id, toggledOn(r.g.goal, r.key))} />
                      <span className="t" style={{ textDecoration: r.g.done ? "line-through" : "none" }}>{r.g.goal.title}</span>
                      <span className="m">Goal</span>
                    </div>
                  </div>
                );
              })}
              <div className="addrow">
                <button type="button" onClick={() => (filter === "goals" ? actions.newGoal(g.key) : actions.newEvent({ date: g.key }))}>
                  <IconPlus size={13} /> Add to {title}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
