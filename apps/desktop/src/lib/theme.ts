// Runtime side of the theme system. public/theme-init.js reads (and migrates)
// the saved preference and sets data-theme on <html> before the app renders;
// this module reads it back from there and saves a new choice.

// The swatch colours repeat each theme's --bg and --accent from the token
// blocks in src/index.css (swatchBg is also the first-paint background, as in
// public/theme-init.js). Keep all three in step when a token changes.
export const THEMES = [
  { id: "default", name: "Black and green", swatchBg: "#060706", swatchAccent: "#22C55E" },
  { id: "midnight", name: "Midnight", swatchBg: "#04070E", swatchAccent: "#4C8DF6" },
  { id: "ember", name: "Ember", swatchBg: "#060504", swatchAccent: "#FF8000" },
  { id: "light", name: "Light", swatchBg: "#F6F6F3", swatchAccent: "#15803D" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_CHOICE_KEY = "facta_theme_choice";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** The theme theme-init.js applied, or the default if it didn't run. */
export function currentTheme(root: HTMLElement = document.documentElement): ThemeId {
  const value = root.getAttribute("data-theme");
  return isThemeId(value) ? value : "default";
}

/** Applies a theme the user picked and remembers it. Only called on a pick. */
export function chooseTheme(theme: ThemeId, root: HTMLElement = document.documentElement, storage?: Storage): void {
  // Switch without transitions: elements with transition-colors would
  // otherwise fade through clashing pairs (e.g. dark rows on a light page).
  root.classList.add("theme-switching");
  root.setAttribute("data-theme", theme);
  // theme-init.js paints <html> inline before the stylesheet loads; keep
  // those inline values in step, or they'd outlast the switch.
  const meta = THEMES.find((t) => t.id === theme);
  if (meta) root.style.backgroundColor = meta.swatchBg;
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  // Force the new colours to be computed now, while transitions are off;
  // removing the class afterwards then has nothing left to animate.
  void getComputedStyle(root).color;
  requestAnimationFrame(() => root.classList.remove("theme-switching"));
  try {
    (storage ?? window.localStorage).setItem(THEME_CHOICE_KEY, theme);
  } catch {
    // Storage blocked: the theme still applies for this session.
  }
  try {
    window.dispatchEvent(new Event(THEME_EVENT));
  } catch {
    // No window (tests): nothing is listening.
  }
}

/** Fired on window after chooseTheme, so every theme picker shows the pick. */
export const THEME_EVENT = "facta-theme";

export function subscribeTheme(cb: () => void): () => void {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}
