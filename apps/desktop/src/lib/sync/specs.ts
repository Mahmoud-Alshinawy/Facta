import type { Note, DiaryEntry } from "@/types/planner";
import type { CollectionSpec } from "./collection";
import {
  noteFromRow,
  noteToRow,
  prepareNote,
  diaryFromRow,
  diaryToRow,
  prepareDiary,
  type NoteRow,
  type DiaryRow,
} from "./mappers";

export const noteSpec: CollectionSpec<"notes", Note, NoteRow> = {
  table: "notes",
  cacheKeyBase: "planner_notes",
  toWrite: noteToRow,
  fromRow: noteFromRow,
  localOnly: [],
  prepare: prepareNote,
};
export const diarySpec: CollectionSpec<"diary_entries", DiaryEntry, DiaryRow> =
  {
    table: "diary_entries",
    cacheKeyBase: "planner_diary_entries",
    toWrite: diaryToRow,
    fromRow: diaryFromRow,
    localOnly: [],
    naturalKey: (entry) => entry.date,
    writeKey: (entry) => entry.date,
    prepare(entry, previous) {
      if (previous && previous.date !== entry.date)
        throw new Error("Diary date cannot change");
      return prepareDiary({
        ...entry,
        createdAt: previous?.createdAt ?? entry.createdAt,
      });
    },
  };
