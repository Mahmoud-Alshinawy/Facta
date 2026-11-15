import type { SharedSync } from "@/lib/sync/shared/engine";
import { sharedGroupView } from "./view";
import { sharedRequests } from "./requests";

/** Groups with a check-in or undo still being queued, per engine. */
const inFlight = new WeakMap<SharedSync, Set<string>>();

/** Use one captured instant for the group's day and check-in state.
 * Ignore concurrent toggles and wait for outstanding group requests.
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
