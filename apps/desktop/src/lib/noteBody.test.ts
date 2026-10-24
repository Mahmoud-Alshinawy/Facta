import { describe, expect, it } from "vitest";
import {
  extractNoteLinks,
  noteBacklinks,
  noteBodyText,
  noteWordCount,
  validateNoteBody,
} from "./noteBody";
import type { NoteBlock } from "@/types/planner";

const id = "aaaaaaaa-0000-4000-8000-000000000001";
const body: NoteBlock[] = [
  {
    id: "p1",
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Read ",
        marks: [
          { type: "bold" },
          { type: "italic" },
          { type: "color", color: "b" },
        ],
      },
      { type: "noteLink", noteId: id, label: "Lab notes" },
      { type: "noteLink", noteId: id, label: " again" },
    ],
  },
  {
    id: "code",
    type: "code",
    language: "text",
    content: [{ type: "text", text: `[[${id}]]` }],
  },
];

describe("canonical note blocks", () => {
  it("extracts sorted unique UUID references, ignoring code and literal bracket text", () => {
    validateNoteBody(body);
    expect(extractNoteLinks(body)).toEqual([id]);
    expect(
      extractNoteLinks([
        {
          id: "literal",
          type: "paragraph",
          content: [{ type: "text", text: `[[${id}]]` }],
        },
      ]),
    ).toEqual([]);
  });
  it("keeps marks out of plain text and counts multilingual words without markup", () => {
    const blocks: NoteBlock[] = [
      {
        id: "p",
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Hello world مرحبا بالعالم",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ];
    expect(noteBodyText(blocks)).toBe("Hello world مرحبا بالعالم");
    expect(noteWordCount({ title: "Heading", body: blocks })).toBe(5);
  });
  it("rejects malformed/unsafe blocks and oversized UTF-8 bodies", () => {
    expect(() => validateNoteBody({ type: "doc" })).toThrow();
    expect(() =>
      validateNoteBody([
        {
          ...body[0],
          content: [
            {
              type: "text",
              text: "bad",
              marks: [{ type: "link", href: "javascript:alert(1)" }],
            },
          ],
        },
      ]),
    ).toThrow();
    expect(() =>
      validateNoteBody([
        { ...body[0], content: [{ type: "text", text: "م".repeat(103000) }] },
      ]),
    ).toThrow("200 KB");
    expect(() => validateNoteBody([{ ...body[0], type: "checklist" }])).toThrow(
      "Checklist",
    );
  });
  it("computes backlinks from live bodies rather than stale links metadata", () => {
    const base = {
      id: "source",
      title: "Read",
      body,
      links: [],
      trashedAt: null,
    };
    expect(noteBacklinks([base as never], id)).toEqual([base]);
    expect(
      noteBacklinks([{ ...base, trashedAt: "2026-10-22" } as never], id),
    ).toEqual([]);
  });
});
