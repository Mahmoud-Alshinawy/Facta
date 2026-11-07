import { describe, expect, it } from "vitest";
import { eligibleRound, groupDate, roundStart } from "../lib/sharedGoals/dates";
import { nativeScoringPlan, publicationDate } from "./sharedAcceptanceDates";

describe("acceptance publication dates", () => {
  it.each([
    ["2026-11-01T20:59:59Z", "2026-11-02"],
    ["2026-11-01T21:00:00Z", "2026-11-09"],
  ])(
    "DML join at %s has a strictly future eligible boundary %s",
    (joinedAt, expected) => {
      expect(eligibleRound("2026-11-02", joinedAt, "Asia/Riyadh")).toBe(
        expected,
      );
    },
  );
  it.each([
    ["2026-10-25T20:59:59Z", "Asia/Riyadh", "2026-10-26"],
    ["2026-10-25T21:00:00Z", "Asia/Riyadh", "2026-11-02"],
    ["2026-10-26T00:30:00Z", "America/Los_Angeles", "2026-10-26"],
    ["2026-10-25T10:00:00Z", "Pacific/Kiritimati", "2026-11-02"],
    ["2026-12-27T21:00:00Z", "Asia/Riyadh", "2027-01-04"],
  ])(
    "%s in %s publishes on the next local Monday %s",
    (instant, zone, expected) => {
      const date = publicationDate(Date.parse(instant), zone, 1);
      expect(date).toBe(expected);
      expect(date > groupDate(instant, zone)).toBe(true);
    },
  );
});

describe("native 50 to 100 scoring fixture dates", () => {
  it.each([
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ])(
    "%s: seed and action are different days in the same eligible round",
    (day) => {
      const now = Date.parse(`${day}T09:00:00Z`),
        plan = nativeScoringPlan(now);
      expect(plan.today).toBe(day);
      expect(plan.firstRoundDate > plan.creationDate).toBe(true);
      expect(plan.seedDate < plan.today).toBe(true);
      expect(groupDate(plan.seedCapturedAt, "Asia/Riyadh")).toBe(plan.seedDate);
      expect(Date.parse(plan.seedCapturedAt)).toBeLessThan(now);
      expect(roundStart(plan.firstRoundDate, plan.seedDate)).toBe(
        roundStart(plan.firstRoundDate, plan.today),
      );
    },
  );
  it("uses the group date just after Riyadh midnight, not the UTC weekday", () => {
    const plan = nativeScoringPlan(Date.parse("2026-10-25T21:00:00Z"));
    expect(plan.today).toBe("2026-10-26");
    expect(plan.seedDate).toBe("2026-10-25");
    expect(roundStart(plan.firstRoundDate, plan.seedDate)).toBe(
      roundStart(plan.firstRoundDate, plan.today),
    );
  });
});
