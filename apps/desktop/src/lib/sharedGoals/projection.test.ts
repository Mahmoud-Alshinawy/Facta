import { describe, expect, it } from "vitest";
import { mapSnapshot } from "./contracts";
import { reconcileSnapshot } from "./cache";
import { emptySharedState } from "@/lib/sync/shared/state";
import { projectSharedProgress } from "./projection";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_OTHER,
  SHARED_GROUP,
  SHARED_RANGE,
  SHARED_NOW,
} from "@/test/sharedFixtures";

describe("shared Progress handoff", () => {
  const state = () => ({
    ...emptySharedState(SHARED_USER),
    cache: reconcileSnapshot(
      null,
      mapSnapshot(sharedRpcFixture(), SHARED_USER, SHARED_RANGE),
      SHARED_RANGE,
      SHARED_NOW,
    ),
  });
  it("exports bounded server values and pending/stale labels without private data", () => {
    const saved = state();
    const view = projectSharedProgress(saved, SHARED_USER, SHARED_NOW)!;
    expect(view.groupId).toBe(SHARED_GROUP);
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]).toMatchObject({
      rank: 1,
      adherencePct: 0,
      isAtLeast70: false,
      self: true,
    });
    expect(view.stale).toBe(false);
    expect(view.pending).toBe(false);
    expect(
      projectSharedProgress(
        { ...saved, needsRefresh: true },
        SHARED_USER,
        SHARED_NOW,
      )?.stale,
    ).toBe(true);
    expect(
      projectSharedProgress(saved, SHARED_USER, SHARED_NOW + 180_000)?.stale,
    ).toBe(true);
    const json = JSON.stringify(view);
    for (const privateField of [
      "token",
      "invites",
      "profiles",
      "drafts",
      "capturedAt",
    ])
      expect(json).not.toContain(privateField);
    expect(new TextEncoder().encode(json).length).toBeLessThan(4096);
  });
  it("never fabricates a score for absent history and clears invalid selections/accounts", () => {
    const saved = state();
    expect(projectSharedProgress(saved, SHARED_OTHER, SHARED_NOW)).toBeNull();
    expect(
      projectSharedProgress(saved, SHARED_USER, SHARED_NOW, SHARED_OTHER),
    ).toBeNull();
    const empty = {
      ...saved,
      cache: {
        ...saved.cache!,
        snapshot: { ...saved.cache!.snapshot, rounds: [], scores: [] },
      },
    };
    expect(projectSharedProgress(empty, SHARED_USER, SHARED_NOW)).toMatchObject(
      { round: null, rows: [], stale: true },
    );
    expect(
      projectSharedProgress(
        emptySharedState(SHARED_USER),
        SHARED_USER,
        SHARED_NOW,
      ),
    ).toBeNull();
  });
  it("limits an eight-person leaderboard to top three plus self, preserving server ranks", () => {
    const saved = state();
    const own = saved.cache!.snapshot.scores[0];
    const scores = Array.from({ length: 8 }, (_, i) => ({
      ...own,
      userId: i === 7 ? SHARED_USER : crypto.randomUUID(),
      membershipId: crypto.randomUUID(),
      displayName: `Member ${i + 1}`,
      rank: i + 1,
      adherencePct: [100, 95, 90, 80, 75, 65, 60, 50][i],
      isAtLeast70: i < 5,
      rosterSize: 8,
    }));
    const expanded = {
      ...saved,
      cache: {
        ...saved.cache!,
        snapshot: {
          ...saved.cache!.snapshot,
          scores,
          rounds: [{ ...saved.cache!.snapshot.rounds[0], rosterSize: 8 }],
        },
      },
    };
    const view = projectSharedProgress(expanded, SHARED_USER, SHARED_NOW)!;
    expect(view.rows.map((r) => r.rank)).toEqual([1, 2, 3, 8]);
    expect(view.rows.at(-1)).toMatchObject({
      self: true,
      adherencePct: 50,
      isAtLeast70: false,
    });
  });
});
