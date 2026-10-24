import { describe, expect, it } from "vitest";
import { HIDDEN_SECTIONS, nextSidebarMode, sidebarRootClass } from "./navigation";

describe("sidebar navigation", () => {
  it("opens the automatic rail at 1200px and closes it on the next toggle", () => {
    const expanded = nextSidebarMode("", 1200);
    expect(sidebarRootClass(expanded)).toBe("sb-o");
    expect(sidebarRootClass(nextSidebarMode(expanded, 1200))).toBe("");
  });

  it("collapses a full sidebar above 1200px and restores the automatic mode", () => {
    const collapsed = nextSidebarMode("", 1201);
    expect(sidebarRootClass(collapsed)).toBe("sb-c");
    expect(sidebarRootClass(nextSidebarMode(collapsed, 1440))).toBe("");
  });

  it("lets a manually collapsed wide sidebar open after resizing to 1100", () => {
    expect(sidebarRootClass(nextSidebarMode("c", 1100))).toBe("sb-o");
  });

  it("lets a manually opened rail collapse after resizing to a wide window", () => {
    expect(sidebarRootClass(nextSidebarMode("o", 1440))).toBe("sb-c");
  });

  it("exposes the implemented Notes and Diary pages", () => {
    expect([...HIDDEN_SECTIONS]).toEqual([]);
  });
});
