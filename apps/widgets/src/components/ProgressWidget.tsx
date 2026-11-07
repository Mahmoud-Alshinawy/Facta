import { useEffect, useState } from "react";
import { parseSharedWidgetExport } from "@facta/calendar";
import type { SharedData } from "@/lib/sharedData";
import { prefsFrom, type WidgetGoal } from "@/lib/today";
import ProgressCard from "./ProgressCard";
export default function ProgressWidget({
  theme,
  translucent,
}: {
  theme: string;
  translucent: boolean;
}) {
  const [data, setData] = useState<SharedData | null>(null),
    [id, setId] = useState<string | null>(null),
    [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let disposed = false,
      reading = false,
      last = 0,
      identified = false;
    const read = async () => {
      if (reading) return;
      reading = true;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const next = await invoke<SharedData>("read_shared_data");
        if (disposed) return;
        if ((next.exported_at_ms ?? 0) > last) {
          last = next.exported_at_ms ?? 0;
          setData(next);
        }
        if (!identified) {
          identified = true;
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          if (!disposed)
            setId(getCurrentWindow().label.replace(/^widget-/, ""));
        }
        setError("");
      } catch {
        if (!disposed)
          setError(
            "Could not refresh widget data. Retained values may be stale.",
          );
      } finally {
        reading = false;
      }
    };
    void read();
    const timer = setInterval(() => {
      setNow(Date.now());
      void read();
    }, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  const config = data?.config?.widgets?.find((w: any) => w?.id === id) as
    | {
        theme?: string;
        translucent?: boolean;
        sharedGroupId?: string;
        sharedUserId?: string;
      }
    | undefined;
  const bundle = parseSharedWidgetExport(
    data?.shared_goals,
    data?.user_id ?? null,
  );
  const open = async (groupId: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_main_app", { section: "goals", groupId });
    } catch {
      setError("Could not open this group in Facta.");
    }
  };
  return (
    <div style={{ height: "100vh" }}>
      {id && data ? (
        <ProgressCard
          data={bundle}
          goals={(data?.goals ?? []) as WidgetGoal[]}
          now={now}
          timeFormat={prefsFrom(data.config).timeFormat}
          widgetId={id}
          theme={config?.theme ?? theme}
          translucent={config?.translucent ?? translucent}
          error={error}
          configuredId={
            config?.sharedUserId === data?.user_id
              ? (config?.sharedGroupId ?? null)
              : null
          }
          onOpen={open}
        />
      ) : (
        <p role="status">{error || "Reading Facta data…"}</p>
      )}
    </div>
  );
}
