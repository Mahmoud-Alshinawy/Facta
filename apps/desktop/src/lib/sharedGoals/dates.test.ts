import { describe, expect, it } from "vitest";
import {
  groupDate,
  nextRoundDate,
  roundInterval,
  roundStart,
  eligibleRound,
  canReplay,
  validDate,
  validInstant,
} from "./dates";

describe("shared group dates", () => {
  it("publishes strictly after the group-local date, independently of device zone", () => {
    expect(groupDate("2026-10-18T23:30:00Z", "Asia/Riyadh")).toBe("2026-10-19");
    expect(nextRoundDate("2026-10-18T23:30:00Z", "Asia/Riyadh", 1)).toBe(
      "2026-10-26",
    );
  });
  it("uses local midnights across DST, not fixed-duration weeks", () => {
    expect(roundInterval("2026-03-08", "America/New_York")).toEqual({
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-15T04:00:00.000Z",
    });
    expect(roundInterval("2026-11-01", "America/New_York")).toEqual({
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-11-08T05:00:00.000Z",
    });
  });
  it("assigns midnight acceptance to the following round and handles leap/year boundaries", () => {
    expect(
      eligibleRound("2026-10-19", "2026-10-18T20:59:59.999Z", "Asia/Riyadh"),
    ).toBe("2026-10-19");
    expect(
      eligibleRound("2026-10-19", "2026-10-18T21:00:00Z", "Asia/Riyadh"),
    ).toBe("2026-10-26");
    expect(roundStart("2024-02-26", "2024-03-03")).toBe("2024-02-26");
    expect(nextRoundDate("2026-12-31T23:30:00Z", "Pacific/Kiritimati", 0)).toBe(
      "2027-01-03",
    );
  });
  it("retains original captured dates and allows exactly seven prior local dates", () => {
    expect(
      canReplay(
        "2026-10-18T22:00:00Z",
        "2026-10-25T22:00:00Z",
        "2026-10-19",
        "Asia/Riyadh",
      ),
    ).toBe(true);
    expect(
      canReplay(
        "2026-10-17T22:00:00Z",
        "2026-10-25T22:00:00Z",
        "2026-10-18",
        "Asia/Riyadh",
      ),
    ).toBe(false);
    expect(
      canReplay(
        "2026-10-25T22:00:01Z",
        "2026-10-25T22:00:00Z",
        "2026-10-26",
        "Asia/Riyadh",
      ),
    ).toBe(false);
    expect(
      canReplay(
        "2026-10-25T22:00:00Z",
        "2026-10-25T22:00:00Z",
        "2026-10-25",
        "Asia/Riyadh",
      ),
    ).toBe(false);
  });
  it("handles every round weekday and rejects normalized invalid dates or naive timestamps", () => {
    expect(
      Array.from({ length: 7 }, (_, day) =>
        nextRoundDate("2026-10-18T12:00:00Z", "UTC", day),
      ),
    ).toEqual([
      "2026-10-25",
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ]);
    expect(validDate("2024-02-29")).toBe(true);
    expect(validDate("2026-02-29")).toBe(false);
    expect(validInstant("2026-02-30T09:00:00Z")).toBe(false);
    expect(validInstant("2026-10-20T09:00:00")).toBe(false);
  });
});
