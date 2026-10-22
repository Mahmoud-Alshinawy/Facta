// The keyboard cheat sheet (?) and the hint bar along the bottom. The rows
// are the CW-cheat and footer boards, word for word.

import { Fragment, useEffect, useRef } from "react";
import { IconClose } from "./Icons";
import { useDialogFocus } from "@/hooks/useDialogFocus";

export type ShortcutContext = "calendar" | "goals" | "today";
export type CalendarView = "day" | "week" | "month" | "agenda";

interface Row { what: string; keys: string[] }
interface Group { name: string; rows: Row[] }

const GENERAL: Group = {
  name: "GENERAL",
  rows: [
    { what: "Search everything", keys: ["Ctrl", "K"] },
    { what: "This cheat sheet", keys: ["?"] },
    { what: "Hide the mini calendar", keys: ["["] },
  ],
};

export const CHEAT_GROUPS: Record<ShortcutContext, { label: string; groups: Group[] }> = {
  calendar: {
    label: "Calendar",
    groups: [
      { name: "VIEWS", rows: [{ what: "Day", keys: ["1"] }, { what: "Week", keys: ["2"] }, { what: "Month", keys: ["3"] }, { what: "Agenda", keys: ["4"] }] },
      { name: "NAVIGATE", rows: [{ what: "Previous or next day", keys: ["←", "→"] }, { what: "Up or down 30 minutes", keys: ["↑", "↓"] }, { what: "Previous or next week", keys: ["PgUp", "PgDn"] }, { what: "Jump to today", keys: ["T"] }] },
      { name: "CREATE", rows: [{ what: "New event", keys: ["N"] }, { what: "New goal", keys: ["G"] }, { what: "Quick add", keys: ["Q"] }, { what: "Start a slot at the cursor", keys: ["Enter"] }, { what: "Stretch the new slot", keys: ["Shift", "↑ ↓"] }] },
      { name: "EDIT", rows: [{ what: "Open event or toggle goal", keys: ["Enter"] }, { what: "Edit the open event", keys: ["E"] }, { what: "Delete the open event", keys: ["Del"] }, { what: "Cancel a drag or close", keys: ["Esc"] }] },
      GENERAL,
    ],
  },
  goals: {
    label: "Goals",
    groups: [
      { name: "MOVE", rows: [{ what: "Next or previous goal", keys: ["↓", "↑"] }, { what: "Same, without arrows", keys: ["J", "K"] }, { what: "First or last goal", keys: ["Home", "End"] }, { what: "List, filters, add row", keys: ["Tab"] }] },
      { name: "EDIT", rows: [{ what: "Toggle done", keys: ["X"] }, { what: "Edit the goal", keys: ["E"] }, { what: "New goal", keys: ["N"] }] },
      { name: "GENERAL", rows: [GENERAL.rows[0], GENERAL.rows[1]] },
    ],
  },
  today: {
    label: "Today",
    groups: [
      { name: "CREATE", rows: [{ what: "New goal", keys: ["N"] }] },
      { name: "GENERAL", rows: [GENERAL.rows[0], GENERAL.rows[1]] },
    ],
  },
};

export function CheatSheet({ context, onClose }: { context: ShortcutContext; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const c = CHEAT_GROUPS[context];
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="cs-h" tabIndex={-1}
        style={{ width: 760, maxWidth: "calc(100% - 40px)", maxHeight: "calc(100% - 40px)" }}
        onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid var(--border-strong)" }}>
          <h2 id="cs-h" style={{ margin: 0, fontSize: 18, fontWeight: 600, flex: 1 }}>Keyboard shortcuts</h2>
          <span style={{ fontSize: 12, color: "var(--subtle)" }}>{c.label}</span>
          <button type="button" className="b b-icon" aria-label="Close shortcuts" onClick={onClose}><IconClose /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "22px 40px", padding: "20px 22px 22px", overflowY: "auto" }}>
          {c.groups.map((g) => (
            <section key={g.name} aria-label={g.name}>
              <div className="sec" style={{ marginBottom: 6 }}>{g.name}</div>
              {g.rows.map((r) => (
                <div className="crow" key={r.what}>
                  <span>{r.what}</span>
                  <span className="ks">{r.keys.map((k) => <span className="kbd" key={k}>{k}</span>)}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

type Hint = { keys: string[]; label: string; sep?: string };

const FOOT: Record<CalendarView | "goals", Hint[]> = {
  week: [
    { keys: ["←", "→"], label: "day" }, { keys: ["↑", "↓"], label: "30 min" }, { keys: ["Shift", "↑", "↓"], label: "stretch a new slot" },
    { keys: ["Enter"], label: "open, toggle or create" }, { keys: ["N"], label: "event" }, { keys: ["G"], label: "goal" }, { keys: ["Q"], label: "quick add" },
  ],
  day: [
    { keys: ["←", "→"], label: "day" }, { keys: ["↑", "↓"], label: "30 min" }, { keys: ["Enter"], label: "open or toggle" },
    { keys: ["N"], label: "event" }, { keys: ["G"], label: "goal" },
  ],
  month: [
    { keys: ["←", "→"], label: "day" }, { keys: ["↑", "↓"], label: "week" }, { keys: ["PgUp", "PgDn"], label: "month" },
    { keys: ["Enter"], label: "open day" }, { keys: ["N"], label: "event" },
  ],
  agenda: [
    { keys: ["↑", "↓"], label: "item" }, { keys: ["Enter"], label: "open or toggle" }, { keys: ["F"], label: "filter" }, { keys: ["N"], label: "event" },
  ],
  goals: [
    { keys: ["↑", "↓", "J", "K"], label: "move", sep: "or" }, { keys: ["X"], label: "toggle done" }, { keys: ["E"], label: "edit" }, { keys: ["N"], label: "new goal" },
  ],
};

export function FootHints({ view }: { view: CalendarView | "goals" }) {
  return (
    <div className="foot" aria-label="Keyboard hints">
      {FOOT[view].map((h) => (
        <span className="k" key={h.label}>
          {h.sep
            ? <>{h.keys.slice(0, 2).map((k) => <span className="kbd" key={k}>{k}</span>)}{h.sep}{h.keys.slice(2).map((k) => <span className="kbd" key={k}>{k}</span>)}</>
            : h.keys.map((k) => <Fragment key={k}><span className="kbd">{k}</span></Fragment>)}
          {h.label}
        </span>
      ))}
      <span style={{ flex: 1 }} />
      {view === "goals"
        ? <span className="k"><span className="kbd">Tab</span>list, filters, add row</span>
        : <span className="k"><span className="kbd">?</span>all shortcuts</span>}
    </div>
  );
}
