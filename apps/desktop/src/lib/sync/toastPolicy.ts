// Decides when the sync status turns into a toast. Pure, so it can be tested
// without React.
//
// A toast is shown once per distinct problem. The "already shown" memory is
// cleared only when sync gets back to idle, so the brief "syncing" state of
// each retry doesn't re-arm it. Each kind of toast has a fixed id, so even a
// new message replaces the previous toast of that kind instead of stacking.

import type { SyncStatus } from "@/lib/sync/engine";

export type SyncToastId =
  "sync-offline" | "sync-error" | "sync-failed" | "sync-storage";
export const SYNC_TOAST_IDS: readonly SyncToastId[] = [
  "sync-offline",
  "sync-error",
  "sync-failed",
  "sync-storage",
];

export interface SyncToast {
  id: SyncToastId;
  message: string;
  failed: number;
}

export interface ToastDecision {
  /** Remembered for the next call. */
  shown: string | null;
  /** Show (or replace) this toast. */
  show: SyncToast | null;
  /** Sync recovered: dismiss every sync toast. */
  clear: boolean;
}

export function decideSyncToast(
  shown: string | null,
  status: SyncStatus,
): ToastDecision {
  if (
    status.state === "idle" ||
    (status.state === "local-only" && !status.lastError)
  )
    return { shown: null, show: null, clear: shown !== null };
  if (
    (status.state !== "error" && status.state !== "offline") ||
    !status.lastError
  ) {
    // syncing, local-only, or no message: keep whatever is showing.
    return { shown, show: null, clear: false };
  }
  const id: SyncToastId = status.storageError
    ? "sync-storage"
    : status.state === "offline"
      ? "sync-offline"
      : status.failed > 0
        ? "sync-failed"
        : "sync-error";
  const key = `${id}|${status.failed}|${status.lastError}`;
  if (key === shown) return { shown, show: null, clear: false };
  return {
    shown: key,
    show: { id, message: status.lastError, failed: status.failed },
    clear: false,
  };
}
