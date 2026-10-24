import { plannerQuit } from "./sync/quitBarrier";

/** Register before rendering, so Quit also works while auth/storage is opening. */
export async function installNativeQuit(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  const [{ listen }, { invoke }] = await Promise.all([
    import("@tauri-apps/api/event"),
    import("@tauri-apps/api/core"),
  ]);
  let quitting = false;
  await listen("facta-request-quit", () => {
    if (quitting) return;
    quitting = true;
    void (async () => {
      const result = await plannerQuit.flush();
      if (result !== "flushed")
        console.error(`[Facta] Quit storage barrier: ${result}`);
      await invoke("finish_quit");
    })().catch((error) => console.error("[Facta] Quit failed", error));
  });
  // Re-deliver a tray request made before the listener existed.
  await invoke("quit_listener_ready");
}
