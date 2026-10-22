import { useCallback, useSyncExternalStore } from "react";
import { useSyncEngine } from "./useSync";
import { extractNoteLinks } from "@/lib/noteBody";
import type { Note } from "@/types/planner";

const EMPTY: Note[] = [];
const noop = () => () => {};
export function useNotes() {
  const engine = useSyncEngine();
  // Includes Trash so restore and backlinks can distinguish it from tombstones.
  const notes = useSyncExternalStore(
    engine ? engine.subscribe : noop,
    engine ? engine.notes.getSnapshot : () => EMPTY,
  );
  const addNote = useCallback(
    (draft: Partial<Omit<Note, "id" | "updatedAt" | "createdAt">> = {}) => {
      if (!engine) return null;
      const body = draft.body ?? [];
      return engine.notes.upsert({
        title: null,
        body,
        color: null,
        tags: [],
        pinned: false,
        pinnedToWidget: false,
        font: null,
        align: null,
        trashedAt: null,
        ...draft,
        links: extractNoteLinks(body),
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
    },
    [engine],
  );
  const updateNote = useCallback(
    (
      id: string,
      patch: Partial<Omit<Note, "id" | "updatedAt" | "createdAt">>,
    ) => {
      const current = engine?.notes.get(id);
      if (!engine || !current) return null;
      return engine.notes.upsert({ ...current, ...patch });
    },
    [engine],
  );
  const trashNote = useCallback(
    (id: string) => updateNote(id, { trashedAt: new Date().toISOString() }),
    [updateNote],
  );
  const restoreNote = useCallback(
    (id: string) => updateNote(id, { trashedAt: null }),
    [updateNote],
  );
  const deleteNotePermanently = useCallback(
    (id: string) => engine?.notes.remove(id),
    [engine],
  );
  return {
    notes,
    addNote,
    updateNote,
    trashNote,
    restoreNote,
    deleteNotePermanently,
  };
}
