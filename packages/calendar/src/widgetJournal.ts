/** Small, editor-independent protocol used by the companion and Settings preview. */
export type WidgetNoteColor = "a" | "b" | "c" | "d";
export interface WidgetNote {
  id: string;
  title: string;
  preview: string;
  color: WidgetNoteColor | null;
  pinned: boolean;
  truncated: boolean;
  words: number;
  updatedAt: string;
}
export interface WidgetDiaryLine {
  date: string;
  oneLine: string;
}
export interface WidgetJournal {
  notes: WidgetNote[];
  recentIds: string[];
  noteCount: number;
  omittedPinned: number;
  diary: {
    date: string;
    today: WidgetDiaryLine | null;
    past: WidgetDiaryLine[];
  };
}
export interface WidgetActionResult {
  id: string;
  error?: string;
}
export type JournalAction = { id: string; user_id: string } & (
  | {
      type: "edit_note";
      note_id: string;
      base: { title: string; preview: string; color: WidgetNoteColor | null };
      patch: {
        title?: string;
        preview?: string;
        color?: WidgetNoteColor | null;
      };
    }
  | { type: "quick_note"; text: string }
  | { type: "diary_line"; date: string; line: string; baseLine: string | null }
);
export const WIDGET_PREVIEW_CHARS = 800;
export const WIDGET_EDIT_CHARS = 4000;
export const emptyWidgetJournal = (date: string): WidgetJournal => ({
  notes: [],
  recentIds: [],
  noteCount: 0,
  omittedPinned: 0,
  diary: { date, today: null, past: [] },
});
