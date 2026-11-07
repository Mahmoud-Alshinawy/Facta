// Widget export bus: any data-writing hook can call requestWidgetExport()
// after a mutation, and all calls within the debounce window coalesce into a
// single export_data_for_widgets invocation.

import { toast } from "sonner";
import { getStorageKey } from "@/hooks/useAuth";
import { readPrefs } from "@/hooks/usePrefs";
import { projectWidgetJournal } from "./widgetJournal";
import { widgetReceiptsKey } from "./widgetActions";
import { keyOf } from "./calendarData";
import type { Note, DiaryEntry } from "@/types/planner";
import type { KeyValueStore } from "@/lib/sync/storage";
import { storedSharedWidgetExport } from "./sharedGoals/widgetExport";
import { cleanWidgetSharedSelections, WIDGET_CONFIG_KEY } from "./widgetConfig";

let timer: ReturnType<typeof setTimeout> | null = null;
let exportUserId: string | null = null;
let exportStore: { userId: string; store: KeyValueStore } | null = null;

export function setWidgetExportStore(
  userId: string | null,
  store: KeyValueStore | null,
) {
  exportStore = userId && store ? { userId, store } : null;
  requestWidgetExport();
}

// Called by the auth-aware sync provider so exports read the signed-in user's
// data instead of whichever planner_goals_* key localStorage lists first
// (which could be the stale "anon" one).
export function setWidgetExportUser(userId: string | null) {
  if (exportUserId === userId) return;
  exportUserId = userId;
  // Queue account cleanup immediately, including while its next store opens.
  if (
    typeof window !== "undefined" &&
    ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)
  )
    void exportWidgetsNow();
  requestWidgetExport();
}
let dirty = false;

export function requestWidgetExport() {
  if (
    typeof window === "undefined" ||
    !((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)
  )
    return;
  dirty = true;
  if (timer) return;
  timer = setTimeout(flush, 500);
}

let exporting: Promise<void> = Promise.resolve();
export function exportWidgetsNow(): Promise<void> {
  exporting = exporting.then(writeWidgetSnapshot);
  return exporting;
}
async function writeWidgetSnapshot() {
  try {
    const accountId = exportUserId;
    const source = exportStore;
    // Replace the previous account's file while the next account store opens.
    const userId = accountId;
    const ready = !!userId && source?.userId === userId;
    if (ready) await source?.store.flush?.();
    const { invoke } = await import("@tauri-apps/api/core");
    if (accountId !== exportUserId || source !== exportStore) return;
    const goalsKey = getStorageKey("planner_goals", userId);
    const eventsKey = getStorageKey("planner_events", userId);
    const goalsJson = ready ? source!.store.get(goalsKey) || "[]" : "[]";
    const eventsJson = ready ? source!.store.get(eventsKey) || "[]" : "[]";
    const notes: Note[] = ready
      ? JSON.parse(
          source!.store.get(getStorageKey("planner_notes", userId)) || "[]",
        )
      : [];
    const diary: DiaryEntry[] = ready
      ? JSON.parse(
          source!.store.get(getStorageKey("planner_diary_entries", userId)) ||
            "[]",
        )
      : [];
    const journalJson = JSON.stringify(
      projectWidgetJournal(notes, diary, keyOf(new Date())),
    );
    const results = ready
      ? JSON.parse(source!.store.get(widgetReceiptsKey(userId)) || "[]")
      : [];
    // The widgets read the calendar settings (time format, week start) from
    // the same file, under config.prefs.
    let config: Record<string, unknown> = { widgets: [] };
    try {
      config = JSON.parse(
        localStorage.getItem("facta_widget_config") || '{"widgets":[]}',
      );
    } catch {
      config = { widgets: [] };
    }
    const preferred = Array.isArray(config.widgets)
      ? config.widgets
          .filter(
            (w: any) => w?.type === "progress" && w.sharedUserId === userId,
          )
          .map((w: any) => w.sharedGroupId)
      : [];
    const shared = storedSharedWidgetExport(
      ready ? source!.store : null,
      userId,
      Date.now(),
      preferred,
      !navigator.onLine,
    );
    const cleaned = cleanWidgetSharedSelections(
      config,
      accountId,
      shared.allowed,
    );
    if (JSON.stringify(cleaned) !== JSON.stringify(config)) {
      try {
        localStorage.setItem(WIDGET_CONFIG_KEY, JSON.stringify(cleaned));
        window.dispatchEvent(new Event("facta:widget-config"));
      } catch {
        toast.error(
          "Could not save widget selections. Account cleanup will still update the widget file.",
          { id: "widget-selection-storage" },
        );
      }
    }
    const configJson = JSON.stringify({ ...cleaned, prefs: readPrefs() });
    if (accountId !== exportUserId || source !== exportStore) return;
    await invoke("export_data_for_widgets", {
      goalsJson,
      eventsJson,
      configJson,
      journalJson,
      actionResultsJson: JSON.stringify(results),
      userId,
      sharedGoalsJson: JSON.stringify(shared.data),
    });
  } catch (e) {
    console.error("[WidgetExport] failed:", e);
    toast.error(
      "Could not update desktop widgets. Your planner data is kept.",
      { id: "widget-export-error" },
    );
  }
}

async function flush() {
  timer = null;
  if (!dirty) return;
  dirty = false;
  await exportWidgetsNow();
}
