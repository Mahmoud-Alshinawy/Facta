import type { ReactNode } from "react";
import { createContext, createElement, useContext, useState, useCallback, useEffect } from "react";
import { getDay, parseISO } from "date-fns";
import { useAuth, getStorageKey } from "@/hooks/useAuth";
import { requestWidgetExport } from "@/lib/widgetExportBus";

export type EventColor = "blue" | "red" | "green" | "orange" | "purple" | "pink";
export type EventRepeat = "none" | "daily" | "weekdays" | "weekly" | "custom";

export const EVENT_REPEAT_META: Record<EventRepeat, { label: string }> = {
  none:     { label: "No repeat" },
  daily:    { label: "Daily"     },
  weekdays: { label: "Weekdays"  },
  weekly:   { label: "Weekly"    },
  custom:   { label: "Custom"    },
};

export const EVENT_DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  color: EventColor;
  description?: string;
  allDay?: boolean;
  repeat?: EventRepeat;
  repeatDays?: number[];
}

function loadEvents(key: string): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEvents(key: string, events: CalendarEvent[]) {
  localStorage.setItem(key, JSON.stringify(events));
}

function useEventsState() {
  const { user } = useAuth();
  const storageKey = getStorageKey("planner_events", user?.id);
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadEvents(storageKey));

  useEffect(() => {
    setEvents(loadEvents(storageKey));
  }, [storageKey]);

  // Persist, then let the widgets know. Kept out of the state updaters below so
  // they stay pure.
  useEffect(() => {
    saveEvents(storageKey, events);
    requestWidgetExport();
  }, [events, storageKey]);

  const addEvent = useCallback((event: Omit<CalendarEvent, "id">) => {
    const newEvent: CalendarEvent = { ...event, id: crypto.randomUUID() };
    setEvents((prev) => [...prev, newEvent]);
    return newEvent;
  }, []);

  const updateEvent = useCallback((id: string, updates: Partial<CalendarEvent>) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

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

  return { events, addEvent, updateEvent, deleteEvent, getEventsForDate };
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
