import type { ReactNode } from "react";
import { createContext, createElement, useContext, useCallback, useMemo, useSyncExternalStore } from "react";
import { getDay, parseISO } from "date-fns";
import { useSyncEngine } from "@/hooks/useSync";
import type { CalendarEvent, EventColor, EventRepeat } from "@/types/planner";

export type { CalendarEvent, EventColor, EventRepeat } from "@/types/planner";

export const EVENT_REPEAT_META: Record<EventRepeat, { label: string }> = {
  none:     { label: "No repeat" },
  daily:    { label: "Daily"     },
  weekdays: { label: "Weekdays"  },
  weekly:   { label: "Weekly"    },
  custom:   { label: "Custom"    },
};

export const EVENT_DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const NO_EVENTS: CalendarEvent[] = [];
const noopSubscribe = () => () => {};

function useEventsState() {
  const engine = useSyncEngine();
  const events = useSyncExternalStore(
    engine ? engine.subscribe : noopSubscribe,
    engine ? engine.events.getSnapshot : () => NO_EVENTS,
  );

  /** Returns the saved event, or null if there is no signed-in engine yet. */
  const addEvent = useCallback((event: Omit<CalendarEvent, "id" | "updatedAt">): CalendarEvent | null => {
    if (!engine) return null;
    return engine.events.upsert({ ...event, id: crypto.randomUUID() });
  }, [engine]);

  const updateEvent = useCallback((id: string, updates: Partial<CalendarEvent>) => {
    const current = engine?.events.get(id);
    if (!engine || !current) return;
    engine.events.upsert({ ...current, ...updates, id });
  }, [engine]);

  const deleteEvent = useCallback((id: string) => {
    engine?.events.remove(id);
  }, [engine]);

  const getEventsForDate = useCallback(
    (dateStr: string) => events.filter((e) => {
      const repeat = e.repeat ?? "none";
      if (repeat === "none") return e.date === dateStr;
      // Only show recurring events on/after start date
      if (dateStr < e.date) return false;
      const dow = getDay(parseISO(dateStr));
      if (repeat === "daily")    return true;
      if (repeat === "weekdays") return dow >= 1 && dow <= 5;
      if (repeat === "weekly")   return getDay(parseISO(e.date)) === dow;
      if (repeat === "custom")   return (e.repeatDays ?? []).includes(dow);
      return false;
    }),
    [events]
  );

  return useMemo(
    () => ({ events, addEvent, updateEvent, deleteEvent, getEventsForDate }),
    [events, addEvent, updateEvent, deleteEvent, getEventsForDate],
  );
}

export const COLOR_MAP: Record<EventColor, { bg: string; text: string; dot: string }> = {
  blue:   { bg: "bg-blue-500/15",   text: "text-blue-700",   dot: "bg-blue-500"   },
  red:    { bg: "bg-red-500/15",    text: "text-red-700",    dot: "bg-red-500"    },
  green:  { bg: "bg-green-500/15",  text: "text-green-700",  dot: "bg-green-500"  },
  orange: { bg: "bg-orange-500/15", text: "text-orange-700", dot: "bg-orange-500" },
  purple: { bg: "bg-purple-500/15", text: "text-purple-700", dot: "bg-purple-500" },
  pink:   { bg: "bg-pink-500/15",   text: "text-pink-700",   dot: "bg-pink-500"   },
};

// One shared instance for the whole app. Each independent useEvents() call
// used to hold its own state, so a change made through one (e.g. a widget
// toggle applied in App) never reached the others until a remount.
const EventsContext = createContext<ReturnType<typeof useEventsState> | null>(null);

export function EventsProvider({ children }: { children: ReactNode }) {
  return createElement(EventsContext.Provider, { value: useEventsState() }, children);
}

export function useEvents() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error("useEvents must be used inside <EventsProvider>");
  return ctx;
}
