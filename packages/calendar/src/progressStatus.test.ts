import { expect, it } from "vitest";
import { progressStatusLines } from "./progressStatus";
import type { SharedProgress } from "./sharedProgress";

const group: SharedProgress = {
  groupId: "33333333-3333-4333-8333-333333333333",
  revision: 1,
  name: "Gym",
  timeZone: "Asia/Riyadh",
  today: "2026-10-20",
  phase: "active",
  reason: null,
  confirmedAt: Date.parse("2026-10-20T09:00:00Z"),
  archived: false,
  pending: false,
  stale: false,
  round: {
    start: "2026-10-19",
    end: "2026-10-26",
    activityEnd: "2026-10-25T21:00:00Z",
    endReason: "scheduled",
    active: true,
    averagePct: 50,
  },
  rows: [
    {
      userId: "11111111-1111-4111-8111-111111111111",
      name: "You",
      rank: 1,
      adherencePct: 50,
      isAtLeast70: false,
      self: true,
      left: false,
      completedDays: 1,
      target: 2,
    },
  ],
};
const now = Date.parse("2026-10-20T09:01:00Z");
const lines = (g: Partial<SharedProgress>, viewerZone = "Asia/Riyadh") =>
  progressStatusLines(
    { ...group, ...g },
    { now, timeFormat: "24h", viewerZone },
  ).map((l) => l.text);

it("says nothing about rounds, zones or confirmation while all is normal", () => {
  expect(lines({})).toEqual([]);
});

it("never shows round dates, the group zone or UTC outside the deadline lines", () => {
  for (const phase of [
    "active",
    "waiting",
    "paused",
    "archived",
    "unconfirmed",
  ] as const)
    for (const l of progressStatusLines(
      { ...group, phase, stale: true, rows: [] },
      { now, timeFormat: "24h", viewerZone: "America/Los_Angeles" },
    ).filter((l) => !l.deadline))
      expect(l.text).not.toMatch(/round|UTC|Asia\/Riyadh|2026-10-|Confirmed/i);
});

it("explains each non-active phase in plain words, preferring the app's reason", () => {
  expect(lines({ phase: "waiting" })).toEqual([
    "Starts once two people have joined.",
  ]);
  expect(lines({ phase: "paused" })).toEqual([
    "Paused. It restarts at the start of a week with two people in.",
  ]);
  expect(lines({ phase: "archived" })).toEqual(["Archived"]);
  expect(lines({ phase: "unconfirmed" })).toEqual([
    "Connect to the internet to update this group.",
  ]);
  expect(lines({ phase: "waiting", reason: "Starts Mon 26 Oct 2026" })).toEqual(
    ["Starts Mon 26 Oct 2026"],
  );
  expect(lines({ reason: "Rest day" })).toEqual(["Rest day"]);
});

it("says when there are no scores, unsynced changes or an old read", () => {
  expect(lines({ rows: [] })).toEqual(["No scores yet."]);
  expect(lines({ pending: true })).toEqual(["Not synced yet"]);
  // 09:00Z is 12:00 in Riyadh and the same day there.
  expect(lines({ stale: true })).toEqual(["Last updated 12:00"]);
  // An older read names its day, in the viewer's own clock.
  expect(
    lines({ stale: true, confirmedAt: Date.parse("2026-10-18T15:30:00Z") }),
  ).toEqual(["Last updated Sun 18 Oct 18:30"]);
  expect(lines({ stale: true, confirmedAt: null })).toEqual([]);
});

it("keeps the local-time deadline lines for an active round, marked as deadlines", () => {
  const out = progressStatusLines(group, {
    now,
    timeFormat: "24h",
    viewerZone: "America/Los_Angeles",
  });
  expect(out.length).toBeGreaterThan(0);
  expect(out.every((l) => l.deadline)).toBe(true);
});
