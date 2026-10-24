import { describe, expect, it } from "vitest";
import {
  emptySharedState,
  encodeSharedState,
  decodeSharedState,
} from "./state";
import { acknowledge, appendCheckin, prepareCheckin } from "./outbox";
import { mapSnapshot } from "@/lib/sharedGoals/contracts";
import { reconcileSnapshot } from "@/lib/sharedGoals/cache";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_OTHER,
  SHARED_GROUP,
  SHARED_RANGE,
  SHARED_NOW,
} from "@/test/sharedFixtures";

describe("saved shared account record", () => {
  it("restores exact prepared command bytes and rejects wrong-account or corrupt state", () => {
    const data = mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE);
    const state = emptySharedState(SHARED_USER);
    state.cache = reconcileSnapshot(null, data, SHARED_RANGE, SHARED_NOW);
    state.outbox = appendCheckin(
      [],
      [],
      data,
      SHARED_USER,
      { groupId: SHARED_GROUP, date: "2026-10-20", completed: true },
      SHARED_NOW,
    );
    state.outbox = [prepareCheckin(state.outbox[0], [], data, SHARED_NOW)];
    const original = JSON.stringify(state.outbox[0].command);
    const saved = encodeSharedState(state);
    expect(
      JSON.stringify(decodeSharedState(saved, SHARED_USER).outbox[0].command),
    ).toBe(original);
    expect(() => decodeSharedState(saved, SHARED_OTHER)).toThrow();
    expect(() => decodeSharedState("broken", SHARED_USER)).toThrow();
    const tampered = JSON.parse(saved);
    tampered.outbox[0].command.payload.completed = false;
    expect(() =>
      decodeSharedState(JSON.stringify(tampered), SHARED_USER),
    ).toThrow();
    tampered.outbox = [];
    tampered.drafts = [
      {
        id: crypto.randomUUID(),
        fields: { token: "secret" },
        updatedAt: SHARED_NOW,
      },
    ];
    expect(() =>
      decodeSharedState(JSON.stringify(tampered), SHARED_USER),
    ).toThrow();
  });
  it("restores rejected intents alongside their committed negative receipts for review", () => {
    const snapshot = mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE);
    const state = emptySharedState(SHARED_USER);
    state.cache = reconcileSnapshot(null, snapshot, SHARED_RANGE, SHARED_NOW);
    const intent = prepareCheckin(
      appendCheckin(
        [],
        [],
        snapshot,
        SHARED_USER,
        { groupId: SHARED_GROUP, date: "2026-10-20", completed: true },
        SHARED_NOW,
      )[0],
      [],
      snapshot,
      SHARED_NOW,
    );
    Object.assign(
      state,
      acknowledge(
        [intent],
        [],
        intent,
        { ok: false, code: "conflict", revision: 2, completed: false },
        SHARED_NOW,
      ),
    );
    const restored = decodeSharedState(encodeSharedState(state), SHARED_USER);
    expect(restored.outbox[0]).toMatchObject({
      id: intent.id,
      phase: "failed",
      failure: "conflict",
    });
    expect(restored.receipts[0]).toMatchObject({
      id: intent.id,
      outcome: { ok: false, code: "conflict" },
    });
  });
});
