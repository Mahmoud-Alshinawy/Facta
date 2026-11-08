import { describe, expect, it } from "vitest";
import { noteFont } from "./NoteEditor";

describe("note font selection", () => {
  it("uses the UI font by default and preserves explicitly saved fonts", () => {
    expect(noteFont(null)).toBe("var(--font-ui)");
    expect(noteFont("IBM Plex Mono")).toBe("var(--font-mono)");
    expect(noteFont("Geist")).toBe("'Geist', sans-serif");
    expect(noteFont("Geist Mono")).toBe("'Geist Mono', monospace");
    expect(noteFont("Source Serif 4")).toBe("'Source Serif 4', serif");
  });
});
