import { isThemeId, type ThemeId } from "./theme";
import { progressUuid } from "@facta/calendar";

export const WIDGET_TYPES = [
  "tasks",
  "progress",
  "events",
  "calendar",
  "dayview",
  "notes",
  "diary",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];
export type WidgetTheme = ThemeId;
export interface WidgetConfig {
  id: string;
  type: WidgetType;
  enabled: boolean;
  translucent: boolean;
  theme: WidgetTheme;
  noteStyle?: "sticky" | "stack";
  sharedGroupId?: string;
  sharedUserId?: string;
}
export const WIDGET_CONFIG_KEY = "facta_widget_config";
export const WIDGET_LABELS: Record<WidgetType, string> = {
  tasks: "Tasks",
  progress: "Progress",
  events: "Events",
  calendar: "Calendar",
  dayview: "Day",
  notes: "Notes",
  diary: "Diary",
};

/** Keep the native companion's existing JSON fields and legacy defaults. */
export function parseWidgetConfig(raw: unknown): WidgetConfig[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { widgets?: unknown }).widgets)
  )
    return [];
  const ids = new Set<string>();
  return (raw as { widgets: unknown[] }).widgets.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const w = value as Record<string, unknown>;
    if (
      typeof w.id !== "string" ||
      !w.id.trim() ||
      ids.has(w.id) ||
      !WIDGET_TYPES.includes(w.type as WidgetType)
    )
      return [];
    ids.add(w.id);
    return [
      {
        id: w.id,
        type: w.type as WidgetType,
        ...(w.type === "progress" &&
        progressUuid(w.sharedGroupId) &&
        progressUuid(w.sharedUserId)
          ? { sharedGroupId: w.sharedGroupId, sharedUserId: w.sharedUserId }
          : {}),
        ...(w.type === "notes"
          ? {
              noteStyle:
                w.noteStyle === "stack"
                  ? ("stack" as const)
                  : ("sticky" as const),
            }
          : {}),
        enabled: w.enabled !== false,
        translucent: w.translucent !== false,
        theme: isThemeId(w.theme) ? w.theme : "midnight",
      },
    ];
  });
}

export function readWidgetConfig(
  storage: Pick<Storage, "getItem">,
): WidgetConfig[] {
  try {
    return parseWidgetConfig(
      JSON.parse(storage.getItem(WIDGET_CONFIG_KEY) ?? "{}"),
    );
  } catch {
    return [];
  }
}

export function widgetConfigJson(widgets: readonly WidgetConfig[]): string {
  return JSON.stringify({ widgets });
}
/** Remove only account/access-bound choices; preserve all other config fields. */
export function cleanWidgetSharedSelections(
  config: Record<string, unknown>,
  userId: string | null,
  allowed?: ReadonlySet<string>,
): Record<string, unknown> {
  if (!Array.isArray(config.widgets)) return config;
  return {
    ...config,
    widgets: config.widgets.map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const w = { ...raw };
      if (
        w.type !== "progress" ||
        !userId ||
        w.sharedUserId !== userId ||
        !progressUuid(w.sharedGroupId) ||
        (allowed && !allowed.has(w.sharedGroupId))
      ) {
        delete w.sharedUserId;
        delete w.sharedGroupId;
      }
      return w;
    }),
  };
}
