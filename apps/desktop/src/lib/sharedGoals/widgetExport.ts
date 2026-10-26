import {
  emptySharedWidgetExport,
  type SharedWidgetExport,
} from "@facta/calendar";
import type { KeyValueStore } from "@/lib/sync/storage";
import { decodeSharedState, sharedStorageKey } from "@/lib/sync/shared/state";
import { projectSharedWidgetExport, sharedProgressChoices } from "./projection";
/** Read only after the export bus has flushed its captured account store. */
export function storedSharedWidgetExport(
  store: KeyValueStore | null,
  userId: string | null,
  now: number,
  preferred: readonly string[] = [],
  offline = false,
): { data: SharedWidgetExport; allowed?: Set<string> } {
  if (!userId || !store)
    return {
      data: { ...emptySharedWidgetExport(userId), unavailable: !!userId },
    };
  try {
    const raw = store.get(sharedStorageKey(userId));
    const state = raw ? decodeSharedState(raw, userId) : null;
    return {
      data: projectSharedWidgetExport(state, userId, now, preferred, offline),
      ...(state?.cache
        ? {
            allowed: new Set(
              sharedProgressChoices(state, userId, now).map((v) => v.group.id),
            ),
          }
        : {}),
    };
  } catch {
    return { data: { ...emptySharedWidgetExport(userId), unavailable: true } };
  }
}
