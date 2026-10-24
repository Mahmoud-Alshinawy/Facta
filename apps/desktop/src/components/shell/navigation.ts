export type Section = "today" | "calendar" | "goals" | "notes" | "diary" | "settings";

/** Empty follows the viewport; c/o are the user's collapsed/open overrides. */
export type SidebarMode = "" | "c" | "o";
export const RAIL_BREAKPOINT = 1200;
export const HIDDEN_SECTIONS: ReadonlySet<Section> = new Set();

export function nextSidebarMode(mode: SidebarMode, width: number): SidebarMode {
  const narrow = width <= RAIL_BREAKPOINT;
  const collapsed = narrow ? mode !== "o" : mode === "c";
  if (collapsed) return narrow ? "o" : "";
  return narrow ? "" : "c";
}

export function sidebarRootClass(mode: SidebarMode): string {
  return mode === "c" ? "sb-c" : mode === "o" ? "sb-o" : "";
}
