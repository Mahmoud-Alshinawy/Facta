import { describe, expect, it } from "vitest";
import { trapTab } from "./focusTrap";

describe("trapTab", () => {
  it("wraps at both ends and leaves the middle to the browser", () => {
    expect(trapTab(2, 3, false)).toBe(0);
    expect(trapTab(0, 3, true)).toBe(2);
    expect(trapTab(1, 3, false)).toBeNull();
    expect(trapTab(1, 3, true)).toBeNull();
  });
  it("brings focus back in from outside the list", () => {
    expect(trapTab(-1, 3, false)).toBe(0);
    expect(trapTab(-1, 3, true)).toBe(2);
  });
  it("keeps focus on the dialog when nothing inside can take it", () => {
    expect(trapTab(-1, 0, false)).toBe(-1);
  });
});
