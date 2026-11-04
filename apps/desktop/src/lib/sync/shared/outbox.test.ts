import { describe, expect, it } from "vitest";
import {
  appendCheckin,
  datedAhead,
  prepareCheckin,
  type CheckinIntent,
} from "./outbox";
import { mapSnapshot } from "@/lib/sharedGoals/contracts";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_GROUP,
  SHARED_RANGE,
  SHARED_NOW,
} from "@/test/sharedFixtures";

describe("durable shared intent reducer", () => {
  it("coalesces only unattempted edits; an in-flight command and captured date stay immutable", () => {
    const snapshot = mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE);
    const args = { groupId: SHARED_GROUP, date: "2026-10-20", completed: true };
    const first = appendCheckin(
      [],
      [],
      snapshot,
      SHARED_USER,
      args,
      SHARED_NOW,
    );
    const coalesced = appendCheckin(
      first,
      [],
      snapshot,
      SHARED_USER,
      { ...args, completed: false },
      SHARED_NOW + 1,
    );
    expect(coalesced).toHaveLength(1);
    expect(coalesced[0].id).not.toBe(first[0].id);
    const prepared = prepareCheckin(first[0], [], snapshot, SHARED_NOW);
    expect(prepared.command?.payload.date).toBe("2026-10-20");
    const original = JSON.stringify(prepared.command);
    const waiting = appendCheckin(
      [prepared],
      [],
      snapshot,
      SHARED_USER,
      { ...args, completed: false },
      SHARED_NOW + 2,
    );
    expect(waiting).toHaveLength(2);
    expect(waiting[1].after).toBe(prepared.id);
    expect(JSON.stringify(waiting[0].command)).toBe(original);
    const receipt = {
      id: prepared.id,
      groupId: SHARED_GROUP,
      membershipId: prepared.membershipId,
      date: prepared.date,
      outcome: {
        ok: true,
        code: "checked",
        revision: 1,
        completed: true,
        id: crypto.randomUUID(),
      },
      confirmedAt: SHARED_NOW,
    };
    const next = prepareCheckin(
      waiting[1],
      [receipt],
      snapshot,
      SHARED_NOW + 3,
    );
    expect(next.command?.payload).toMatchObject({
      base_revision: 1,
      completed: false,
      date: "2026-10-20",
    });
    expect(
      prepareCheckin(prepared, [], snapshot, SHARED_NOW + 86_400_000).command,
    ).toEqual(prepared.command);
  });
});

describe("a refused check-in from a clock that was ahead", () => {
  const snapshot = mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE);
  // Asia/Riyadh is UTC+3: 20:58Z is 23:58 on the 20th, 21:03Z is 00:03 on the 21st.
  const corrected = Date.parse("2026-10-20T20:58:00Z");
  const failed = (date: string, capturedAt: string) =>
    ({
      groupId: SHARED_GROUP,
      date,
      capturedAt,
      phase: "failed",
      failure: "invalid_date",
    }) as CheckinIntent;

  it("is dated ahead when its day hasn't started here yet", () => {
    expect(
      datedAhead(
        failed("2026-10-21", "2026-10-20T21:03:00Z"),
        snapshot,
        corrected,
      ),
    ).toBe(true);
  });
  it("is not dated ahead on the same day, so Try again can re-stamp it", () => {
    expect(
      datedAhead(
        failed("2026-10-20", "2026-10-20T20:59:00Z"),
        snapshot,
        corrected,
      ),
    ).toBe(false);
  });
  it("is not dated ahead when the stamp is in the past", () => {
    expect(
      datedAhead(
        failed("2026-10-20", "2026-10-20T09:00:00Z"),
        snapshot,
        corrected,
      ),
    ).toBe(false);
  });
  it("is not dated ahead once that day has started", () => {
    expect(
      datedAhead(
        failed("2026-10-21", "2026-10-20T21:03:00Z"),
        snapshot,
        Date.parse("2026-10-20T21:01:00Z"),
      ),
    ).toBe(false);
  });
});
