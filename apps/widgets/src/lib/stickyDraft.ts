import {
  WIDGET_EDIT_CHARS,
  type JournalAction,
  type WidgetNote,
} from "@facta/calendar";

export type StickyFields = Pick<WidgetNote, "title" | "preview" | "color">;
export interface StickySave {
  id: string;
  base: StickyFields;
  values: StickyFields;
}
export interface StickyDraft extends StickyFields {
  base: WidgetNote;
  attempt: StickySave | null;
}
const fields = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const v = value as StickyFields;
  return (
    typeof v.title === "string" &&
    v.title.length <= 1000 &&
    typeof v.preview === "string" &&
    v.preview.length <= WIDGET_EDIT_CHARS * 2 &&
    (v.color === null || ["a", "b", "c", "d"].includes(v.color))
  );
};
export function readStickyDraft(
  raw: string | null,
  note: WidgetNote,
): StickyDraft {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (fields(saved) && saved.base?.id === note.id && fields(saved.base)) {
      const attempt = saved.attempt;
      if (
        attempt != null &&
        (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          attempt.id,
        ) ||
          !fields(attempt.base) ||
          !fields(attempt.values))
      )
        throw new Error("Invalid saved attempt");
      return { ...saved, attempt: attempt ?? null };
    }
  } catch {
    /* A malformed recovery record must not replace the exported note. */
  }
  return {
    title: note.title,
    preview: note.preview,
    color: note.color,
    base: note,
    attempt: null,
  };
}
export function stickySaveAction(
  noteId: string,
  save: StickySave,
): Omit<Extract<JournalAction, { type: "edit_note" }>, "id" | "user_id"> {
  const patch: Extract<JournalAction, { type: "edit_note" }>["patch"] = {};
  if (save.values.title !== save.base.title) patch.title = save.values.title;
  if (save.values.preview !== save.base.preview)
    patch.preview = save.values.preview;
  if (save.values.color !== save.base.color) patch.color = save.values.color;
  return { type: "edit_note", note_id: noteId, base: save.base, patch };
}
export const sameStickyFields = (a: StickyFields, b: StickyFields) =>
  a.title === b.title && a.preview === b.preview && a.color === b.color;
