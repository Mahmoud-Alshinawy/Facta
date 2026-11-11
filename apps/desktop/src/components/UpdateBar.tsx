import { useCallback, useEffect, useRef, useState } from "react";
import { plannerQuit } from "@/lib/sync/quitBarrier";
import {
  shouldShowUpdateBar,
  updateBarText,
  type UpdateStatus,
} from "@/lib/updates";

const isDesktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * "Update ready, restart to install" (docs/updater.md, section 3). Nothing is
 * installed until Restart is pressed here or in the tray.
 */
export default function UpdateBar() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"idle" | "widgets" | "installing">(
    "idle",
  );
  const [error, setError] = useState("");
  const restarting = useRef(false);

  const refresh = useCallback(async () => {
    const [{ invoke }, { getCurrentWindow }] = await Promise.all([
      import("@tauri-apps/api/core"),
      import("@tauri-apps/api/window"),
    ]);
    const [next, shown] = await Promise.all([
      invoke<UpdateStatus>("update_status"),
      getCurrentWindow().isVisible(),
    ]);
    setStatus(next);
    setVisible(shown && document.visibilityState === "visible");
  }, []);

  const restart = useCallback(async () => {
    if (restarting.current) return;
    restarting.current = true;
    setError("");
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      setPhase("widgets");
      await invoke("prepare_update");
      setPhase("installing");
      // Save local data right before Facta exits, as Quit does.
      const saved = await plannerQuit.flush();
      if (saved !== "flushed")
        console.error(`[Facta] Update storage barrier: ${saved}`);
      await invoke("install_update");
    } catch (reason) {
      console.error("[Facta] Update failed", reason);
      setError("The update could not be installed. Try again later.");
      setPhase("idle");
      restarting.current = false;
      void refresh().catch(() => {});
    }
  }, [refresh]);

  useEffect(() => {
    if (!isDesktop()) return;
    let active = true;
    const unlisten: Array<() => void> = [];
    const update = () => {
      if (active) void refresh().catch(() => {});
    };
    void (async () => {
      const [{ listen }, { getCurrentWindow }] = await Promise.all([
        import("@tauri-apps/api/event"),
        import("@tauri-apps/api/window"),
      ]);
      const subscriptions = await Promise.all([
        listen("update-ready", update),
        listen("update-installing", update),
        listen("update-restart-requested", () => void restart()),
        getCurrentWindow().onFocusChanged(update),
      ]);
      if (active) unlisten.push(...subscriptions);
      else subscriptions.forEach((stop) => stop());
      update();
    })();
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", update);
      unlisten.forEach((stop) => stop());
    };
  }, [refresh, restart]);

  const busy = phase !== "idle";
  if (!status || (!busy && !shouldShowUpdateBar(status, dismissed, visible)))
    return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-[12px] border border-border bg-card px-4 py-2.5 text-sm text-foreground shadow-lg"
    >
      <span>{updateBarText(status, phase)}</span>
      {status.version && !busy && (
        <span className="font-mono text-xs text-muted-foreground">
          {status.version}
        </span>
      )}
      {!busy && (
        <>
          <button
            type="button"
            onClick={() => void restart()}
            className="h-8 rounded-[8px] bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-accent-hover"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={() => setDismissed(status.version)}
            className="h-8 rounded-[8px] px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Later
          </button>
        </>
      )}
      {error && (
        <span role="alert" className="basis-full text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
