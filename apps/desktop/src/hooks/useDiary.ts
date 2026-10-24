import { useCallback, useSyncExternalStore } from "react";
import { useSyncEngine } from "./useSync";
import type { DiaryEntry } from "@/types/planner";

const EMPTY: DiaryEntry[] = [];
const noop = () => () => {};
export function useDiary() {
  const engine = useSyncEngine();
  const entries = useSyncExternalStore(
    engine ? engine.subscribe : noop,
    engine ? engine.diaryEntries.getSnapshot : () => EMPTY,
  );
  const saveEntry = useCallback(
    (
      draft: Pick<DiaryEntry, "date" | "oneLine"> &
        Partial<Pick<DiaryEntry, "mood" | "body" | "tags">>,
    ) => {
      if (!engine) return null;
      const existing = engine.diaryEntries
        .getSnapshot()
        .find((entry) => entry.date === draft.date);
      return engine.diaryEntries.upsert({
        id: existing?.id ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        mood: existing?.mood ?? 3,
        body: existing?.body ?? null,
        tags: existing?.tags ?? [],
        ...draft,
      });
    },
    [engine],
  );
  const deleteEntry = useCallback(
    (id: string) => engine?.diaryEntries.remove(id),
    [engine],
  );
  return { entries, saveEntry, deleteEntry };
}
