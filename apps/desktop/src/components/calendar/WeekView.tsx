// Week (CalWeek board): sticky header with the overlap marker, the all-day
// band with spanning chips, the goals row, a 24-hour grid with overlap
// columns, click or drag to create (quick-add popover), drag to move and
// resize (15-minute steps, Esc cancels), and the event detail popover.
// One tab stop: the grid. No now line, only the time pill in the gutter.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import {
  eventSpanDays, conflicts, isWeekend, layoutColumns, minutesAt, moveBlock, resizeBlock, spanLanes, weekDates, type CalendarPrefs,
} from "@facta/calendar";
import { useEvents } from "@/hooks/useEvents";
import { useGoals } from "@/hooks/useGoals";
import type { CalendarEvent, Goal } from "@/types/planner";
import { allDaySpans, clockValue, durationText, goalsOn, keyOf, splitDay, toggledOn } from "@/lib/calendarData";
import { IconWarn } from "@/components/shell/Icons";
import { Check, Commit, Kbd, addDays, clocks, colorVar, dayLabel, dayLabelLong, deleteEventWithUndo, dowShort, sameDay, useDeletingEvents } from "./common";
import { DetailPopover, QuickAddPopover } from "./Popovers";
import type { CalendarActions } from "./types";

const H = 52;
const G = 56;
const GOAL_MIN = Math.ceil((22 / H) * 60);
const SLOTS = 48;

type Drag =
  | { kind: "create"; key: string; a: number; b: number; kb?: boolean }
  | { kind: "move" | "start" | "end"; event: CalendarEvent; fromKey: string; start: number; end: number; grab: number; toKey: string; s: number; e: number; moved: boolean; x0: number; y0: number };

interface Props {
  anchor: Date;
  now: Date;
  prefs: CalendarPrefs;
  actions: CalendarActions;
  onAnchor: (d: Date) => void;
  onOpenDay: (d: Date) => void;
  /** Announced to screen readers and shown as a toast. */
  say: (text: string) => void;
}

