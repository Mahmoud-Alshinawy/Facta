// Widget export bus: any data-writing hook can call requestWidgetExport()
// after a mutation, and all calls within the debounce window coalesce into a
// single export_data_for_widgets invocation.

import { getStorageKey } from "@/hooks/useAuth";
import { readPrefs } from "@/hooks/usePrefs";

let timer: ReturnType<typeof setTimeout> | null = null;
let exportUserId: string | null = null;

// Called by the auth-aware providers so exports read the signed-in user's
// data instead of whichever planner_goals_* key localStorage lists first
// (which could be the stale "anon" one).
export function setWidgetExportUser(userId: string | null) {
  if (exportUserId === userId) return;
  exportUserId = userId;
  requestWidgetExport();
}
let dirty = false;

export function requestWidgetExport() {
  if (typeof window === "undefined" || !((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) return;
  dirty = true;
  if (timer) return;
  timer = setTimeout(flush, 500);
}

export async function exportWidgetsNow() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const goalsKey = getStorageKey('planner_goals', exportUserId);
    const eventsKey = getStorageKey('planner_events', exportUserId);
    const goalsJson = localStorage.getItem(goalsKey) || '[]';
    const eventsJson = localStorage.getItem(eventsKey) || '[]';
    // The widgets read the calendar settings (time format, week start) from
    // the same file, under config.prefs.
    let config: Record<string, unknown> = { widgets: [] };
    try {
      config = JSON.parse(localStorage.getItem('facta_widget_config') || '{"widgets":[]}');
    } catch {
      config = { widgets: [] };
    }
    const configJson = JSON.stringify({ ...config, prefs: readPrefs() });
    await invoke("export_data_for_widgets", { goalsJson, eventsJson, configJson });
  } catch (e) {
    console.error("[WidgetExport] failed:", e);
  }
}

async function flush() {
  timer = null;
  if (!dirty) return;
  dirty = false;
  await exportWidgetsNow();
}
