import { expect, it } from "vitest";
import {
  sharedExportByteLength,
  emptySharedWidgetExport,
  resolveProgressSelection,
  parseSharedWidgetExport,
  currentSharedProgress,
  type SharedProgress,
} from "./sharedProgress";
it("counts UTF-8 bytes including non-Latin names and emoji", () =>
  expect(sharedExportByteLength({ x: "界😀" })).toBe(15));
const user = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const group: SharedProgress = {
  groupId: id,
  revision: 1,
  name: "Gym",
  timeZone: "Asia/Riyadh",
  today: "2026-10-20",
  phase: "active",
  reason: null,
  confirmedAt: Date.parse("2026-10-20T21:00:00Z"),
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
      userId: user,
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
it("keeps a selected group stable through ordering, leave and account changes", () => {
  const data = {
    ...emptySharedWidgetExport(user),
    groups: [group],
    defaultGroupId: id,
  };
  const selected = resolveProgressSelection(data, null)!;
  expect(selected.groupId).toBe(id);
  expect(
    resolveProgressSelection(
      {
        ...data,
        groups: [{ ...group, groupId: other }],
        defaultGroupId: other,
      },
      selected,
    )?.groupId,
  ).toBe(id);
  expect(
    resolveProgressSelection(
      { ...data, userId: other, groups: [], defaultGroupId: null },
      selected,
    )?.groupId,
  ).toBeNull();
  expect(
    resolveProgressSelection(emptySharedWidgetExport(null), selected),
  ).toBeNull();
});
it("does not silently switch a configured selection when leave cleanup clears its setting", () => {
  const data = {
    ...emptySharedWidgetExport(user),
    groups: [group],
    defaultGroupId: id,
  };
  const selected = resolveProgressSelection(data, null, id)!;
  expect(
    resolveProgressSelection(
      {
        ...data,
        groups: [{ ...group, groupId: other }],
        defaultGroupId: other,
      },
      selected,
      null,
    )?.groupId,
  ).toBe(id);
});
it("reads old files and rejects cross-account/private or oversized handoffs", () => {
  const data = {
    ...emptySharedWidgetExport(user),
    groups: [group],
    defaultGroupId: id,
  };
  expect(parseSharedWidgetExport(data, user)).toEqual(data);
  expect(parseSharedWidgetExport(undefined, user).groups).toEqual([]);
  expect(parseSharedWidgetExport(data, other).groups).toEqual([]);
  expect(
    parseSharedWidgetExport({ ...data, token: "secret" }, user).unavailable,
  ).toBe(true);
  expect(
    parseSharedWidgetExport({ ...data, groups: Array(17).fill(group) }, user)
      .unavailable,
  ).toBe(true);
  expect(
    parseSharedWidgetExport(
      {
        ...data,
        groups: [{ ...group, rows: [{ ...group.rows[0], self: false }] }],
      },
      user,
    ).unavailable,
  ).toBe(true);
});
it("ages a retained file in the group zone and never carries active status past the cutoff", () => {
  expect(
    currentSharedProgress(group, Date.parse("2026-10-20T21:01:00Z")),
  ).toMatchObject({ today: "2026-10-21", stale: true });
  const ended = currentSharedProgress(
    group,
    Date.parse("2026-10-25T21:00:00Z"),
  );
  expect(ended).toMatchObject({
    phase: "unconfirmed",
    round: { active: false },
    stale: true,
    rows: group.rows,
  });
});
