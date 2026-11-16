import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { splitBlock } from "@tiptap/pm/commands";
import { TextSelection } from "@tiptap/pm/state";
import { bodyToEditor, editorToBody } from "./noteEditorAdapter";
import { noteExtensions } from "@/components/notes/editorExtensions";
import type { NoteBlock } from "@/types/planner";

const linked = "aaaaaaaa-0000-4000-8000-000000000001";
const body: NoteBlock[] = [
  {
    id: "p",
    type: "paragraph",
    align: "center",
    content: [
      {
        type: "text",
        text: "Hello ",
        marks: [
          { type: "bold" },
          { type: "italic" },
          { type: "color", color: "c" },
          { type: "link", href: "https://example.com" },
        ],
      },
      {
        type: "noteLink",
        noteId: linked,
        label: "Another note",
        marks: [{ type: "bold" }],
      },
    ],
  },
  {
    id: "h",
    type: "heading",
    align: "right",
    level: 3,
    content: [{ type: "text", text: "Heading" }],
  },
  {
    id: "c",
    type: "checklist",
    align: "justify",
    checked: true,
    content: [{ type: "text", text: "Done" }],
  },
  {
    id: "b",
    type: "bullet",
    align: "left",
    content: [{ type: "text", text: "Item" }],
  },
  {
    id: "q",
    type: "quote",
    align: "right",
    content: [{ type: "text", text: "Quote\nsecond line" }],
  },
  {
    id: "code",
    type: "code",
    language: "ts",
    content: [{ type: "text", text: "const n = 1;\n" }],
  },
  { id: "d", type: "divider", content: [] },
];
describe("note editor storage adapter", () => {
  it("round-trips all seven block types, stable IDs, inline marks and references through the real schema", () => {
    const schema = getSchema(noteExtensions);
    const document = schema.nodeFromJSON(bodyToEditor(body));
    document.check();
    expect(editorToBody(document.toJSON())).toEqual(body);
  });
  it("preserves explicit alignment in both directions and omits a legacy block's default alignment", () => {
    const editorDoc = bodyToEditor([body[0]]);
    expect(editorDoc.content![0].attrs!.align).toBe("center");
    expect(editorToBody(editorDoc)).toEqual([body[0]]);
    expect(
      editorToBody({
        type: "doc",
        content: [{ type: "paragraph", attrs: { id: "legacy", align: null } }],
      }),
    ).toEqual([{ id: "legacy", type: "paragraph", content: [] }]);
  });
  it("creates an editable empty paragraph without persisting an editor wrapper", () => {
    const result = editorToBody(bodyToEditor([]));
    expect(result).toMatchObject([{ type: "paragraph", content: [] }]);
    expect(result[0].id).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
  });
  it("retains both halves of a split and repairs duplicate IDs before storage validation", () => {
    const schema = getSchema(noteExtensions);
    const doc = schema.nodeFromJSON(
      bodyToEditor([
        {
          id: "same",
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ]),
    );
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6),
    });
    expect(
      splitBlock(state, (tr) => {
        state = state.apply(tr);
      }),
    ).toBe(true);
    const saved = editorToBody(state.doc.toJSON());
    expect(saved.map((b) => b.content)).toEqual([
      [{ type: "text", text: "Hello" }],
      [{ type: "text", text: " world" }],
    ]);
    expect(new Set(saved.map((b) => b.id)).size).toBe(2);
  });
  it("rejects unsupported marks, invalid references and oversized UTF-8 content", () => {
    expect(() =>
      editorToBody({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "bad", marks: [{ type: "strike" }] },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      editorToBody({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "noteLink", attrs: { noteId: "bad", label: "Broken" } },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      editorToBody({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "🙂".repeat(60000) }],
          },
        ],
      }),
    ).toThrow("200 KB");
  });
});
