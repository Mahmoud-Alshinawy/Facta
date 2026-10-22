import { describe, expect, it } from "vitest";
import { popoverTop } from "./popoverPlacement";

describe("grid popover placement", () => {
  const viewport = { visibleTop: 600, visibleBottom: 1000, height: 200 };
  it("opens below a slot with room", () => {
    expect(popoverTop({ ...viewport, start: 620, end: 670 })).toBe(678);
  });
  it("flips above a 3–5 PM selection near the footer", () => {
    const start = 15 * 52, end = 17 * 52;
    const top = popoverTop({ start, end, height: 200, visibleTop: 550, visibleBottom: 900 });
    expect(top).toBe(572);
    expect(top + 200).toBeLessThan(start);
  });
  it("clamps a tall selection below the sticky header and above the footer", () => {
    expect(popoverTop({ ...viewport, start: 610, end: 980 })).toBe(600);
  });
  it("uses new viewport bounds after scrolling or resizing", () => {
    expect(popoverTop({ ...viewport, start: 900, end: 950 })).toBe(692);
    expect(popoverTop({ ...viewport, start: 900, end: 950, visibleBottom: 1200 })).toBe(958);
  });
});
