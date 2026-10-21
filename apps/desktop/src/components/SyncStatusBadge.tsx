import { useSyncEngine, useSyncStatus } from "@/hooks/useSync";
import { useNow } from "@/hooks/useNow";

function ago(ms: number | null, now: number): string | null {
  if (ms === null) return null;
  const min = Math.floor((now - ms) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** The sync line at the bottom of the sidebar. Click to sync now. */
export default function SyncStatusBadge() {
  const engine = useSyncEngine();
  const status = useSyncStatus();
  const now = useNow(30_000).getTime();
  if (!engine) return null;

  let dot = "bg-success";
  let label = "Synced";
  let detail = ago(status.lastSyncedAt, now);
  if (status.state === "local-only") {
    dot = "bg-subtle";
    label = "This device only";
    detail = null;
  } else if (status.state === "syncing") {
    dot = "bg-accent animate-pulse";
    label = "Syncing…";
    detail = null;
  } else if (status.state === "offline") {
    dot = "bg-warning";
    label = "Offline";
    detail = status.pending > 0 ? `${status.pending} pending` : null;
  } else if (status.state === "error") {
    dot = "bg-danger";
    label = status.failed > 0 ? `${status.failed} not synced` : "Sync error";
    detail = null;
  } else if (status.lastSyncedAt === null) {
    // Idle but never synced yet (just started): nothing to claim.
    label = "Ready";
  }

  const title =
    status.state === "local-only"
      ? "Supabase isn't configured in this build, so data stays on this device."
      : status.lastError ?? "Sync now";

  return (
    <button
      type="button"
      onClick={() => { void engine.syncNow(); }}
      disabled={status.state === "local-only"}
      title={title}
      aria-label={detail ? `${label}, ${detail}` : label}
      className="flex w-full items-center gap-2 rounded-md px-2 pt-2.5 text-left text-xs text-subtle hover:text-text-2 disabled:cursor-default"
    >
      <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${dot}`} />
      <span className="sync-t flex min-w-0 items-center gap-1">
        <span className="text-text-2">{label}</span>
        {detail && <span className="truncate">· {detail}</span>}
      </span>
    </button>
  );
}
