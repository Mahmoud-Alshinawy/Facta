import { useSyncExternalStore } from "react";
import { DEFAULT_PREFS, parsePrefs, type CalendarPrefs } from "@facta/calendar";
import { requestWidgetExport } from "@/lib/widgetExportBus";

// Calendar settings (week start, time format, weekend): one store for Month,
// Week, the sidebar calendar and, via widgets.json, the widgets.

export const PREFS_KEY = "facta.prefs";
const EVENT = "facta-prefs";

let cachedRaw: string | null | undefined;
let cachedPrefs: CalendarPrefs = DEFAULT_PREFS;

export function readPrefs(): CalendarPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    let parsed: unknown = undefined;
    try {
      parsed = raw ? JSON.parse(raw) : undefined;
    } catch {
      parsed = undefined;
    }
    cachedPrefs = parsePrefs(parsed);
  }
  return cachedPrefs;
}

export function savePrefs(patch: Partial<CalendarPrefs>): void {
  const next = parsePrefs({ ...readPrefs(), ...patch });
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: nothing to persist.
  }
  window.dispatchEvent(new Event(EVENT));
  requestWidgetExport();
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePrefs(): CalendarPrefs {
  return useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_PREFS);
}
