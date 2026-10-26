import { expect, it } from "vitest";
import { sharedGroupView, olderHistoryRange } from "./view";
import { sharedCell } from "./view";
import { emptySharedState } from "@/lib/sync/shared/state";
import { mapSnapshot } from "./contracts";
import { reconcileSnapshot } from "./cache";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_GROUP,
  SHARED_RANGE,
  SHARED_NOW,
} from "@/test/sharedFixtures";
it("keeps confirmed rank/score while an offline check-in is pending and respects boundary eligibility", () => {
  const state = emptySharedState(SHARED_USER);
  state.cache = reconcileSnapshot(
    null,
    mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE),
    SHARED_RANGE,
    SHARED_NOW,
  );
  const base = sharedGroupView(state, SHARED_USER, SHARED_GROUP, SHARED_NOW)!;
  expect(base.phase).toBe("active");
  expect(base.canCheck).toBe(true);
  state.outbox = [
    {
      id: crypto.randomUUID(),
      groupId: SHARED_GROUP,
      membershipId: base.member!.id,
      userId: SHARED_USER,
      date: "2026-10-20",
      capturedAt: new Date(SHARED_NOW).toISOString(),
      completed: true,
      baseRevision: 0,
      after: null,
      command: null,
      phase: "queued",
      failure: null,
    },
  ];
  const pending = sharedGroupView(
    state,
    SHARED_USER,
    SHARED_GROUP,
    SHARED_NOW,
  )!;
  expect(pending.checked).toBe(true);
  expect(pending.pending).toBe(true);
  expect(pending.scores).toEqual(base.scores);
  const waiting = structuredClone(state);
  waiting.cache!.snapshot.rounds = [];
  waiting.cache!.snapshot.scores = [];
  waiting.cache!.snapshot.memberships = waiting.cache!.snapshot.memberships.map(
    (m) => ({ ...m, eligibleRound: "2026-10-26" }),
  );
  const view = sharedGroupView(waiting, SHARED_USER, SHARED_GROUP, SHARED_NOW)!;
  expect(view.phase).toBe("waiting");
  expect(view.canCheck).toBe(false);
  expect(view.scores).toEqual([]);
});
function populated() {
  const state = emptySharedState(SHARED_USER);
  state.cache = structuredClone(
    reconcileSnapshot(
      null,
      mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE),
      SHARED_RANGE,
      SHARED_NOW,
    ),
  );
  return state;
}
it("pages history using only coverage for this group revision and stops at its anchor", () => {
  const state = populated(),
    group = state.cache!.snapshot.groups[0];
  state.cache!.windows = [
    {
      from: "2026-01-01",
      until: "2026-12-31",
      confirmedAt: SHARED_NOW,
      versions: { [group.id]: 0 },
    },
    {
      from: "2026-11-02",
      until: "2026-12-01",
      confirmedAt: SHARED_NOW,
      versions: { [group.id]: group.revision },
    },
  ];
  expect(olderHistoryRange(state, group, "2026-12-01")).toEqual({
    from: "2026-10-19",
    until: "2026-11-01",
  });
  state.cache!.windows.push({
    from: "2026-10-19",
    until: "2026-11-01",
    confirmedAt: SHARED_NOW,
    versions: { [group.id]: group.revision },
  });
  expect(olderHistoryRange(state, group, "2026-12-01")).toBeNull();
});
it("distinguishes rest, future, departed and unrostered days without missed-day scores", () => {
  const state = populated(),
    s = state.cache!.snapshot;
  Object.assign(s.groups[0], {
    template: "custom",
    scheduleKind: "days",
    weekdays: [1, 3],
    timesPerWeek: null,
  });
  const v = sharedGroupView(state, SHARED_USER, SHARED_GROUP, SHARED_NOW)!;
  expect(v.rest).toBe(true);
  expect(v.canCheck).toBe(false);
  expect(sharedCell(state, v, v.member, "2026-10-20")).toBe("rest");
  expect(sharedCell(state, v, v.member, "2026-10-21")).toBe("future");
  expect(sharedCell(state, v, v.member, "2026-10-19")).toBe("not done");
  expect(
    sharedCell(
      state,
      v,
      { ...v.member, leftAt: "2026-10-20T12:00:00Z" },
      "2026-10-21",
    ),
  ).toBe("inactive");
  expect(
    sharedCell(
      state,
      v,
      { ...v.member, id: crypto.randomUUID() },
      "2026-10-19",
    ),
  ).toBe("ineligible");
  expect(v.scores).toEqual(s.scores);
});
it("does not let unrelated history reads or another revision refresh the displayed round", () => {
  const state = populated();
  state.cache!.windows[0].confirmedAt = SHARED_NOW - 300_000;
  state.cache!.confirmedAt = SHARED_NOW;
  state.cache!.windows.push({
    from: "2026-09-01",
    until: "2026-09-30",
    confirmedAt: SHARED_NOW,
    versions: { [SHARED_GROUP]: 1 },
  });
  const read = () =>
    sharedGroupView(state, SHARED_USER, SHARED_GROUP, SHARED_NOW)!;
  expect(read().stale).toBe(true);
  expect(read().confirmedAt).toBe(SHARED_NOW - 300_000);
  state.cache!.windows.push({
    ...SHARED_RANGE,
    confirmedAt: SHARED_NOW,
    versions: { [SHARED_GROUP]: 2 },
  });
  expect(read().stale).toBe(true);
  state.cache!.windows.push({
    ...SHARED_RANGE,
    confirmedAt: SHARED_NOW,
    versions: { [SHARED_GROUP]: 1 },
  });
  expect(read().stale).toBe(false);
});
it("preserves historical denominators and tied server ranks while a Gym target is pending", () => {
  const state = populated(),
    s = state.cache!.snapshot;
  s.targets.push({
    ...s.targets[0],
    id: crypto.randomUUID(),
    effectiveRound: "2026-10-26",
    target: 4,
  });
  const v = sharedGroupView(state, SHARED_USER, SHARED_GROUP, SHARED_NOW)!;
  expect(v.effectiveTarget).toBe(2);
  expect(v.pendingTarget?.target).toBe(4);
  expect(v.scores.map((s) => [s.rank, s.target])).toEqual([
    [1, 2],
    [1, 2],
  ]);
  expect(
    sharedGroupView(state, crypto.randomUUID(), SHARED_GROUP, SHARED_NOW),
  ).toBeNull();
  s.memberships[0].leftAt = new Date(SHARED_NOW).toISOString();
  expect(
    sharedGroupView(state, SHARED_USER, SHARED_GROUP, SHARED_NOW),
  ).toBeNull();
});
it("stops accepting checks at the exact round cutoff and does not invent a paused next round while offline", () => {
  const state = populated();
  const end = Date.parse(state.cache!.snapshot.rounds[0].activityEnd);
  expect(
    sharedGroupView(state, SHARED_USER, SHARED_GROUP, end - 1)!.canCheck,
  ).toBe(true);
  const next = sharedGroupView(state, SHARED_USER, SHARED_GROUP, end)!;
  expect(next.canCheck).toBe(false);
  expect(next.phase).toBe("unconfirmed");
  expect(next.scores.map((s) => s.rank)).toEqual([1, 1]);
});
it("makes archival read-only even with an older active round retained in cache", () => {
  const state = emptySharedState(SHARED_USER);
  state.cache = reconcileSnapshot(
    null,
    mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE),
    SHARED_RANGE,
    SHARED_NOW,
  );
  state.cache = structuredClone(state.cache);
  state.cache.snapshot.groups[0].archivedAt = new Date(
    SHARED_NOW,
  ).toISOString();
  const v = sharedGroupView(state, SHARED_USER, SHARED_GROUP, SHARED_NOW)!;
  expect(v.phase).toBe("archived");
  expect(v.canCheck).toBe(false);
});
