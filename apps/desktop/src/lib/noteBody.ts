import type { Note, NoteBlock, NoteInline, NoteMark } from "@/types/planner";

export const NOTE_BODY_LIMIT = 200 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = [
  "paragraph",
  "heading",
  "checklist",
  "bullet",
  "quote",
  "code",
  "divider",
];
const COLORS = ["a", "b", "c", "d"];
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function validTags(tags: unknown): tags is string[] {
  return (
    Array.isArray(tags) &&
    tags.length <= 20 &&
    tags.every(
      (tag) =>
        typeof tag === "string" &&
        [...tag].length >= 1 &&
        [...tag].length <= 50,
    )
  );
}
function validMark(mark: unknown): mark is NoteMark {
  if (!object(mark)) return false;
  if (mark.type === "bold" || mark.type === "italic") return true;
  if (mark.type === "color")
    return typeof mark.color === "string" && COLORS.includes(mark.color);
  if (mark.type === "link" && typeof mark.href === "string") {
    try {
      return ["http:", "https:", "mailto:"].includes(
        new URL(mark.href).protocol,
      );
    } catch {
      return false;
    }
  }
  return false;
}
function validInline(inline: unknown): inline is NoteInline {
  if (
    !object(inline) ||
    (inline.marks !== undefined &&
      (!Array.isArray(inline.marks) || !inline.marks.every(validMark)))
  )
    return false;
  return (
    (inline.type === "text" && typeof inline.text === "string") ||
    (inline.type === "noteLink" &&
      typeof inline.noteId === "string" &&
      UUID.test(inline.noteId) &&
      typeof inline.label === "string")
  );
}

export function validateNoteBody(value: unknown): asserts value is NoteBlock[] {
  if (!Array.isArray(value))
    throw new Error("Note body must be an array of blocks");
  const ids = new Set<string>();
  for (const block of value) {
    if (
      !object(block) ||
      typeof block.id !== "string" ||
      !block.id ||
      ids.has(block.id) ||
      typeof block.type !== "string" ||
      !TYPES.includes(block.type) ||
      !Array.isArray(block.content) ||
      !block.content.every(validInline)
    )
      throw new Error("Invalid note block or inline content");
    ids.add(block.id);
    if (
      block.type === "heading" &&
      (typeof block.level !== "number" || ![1, 2, 3].includes(block.level))
    )
      throw new Error("Heading level must be 1, 2 or 3");
    if (block.type === "checklist" && typeof block.checked !== "boolean")
      throw new Error("Checklist state is required");
    if (block.type === "divider" && block.content.length)
      throw new Error("Divider cannot contain text");
    if (
      block.type === "code" &&
      block.content.some(
        (inline) => inline.type !== "text" || inline.marks?.length,
      )
    )
      throw new Error("Code blocks contain plain text only");
    if (block.language !== undefined && typeof block.language !== "string")
      throw new Error("Invalid code language");
  }
  // PostgreSQL jsonb::text adds spaces after separators. This conservative
  // representation bounds both transport bytes and the server's text check.
  const json = JSON.stringify(value, null, 1);
  if (new TextEncoder().encode(json).length > NOTE_BODY_LIMIT)
    throw new Error("Note body exceeds 200 KB");
}

export function extractNoteLinks(body: readonly NoteBlock[]): string[] {
  return [
    ...new Set(
      body.flatMap((block) =>
        block.type === "code"
          ? []
          : block.content.flatMap((inline) =>
              inline.type === "noteLink" && UUID.test(inline.noteId)
                ? [inline.noteId.toLowerCase()]
                : [],
            ),
      ),
    ),
  ].sort();
}
export const noteBodyText = (body: readonly NoteBlock[]) =>
  body
    .map((block) =>
      block.content
        .map((inline) => (inline.type === "text" ? inline.text : inline.label))
        .join(""),
    )
    .join("\n");
export function noteWordCount(note: Pick<Note, "title" | "body">): number {
  const text = `${note.title ?? ""}\n${noteBodyText(note.body)}`;
  return [
    ...new Intl.Segmenter(undefined, { granularity: "word" }).segment(text),
  ].filter((part) => part.isWordLike).length;
}
export const noteBacklinks = (notes: readonly Note[], id: string) =>
  notes.filter(
    (note) =>
      !note.trashedAt &&
      note.id !== id &&
      extractNoteLinks(note.body).includes(id.toLowerCase()),
  );
