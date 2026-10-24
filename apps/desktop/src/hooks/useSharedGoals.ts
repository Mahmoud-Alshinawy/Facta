import { useSyncExternalStore } from "react";
import { useSharedSyncEngine } from "./useSync";
import type { SharedState } from "@/lib/sync/shared/state";
import type { SharedStatus } from "@/lib/sync/shared/engine";

const noop = () => () => {};
const waiting: SharedStatus = {
  state: "paused",
  pending: 0,
  failed: 0,
  storageError: false,
  lastError: null,
  lastSyncedAt: null,
};
const noData = (): SharedState | null => null;

/** Data/status only. Shared screens and deep-link routes start in Step 3. */
export function useSharedGoals() {
  const engine = useSharedSyncEngine();
  const data = useSyncExternalStore(
    engine?.subscribe ?? noop,
    engine?.getSnapshot ?? noData,
  );
  const status = useSyncExternalStore(
    engine?.subscribe ?? noop,
    engine?.getStatus ?? (() => waiting),
  );
  return { engine, data, status };
}
