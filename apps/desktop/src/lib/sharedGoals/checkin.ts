import type { SharedSync } from "@/lib/sync/shared/engine";
import { sharedGroupView } from "./view";

/**
 * Check in, or undo, for the group's own day. The display can be a minute old,
 * so the caller captures the instant once and both the day and the checked
 * state are derived from it here. The outbox keeps that capture unchanged.
 */
export async function toggleSharedCheckin(
  engine: SharedSync,
  groupId: string,
  captured: number,
): Promise<void> {
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
  await engine.enqueueCheckin({
    groupId: action.group.id,
    date: action.today,
    completed: !action.checked,
    capturedAt: new Date(captured).toISOString(),
  });
}
