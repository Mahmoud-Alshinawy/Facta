import {
  WIDGET_EDIT_CHARS,
  dayIndex,
  type WidgetActionResult,
  type JournalAction,
} from "@facta/calendar";
import type { PlannerSync } from "./sync/engine";
import { readJson } from "./sync/storage";
import { keyOf, toggledOn } from "./calendarData";
import { noteBodyText } from "./noteBody";
import { editNotePreview, widgetNote } from "./widgetJournal";
import type { NoteColor } from "@/types/planner";

export const widgetReceiptsKey = (userId: string) =>
  `planner_widget_receipts_${userId}`;
export const widgetReceipts = (engine: PlannerSync) =>
  readJson<WidgetActionResult[]>(
    engine.localStore,
    widgetReceiptsKey(engine.userId),
    [],
  );
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && [...v].length <= max;
const color = (v: unknown): v is NoteColor | null =>
  v === null || ["a", "b", "c", "d"].includes(v as string);
function writeAction(
  engine: PlannerSync,
  a: Record<string, unknown>,
  now: Date,
) {
  if (a.type === "toggle_goal") {
    if (typeof a.goal_id !== "string") throw new Error("Invalid goal action");
    const goal = engine.goals.get(a.goal_id);
    if (goal) engine.goals.upsert({ ...goal, ...toggledOn(goal, keyOf(now)) });
  } else if (a.type === "quick_note") {
    if (!text(a.text, 500) || !a.text.trim())
      throw new Error("A quick note needs 1–500 characters.");
    // The action id is the entity id, so a retry cannot create another note.
    if (engine.notes.get(a.id as string)) return;
    engine.notes.upsert({
      id: a.id as string,
      title: a.text.trim(),
      body: [],
      color: "a",
      tags: [],
      pinned: false,
      pinnedToWidget: false,
      font: null,
      align: null,
      links: [],
      trashedAt: null,
      createdAt: now.toISOString(),
    });
  } else if (a.type === "edit_note") {
    if (!uuid(a.note_id) || !object(a.base) || !object(a.patch))
      throw new Error("Invalid note action");
    const note = engine.notes.get(a.note_id);
    if (!note || note.trashedAt)
      throw new Error(
        "This note was removed. Open Notes to review your widget draft.",
      );
    const current = widgetNote(note),
      patch = a.patch,
      base = a.base;
    for (const field of Object.keys(patch)) {
      if (!["title", "preview", "color"].includes(field))
        throw new Error("Invalid note field");
      if (
        field === "preview"
          ? typeof base.preview !== "string" ||
            !noteBodyText(note.body).startsWith(base.preview)
          : current[field as keyof typeof current] !== base[field]
      )
        throw new Error(
          "This note changed in Facta. Your widget draft is kept; open Notes to review it.",
        );
    }
    if (patch.title !== undefined && !text(patch.title, 500))
      throw new Error("Note title is too long.");
    if (
      patch.preview !== undefined &&
      (!text(patch.preview, WIDGET_EDIT_CHARS) ||
        !text(base.preview, WIDGET_EDIT_CHARS))
    )
      throw new Error("Widget note text is too long.");
    if (patch.color !== undefined && !color(patch.color))
      throw new Error("Invalid note colour");
    engine.notes.upsert({
      ...note,
      ...(patch.title !== undefined
        ? { title: (patch.title as string).trim() || null }
        : {}),
      ...(patch.color !== undefined
        ? { color: patch.color as NoteColor | null }
        : {}),
      ...(patch.preview !== undefined
        ? {
            body: editNotePreview(
              note.body,
              base.preview as string,
              patch.preview as string,
              a.id as string,
            ),
          }
        : {}),
    });
  } else if (a.type === "diary_line") {
    if (
      typeof a.date !== "string" ||
      !Number.isFinite(dayIndex(a.date)) ||
      a.date > keyOf(now) ||
      !text(a.line, 120) ||
      !a.line.trim()
    )
      throw new Error("Diary lines need a valid date and 1–120 characters.");
    const current = engine.diaryEntries
      .getSnapshot()
      .find((e) => e.date === a.date);
    if (
      (current?.oneLine ?? null) !== a.baseLine &&
      current?.oneLine !== a.line.trim()
    )
      throw new Error(
        "This diary line changed in Facta. Your widget draft is kept; open Diary to review it.",
      );
    engine.diaryEntries.upsert({
      id: current?.id ?? (a.id as string),
      date: a.date,
      oneLine: a.line.trim(),
      mood: current?.mood ?? 3,
      body: current?.body ?? null,
      tags: current?.tags ?? [],
      createdAt: current?.createdAt ?? now.toISOString(),
    });
  } else throw new Error("Unsupported widget action");
}
/** Mutation + receipt enter one IndexedDB transaction. Ack only after durability.
 * Null means another account owns the action: leave it queued for that account. */
export async function applyWidgetAction(
  engine: PlannerSync,
  input: unknown,
  now = new Date(),
): Promise<WidgetActionResult | null> {
  if (!object(input) || !uuid(input.id)) return null;
  if (input.user_id !== undefined && input.user_id !== engine.userId)
    return null;
  if (input.type !== "toggle_goal" && input.user_id !== engine.userId)
    return null;
  const receipts = widgetReceipts(engine),
    previous = receipts.find((r) => r.id === input.id);
  if (previous) {
    await engine.localStore.flush?.();
    return previous;
  }
  let result: WidgetActionResult = { id: input.id };
  try {
    writeAction(engine, input, now);
  } catch (error) {
    result = {
      id: input.id,
      error:
        error instanceof Error
          ? error.message
          : "Could not apply this widget edit.",
    };
  }
  engine.localStore.set(
    widgetReceiptsKey(engine.userId),
    JSON.stringify([...receipts, result].slice(-512)),
  );
  await engine.localStore.flush?.();
  return result;
}
export type { JournalAction };
