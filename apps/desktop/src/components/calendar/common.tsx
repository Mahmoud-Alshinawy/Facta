// Small pieces every calendar view uses: the checkbox, the commit button,
// the time formatters bound to the user's prefs, and pending deletes.

import { useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { formatClock, formatRange, type CalendarPrefs } from "@facta/calendar";
import { LetGoStore } from "@/lib/letGo";
import type { CalendarEvent, EventColor } from "@/types/planner";
import { IconCheck } from "@/components/shell/Icons";

export function Check({ done, label, onToggle, tabIndex = -1, className = "cb" }: {
  done: boolean; label: string; onToggle: () => void; tabIndex?: number; className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      role="checkbox"
      tabIndex={tabIndex}
      aria-checked={done}
      aria-label={`${done ? "Mark not done" : "Mark done"}: ${label}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      {done && <IconCheck size={10} />}
    </button>
  );
}

/** The slanted commit button: label, then the key that does the same. */
export function Commit({ children, keyHint, onClick, type = "button", disabled, danger, className = "", hideKeyNarrow }: {
  children: ReactNode; keyHint?: string; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean; danger?: boolean; className?: string;
  /** Drop the key chip on narrow windows, as the toolbar boards do. */
  hideKeyNarrow?: boolean;
}) {
  return (
    <button
      type={type}
      className={`b b-commit ${danger ? "b-danger" : "b-primary"} ${className}`}
      aria-disabled={disabled ? "true" : undefined}
      onClick={onClick}
    >
      <span className="lab">{children}</span>
      {keyHint && <span className={`key${hideKeyNarrow ? " hide-s" : ""}`} aria-hidden="true">{keyHint}</span>}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export const colorVar = (c: EventColor) => `var(--event-${c})`;

/** Time formatters for the current prefs, in the boards' three styles. */
export function clocks(prefs: Pick<CalendarPrefs, "timeFormat">) {
  const tf = prefs.timeFormat;
  return {
    /** 09:05 · 9:05 AM */
    full: (m: number) => formatClock(m, tf, "full"),
    /** 09:00 · 9 AM */
    hour: (m: number) => formatClock(m, tf, "hour"),
    /** 09:05 · 9:05a */
    chip: (m: number) => formatClock(m, tf, "short"),
    range: (a: number, b: number) => formatRange(a, b, tf, "full"),
    chipRange: (a: number, b: number) => formatRange(a, b, tf, "short"),
  };
}

export type Clocks = ReturnType<typeof clocks>;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const dayLabel = (d: Date) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
export const dayLabelLong = (d: Date) => `${DOW_LONG[d.getDay()]} ${d.getDate()} ${MON_LONG[d.getMonth()]}`;
export const monthLong = (m: number) => MON_LONG[m];
export const monthShort = (m: number) => MON[m];
export const dowShort = (n: number) => DOW[n].toUpperCase();
export const dowLong = (n: number) => DOW_LONG[n];

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---- deleting an event with Undo ---------------------------------------------

const UNDO_MS = 5_000;
export const eventDeletes = new LetGoStore();

export function useDeletingEvents(): ReadonlySet<string> {
  return useSyncExternalStore(eventDeletes.subscribe, eventDeletes.getHidden);
}

/** Hides the event behind an Undo toast and deletes it when the toast closes. */
export function deleteEventWithUndo(event: CalendarEvent, deleteEvent: (id: string) => void) {
  eventDeletes.letGo(event.id, {
    deleteGoal: deleteEvent,
    toast: {
      show: ({ onUndo, onClosed }) => {
        toast("Event deleted", {
          description: event.title,
          duration: UNDO_MS,
          dismissible: false,
          action: { label: "Undo", onClick: onUndo },
          onAutoClose: onClosed,
          onDismiss: onClosed,
        });
      },
    },
  });
}
