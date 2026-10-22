import type { EventColor } from "@/types/planner";

export const EVENT_COLORS: readonly EventColor[] = ["blue", "red", "green", "orange", "purple", "pink"];

export const EVENT_COLOR_NAMES: Record<EventColor, string> = {
  blue: "Blue", red: "Red", green: "Green", orange: "Orange", purple: "Purple", pink: "Pink",
};

/** An event colour as a CSS colour value: the theme's event token. */
export function eventColorVar(color: EventColor): string {
  return `var(--event-${color})`;
}
