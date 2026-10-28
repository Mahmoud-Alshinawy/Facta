import { describe, expect, it } from "vitest";
import { groupDeadlineText, zoneMidnight } from "./groupDeadlines";

const riyadh = "Asia/Riyadh";
describe("group deadlines in the viewer's clock", () => {
  it("adds nothing when the viewer's clock already reads the group's midnight", () => {
    const at = {
      today: "2026-11-04",
      timeZone: riyadh,
      roundEnd: "2026-11-09",
      now: Date.parse("2026-11-04T10:00:00Z"),
    };
    expect(groupDeadlineText({ ...at, viewerZone: riyadh })).toEqual([]);
    // A different zone name with the same offset is not noise either.
    expect(groupDeadlineText({ ...at, viewerZone: "Asia/Kuwait" })).toEqual([]);
  });
  it("shows a Riyadh group's deadlines in Los Angeles time", () => {
    expect(
      groupDeadlineText({
        today: "2026-11-04",
        timeZone: riyadh,
        roundEnd: "2026-11-09",
        now: Date.parse("2026-11-04T10:00:00Z"),
        viewerZone: "America/Los_Angeles",
      }),
    ).toEqual([
      "Today's check-in closes at 1:00pm your time (midnight Asia/Riyadh)",
      "Round ends Sun 1:00pm your time",
    ]);
  });
  it("names the group's date when the viewer is already on the next day", () => {
    expect(
      groupDeadlineText({
        today: "2026-11-04",
        timeZone: riyadh,
        roundEnd: "2026-11-09",
        now: Date.parse("2026-11-04T10:00:00Z"),
        viewerZone: "Pacific/Kiritimati",
      }),
    ).toEqual([
      "Check-in for Wed 4 Nov closes at 11:00am your time (midnight Asia/Riyadh)",
      "Round ends Mon 11:00am your time",
    ]);
  });
  it("says tomorrow when the group is a day ahead of the viewer", () => {
    expect(
      groupDeadlineText({
        today: "2026-11-05",
        timeZone: riyadh,
        roundEnd: null,
        now: Date.parse("2026-11-04T23:00:00Z"),
        viewerZone: "America/Los_Angeles",
      }),
    ).toEqual([
      "Check-in for Thu 5 Nov closes tomorrow at 1:00pm your time (midnight Asia/Riyadh)",
    ]);
  });
  it("follows the viewer's DST change inside one round", () => {
    // US clocks go back on Sun 1 Nov 2026; Riyadh has no DST.
    expect(
      groupDeadlineText({
        today: "2026-10-31",
        timeZone: riyadh,
        roundEnd: "2026-11-02",
        now: Date.parse("2026-10-31T10:00:00Z"),
        viewerZone: "America/Los_Angeles",
      }),
    ).toEqual([
      "Today's check-in closes at 2:00pm your time (midnight Asia/Riyadh)",
      "Round ends Sun 1:00pm your time",
    ]);
  });
  it("follows the group's DST change, from its own day boundary", () => {
    expect(
      groupDeadlineText({
        today: "2026-10-31",
        timeZone: "America/New_York",
        roundEnd: "2026-11-02",
        now: Date.parse("2026-10-31T16:00:00Z"),
        viewerZone: riyadh,
      }),
    ).toEqual([
      "Today's check-in closes tomorrow at 7:00am your time (midnight America/New_York)",
      "Round ends Mon 8:00am your time",
    ]);
  });
  it("resolves midnight like PostgreSQL across DST and at a midnight gap", () => {
    expect(
      new Date(zoneMidnight("2026-11-01", "America/New_York")).toISOString(),
    ).toBe("2026-11-01T04:00:00.000Z");
    expect(
      new Date(zoneMidnight("2026-11-08", "America/New_York")).toISOString(),
    ).toBe("2026-11-08T05:00:00.000Z");
    // Santiago skips 00:00–01:00 when DST starts; take the shifted instant.
    expect(
      new Date(zoneMidnight("2026-09-06", "America/Santiago")).toISOString(),
    ).toBe("2026-09-06T04:00:00.000Z");
  });
});
