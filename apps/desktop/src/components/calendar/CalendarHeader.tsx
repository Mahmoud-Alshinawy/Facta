import { useState } from "react";
import { IconLeft, IconPlus, IconRight } from "@/components/shell/Icons";
import { Commit } from "./common";
import type { CalendarView } from "./types";

const VIEWS: [CalendarView, string, string][] = [["day", "Day", "1"], ["week", "Week", "2"], ["month", "Month", "3"], ["agenda", "Agenda", "4"]];

export const QUICK_ADD_ID = "qa-in";

interface Props {
  title: string;
  subtitle: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  view: CalendarView;
  onView: (v: CalendarView) => void;
  onNewEvent: () => void;
  /** Returns true when the text was used (added, or handed to the dialog). */
  onQuickAdd: (text: string) => boolean;
  quickAddVisible?: boolean;
}

export default function CalendarHeader(p: Props) {
  const [q, setQ] = useState("");
  return (
    <header className="hd">
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 150 }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--subtle)", letterSpacing: ".06em" }}>{p.subtitle}</span>
        <h1>{p.title}</h1>
      </div>
      <div role="group" aria-label="Navigate" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button type="button" className="ctl ctl-icon" aria-label={p.prevLabel} title={`${p.prevLabel} (PgUp)`} onClick={p.onPrev}><IconLeft /></button>
        <button type="button" className="ctl" title="Jump to today (T)" onClick={p.onToday}>Today <span className="kbd">T</span></button>
        <button type="button" className="ctl ctl-icon" aria-label={p.nextLabel} title={`${p.nextLabel} (PgDn)`} onClick={p.onNext}><IconRight /></button>
      </div>
      <div className={`qa${p.quickAddVisible ? "" : " hide-s"}`}>
        <label htmlFor={QUICK_ADD_ID} className="sr-only">Quick add</label>
        <span style={{ position: "absolute", left: 11, top: 10, color: "var(--subtle)", display: "flex" }}><IconPlus size={15} stroke={2.2} /></span>
        <input
          id={QUICK_ADD_ID}
          type="text"
          autoComplete="off"
          placeholder="Quick add: Lunch with Alex Fri 1pm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (q.trim() && p.onQuickAdd(q)) setQ("");
            } else if (e.key === "Escape") {
              e.preventDefault();
              setQ("");
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="kbd" style={{ position: "absolute", right: 8, top: 9 }}>Q</span>
      </div>
      <div style={{ flex: 1 }} />
      <div className="seg" role="radiogroup" aria-label="Calendar view">
        {VIEWS.map(([id, name, key]) => (
          <button key={id} type="button" role="radio" aria-checked={p.view === id} title={`${name} (${key})`} onClick={() => p.onView(id)}>
            <span>{name}</span><span className="mono hide-s">{key}</span>
          </button>
        ))}
      </div>
      <Commit keyHint="N" hideKeyNarrow onClick={p.onNewEvent}><IconPlus />New event</Commit>
    </header>
  );
}
