import { AlertTriangle, CheckCircle2, CloudOff, HardDrive, RefreshCw } from "lucide-react";
import { useSyncEngine, useSyncStatus } from "@/hooks/useSync";

/** Small sync indicator for the sidebar. Click to sync now. */
export default function SyncStatusBadge() {
  const engine = useSyncEngine();
  const status = useSyncStatus();
  if (!engine) return null;

  const pending = status.pending > 0 ? ` · ${status.pending} pending` : "";
  let icon = <CheckCircle2 size={13} className="text-green-600" />;
  let label = "Synced";
  if (status.state === "local-only") {
    icon = <HardDrive size={13} />;
    label = "This device only";
  } else if (status.state === "syncing") {
    icon = <RefreshCw size={13} className="animate-spin" />;
    label = "Syncing…";
  } else if (status.state === "offline") {
    icon = <CloudOff size={13} className="text-orange-500" />;
    label = `Offline${pending}`;
  } else if (status.state === "error") {
    icon = <AlertTriangle size={13} className="text-red-600" />;
    label = status.failed > 0 ? `${status.failed} not synced` : "Sync error";
  }
  // While idle, a pending count only means an edit is about to flush (well
  // under a second), so it isn't shown; it would flicker on every click.

  const title =
    status.state === "local-only"
      ? "Supabase isn't configured in this build, so data stays on this device."
      : status.lastError ?? (status.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString()}` : "Click to sync now");

  return (
    <button
      onClick={() => { void engine.syncNow(); }}
      disabled={status.state === "local-only"}
      title={title}
      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--sidebar-accent))] transition-colors disabled:hover:bg-transparent disabled:cursor-default"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
