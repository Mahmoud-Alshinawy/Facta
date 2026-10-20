import type { EventColor } from "@/types/planner";

/**
 * An event colour as a CSS colour value, for tints and dots. Blue and purple
 * use the theme's event tokens; the other four keep the Tailwind colours the
 * app already uses for them (there are no theme tokens for those).
 */
export function eventColorVar(color: EventColor): string {
  switch (color) {
    case "blue": return "var(--event-blue)";
    case "purple": return "var(--event-purple)";
    case "red": return "var(--color-red-500)";
    case "green": return "var(--color-green-500)";
    case "orange": return "var(--color-orange-500)";
    case "pink": return "var(--color-pink-500)";
  }
}
