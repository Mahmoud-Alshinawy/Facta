import { useEffect } from "react";
import { toast } from "sonner";
import { useSyncEngine } from "./useSync";
import { applyWidgetAction } from "@/lib/widgetActions";
import { requestWidgetExport } from "@/lib/widgetExportBus";

export function useWidgetActions() {
  const engine = useSyncEngine();
  useEffect(() => {
    if (!engine || !(window as any).__TAURI_INTERNALS__) return;
    let cancelled = false,
      unlisten: (() => void) | undefined,
      pause: (() => Promise<unknown>) | undefined;
    let chain = Promise.resolve();
    const queued = new Set<string>();
    const consumerId = crypto.randomUUID();
    void (async () => {
      const { invoke } = await import("@tauri-apps/api/core"),
        { listen } = await import("@tauri-apps/api/event");
      const apply = (actions: unknown[]) => {
        const fresh = actions.filter((a: any) => {
          if (typeof a?.id !== "string" || queued.has(a.id)) return false;
          queued.add(a.id);
          return true;
        });
        chain = chain
          .then(async () => {
            for (const action of fresh) {
              if (cancelled) return;
              const result = await applyWidgetAction(engine, action);
              if (!result) {
                queued.delete((action as { id: string }).id);
                continue;
              }
              if (result.error) toast.error(result.error, { id: result.id });
              if (cancelled) return;
              await invoke("ack_widget_actions", { ids: [result.id] });
              requestWidgetExport();
              queued.delete(result.id);
            }
          })
          .catch((error) => {
            queued.clear();
            toast.error(`Widget edits are still queued: ${String(error)}`, {
              id: "widget-actions-error",
            });
          });
      };
      pause = () =>
        invoke("set_widget_action_delivery", { consumerId, ready: false });
      const un = await listen<unknown[]>("widget-actions", (e) =>
        apply(e.payload),
      );
      if (cancelled) {
        un();
        return;
      }
      unlisten = un;
      await invoke("set_widget_action_delivery", { consumerId, ready: true });
      if (cancelled) {
        await pause();
        return;
      }
      apply(await invoke<unknown[]>("read_pending_actions"));
    })().catch((error) =>
      toast.error(`Could not read widget edits: ${String(error)}`),
    );
    return () => {
      cancelled = true;
      void pause?.()
        .finally(() => unlisten?.())
        .catch(() => {});
    };
  }, [engine]);
}
