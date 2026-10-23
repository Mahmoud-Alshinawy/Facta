import { describe, expect, it } from "vitest";
import { makeNote } from "@/test/contentFixtures";
import { captureNote, noteSection, selectNotes } from "./notes";

describe("notes selection and capture", () => {
  const now = new Date("2026-10-23T12:00:00+03:00");
  const notes = [
    makeNote({
      id: "older-pin",
      title: "Research",
      pinned: true,
      tags: ["uni"],
      updatedAt: "2026-10-01T12:00:00Z",
    }),
    makeNote({
      id: "new",
      title: "Lab",
      tags: ["uni"],
      updatedAt: now.toISOString(),
      body: [
        {
          id: "p",
          type: "paragraph",
          content: [{ type: "text", text: "Heat capacity" }],
        },
      ],
    }),
    makeNote({
      id: "trash",
      title: "Lab discarded",
      trashedAt: now.toISOString(),
    }),
  ];
  it("sorts pinned first, excludes Trash, and searches title/body/tags with all terms", () => {
    expect(
      selectNotes(notes, "all", "", now.getTime()).map((n) => n.id),
    ).toEqual(["older-pin", "new"]);
    expect(
      selectNotes(notes, "all", "uni heat", now.getTime()).map((n) => n.id),
    ).toEqual(["new"]);
    expect(selectNotes(notes, "tag:uni", "", now.getTime())).toHaveLength(2);
    expect(selectNotes(notes, "pinned", "", now.getTime())).toHaveLength(1);
    expect(
      selectNotes(notes, "recent", "", now.getTime()).map((n) => n.id),
    ).toEqual(["new"]);
    expect(
      selectNotes(notes, "trash", "lab", now.getTime()).map((n) => n.id),
    ).toEqual(["trash"]);
  });
  it("captures the first line as title, preserving body lines, colour and inbox", () => {
    const result = captureNote("  An idea  \r\nFirst\r\n\r\nSecond", "b");
    expect(result).toMatchObject({
      title: "An idea",
      color: "b",
      tags: ["inbox"],
      body: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    });
    expect(new Set(result.body!.map((b) => b.id)).size).toBe(3);
  });
  it("groups notes by local edit date, keeping pins separate", () => {
    const sunday = makeNote({ updatedAt: "2026-10-18T12:00:00Z" });
    expect(noteSection(sunday, now, 0)).toBe("THIS WEEK");
    expect(noteSection(sunday, now, 1)).toBe("EARLIER");
    expect(
      noteSection(makeNote({ updatedAt: "2026-10-17T12:00:00Z" }), now, 0),
    ).toBe("EARLIER");
    expect(
      noteSection(makeNote({ updatedAt: "2026-10-17T12:00:00Z" }), now, 6),
    ).toBe("THIS WEEK");
    expect(noteSection(notes[0], now)).toBe("PINNED");
    expect(noteSection(notes[1], now)).toBe("TODAY");
    expect(
      noteSection(makeNote({ updatedAt: "2026-10-18T12:00:00Z" }), now),
    ).toBe("THIS WEEK");
    expect(
      noteSection(makeNote({ updatedAt: "2026-10-01T12:00:00Z" }), now),
    ).toBe("EARLIER");
  });
});
