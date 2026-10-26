import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { SharedSync } from "@/lib/sync/shared/engine";
import { createSharedRemote } from "@/lib/sync/shared/remote";
import { PlannerSync, type SyncStatus } from "@/lib/sync/engine";
import { IndexedDbStore, storageErrorMessage } from "@/lib/sync/indexedDbStore";
import { SYNC_TOAST_IDS, decideSyncToast } from "@/lib/sync/toastPolicy";
import { createSupabaseRemotes } from "@/lib/sync/supabaseRemote";
import {
  requestWidgetExport,
  setWidgetExportStore,
  setWidgetExportUser,
} from "@/lib/widgetExportBus";

// The signed-in user as of right now. Flushes and pulls check it after every
// request and drop their results if it changed underneath them.
let activeUserId: string | null = null;

const SyncContext = createContext<PlannerSync | null>(null);
const SharedSyncContext = createContext<SharedSync | null>(null);

/**
 * Creates the sync engine once auth has resolved and a user is signed in.
 * Until then there is no engine, so nothing is read or written under "anon".
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const userId = loading ? null : (user?.id ?? null);
  const [engine, setEngine] = useState<PlannerSync | null>(null);
  const [shared, setShared] = useState<SharedSync | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // An unresolved initial auth read is not a confirmed account change.
    if (loading) return;
    activeUserId = userId;
    setEngine(null);
    setShared(null);
    setOpenError(null);
    setWidgetExportStore(userId, null);
    setWidgetExportUser(userId);
    const exportClock = setInterval(requestWidgetExport, 30_000);
    if (!userId) {
      setEngine(null);
      return () => clearInterval(exportClock);
    }
    let cancelled = false;
    let next: PlannerSync | null = null;
    let nextShared: SharedSync | null = null;
    let store: IndexedDbStore | null = null;
    void (async () => {
      try {
        store = await IndexedDbStore.create(userId);
        if (cancelled) {
          await store.close();
          return;
        }
        next = new PlannerSync({
          userId,
          store,
          remotes: isSupabaseConfigured ? createSupabaseRemotes(userId) : null,
          currentUserId: () => activeUserId,
          onCacheWrite: requestWidgetExport,
          // One toast per burst: sonner replaces a toast that has the same id.
          onServerWon: (table, outcome) => {
            const what =
              table === "goals"
                ? "A goal"
                : table === "events"
                  ? "An event"
                  : table === "notes"
                    ? "A note"
                    : "A diary entry";
            toast.info(
              outcome === "deleted"
                ? `${what} was deleted on another device`
                : `${what} was changed on another device`,
              {
                id: "sync-server-won",
                description:
                  "That version was newer, so it replaced your edit here.",
              },
            );
          },
        });
        next.load();
        await store.flush();
        if (cancelled) {
          next.dispose();
          await store.close();
          return;
        }
        setWidgetExportStore(userId, store);
        next.start();
        setEngine(next);
        // Shared initialization/retries never join the personal sync chain.
        // Missing schema or a damaged shared record must not block Mine/Notes.
        try {
          nextShared = new SharedSync({
            userId,
            store,
            remote: isSupabaseConfigured
              ? createSharedRemote(userId, supabase)
              : null,
            currentUserId: () => activeUserId,
            onCacheWrite: requestWidgetExport,
          });
          nextShared.load();
          nextShared.start();
          setShared(nextShared);
        } catch {
          nextShared?.dispose();
          toast.error(
            "Shared goals could not start. Your personal planner is still available.",
            { id: "shared-sync-start" },
          );
        }
      } catch (error) {
        next?.dispose();
        if (!cancelled) setOpenError(storageErrorMessage(error));
        // Failed writes remain in the store's pending batch. Do not claim
        // success or remove the legacy cache when opening fails.
      }
    })();
    return () => {
      clearInterval(exportClock);
      cancelled = true;
      if (activeUserId === userId) activeUserId = null;
      setWidgetExportStore(null, null);
      next?.dispose();
      nextShared?.dispose();
      if (store) void store.close().catch(() => {});
    };
  }, [userId, attempt, loading]);

  if (userId && (!engine || engine.userId !== userId))
    return (
      <main
        className="min-h-screen flex items-center justify-center p-6"
        aria-busy={!openError}
      >
        {openError ? (
          <div role="alert" className="max-w-lg space-y-3">
            <p>{openError}</p>
            <button
              type="button"
              className="rounded border p-2 focus-visible:outline-2"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry opening local storage
            </button>
          </div>
        ) : (
          <p role="status">Opening your saved planner…</p>
        )}
      </main>
    );

  return (
    <SyncContext.Provider value={engine}>
      <SharedSyncContext.Provider value={shared}>
        {engine && <SyncErrorToasts engine={engine} />}
        {shared && <SharedErrorToasts engine={shared} />}
        {children}
      </SharedSyncContext.Provider>
    </SyncContext.Provider>
  );
}

/** The engine for the signed-in user, or null before auth has resolved. */
export function useSyncEngine(): PlannerSync | null {
  return useContext(SyncContext);
}
export function useSharedSyncEngine(): SharedSync | null {
  const engine = useContext(SharedSyncContext);
  const { user, loading } = useAuth();
  return !loading && engine?.userId === user?.id ? engine : null;
}

function SharedErrorToasts({ engine }: { engine: SharedSync }) {
  const status = useSyncExternalStore(engine.subscribe, engine.getStatus);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!status.lastError) {
      if (shown.current) toast.dismiss("shared-sync-error");
      shown.current = null;
      return;
    }
    if (shown.current === status.lastError) return;
    shown.current = status.lastError;
    toast.error(
      status.storageError
        ? "Shared changes could not be saved on this device"
        : "Shared goals need attention",
      {
        id: "shared-sync-error",
        description: status.lastError,
        ...(status.storageError
          ? {
              duration: Infinity,
              action: {
                label: "Retry saving",
                onClick: () => {
                  void engine.retrySaving().catch(() => {});
                },
              },
            }
          : {}),
      },
    );
  }, [engine, status]);
  return null;
}

const NO_ENGINE_STATUS: SyncStatus = {
  state: "idle",
  pending: 0,
  failed: 0,
  lastError: null,
  lastSyncedAt: null,
};
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
    if (t.id === "sync-storage") {
      toast.error("Recent edits could not be saved on this device", {
        id: t.id,
        description: t.message,
        duration: Infinity,
        action: {
          label: "Retry saving",
          onClick: () => {
            void engine.flush();
          },
        },
      });
    } else if (t.id === "sync-offline") {
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
        action: {
          label: "Retry",
          onClick: () => {
            void engine.retryFailed();
          },
        },
        cancel: {
          label: `Delete ${items} from this device`,
          onClick: () => {
            void engine.discardFailed();
          },
        },
      });
    }
  }, [engine, status]);

  return null;
}
