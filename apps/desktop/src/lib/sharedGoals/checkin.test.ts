import { expect, it } from "vitest";
import { SharedSync } from "@/lib/sync/shared/engine";
import {
  emptySharedState,
  encodeSharedState,
  sharedStorageKey,
} from "@/lib/sync/shared/state";
import { memoryStore } from "@/lib/sync/storage";
import { mapSnapshot } from "./contracts";
import { reconcileSnapshot } from "./cache";
import { toggleSharedCheckin } from "./checkin";
import {
  sharedRpcFixture,
  SHARED_USER,
  SHARED_GROUP,
  SHARED_RANGE,
  SHARED_NOW,
} from "@/test/sharedFixtures";

function engine(archived = false) {
  const rows = sharedRpcFixture();
  if (archived)
    (rows.groups[0] as { archived_at: string | null }).archived_at =
      "2026-10-20T08:00:00Z";
  const seed = emptySharedState(SHARED_USER);
  seed.cache = reconcileSnapshot(
    null,
    mapSnapshot(rows, SHARED_USER, SHARED_RANGE),
    SHARED_RANGE,
    SHARED_NOW,
  );
  const e = new SharedSync({
    userId: SHARED_USER,
    store: memoryStore({
      [sharedStorageKey(SHARED_USER)]: encodeSharedState(seed),
    }),
    remote: null,
    currentUserId: () => SHARED_USER,
    now: () => SHARED_NOW,
  });
  e.load();
  return e;
}

it("queues a check-in for the group's day at the captured instant, then an undo", async () => {
  const e = engine();
  await toggleSharedCheckin(e, SHARED_GROUP, SHARED_NOW);
  expect(e.getSnapshot().outbox).toEqual([
    expect.objectContaining({
      groupId: SHARED_GROUP,
      date: "2026-10-20",
      completed: true,
      capturedAt: new Date(SHARED_NOW).toISOString(),
    }),
  ]);
  await toggleSharedCheckin(e, SHARED_GROUP, SHARED_NOW);
  // Not yet sent, so the undo replaces the queued check-in.
  expect(e.getSnapshot().outbox).toEqual([
    expect.objectContaining({ completed: false }),
  ]);
  e.dispose();
});

it("refuses in plain words when the group can't take a check-in", async () => {
  const e = engine(true);
  await expect(
    toggleSharedCheckin(e, SHARED_GROUP, SHARED_NOW),
  ).rejects.toThrow("Archived");
  expect(e.getSnapshot().outbox).toEqual([]);
  e.dispose();
});
