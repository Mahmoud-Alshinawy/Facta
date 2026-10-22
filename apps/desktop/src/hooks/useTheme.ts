import { useSyncExternalStore } from "react";
import { currentTheme, subscribeTheme, type ThemeId } from "@/lib/theme";

/** The app theme, kept current when any picker changes it. */
export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribeTheme, () => currentTheme());
}
