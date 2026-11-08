import type { SharedSync } from "@/lib/sync/shared/engine";
import { sharedGroupView } from "./view";
import { sharedRequests } from "./requests";

/** Groups with a check-in or undo still being queued, per engine. */
const inFlight = new WeakMap<SharedSync, Set<string>>();

/**
 * Check in, or undo, for the group's own day. The display can be a minute old,
 * so the caller captures the instant once and both the day and the checked
 * state are derived from it here. The outbox keeps that capture unchanged.
 *
 * Every caller goes through here, so one check-in at a time per group: a
 * second toggle while the first is in flight does nothing and returns false.
 * While a group request is being sent, check-ins wait.
 */
export async function toggleSharedCheckin(
  engine: SharedSync,
  groupId: string,
  captured: number,
): Promise<boolean> {
  if (sharedRequests(engine).getSnapshot().length > 0)
    throw new Error("Wait until the group update has finished.");
  const busy = inFlight.get(engine) ?? new Set<string>();
  inFlight.set(engine, busy);
  if (busy.has(groupId)) return false;
  const action = sharedGroupView(
    engine.getSnapshot(),
    engine.userId,
    groupId,
    captured,
  );
  if (!action?.canCheck)
    throw new Error(
      action?.reason ?? "Connect to the internet to update this group.",
    );
  busy.add(groupId);
  try {
    await engine.enqueueCheckin({
      groupId: action.group.id,
      date: action.today,
      completed: !action.checked,
      capturedAt: new Date(captured).toISOString(),
    });
    return true;
  } finally {
    busy.delete(groupId);
  }
}
