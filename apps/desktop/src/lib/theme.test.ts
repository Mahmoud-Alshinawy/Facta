import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEMES, THEME_CHOICE_KEY, chooseTheme, currentTheme } from "@/lib/theme";

/**
 * Reads a source file with "\n" line endings, whatever the checkout uses
 * (Windows checkouts can have CRLF), so text searches behave the same everywhere.
 */
function readSource(relative: string): string {
  return readFileSync(path.resolve(import.meta.dirname, relative), "utf8").replace(/\r\n?/g, "\n");
}

// The migration lives in public/theme-init.js (it must run before the app,
// from a plain <script src>). These tests run that exact file.
const INIT_SRC = readSource("../../public/theme-init.js");

class MemoryStorage {
  data = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.data.set(k, v);
  }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
  removeItem(k: string) { this.data.delete(k); }
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  clear() { this.data.clear(); }
}

class FakeRoot {
  style: { backgroundColor?: string; colorScheme?: string } = {};
  attrs = new Map<string, string>();
  classes = new Set<string>();
  /** Snapshot of the classes each time data-theme changed. */
  classesWhenThemeSet: string[][] = [];
  classList = {
    add: (c: string) => { this.classes.add(c); },
    remove: (c: string) => { this.classes.delete(c); },
    contains: (c: string) => this.classes.has(c),
  };
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
    if (k === "data-theme") this.classesWhenThemeSet.push([...this.classes]);
  }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
}

// chooseTheme flushes styles and waits a frame; stub both for node.
let frames: (() => void)[] = [];
let styleReads = 0;
beforeEach(() => {
  frames = [];
  styleReads = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { frames.push(cb); return frames.length; });
  vi.stubGlobal("getComputedStyle", () => { styleReads += 1; return { color: "" }; });
});
afterEach(() => { vi.unstubAllGlobals(); });

function runInit(initial: Record<string, string> | "blocked" = {}) {
  const root = new FakeRoot();
  const storage = initial === "blocked" ? null : new MemoryStorage(initial);
  const window = {
    get localStorage(): MemoryStorage {
      if (!storage) throw new Error("SecurityError: storage blocked");
      return storage;
    },
  };
  const document = { documentElement: root };
  new Function("window", "document", INIT_SRC)(window, document);
  return { theme: root.getAttribute("data-theme"), storage: storage?.data, style: root.style };
}

describe("theme-init.js: first run after the update", () => {
  it("a new user (nothing stored) gets Black and green", () => {
    const r = runInit();
    expect(r.theme).toBe("default");
    expect(r.storage?.size).toBe(0); // nothing is written without a pick
  });

  it("a stored 'light' was the old auto-written default: it becomes Black and green", () => {
    const r = runInit({ facta_theme: "light" });
    expect(r.theme).toBe("default");
    expect(r.storage?.has("facta_theme")).toBe(false);
    expect(r.storage?.has(THEME_CHOICE_KEY)).toBe(false);
  });

  it.each(["midnight", "ember"])("keeps an old '%s' and moves it to the new key", (old) => {
    const r = runInit({ facta_theme: old });
    expect(r.theme).toBe(old);
    expect(r.storage?.get(THEME_CHOICE_KEY)).toBe(old);
    expect(r.storage?.has("facta_theme")).toBe(false);
  });

  it("drops junk in the old key", () => {
    const r = runInit({ facta_theme: "solarized" });
    expect(r.theme).toBe("default");
    expect(r.storage?.size).toBe(0);
  });
});

describe("theme-init.js: later runs", () => {
  it.each(["default", "midnight", "ember", "light"])("uses a picked '%s'", (choice) => {
    expect(runInit({ [THEME_CHOICE_KEY]: choice }).theme).toBe(choice);
  });

  it("a Light picked after the migration stays Light", () => {
    // First run migrates the old auto "light" away…
    const first = runInit({ facta_theme: "light" });
    expect(first.theme).toBe("default");
    // …then the user picks Light, and it sticks from then on.
    const picked = new MemoryStorage(Object.fromEntries(first.storage ?? []));
    chooseTheme("light", new FakeRoot() as unknown as HTMLElement, picked as unknown as Storage);
    expect(runInit(Object.fromEntries(picked.data)).theme).toBe("light");
  });

  it("an explicit choice wins over a leftover old key", () => {
    expect(runInit({ [THEME_CHOICE_KEY]: "light", facta_theme: "ember" }).theme).toBe("light");
  });

  it("ignores an invalid choice", () => {
    expect(runInit({ [THEME_CHOICE_KEY]: "neon" }).theme).toBe("default");
  });

  it("falls back to the default when storage is blocked", () => {
    expect(runInit("blocked").theme).toBe("default");
  });
});

describe("theme-init.js: first paint", () => {
  it.each([
    ["default", "#060706", "dark"],
    ["midnight", "#04070E", "dark"],
    ["ember", "#060504", "dark"],
    ["light", "#F6F6F3", "light"],
  ])("paints <html> for '%s' before the CSS loads", (theme, bg, scheme) => {
    const r = runInit({ [THEME_CHOICE_KEY]: theme });
    expect(r.style).toEqual({ backgroundColor: bg, colorScheme: scheme });
  });

  it("uses the same background colours as the shared tokens and lib/theme", () => {
    const css = readSource("../../../../packages/calendar/src/theme-tokens.css");
    for (const t of THEMES) {
      const sel = t.id === "default" ? ':root,\n[data-theme="default"] {' : `[data-theme="${t.id}"] {`;
      const block = css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
      expect(block, t.id).toContain(`--bg: ${t.swatchBg};`);
      expect(block, t.id).toContain(`--accent: ${t.swatchAccent};`);
      expect(runInit({ [THEME_CHOICE_KEY]: t.id }).style.backgroundColor).toBe(t.swatchBg);
    }
  });
});

describe("lib/theme", () => {
  it("chooseTheme applies and saves; currentTheme reads it back", () => {
    const root = new FakeRoot() as unknown as HTMLElement;
    const storage = new MemoryStorage();
    chooseTheme("ember", root, storage as unknown as Storage);
    expect(currentTheme(root)).toBe("ember");
    expect(root.style.backgroundColor).toBe("#060504");
    chooseTheme("light", root, storage as unknown as Storage);
    expect(root.style.colorScheme).toBe("light");
    expect(root.style.backgroundColor).toBe("#F6F6F3");
    expect(storage.getItem(THEME_CHOICE_KEY)).toBe("light");
  });

  it("switches with transitions off for one frame", () => {
    const fake = new FakeRoot();
    const root = fake as unknown as HTMLElement;
    chooseTheme("light", root, new MemoryStorage() as unknown as Storage);
    // The class was on when data-theme changed, styles were flushed, and it
    // stays on until the next frame.
    expect(fake.classesWhenThemeSet).toEqual([["theme-switching"]]);
    expect(styleReads).toBe(1);
    expect(fake.classes.has("theme-switching")).toBe(true);
    expect(frames).toHaveLength(1);
    frames[0]();
    expect(fake.classes.has("theme-switching")).toBe(false);
  });

  it("currentTheme falls back to the default", () => {
    expect(currentTheme(new FakeRoot() as unknown as HTMLElement)).toBe("default");
  });
});
