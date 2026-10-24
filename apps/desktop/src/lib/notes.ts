import { noteBodyText } from "./noteBody";
import type { Note, NoteBlock, NoteColor } from "@/types/planner";
import { startOfWeekFor, type WeekStart } from "@facta/calendar";

export const NOTE_COLORS: {
  value: NoteColor | null;
  label: string;
  token: string;
}[] = [
  { value: null, label: "No colour", token: "var(--control-border)" },
  { value: "a", label: "Amber", token: "var(--note-a)" },
  { value: "b", label: "Blue", token: "var(--note-b)" },
  { value: "c", label: "Pink", token: "var(--note-c)" },
  { value: "d", label: "Green", token: "var(--note-d)" },
];
export const noteColor = (note: Pick<Note, "color">) =>
  NOTE_COLORS.find((c) => c.value === note.color)?.token ?? "var(--text-2)";
export const noteTitle = (note: Pick<Note, "title">) =>
  note.title?.trim() || "Untitled";

/** The grid shows four content blocks, keeping list/checklist meaning visible. */
export function noteCardPreview(note: Pick<Note, "body">): string {
  const text = note.body
    .filter((block) => block.type !== "heading" && block.type !== "divider")
    .slice(0, 4)
    .map((block) => {
      const text = noteBodyText([block]);
      return block.type === "checklist"
        ? `${block.checked ? "[x]" : "[ ]"} ${text}`
        : block.type === "bullet"
          ? `- ${text}`
          : text;
    })
    .join("\n");
  return [...text].slice(0, 440).join("");
}
export type NoteFilter =
  "all" | "pinned" | "recent" | "trash" | `tag:${string}`;

export function selectNotes(
  notes: readonly Note[],
  filter: NoteFilter,
  query: string,
  now = Date.now(),
): Note[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return notes
    .filter((note) => {
      if (Boolean(note.trashedAt) !== (filter === "trash")) return false;
      if (filter === "pinned" && !note.pinned) return false;
      if (
        filter === "recent" &&
        Date.parse(note.updatedAt ?? note.createdAt) < now - 7 * 86400000
      )
        return false;
      if (filter.startsWith("tag:") && !note.tags.includes(filter.slice(4)))
        return false;
      const text =
        `${noteTitle(note)}\n${noteBodyText(note.body)}\n${note.tags.join(" ")}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        Date.parse(b.updatedAt ?? b.createdAt) -
          Date.parse(a.updatedAt ?? a.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

export function captureNote(
  text: string,
  color: NoteColor | null = null,
): Partial<Note> {
  const [first = "", ...rest] = text.replace(/\r\n?/g, "\n").split("\n");
  const body: NoteBlock[] = rest.map((line) => ({
    id: crypto.randomUUID(),
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
  return { title: first.trim() || null, body, color, tags: ["inbox"] };
}

export function noteSection(
  note: Note,
  now: Date,
  weekStart: WeekStart = 0,
): string {
  if (note.pinned) return "PINNED";
  const edited = new Date(note.updatedAt ?? note.createdAt);
  if (edited.toDateString() === now.toDateString()) return "TODAY";
  const start = startOfWeekFor(now, weekStart);
  return edited >= start ? "THIS WEEK" : "EARLIER";
}