export default function WeekView({ anchor, now, prefs, actions, onAnchor, onOpenDay, say }: Props) {
  const { getEventsForDate, updateEvent, addEvent, deleteEvent } = useEvents();
  const { goals, updateGoal } = useGoals();
  const deleting = useDeletingEvents();
  const C = clocks(prefs);
  const days = useMemo(() => weekDates(anchor, prefs.weekStart), [anchor, prefs.weekStart]);
  const keys = days.map(keyOf);
  const todayIdx = days.findIndex((d) => sameDay(d, now));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const curIdx = Math.max(0, days.findIndex((d) => sameDay(d, anchor)));

  const [slot, setSlot] = useState(() => Math.min(SLOTS - 1, Math.floor(nowMin / 30)));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [qa, setQa] = useState<{ key: string; a: number; b: number } | null>(null);
  const [detail, setDetail] = useState<{ key: string; id: string; at?: number } | null>(null);
  const scRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  const eventsOn = useCallback(
    (key: string) => getEventsForDate(key).filter((e) => !deleting.has(e.id)),
    [getEventsForDate, deleting],
  );

  // ---- data per day ----
  const perDay = keys.map((key) => {
    const { timed } = splitDay(eventsOn(key), key);
    const gs = goalsOn(goals, key);
    return { key, timed, goals: gs };
  });
  const empty = perDay.every((d) => d.timed.length === 0 && d.goals.length === 0) && keys.every((k) => eventsOn(k).length === 0);

  const spans = spanLanes(allDaySpans(keys, eventsOn), keys);
  const lanes = Math.max(1, spans.lanes);
  const bandH = 12 + lanes * 25;
  const stickyH = 56 + bandH + 54;

  const toggleGoal = (g: Goal, key: string) => {
    const patch = toggledOn(g, key);
    updateGoal(g.id, patch);
  };

  // ---- initial scroll: 08:00, or two hours before now when now is lower ----
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    const el = scRef.current;
    if (!el || scrolled.current) return;
    const go = () => {
      if (el.clientHeight === 0) return false;
      const visibleH = el.clientHeight - stickyH;
      const at8 = 8 * H - 6;
      const nowY = (nowMin / 60) * H;
      el.scrollTop = todayIdx >= 0 && nowY > at8 + visibleH - H ? Math.max(0, nowY - 2 * H) : at8;
      scrolled.current = true;
      return true;
    };
    if (go()) return;
    const ro = new ResizeObserver(() => { if (go()) ro.disconnect(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stickyH, nowMin, todayIdx]);

  /** Keeps a half-hour row in view below the sticky header. */
  const ensureVisible = (s: number) => {
    const el = scRef.current;
    if (!el) return;
    const sticky = stickyRef.current?.offsetHeight ?? stickyH;
    const y = (s * H) / 2;
    if (y < el.scrollTop + 8) el.scrollTop = Math.max(0, y - 8);
    else if (sticky + y + H / 2 > el.scrollTop + el.clientHeight - 8) el.scrollTop = sticky + y + H / 2 - el.clientHeight + 8;
  };

  // ---- pointer maths ----
  const pointAt = (x: number, y: number) => {
    const cols = colsRef.current;
    if (!cols) return null;
    const r = cols.getBoundingClientRect();
    const idx = Math.max(0, Math.min(6, Math.floor(((x - r.left) / r.width) * 7)));
    return { idx, min: minutesAt(y - r.top, H) };
  };
  const slotAt = (y: number) => {
    const p = pointAt(0, y);
    return p ? Math.max(0, Math.min(SLOTS - 1, Math.floor(p.min / 30))) : 0;
  };

  // Window listeners while a pointer drag is live. The handlers read the
  // drag from a ref so side effects run once, outside state updaters.
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const pointerDrag = !!drag && !(drag.kind === "create" && drag.kb);
  useEffect(() => {
    if (!pointerDrag) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.kind === "create") {
        const b = slotAt(e.clientY);
        if (b !== d.b) setDrag({ ...d, b });
        return;
      }
      const moved = d.moved || Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 4;
      if (!moved) return;
      const p = pointAt(e.clientX, e.clientY);
      if (!p) return;
      if (d.kind === "move") {
        const r = moveBlock(d.start, d.end, p.min - d.grab - d.start);
        // A repeating event moves in time only: its days come from the rule.
        const repeating = (d.event.repeat ?? "none") !== "none";
        setDrag({ ...d, moved, s: r.start, e: r.end, toKey: repeating ? d.fromKey : keys[p.idx] });
      } else {
        const r = resizeBlock(d.start, d.end, d.kind, p.min);
        setDrag({ ...d, moved, s: r.start, e: r.end });
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (d.kind === "create") {
        const lo = Math.min(d.a, d.b);
        const hi = Math.max(d.a, d.b);
        setDetail(null);
        setQa({ key: d.key, a: lo, b: hi === lo ? lo + 1 : hi });
        return;
      }
      if (!d.moved) {
        setDetail({ key: d.fromKey, id: d.event.id });
        return;
      }
      const repeating = (d.event.repeat ?? "none") !== "none";
      const patch: Partial<CalendarEvent> = { startTime: clockValue(d.s), endTime: clockValue(d.e) };
      if (!repeating) { patch.date = d.toKey; if (d.event.endDate) patch.endDate = d.toKey; }
      updateEvent(d.event.id, patch);
      say(`${d.kind === "move" ? "Moved" : "Resized"} · ${d.event.title} · ${dayLabel(new Date(`${d.toKey}T12:00`))} · ${C.range(d.s, d.e)}${repeating ? " · every repeat" : ""}`);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDrag(null); }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
    // The handlers read everything live through refs and the latest render.
  }, [pointerDrag]); // eslint-disable-line react-hooks/exhaustive-deps

  const closePops = () => { setQa(null); setDetail(null); };
  const focusGrid = () => scRef.current?.focus({ preventScroll: true });

  // ---- keyboard ----
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== scRef.current) return;
    const k = e.key;
    const pend = drag && drag.kind === "create" && drag.kb ? drag : null;
    if (e.shiftKey && (k === "ArrowDown" || k === "ArrowUp")) {
      e.preventDefault();
      if (pend) {
        const nb = k === "ArrowDown" ? Math.min(SLOTS - 1, pend.b + 1) : Math.max(pend.a, pend.b - 1);
        setDrag({ ...pend, b: nb });
      }
      return;
    }
    if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      onAnchor(addDays(anchor, k === "ArrowLeft" ? -1 : 1));
      if (pend) setDrag(null);
      return;
    }
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      const s = k === "ArrowUp" ? Math.max(0, slot - 1) : Math.min(SLOTS - 1, slot + 1);
      setSlot(s);
      ensureVisible(s);
      if (pend) setDrag(null);
      return;
    }
    if (k === "Escape") {
      if (drag || qa || detail) { e.preventDefault(); setDrag(null); closePops(); }
      return;
    }
    if (k === "Enter") {
      e.preventDefault();
      const key = keys[curIdx];
      const t0 = slot * 30;
      if (pend) {
        const lo = Math.min(pend.a, pend.b);
        setQa({ key: pend.key, a: lo, b: Math.max(pend.a, pend.b) });
        setDrag(null);
        return;
      }
      const gg = perDay[curIdx].goals.find((g) => g.at !== null && g.at >= t0 && g.at < t0 + 30);
      if (gg) {
        toggleGoal(gg.goal, key);
        say(`${gg.done ? "Not done" : "Done"} · ${gg.goal.title}`);
        return;
      }
      const hit = perDay[curIdx].timed.find((t) => t.start <= t0 && t.end > t0);
      if (hit) { setDetail({ key, id: hit.event.id, at: t0 }); return; }
      setDrag({ kind: "create", key, a: slot, b: Math.min(SLOTS - 1, slot + 1), kb: true });
    }
  };

  // ---- columns ----
  const MON = days[3];
  const pending = drag && drag.kind !== "create" && drag.moved ? drag : null;
  const cols = days.map((dt, i) => {
    const key = keys[i];
    const isToday = i === todayIdx;
    const isPastDay = todayIdx >= 0 ? i < todayIdx : dt < now;
    type Item =
      | { kind: "ev"; id: string; event: CalendarEvent; start: number; end: number; origin?: boolean; lift?: boolean }
      | { kind: "goal"; id: string; goal: Goal; done: boolean; start: number; end: number };
    const items: Item[] = [];
    for (const t of perDay[i].timed) {
      const origin = !!pending && pending.event.id === t.event.id && pending.fromKey === key;
      items.push({ kind: "ev", id: t.id, event: t.event, start: t.start, end: Math.max(t.end, t.start + GOAL_MIN), origin });
    }
    if (pending && pending.toKey === key) {
      items.push({ kind: "ev", id: `lift:${pending.event.id}`, event: pending.event, start: pending.s, end: Math.max(pending.e, pending.s + GOAL_MIN), lift: true });
    }
    for (const g of perDay[i].goals) {
      if (g.at === null) continue;
      items.push({ kind: "goal", id: g.goal.id, goal: g.goal, done: g.done, start: g.at, end: g.at + GOAL_MIN });
    }
    const laid = layoutColumns(items);
    const realTimed = perDay[i].timed.filter((t) => !(pending && pending.event.id === t.event.id && pending.fromKey === key))
      .map((t) => ({ id: t.id, start: t.start, end: t.end }));
    if (pending && pending.toKey === key) realTimed.push({ id: `lift:${pending.event.id}`, start: pending.s, end: pending.e });
    const clash = conflicts(realTimed);
    return { key, dt, isToday, isPastDay, laid, clash, weekend: isWeekend(dt.getDay(), prefs) };
  });

  // ---- render helpers ----
  const evStyle = (top: number, h: number, col: number, cc: number, color: string): CSSProperties => ({
    top, height: h, left: `calc(${(col / cc) * 100}% + 2px)`, width: `calc(${100 / cc}% - ${cc > 1 ? 5 : 4}px)`,
    ["--c" as string]: color,
  });

  const startEventDrag = (e: ReactMouseEvent, event: CalendarEvent, key: string, start: number, end: number, kind: "move" | "start" | "end") => {
    if (e.button !== 0) return;
    if (eventSpanDays(event)) { e.preventDefault(); e.stopPropagation(); setDetail({key,id:event.id,at:pointAt(e.clientX,e.clientY)?.min ?? start}); return; }
    e.stopPropagation();
    e.preventDefault();
    const p = pointAt(e.clientX, e.clientY);
    setQa(null);
    setDetail(null);
    setDrag({ kind, event, fromKey: key, start, end, grab: p ? p.min - start : 0, toKey: key, s: start, e: end, moved: false, x0: e.clientX, y0: e.clientY });
  };

  const ghostFor = (key: string) => {
    let r: { a: number; b: number } | null = null;
    if (drag && drag.kind === "create" && drag.key === key) r = { a: Math.min(drag.a, drag.b), b: Math.max(drag.a, drag.b) };
    if (qa && qa.key === key) r = { a: qa.a, b: qa.b };
    if (!r) return null;
    const hi = drag && drag.kind === "create" && drag.key === key && !drag.kb && drag.a === drag.b ? r.a + 1 : r.b;
    return { top: (r.a * H) / 2 + 1, height: ((hi - r.a + 1) * H) / 2 - 2, label: C.chipRange(r.a * 30, (hi + 1) * 30) };
  };

  const nowTop = (nowMin / 60) * H;
  const hasNow = todayIdx >= 0;
  const weekNo = (() => {
    const t = new Date(Date.UTC(MON.getFullYear(), MON.getMonth(), MON.getDate()));
    const n = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - n);
    return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  })();

  const detailEvent = detail ? eventsOn(detail.key).find((e) => e.id === detail.id) : undefined;
  const detailIdx = detail ? keys.indexOf(detail.key) : -1;
  const colHoriz = (i: number): CSSProperties => (i <= 3
    ? { left: `calc(${G}px + (100% - ${G}px) * ${((i + 1) / 7).toFixed(5)} + 8px)` }
    : { right: `calc((100% - ${G}px) * ${((7 - i) / 7).toFixed(5)} + 8px)` });

  const pendKb = drag && drag.kind === "create" && drag.kb ? drag : null;
  const liveText = `${dayLabel(days[curIdx])}, ${C.full(slot * 30)}${pendKb ? `, new event ${C.range(Math.min(pendKb.a, pendKb.b) * 30, (Math.max(pendKb.a, pendKb.b) + 1) * 30)}. Shift plus arrow down or up changes the length, Enter confirms, Escape cancels` : ""}`;

  return (
    <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      <div
        ref={scRef}
        className="wk-scroll"
        role="grid"
        tabIndex={0}
        aria-label={`Week of ${dayLabelLong(days[0])}. Arrow keys move between days and half-hours, Enter opens an event, toggles a timed goal or starts a new event. Question mark lists shortcuts.`}
        onKeyDown={onKey}
      >
        <div className="stk" ref={stickyRef}>
          <div className="g7">
            <div className="gut" style={{ alignItems: "center", padding: "0 8px 0 0" }}>W{weekNo}</div>
            {cols.map((c) => (
              <div key={c.key} role="columnheader" aria-label={`${dayLabelLong(c.dt)}${c.isToday ? ", today" : ""}${c.clash.ids.size ? ", two events overlap" : ""}`}
                className={`hc${c.isToday ? " is-today" : ""}${c.isPastDay ? " is-past" : ""}${c.weekend ? " is-wk" : ""}`}>
                <span className="mono dw">{dowShort(c.dt.getDay())}</span>
                <button type="button" className="dn dn-btn" aria-label={`Open ${dayLabelLong(c.dt)}`} onClick={() => onOpenDay(c.dt)}>{c.dt.getDate()}</button>
                {c.clash.ids.size > 0 && <span className="warn" title="Two events overlap"><IconWarn size={12} /> Overlap</span>}
              </div>
            ))}
          </div>
          <div className="band" style={{ gridTemplateRows: `repeat(${lanes}, 22px)` }}>
            <div className="gut" style={{ gridRow: `1 / span ${lanes}` }}>ALL DAY</div>
            {spans.segments.length === 0 && (
              <span style={{ gridColumn: "2 / span 7", gridRow: 1, display: "flex", alignItems: "center", paddingLeft: 12, fontSize: 12, color: "var(--subtle)" }}>All-day events appear here</span>
            )}
            {spans.segments.map((s) => (
              <button key={s.item.id} type="button"
                className={`ad${s.contL ? " cl" : ""}${s.contR ? " cr" : ""}`}
                title={`${s.item.event.title}, all day`}
                style={{ ["--c" as string]: colorVar(s.item.event.color), gridColumn: `${s.from + 2} / span ${s.to - s.from + 1}`, gridRow: s.lane + 1 }}
                onClick={() => setDetail({ key: s.item.first < keys[0] ? keys[0] : s.item.first, id: s.item.event.id })}>
                <span className="ee" aria-hidden="true" /><span className="at">{s.item.event.title}</span>
              </button>
            ))}
          </div>
          <div className="goalrow">
            <div className="gut" style={{ paddingTop: 8 }}>GOALS</div>
            {cols.map((c, i) => {
              const gs = perDay[i].goals.filter((g) => g.at === null);
              const shown = gs.length > 2 ? gs.slice(0, 1) : gs.slice(0, 2);
              return (
                <div key={c.key} className={`gcell${c.weekend ? " is-wk" : ""}`}>
                  {shown.map((g) => (
                    <div className="gl" key={g.goal.id}>
                      <Check done={g.done} label={`${g.goal.title}, ${dayLabel(c.dt)}`} onToggle={() => toggleGoal(g.goal, c.key)} tabIndex={0} />
                      <span className="gt" style={{ textDecoration: g.done ? "line-through" : "none" }}>{g.goal.title}</span>
                    </div>
                  ))}
                  {gs.length > 2 && (
                    <button type="button" className="gl more mono gl-more" onClick={() => onOpenDay(c.dt)}>+{gs.length - 1} more</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="gbody" style={{ height: 24 * H }}>
          {Array.from({ length: 23 }, (_, h) => <div key={`l${h}`} className="hl" style={{ top: (h + 1) * H }} />)}
          {Array.from({ length: 24 }, (_, h) => <div key={`m${h}`} className="hl half" style={{ top: h * H + H / 2 }} />)}
          {Array.from({ length: 24 }, (_, h) => (
            <span key={`h${h}`} className="mono hlab" style={{ top: h === 0 ? 2 : h * H - 7, opacity: hasNow && Math.abs(h * H - nowTop) < 14 ? 0 : 1 }}>{C.hour(h * 60)}</span>
          ))}
          <div className="cols" ref={colsRef}>
            {cols.map((c) => {
              const ghost = ghostFor(c.key);
              const ovl = c.clash.first;
              const lift = pending && pending.toKey === c.key ? pending : null;
              return (
                <div
                  key={c.key}
                  className={`col${c.weekend ? " is-wk" : ""}`}
                  aria-label={`${dayLabelLong(c.dt)}${c.isToday ? ", today" : ""}`}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    const s = slotAt(e.clientY);
                    onAnchor(c.dt);
                    setSlot(s);
                    closePops();
                    setDrag({ kind: "create", key: c.key, a: s, b: s });
                    focusGrid();
                  }}
                >
                  {c.laid.map((it) => {
                    if (it.kind === "goal") {
                      const top = (it.start / 60) * H + 1;
                      const past = c.isPastDay || (c.isToday && it.start < nowMin);
                      return (
                        <div key={`g:${it.id}`} className={`gc${it.done ? " is-done" : ""}${past && !it.done ? " is-past" : ""}`}
                          style={evStyle(top, 22, it.col, it.cols, "var(--text)")} onMouseDown={(e) => e.stopPropagation()}>
                          <Check done={it.done} label={it.goal.title} onToggle={() => toggleGoal(it.goal, c.key)} tabIndex={0} />
                          <span className="gt">{it.goal.title}</span><span className="em">{C.chip(it.start)}</span>
                        </div>
                      );
                    }
                    const real = perDay[days.indexOf(c.dt)].timed.find((t) => t.id === it.id);
                    const s = it.lift ? lift!.s : real ? real.start : it.start;
                    const en = it.lift ? lift!.e : real ? real.end : it.end;
                    const top = (s / 60) * H + 1;
                    const h = Math.max(22, ((en - s) / 60) * H - 2);
                    const cc = it.cols;
                    const row = h < 34;
                    const narrow = cc >= 2;
                    const past = !it.lift && (c.isPastDay || (c.isToday && en <= nowMin));
                    const clashing = c.clash.ids.has(it.id);
                    const time = row && narrow ? "" : row ? C.chip(s) : C.chipRange(s, en);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        tabIndex={it.lift || it.origin ? -1 : 0}
                        className={`ev${row ? " row" : ""}${past ? " is-past" : ""}${cc >= 3 ? " dense" : ""}${it.origin ? " is-origin" : ""}${it.lift ? " is-lift" : ""}`}
                        style={evStyle(top, h, it.col, cc, colorVar(it.event.color))}
                        aria-label={`${it.event.title}, ${dayLabel(c.dt)}, ${C.range(s, en)}${clashing ? ", overlaps another event" : ""}${past ? ", past" : ""}`}
                        title={`${it.event.title}, ${C.range(s, en)}`}
                        onMouseDown={(e) => !it.lift && real && startEventDrag(e, it.event, c.key, real.start, real.end, "move")}
                        onClick={(e) => { e.stopPropagation(); if (e.detail === 0 && !it.lift) setDetail({ key: c.key, id: it.event.id, at: s }); }}
                      >
                        <span className="ee" aria-hidden="true" />
                        <span className="in"><span className={narrow ? "et wrap" : "et"}>{it.event.title}</span>{time && <span className="em">{time}</span>}</span>
                        {clashing && !it.lift && cc > 1 && h > 28 && <span className="ci" title="Overlaps another event"><IconWarn size={12} /></span>}
                        {it.lift && <><span className="grip" style={{ top: 3 }} /><span className="grip" style={{ bottom: 3 }} /></>}
                        {!it.lift && !it.origin && real && !eventSpanDays(it.event) && (
                          <>
                            <span className="rsz rsz-t" aria-hidden="true" onMouseDown={(e) => startEventDrag(e, it.event, c.key, real.start, real.end, "start")} />
                            <span className="rsz rsz-b" aria-hidden="true" onMouseDown={(e) => startEventDrag(e, it.event, c.key, real.start, real.end, "end")} />
                          </>
                        )}
                      </button>
                    );
                  })}
                  {ghost && (
                    <div className="ghost" style={{ top: ghost.top, height: ghost.height }}>
                      <span className="gt1">New event</span><span className="gt2">{ghost.label}</span>
                    </div>
                  )}
                  {ovl && c.clash.ids.size > 0 && (
                    <div className="ovl" style={{ top: (ovl.start / 60) * H, height: ((ovl.end - ovl.start) / 60) * H }}>
                      <span><IconWarn size={12} /> Overlap {durationText(ovl.end - ovl.start)}</span>
                    </div>
                  )}
                  {lift && (
                    <div className="tipP" style={{ left: 8, top: (lift.s / 60) * H - 30 }}>{dayLabel(c.dt)} · {C.range(lift.s, lift.e)}</div>
                  )}
                </div>
              );
            })}
          </div>

          {hasNow && <span className="mono nowP" style={{ top: nowTop - 9 }} aria-hidden="true">{C.full(nowMin)}</span>}
          {!drag && !qa && !detail && (
            <div className="curs" style={{ left: `calc(${G}px + (100% - ${G}px) * ${(curIdx / 7).toFixed(5)} + 1px)`, width: `calc((100% - ${G}px) / 7 - 2px)`, top: (slot * H) / 2, height: H / 2 }} />
          )}

          {qa && keys.includes(qa.key) && (
            <QuickAddPopover
              style={{ ...colHoriz(keys.indexOf(qa.key)), top: Math.max(8, (qa.a * H) / 2 - 20), width: 348 }}
              viewportRef={scRef}
              stickyRef={stickyRef}
              slotBounds={{ start: (qa.a * H) / 2, end: ((qa.b + 1) * H) / 2 }}
              day={days[keys.indexOf(qa.key)]}
              start={qa.a * 30}
              end={(qa.b + 1) * 30}
              now={now}
              clocks={C}
              onClose={() => { setQa(null); focusGrid(); }}
              onAdd={(ev) => { addEvent(ev); setQa(null); focusGrid(); say(`Event added · ${ev.title} · ${dayLabel(new Date(`${ev.date}T12:00`))}${ev.allDay ? " · all day" : ` · ${ev.startTime}–${ev.endTime}`}`); }}
              onMore={(draft) => { setQa(null); actions.newEvent(draft); }}
            />
          )}

          {detailEvent && detailIdx >= 0 && (() => {
            const t = splitDay([detailEvent], detail!.key).timed[0];
            return (
              <DetailPopover
                event={detailEvent} at={detail?.at}
                viewportRef={scRef} stickyRef={stickyRef} slotBounds={{start:t ? t.start / 60 * H : 0,end:t ? t.end / 60 * H : 0}}
                day={days[detailIdx]}
                clocks={C}
                style={{ ...colHoriz(detailIdx), top: Math.max(8, t ? (t.start / 60) * H - 12 : 8), width: 330 }}
                onClose={() => { setDetail(null); focusGrid(); }}
                onEdit={() => { setDetail(null); actions.editEvent(detailEvent); }}
                onDelete={() => { setDetail(null); deleteEventWithUndo(detailEvent, deleteEvent); focusGrid(); }}
              />
            );
          })()}

        </div>
      </div>
      {empty && !drag && !qa && !detail && (
        <div className="empty-card">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>A clear week</h2>
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>Click a time slot, drag across it, or type a line and press Enter.</span>
          </div>
          <div className="crow"><span>Quick add</span><span className="mono" style={{ fontSize: 12, color: "var(--text)" }}>Lunch with Alex Fri 1pm</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Commit keyHint="N" onClick={() => actions.newEvent({ date: keys[curIdx] })}>New event</Commit>
            <button type="button" className="ctl" onClick={() => actions.newGoal(keys[curIdx])}>New goal <Kbd>G</Kbd></button>
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite">{liveText}</div>
    </section>
  );
}
