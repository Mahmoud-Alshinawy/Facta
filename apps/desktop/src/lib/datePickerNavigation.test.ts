import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { datePickerNavigation as move } from "./datePickerNavigation";

const date = (key: string) => new Date(`${key}T12:00:00`);
const key = (value: Date | undefined) => value && format(value, "yyyy-MM-dd");
describe("date picker keyboard movement", () => {
  it("crosses month and year boundaries in both directions", () => {
    expect(key(move(date("2026-12-31"), "ArrowRight", 0))).toBe("2027-01-01");
    expect(key(move(date("2027-01-01"), "ArrowLeft", 0))).toBe("2026-12-31");
    expect(key(move(date("2026-12-31"), "ArrowDown", 0))).toBe("2027-01-07");
    expect(key(move(date("2027-01-01"), "ArrowUp", 0))).toBe("2026-12-25");
  });
  it("clamps short and leap-year months", () => {
    expect(key(move(date("2026-01-31"), "PageDown", 0))).toBe("2026-02-28");
    expect(key(move(date("2028-03-31"), "PageUp", 0))).toBe("2028-02-29");
  });
  it.each([0, 1, 6] as const)(
    "uses week start %s for Home and End",
    (weekStart) => {
      const start = move(date("2026-01-01"), "Home", weekStart)!;
      const end = move(date("2026-01-01"), "End", weekStart)!;
      expect(start.getDay()).toBe(weekStart);
      expect(end.getDay()).toBe((weekStart + 6) % 7);
      expect(start <= date("2026-01-01") && end >= date("2026-01-01")).toBe(
        true,
      );
    },
  );
  it("leaves activation and unrelated keys to the control", () => {
    for (const value of ["Enter", " ", "Escape", "Tab", "toString"])
      expect(move(date("2026-01-01"), value, 0)).toBeUndefined();
  });
});
