import { describe, expect, it } from "vitest";
import {
  makeCommand,
  mapSnapshot,
  mapOutcome,
  snapshotToRows,
} from "./contracts";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_OTHER,
  SHARED_GROUP,
  SHARED_MEMBER,
  SHARED_RANGE,
} from "@/test/sharedFixtures";

describe("shared RPC contracts", () => {
  it("accepts optional nullable join eligibility while rejecting invalid dates", () => {
    expect(
      mapOutcome({ ok: true, code: "joined", eligible_round: null }),
    ).toMatchObject({ eligibleRound: null });
    expect(
      mapOutcome({ ok: true, code: "joined", eligible_round: "2026-10-26" }),
    ).toMatchObject({ eligibleRound: "2026-10-26" });
    expect(() =>
      mapOutcome({ ok: true, code: "joined", eligible_round: "2026-02-30" }),
    ).toThrow();
  });
  it("maps a complete authorized snapshot without inventing pending or inactive scores", () => {
    const data = sharedRpcFixture();
    const mapped = mapSnapshot(data, SHARED_USER, SHARED_RANGE);
    expect(mapped.groups[0]).toMatchObject({
      id: SHARED_GROUP,
      timeZone: "Asia/Riyadh",
      firstRoundDate: "2026-10-19",
    });
    expect(mapped.scores[0]).toMatchObject({
      completedDays: 0,
      adherencePct: 0,
      rank: 1,
    });
    data.rounds = [];
    data.scores = [];
    expect(mapSnapshot(data, SHARED_USER, SHARED_RANGE).scores).toEqual([]);
    expect(() =>
      mapSnapshot({ ...data, memberships: [] }, SHARED_USER, SHARED_RANGE),
    ).toThrow();
    expect(() =>
      mapSnapshot({ ...data, scores: undefined }, SHARED_USER, SHARED_RANGE),
    ).toThrow();
    expect(() =>
      mapSnapshot({ ...data, token: "secret" }, SHARED_USER, SHARED_RANGE),
    ).toThrow();
    expect(() =>
      mapSnapshot(data, "88888888-8888-4888-8888-888888888888", SHARED_RANGE),
    ).toThrow();
  });
  it("clones and freezes a finite command, rejecting actor/score injection", () => {
    const payload = {
      group_id: SHARED_GROUP,
      membership_id: SHARED_MEMBER,
      date: "2026-10-20",
      captured_at: "2026-10-20T09:00:00Z",
      completed: true,
      base_revision: 0,
    };
    const command = makeCommand("set_checkin", payload);
    const original = JSON.stringify(command);
    payload.completed = false;
    expect(JSON.stringify(command)).toBe(original);
    expect(Object.isFrozen(command.payload)).toBe(true);
    expect(() =>
      makeCommand("set_checkin", {
        ...payload,
        user_id: SHARED_OTHER,
      } as never),
    ).toThrow();
    expect(() =>
      makeCommand("set_checkin", { ...payload, score: 100 } as never),
    ).toThrow();
  });
  it("preserves the server threshold flag across disk round trips and decodes lifecycle receipts", () => {
    const mapped = mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE);
    expect(mapped.scores[0].isAtLeast70).toBe(false);
    expect(
      mapSnapshot(snapshotToRows(mapped), SHARED_USER, SHARED_RANGE).scores[0]
        .isAtLeast70,
    ).toBe(false);
    expect(
      mapOutcome({ ok: true, code: "left", group_id: SHARED_GROUP }),
    ).toMatchObject({ ok: true, code: "left" });
    expect(
      mapOutcome({
        ok: true,
        code: "owner_transferred",
        group_id: SHARED_GROUP,
      }),
    ).toMatchObject({ ok: true, code: "owner_transferred" });
    expect(() => mapOutcome({ ok: true, code: "left" })).toThrow();
  });
});
