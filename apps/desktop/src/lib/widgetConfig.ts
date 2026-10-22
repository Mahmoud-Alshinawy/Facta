import { isThemeId, type ThemeId } from "./theme";

export const WIDGET_TYPES = [
  "tasks",
  "progress",
  "events",
  "calendar",
  "dayview",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];
export type WidgetTheme = ThemeId;
export interface WidgetConfig {
  id: string;
  type: WidgetType;
  enabled: boolean;
  translucent: boolean;
  theme: WidgetTheme;
}
export const WIDGET_CONFIG_KEY = "facta_widget_config";
export const WIDGET_LABELS: Record<WidgetType, string> = {
  tasks: "Tasks",
  progress: "Progress",
  events: "Events",
  calendar: "Calendar",
  dayview: "Day",
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
