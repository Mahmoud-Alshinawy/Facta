import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PlannerSync, type SyncStatus } from "@/lib/sync/engine";
import { browserStore } from "@/lib/sync/storage";
import { SYNC_TOAST_IDS, decideSyncToast } from "@/lib/sync/toastPolicy";
import { createSupabaseRemotes } from "@/lib/sync/supabaseRemote";
import { requestWidgetExport } from "@/lib/widgetExportBus";

// The signed-in user as of right now. Flushes and pulls check it after every
// request and drop their results if it changed underneath them.
let activeUserId: string | null = null;

const SyncContext = createContext<PlannerSync | null>(null);

/**
 * Creates the sync engine once auth has resolved and a user is signed in.
 * Until then there is no engine, so nothing is read or written under "anon".
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const userId = loading ? null : user?.id ?? null;
  const [engine, setEngine] = useState<PlannerSync | null>(null);

  useEffect(() => {
    activeUserId = userId;
    if (!userId) {
      setEngine(null);
      return;
    }
    const next = new PlannerSync({
      userId,
      store: browserStore,
      remotes: isSupabaseConfigured ? createSupabaseRemotes(userId) : null,
      currentUserId: () => activeUserId,
      onCacheWrite: requestWidgetExport,
      // One toast per burst: sonner replaces a toast that has the same id.
      onServerWon: (table, outcome) => {
        const what = table === "goals" ? "A goal" : "An event";
        toast.info(
          outcome === "deleted" ? `${what} was deleted on another device` : `${what} was changed on another device`,
          { id: "sync-server-won", description: "That version was newer, so it replaced your edit here." },
        );
      },
    });
    next.load();
    next.start();
    setEngine(next);
    return () => {
      if (activeUserId === userId) activeUserId = null;
      next.dispose();
    };
  }, [userId]);

  return (
    <SyncContext.Provider value={engine}>
      {engine && <SyncErrorToasts engine={engine} />}
      {children}
    </SyncContext.Provider>
  );
}

/** The engine for the signed-in user, or null before auth has resolved. */
export function useSyncEngine(): PlannerSync | null {
  return useContext(SyncContext);
}

const NO_ENGINE_STATUS: SyncStatus = { state: "idle", pending: 0, failed: 0, lastError: null, lastSyncedAt: null };
const noopSubscribe = () => () => {};

export function useSyncStatus(): SyncStatus {
  const engine = useSyncEngine();
  return useSyncExternalStore(
    engine ? engine.subscribe : noopSubscribe,
    engine ? engine.getStatus : () => NO_ENGINE_STATUS,
  );
}

/** One toast per distinct problem; see lib/sync/toastPolicy.ts. */
function SyncErrorToasts({ engine }: { engine: PlannerSync }) {
  const status = useSyncExternalStore(engine.subscribe, engine.getStatus);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const decision = decideSyncToast(shown.current, status);
    shown.current = decision.shown;
    if (decision.clear) {
      for (const id of SYNC_TOAST_IDS) toast.dismiss(id);
    }
    const t = decision.show;
    if (!t) return;
    // Only one kind of sync toast at a time.
    for (const id of SYNC_TOAST_IDS) if (id !== t.id) toast.dismiss(id);
    if (t.id === "sync-offline") {
      toast.warning("Sync paused", {
        id: t.id,
        description: `${t.message}. Your changes are saved on this device and will sync when the connection is back.`,
      });
    } else if (t.id === "sync-error") {
      toast.error("Sync isn't working right now", {
        id: t.id,
        description: `${t.message}. Your changes are kept on this device and sync will keep retrying.`,
      });
    } else {
      const n = t.failed;
      const items = n === 1 ? "1 item" : `${n} items`;
      toast.error(`${items} couldn't be saved to the server`, {
        id: t.id,
        description: `${t.message}. They are still on this device. Retry, or delete ${n === 1 ? "it" : "them"} from this device (anything never uploaded is lost).`,
        duration: Infinity,
        action: { label: "Retry", onClick: () => { void engine.retryFailed(); } },
        cancel: { label: `Delete ${items} from this device`, onClick: () => { void engine.discardFailed(); } },
      });
    }
  }, [engine, status]);

  return null;
}
