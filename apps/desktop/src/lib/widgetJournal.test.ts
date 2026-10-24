import { describe, it, expect } from "vitest";
import { WIDGET_PREVIEW_CHARS } from "@facta/calendar";
import { makeNote, makeDiary } from "@/test/contentFixtures";
import { noteBodyText, extractNoteLinks, validateNoteBody } from "./noteBody";
import {
  editNotePreview,
  projectWidgetJournal,
  widgetNote,
} from "./widgetJournal";
import type { NoteBlock } from "@/types/planner";
const paragraph = (text: string, id = "p"): NoteBlock => ({
  id,
  type: "paragraph",
  content: [{ type: "text", text }],
});
describe("bounded widget journal", () => {
  it("exports only pinned-to-widget notes plus the four most recently edited, without bodies/tags/private diary details", () => {
    const notes = Array.from({ length: 7 }, (_, i) =>
      makeNote({
        title: `N${i}`,
        updatedAt: `2026-10-${10 + i}T12:00:00Z`,
        pinnedToWidget: i === 0,
        body: [paragraph("Visible text")],
        tags: ["private"],
      }),
    );
    notes.push(
      makeNote({
        title: "Trash",
        pinnedToWidget: true,
        trashedAt: "2026-10-23T00:00:00Z",
      }),
    );
    const p = projectWidgetJournal(
      notes,
      [
        makeDiary({ date: "2026-10-23", body: "private details", mood: 5 }),
        makeDiary({ date: "2026-09-23" }),
        makeDiary({ date: "2026-10-22", oneLine: "Not exported" }),
      ],
      "2026-10-23",
    );
    expect(p.notes.map((n) => n.title)).toEqual(["N6", "N5", "N4", "N3", "N0"]);
    expect(p.recentIds).toEqual(
      notes
        .slice(3, 7)
        .reverse()
        .map((n) => n.id),
    );
    expect(p.diary.past.map((p) => p.date)).toEqual(["2026-09-23"]);
    const json = JSON.stringify(p);
    expect(json).not.toContain('"body"');
    expect(json).not.toContain('"tags"');
    expect(json).not.toContain("private");
    expect(json).not.toContain("Not exported");
  });
  it("bounds Unicode previews without cutting emoji and limits the complete payload with an explicit overflow count", () => {
    const n = makeNote({ body: [paragraph("🌿".repeat(2000))] });
    expect([...widgetNote(n).preview]).toHaveLength(WIDGET_PREVIEW_CHARS);
    expect(widgetNote(n).truncated).toBe(true);
    const p = projectWidgetJournal(
      Array.from({ length: 100 }, (_, i) => ({
        ...n,
        id: String(i),
        pinnedToWidget: true,
        title: "🌿".repeat(500),
      })),
      [],
      "2026-10-23",
    );
    expect(
      new TextEncoder().encode(JSON.stringify(p)).length,
    ).toBeLessThanOrEqual(128 * 1024);
    expect(p.omittedPinned).toBeGreaterThan(0);
    expect(p.recentIds).toHaveLength(4);
  });
  it("rolls Diary today/On this day forward, exporting no unrelated history", () => {
    const entries = [
      makeDiary({ date: "2026-10-23" }),
      makeDiary({ date: "2026-09-24" }),
    ];
    expect(projectWidgetJournal([], entries, "2026-10-24").diary).toEqual({
      date: "2026-10-24",
      today: null,
      past: [{ date: "2026-09-24", oneLine: entries[1].oneLine }],
    });
  });
});
describe("safe widget preview edits", () => {
  it("preserves marks, checkbox state, whole note links and the unseen tail", () => {
    const link = crypto.randomUUID();
    const body: NoteBlock[] = [
      {
        id: "h",
        type: "heading",
        level: 2,
        content: [
          { type: "text", text: "Keep ", marks: [{ type: "bold" }] },
          { type: "text", text: "old" },
          { type: "noteLink", noteId: link, label: " linked" },
        ],
      },
      {
        id: "c",
        type: "checklist",
        checked: true,
        content: [{ type: "text", text: "tail " + "x".repeat(2000) }],
      },
    ];
    const base = widgetNote(makeNote({ body })).preview,
      next = base.replace("old", "new");
    const edited = editNotePreview(body, base, next, "action");
    expect(noteBodyText(edited)).toBe(noteBodyText(body).replace("old", "new"));
    expect(edited[0].content[0]).toEqual(body[0].content[0]);
    expect(edited[1]).toBe(body[1]);
    expect(extractNoteLinks(edited)).toEqual([link]);
    validateNoteBody(edited);
  });
  it.each([
    ["ab\ncd", "abXcd"],
    ["ab\ncd", "ab\nNew\ncd"],
    ["abc", ""],
    ["🌿 end", "🌱 end"],
  ])(
    "changes newlines/Unicode within %s without deleting the preview suffix",
    (base, next) => {
      const body = base
        .split("\n")
        .map((line, i) => paragraph(line, String(i)));
      const edited = editNotePreview(body, base, next, "action");
      expect(noteBodyText(edited)).toBe(next);
      validateNoteBody(edited);
    },
  );
  it("creates a blank note body and rejects stale preview prefixes", () => {
    expect(
      noteBodyText(editNotePreview([], "", "First\nSecond", "action")),
    ).toBe("First\nSecond");
    expect(() =>
      editNotePreview([paragraph("Changed")], "Old", "New", "action"),
    ).toThrow("changed");
  });
  it("never changes the rest of a partially exported block", () => {
    const full = "x".repeat(1000) + " private tail",
      base = full.slice(0, 800);
    const edited = editNotePreview(
      [paragraph(full)],
      base,
      base.slice(0, -10) + "END",
      "action",
    );
    expect(noteBodyText(edited)).toBe(
      "x".repeat(790) + "END" + full.slice(800),
    );
  });
});
