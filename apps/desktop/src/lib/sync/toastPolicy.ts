// Decides when the sync status turns into a toast. Pure, so it can be tested
// without React.
//
// A toast is shown once per distinct problem. The "already shown" memory is
// cleared only when sync gets back to idle, so the brief "syncing" state of
// each retry doesn't re-arm it. Each kind of toast has a fixed id, so even a
// new message replaces the previous toast of that kind instead of stacking.

import type { SyncStatus } from "@/lib/sync/engine";
import type { SharedStatus } from "@/lib/sync/shared/engine";

export type SyncToastId =
  "sync-offline" | "sync-error" | "sync-failed" | "sync-storage";
export const SYNC_TOAST_IDS: readonly SyncToastId[] = [
  "sync-offline",
  "sync-error",
  "sync-failed",
  "sync-storage",
];

export type SharedToastId =
  "shared-offline" | "shared-error" | "shared-failed" | "shared-storage";
export const SHARED_TOAST_IDS: readonly SharedToastId[] = [
  "shared-offline",
  "shared-error",
  "shared-failed",
  "shared-storage",
];

export interface SyncToast<Id extends string = SyncToastId> {
  id: Id;
  message: string;
  failed: number;
}

export interface ToastDecision<Id extends string = SyncToastId> {
  /** Remembered for the next call. */
  shown: string | null;
  /** Show (or replace) this toast. */
  show: SyncToast<Id> | null;
  /** Sync recovered: dismiss every sync toast. */
  clear: boolean;
}

export function decideSyncToast(
  shown: string | null,
  status: SyncStatus,
): ToastDecision {
  return decideToast(shown, status, "sync");
}

/** The same rules for shared goals, with their own fixed toast ids. */
export function decideSharedToast(
  shown: string | null,
  status: SharedStatus,
): ToastDecision<SharedToastId> {
  return decideToast(shown, status, "shared");
}

function decideToast<Prefix extends "sync" | "shared">(
  shown: string | null,
  status: {
    state: string;
    failed: number;
    lastError: string | null;
    storageError?: boolean;
  },
  prefix: Prefix,
): ToastDecision<`${Prefix}-${"storage" | "offline" | "failed" | "error"}`> {
  if (
    status.state === "idle" ||
    status.state === "paused" ||
    (status.state === "local-only" && !status.lastError)
  )
    return { shown: null, show: null, clear: shown !== null };
  if (
    !["error", "offline", "unavailable"].includes(status.state) ||
    !status.lastError
  ) {
    // syncing, local-only, or no message: keep whatever is showing.
    return { shown, show: null, clear: false };
  }
  const kind = status.storageError
    ? "storage"
    : status.state === "offline"
      ? "offline"
      : status.failed > 0
        ? "failed"
        : "error";
  const id = `${prefix}-${kind}` as const;
  const key = `${id}|${status.failed}|${status.lastError}`;
  if (key === shown) return { shown, show: null, clear: false };
  return {
    shown: key,
    show: { id, message: status.lastError, failed: status.failed },
    clear: false,
  };
}
