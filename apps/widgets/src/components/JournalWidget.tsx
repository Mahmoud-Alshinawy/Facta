import { useCallback, useEffect, useRef, useState } from "react";
import { emptyWidgetJournal, type WidgetActionResult } from "@facta/calendar";
import type { SharedData } from "@/lib/sharedData";
import { DiaryCard, NotesCard, type JournalDraft } from "./JournalCards";
import { localDay } from "@/lib/today";

export default function JournalWidget({
  type,
  theme,
  translucent,
  noteStyle,
}: {
  type: "notes" | "diary";
  theme: string;
  translucent: boolean;
  noteStyle: "sticky" | "stack";
}) {
  const [data, setData] = useState<SharedData | null>(null),
    [status, setStatus] = useState("Reading Facta data…");
  const [scope, setScope] = useState("");
  const [config, setConfig] = useState({ theme, translucent, noteStyle });
  const source = useRef(data);
  source.current = data;
  const pending = useRef(
    new Map<string, { resolve: () => void; reject: (error: Error) => void }>(),
  );
  useEffect(() => {
    let disposed = false,
      reading = false,
      last = 0;
    async function read() {
      if (reading) return;
      reading = true;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const next = await invoke<SharedData>("read_shared_data");
        if (disposed) return;
        if ((next.exported_at_ms ?? 0) > last) {
          last = next.exported_at_ms ?? 0;
          const oldUser = source.current?.user_id;
          source.current = next;
          setData(next);
          if (oldUser && oldUser !== next.user_id) {
            for (const p of pending.current.values())
              p.reject(
                new Error(
                  "The signed-in account changed. Your edit remains in the pending file.",
                ),
              );
            pending.current.clear();
          }
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const id = getCurrentWindow().label.replace(/^widget-/, "");
          setScope(id);
          const w = next.config?.widgets?.find((w: any) => w?.id === id) as
            | {
                theme?: string;
                translucent?: boolean;
                noteStyle?: "sticky" | "stack";
              }
            | undefined;
          if (w)
            setConfig({
              theme: w.theme ?? theme,
              translucent: w.translucent ?? translucent,
              noteStyle: w.noteStyle ?? "sticky",
            });
        }
        for (const result of next.action_results ?? []) {
          const waiter = pending.current.get(result.id);
          if (!waiter) continue;
          pending.current.delete(result.id);
          // Let the projection render before the card adopts its confirmed value.
          requestAnimationFrame(() =>
            result.error
              ? waiter.reject(new Error(result.error))
              : waiter.resolve(),
          );
        }
        setStatus(
          !next.user_id
            ? "Sign in to Facta to use your widgets."
            : type === "diary" && next.journal?.diary.date !== localDay()
              ? "Open Facta to refresh today's diary."
              : "",
        );
      } catch (error) {
        if (!disposed) setStatus(`Could not read Facta data. ${String(error)}`);
      } finally {
        reading = false;
      }
    }
    void read();
    const timer = setInterval(() => void read(), 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
      for (const p of pending.current.values())
        p.reject(new Error("Widget closed; queued edits remain on disk."));
      pending.current.clear();
    };
  }, [theme, translucent, type]);
  const send = useCallback(async (draft: JournalDraft) => {
    const userId = source.current?.user_id;
    if (!userId) throw new Error("Sign in to Facta first.");
    const id = crypto.randomUUID(),
      action = { ...draft, id, user_id: userId };
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_action", { actionJson: JSON.stringify(action) });
    await new Promise<void>((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      const result: WidgetActionResult | undefined =
        source.current?.action_results?.find((r) => r.id === id);
      if (result) {
        pending.current.delete(id);
        result.error ? reject(new Error(result.error)) : resolve();
      }
    });
  }, []);
  const open = async (section: "notes" | "diary", noteId?: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_main_app", { section, noteId: noteId ?? null });
    } catch (error) {
      setStatus(`Could not open Facta. ${String(error)}`);
    }
  };
  const journal = data?.journal ?? emptyWidgetJournal(localDay());
  const props = {
    ...config,
    journal,
    draftScope: data?.user_id && scope ? `${data.user_id}.${scope}` : undefined,
    onSend: send,
    onOpen: open,
    status,
    disabled:
      !data?.user_id || (type === "diary" && journal.diary.date !== localDay()),
  };
  return (
    <div className="journal-window">
      {type === "notes" ? (
        <NotesCard
          key={`${data?.user_id ?? "signed-out"}.${scope}`}
          {...props}
          style={config.noteStyle}
        />
      ) : (
        <DiaryCard
          key={`${data?.user_id ?? "signed-out"}.${scope}`}
          {...props}
        />
      )}
    </div>
  );
}
