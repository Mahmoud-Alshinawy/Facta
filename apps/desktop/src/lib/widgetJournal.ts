import {
  WIDGET_PREVIEW_CHARS,
  emptyWidgetJournal,
  type WidgetJournal,
  type WidgetNote,
} from "@facta/calendar";
import type { Note, NoteBlock, NoteInline, DiaryEntry } from "@/types/planner";
import { noteBodyText, noteWordCount } from "./noteBody";
import { diaryOnThisDay } from "./diary";

export function widgetNote(note: Note): WidgetNote {
  const text = noteBodyText(note.body),
    chars = [...text];
  return {
    id: note.id,
    title: note.title ?? "",
    preview: chars.slice(0, WIDGET_PREVIEW_CHARS).join(""),
    color: note.color,
    pinned: note.pinnedToWidget,
    truncated: chars.length > WIDGET_PREVIEW_CHARS,
    words: noteWordCount(note),
    updatedAt: note.updatedAt ?? note.createdAt,
  };
}
/** Journal payload is capped at 128 KiB even with many large pinned notes. */
export function projectWidgetJournal(
  notes: readonly Note[],
  entries: readonly DiaryEntry[],
  date: string,
): WidgetJournal {
  const live = notes
    .filter((n) => !n.trashedAt)
    .sort(
      (a, b) =>
        (b.updatedAt ?? b.createdAt).localeCompare(
          a.updatedAt ?? a.createdAt,
        ) || a.id.localeCompare(b.id),
    );
  const recent = live.slice(0, 4),
    pinned = live.filter((n) => n.pinnedToWidget);
  const result = emptyWidgetJournal(date);
  result.noteCount = live.length;
  const today = entries.find((e) => e.date === date);
  result.diary.today = today ? { date, oneLine: today.oneLine } : null;
  result.diary.past = diaryOnThisDay(entries, date).map((e) => ({
    date: e.date,
    oneLine: e.oneLine,
  }));
  const ids = new Set<string>();
  // Reserve the four Stack rows first, then fill the Sticky rotation.
  let bytes = new TextEncoder().encode(JSON.stringify(result)).length + 2048;
  for (const n of [...recent, ...pinned]) {
    if (ids.has(n.id)) continue;
    const projection = widgetNote(n),
      size = new TextEncoder().encode(JSON.stringify(projection)).length + 2;
    if (bytes + size > 128 * 1024) continue;
    ids.add(n.id);
    result.notes.push(projection);
    bytes += size;
  }
  result.recentIds = recent.filter((n) => ids.has(n.id)).map((n) => n.id);
  result.omittedPinned = pinned.filter((n) => !ids.has(n.id)).length;
  return result;
}

const inlineText = (inline: NoteInline) =>
  inline.type === "text" ? inline.text : inline.label;
function sliceContent(
  content: NoteInline[],
  from: number,
  to: number,
): NoteInline[] {
  let pos = 0;
  return content.flatMap((inline) => {
    const text = inlineText(inline),
      start = pos;
    pos += text.length;
    const a = Math.max(0, from - start),
      b = Math.min(text.length, to - start);
    if (b <= a) return [];
    if (a === 0 && b === text.length) return [inline];
    // An edited fragment of a note link becomes text; whole untouched links survive.
    return [
      {
        type: "text" as const,
        text: text.slice(a, b),
        ...(inline.marks ? { marks: inline.marks } : {}),
      },
    ];
  });
}
/** Replace only the changed range of the visible prefix. Preserve unseen blocks,
 * checklist state, headings, marks and whole note links outside that range. */
export function editNotePreview(
  body: NoteBlock[],
  base: string,
  next: string,
  id: string,
): NoteBlock[] {
  const full = noteBodyText(body);
  if (!full.startsWith(base))
    throw new Error(
      "This note changed in Facta. Open it to review your widget draft.",
    );
  if (base === next) return body;
  let from = 0,
    suffix = 0;
  while (from < base.length && from < next.length && base[from] === next[from])
    from++;
  while (
    suffix < base.length - from &&
    suffix < next.length - from &&
    base[base.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix++;
  const to = base.length - suffix,
    inserted = next.slice(from, next.length - suffix);
  if (!body.length)
    return next
      .split("\n")
      .map((text, i) => ({
        id: `${id}-${i}`,
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      }));
  const starts: number[] = [];
  let pos = 0;
  for (const block of body) {
    starts.push(pos);
    pos += noteBodyText([block]).length + 1;
  }
  const locate = (offset: number) => {
    for (let i = 0; i < body.length; i++)
      if (offset <= starts[i] + noteBodyText([body[i]]).length) return i;
    return body.length - 1;
  };
  const a = locate(from),
    b = locate(to),
    left = sliceContent(body[a].content, 0, from - starts[a]),
    right = sliceContent(body[b].content, to - starts[b], Infinity);
  const lines = inserted.split("\n");
  const changed = lines.map((text, i): NoteBlock => {
    const template =
      i === 0 ? body[a] : i === lines.length - 1 ? body[b] : undefined;
    const type =
      template?.type === "divider"
        ? "paragraph"
        : (template?.type ?? "paragraph");
    return {
      ...template,
      id: i === 0 ? body[a].id : `${id}-${i}`,
      type,
      content: [
        ...(i === 0 ? left : []),
        ...(text ? [{ type: "text" as const, text }] : []),
        ...(i === lines.length - 1 ? right : []),
      ],
    };
  });
  return [...body.slice(0, a), ...changed, ...body.slice(b + 1)];
}
