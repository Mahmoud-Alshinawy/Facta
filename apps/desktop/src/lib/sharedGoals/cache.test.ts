import { describe, expect, it } from "vitest";
import { mapSnapshot } from "./contracts";
import { reconcileSnapshot, forgetGroup, confirmCheckin } from "./cache";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_GROUP,
  SHARED_MEMBER,
  SHARED_RANGE,
  SHARED_NOW,
} from "@/test/sharedFixtures";

describe("shared snapshot reconciliation", () => {
  it("keeps history outside the page, invalidates changed groups and removes revoked groups", () => {
    const old = mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE);
    const first = reconcileSnapshot(
      null,
      old,
      { from: "2026-10-19", until: "2026-10-25" },
      SHARED_NOW,
    );
    const next = structuredClone(old);
    next.rounds = [];
    next.scores = [];
    const page = { from: "2026-10-26", until: "2026-11-01" };
    const unchanged = reconcileSnapshot(first, next, page, SHARED_NOW + 1);
    expect(unchanged.snapshot.rounds).toHaveLength(1);
    expect(unchanged.windows).toHaveLength(2);
    const changed = { ...next, groups: [{ ...next.groups[0], revision: 2 }] };
    expect(
      reconcileSnapshot(first, changed, page, SHARED_NOW + 2).snapshot.rounds,
    ).toEqual([]);
    const revoked = {
      ...next,
      groups: [],
      memberships: [],
      profiles: [next.profiles[0]],
      invites: [],
      targets: [],
    };
    expect(
      reconcileSnapshot(first, revoked, page, SHARED_NOW + 3).snapshot.groups,
    ).toEqual([]);
    expect(
      reconcileSnapshot(first, revoked, page, SHARED_NOW + 3).snapshot.scores,
    ).toEqual([]);
    expect(first.snapshot.groups[0].id).toBe(SHARED_GROUP);
  });
  it("purges a confirmed leave immediately without claiming a new snapshot for other groups", () => {
    const cache = reconcileSnapshot(
      null,
      mapSnapshot(
        {
          ...sharedRpcFixture(),
          lifecycle: [
            { group_id: SHARED_GROUP, first_scored_round: "2026-10-19" },
          ],
        },
        SHARED_USER,
        SHARED_RANGE,
      ),
      SHARED_RANGE,
      SHARED_NOW,
    );
    const removed = forgetGroup(cache, SHARED_GROUP, SHARED_USER)!;
    expect(removed.confirmedAt).toBe(SHARED_NOW);
    expect(removed.snapshot.groups).toEqual([]);
    expect(removed.snapshot.lifecycle).toEqual([]);
    expect(removed.snapshot.memberships).toEqual([]);
    expect(removed.snapshot.targets).toEqual([]);
    expect(removed.snapshot.scores).toEqual([]);
    expect(removed.snapshot.profiles.map((p) => p.userId)).toEqual([
      SHARED_USER,
    ]);
    expect(removed.windows).toEqual([]);
    expect(cache.snapshot.groups).toHaveLength(1);
  });
});

describe("an accepted check-in in the cache", () => {
  const intent = {
    groupId: SHARED_GROUP,
    membershipId: SHARED_MEMBER,
    userId: SHARED_USER,
    date: "2026-10-20",
    capturedAt: new Date(SHARED_NOW).toISOString(),
  };
  const cache = reconcileSnapshot(
    null,
    mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE),
    SHARED_RANGE,
    SHARED_NOW,
  );
  const id = crypto.randomUUID();
  const ok = (revision: number, completed: boolean) => ({
    ok: true,
    code: "checked",
    id,
    revision,
    completed,
  });

  it("takes the server's id, revision and state, and keeps a newer row", () => {
    const first = confirmCheckin(cache, intent, ok(1, true), SHARED_NOW)!;
    expect(first.snapshot.checkins).toMatchObject([
      { id, revision: 1, completed: true, checkinDate: "2026-10-20" },
    ]);
    const undone = confirmCheckin(first, intent, ok(2, false), SHARED_NOW)!;
    expect(undone.snapshot.checkins).toMatchObject([
      { id, revision: 2, completed: false },
    ]);
    expect(confirmCheckin(undone, intent, ok(1, true), SHARED_NOW)).toBe(
      undone,
    );
    expect(
      confirmCheckin(
        cache,
        intent,
        { ok: false, code: "conflict" },
        SHARED_NOW,
      ),
    ).toBe(cache);
    expect(first.snapshot.scores).toBe(cache.snapshot.scores);
  });
});
