// The quick-add popover (click or drag on an empty slot) and the event
// detail popover (click an event). Both trap focus, close on Escape and
// outside clicks, and hand focus back to the grid.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { parseQuickEvent } from "@facta/calendar";
import type { CalendarEvent, EventColor } from "@/types/planner";
import { EVENT_COLORS, EVENT_COLOR_NAMES } from "@/lib/eventColors";
import { clockValue, durationText, eventMinutes, keyOf } from "@/lib/calendarData";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { IconCalendar, IconClock, IconClose, IconEdit, IconRepeat, IconTrash } from "@/components/shell/Icons";
import { Commit, Kbd, colorVar, dayLabel, type Clocks } from "./common";
import type { EventDraft } from "./types";

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    // Next tick, so the click that opened the popover doesn't close it.
    const t = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", onDown); };
  }, [ref, onOutside]);
}

const REPEAT_TEXT: Record<string, string> = {
  none: "Does not repeat", daily: "Every day", weekdays: "Every weekday", weekly: "Every week", custom: "On chosen days",
};

export function QuickAddPopover({ style, day, start, end, now, clocks: C, onClose, onAdd, onMore }: {
  style: CSSProperties;
  day: Date;
  start: number;
  end: number;
  now: Date;
  clocks: Clocks;
  onClose: () => void;
  onAdd: (event: Omit<CalendarEvent, "id" | "updatedAt">) => void;
  onMore: (draft: EventDraft) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [color, setColor] = useState<EventColor>("blue");
  const [blocked, setBlocked] = useState("");
  useDialogFocus(ref, true);
  useOutside(ref, onClose);

  // The slot is the default; a day or time typed in the title wins.
  const p = parseQuickEvent(text, now, day);
  const s = p.allDay ? null : p.start ?? start;
  const e = p.allDay ? null : p.start !== null ? p.end ?? end : end;
  const date = p.hadDate ? new Date(`${p.date}T12:00`) : day;
  const draft = (): EventDraft => ({
    title: p.title, date: keyOf(date), allDay: p.allDay, color,
    startTime: s !== null ? clockValue(s) : undefined, endTime: e !== null ? clockValue(e) : undefined,
  });
  const add = () => {
    if (!p.title) { setBlocked("Type a title first"); return; }
    onAdd({ title: p.title, date: keyOf(date), allDay: p.allDay, color, startTime: clockValue(s ?? 0), endTime: clockValue(e ?? 24 * 60), repeat: "none" });
  };

  return (
    <div ref={ref} className="pop" role="dialog" aria-label="Quick add event" style={style}
      onMouseDown={(ev) => ev.stopPropagation()}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); onClose(); }
        else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); onMore(draft()); }
      }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 14px 10px" }}>
        <label htmlFor="qa-title" className="sr-only">Event title</label>
        <input id="qa-title" className="qin" type="text" autoComplete="off" data-autofocus placeholder="Event title"
          value={text} onChange={(ev) => { setText(ev.target.value); setBlocked(""); }}
          onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); add(); } }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className="pchip"><IconCalendar size={13} /> {dayLabel(date)}</span>
          {s !== null && e !== null
            ? <><span className="pchip mono"><IconClock size={14} /> {C.range(s, e)}</span><span className="pchip mono">{durationText(e - s)}</span></>
            : <span className="pchip">All day</span>}
        </div>
        <div role="radiogroup" aria-label="Colour" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {EVENT_COLORS.map((k) => (
            <button key={k} type="button" className="swc" role="radio" aria-checked={color === k} aria-label={EVENT_COLOR_NAMES[k]}
              onClick={() => setColor(k)} style={{ ["--c" as string]: colorVar(k) }} />
          ))}
        </div>
        <div className="sr-only" aria-live="assertive">{blocked}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--border-strong)", background: "var(--surface)" }}>
        <button type="button" className="b b-quiet" onClick={() => onMore(draft())}>More options <Kbd>Ctrl Enter</Kbd></button>
        <span style={{ flex: 1 }} />
        <button type="button" className="b b-quiet" onClick={onClose}>Cancel <Kbd>Esc</Kbd></button>
        <Commit keyHint="Enter" onClick={add} disabled={!p.title}>Add event</Commit>
      </div>
    </div>
  );
}

export function DetailPopover({ event, day, style, clocks: C, onClose, onEdit, onDelete }: {
  event: CalendarEvent;
  day: Date;
  style: CSSProperties;
  clocks: Clocks;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, true);
  useOutside(ref, onClose);
  const t = eventMinutes(event);
  return (
    <div ref={ref} className="pop" role="dialog" aria-label={`Event details: ${event.title}`} tabIndex={-1} style={style}
      onMouseDown={(ev) => ev.stopPropagation()}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); onClose(); }
        else if ((ev.key === "e" || ev.key === "E") && !(ev.target instanceof HTMLInputElement)) { ev.preventDefault(); ev.stopPropagation(); onEdit(); }
        else if (ev.key === "Delete") { ev.preventDefault(); ev.stopPropagation(); onDelete(); }
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 12px 6px 16px" }}>
        <span className="evdot" style={{ ["--c" as string]: colorVar(event.color), marginTop: 7, width: 10, height: 10, borderRadius: 5 }} />
        <div style={{ flex: 1, minWidth: 0 }}><h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-.01em", overflowWrap: "anywhere" }}>{event.title}</h3></div>
        <button type="button" className="b b-icon" aria-label="Close" onClick={onClose}><IconClose /></button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "2px 16px 12px 36px" }}>
        <div className="chrow">
          <IconClock size={14} />
          <span>{dayLabel(day)} · {event.allDay ? "All day" : C.range(t.start, t.end)}</span>
          {!event.allDay && <span className="mono" style={{ color: "var(--subtle)", fontSize: 12 }}>{durationText(t.end - t.start)}</span>}
        </div>
        <div className="chrow"><IconRepeat size={14} /><span>{REPEAT_TEXT[event.repeat ?? "none"]}</span></div>
        <div className="chrow"><span className="evdot" style={{ ["--c" as string]: colorVar(event.color) }} /><span>{EVENT_COLOR_NAMES[event.color]}</span></div>
        {event.description && <div className="chrow" style={{ color: "var(--text-2)", whiteSpace: "pre-wrap" }}>{event.description}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderTop: "1px solid var(--border-strong)", background: "var(--surface)" }}>
        <button type="button" className="ctl" data-autofocus onClick={onEdit}><IconEdit size={14} /> Edit <Kbd>E</Kbd></button>
        <span style={{ flex: 1 }} />
        <button type="button" className="b b-del" onClick={onDelete}><IconTrash size={14} /> Delete <Kbd>Del</Kbd></button>
      </div>
    </div>
  );
}
