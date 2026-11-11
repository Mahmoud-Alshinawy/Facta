import { describe, expect, it } from "vitest";
import { shouldShowUpdateBar, updateBarText, type UpdateStatus } from "./updates";

const ready: UpdateStatus = { state: "ready", version: "1.0.1", current: "1.0.0" };

describe("update bar", () => {
  it("shows a ready update only while the window is visible", () => {
    expect(shouldShowUpdateBar(ready, null, true)).toBe(true);
    expect(shouldShowUpdateBar(ready, null, false)).toBe(false);
    expect(shouldShowUpdateBar(null, null, true)).toBe(false);
    expect(
      shouldShowUpdateBar({ state: "idle", version: null, current: "1.0.0" }, null, true),
    ).toBe(false);
  });

  it("stays hidden after Later until a newer version is ready", () => {
    expect(shouldShowUpdateBar(ready, "1.0.1", true)).toBe(false);
    expect(shouldShowUpdateBar({ ...ready, version: "1.0.2" }, "1.0.1", true)).toBe(true);
  });

  it("keeps showing while installing, even after Later", () => {
    expect(shouldShowUpdateBar({ ...ready, state: "installing" }, "1.0.1", true)).toBe(true);
  });

  it("uses plain wording for each phase", () => {
    expect(updateBarText(ready, "idle")).toBe("Update ready, restart to install");
    expect(updateBarText(ready, "widgets")).toBe("Updating the widgets…");
    expect(updateBarText(ready, "installing")).toBe("Installing the update…");
  });
});
