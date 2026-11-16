import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeNote } from "@/test/contentFixtures";
import NoteEditor from "./NoteEditor";
import { Editor, getSchema } from "@tiptap/core";
import { applyNoteLink } from "./noteEditorLink";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { noteExtensions } from "./editorExtensions";

const state = vi.hoisted(() => ({
  empty: true,
  active: new Set<string>(),
}));

vi.mock("@tiptap/react", () => ({
  EditorContent: () => createElement("div", { "data-note-body": true }),
  useEditor: () => ({
    state: {
      selection: {
        empty: state.empty,
        from: 1,
        $from: {
          parent: { type: { name: "paragraph" }, textBetween: () => "" },
          parentOffset: 0,
        },
      },
    },
    getText: () => "A note",
    isActive: (mark: string, attrs?: { color: string }) =>
      state.active.has(attrs ? mark + ":" + attrs.color : mark),
  }),
}));

const render = (readOnly = false) =>
  renderToStaticMarkup(
    createElement(NoteEditor, {
      note: makeNote({ align: "center" }),
      notes: [],
      readOnly,
      onBody: vi.fn(),
      onPatch: vi.fn(),
      onOpen: vi.fn(),
      onLink: vi.fn(),
    }),
  );

describe("note formatting toolbar", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    state.empty = true;
    state.active.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("is present before the body with a cursor and remains one toolbar on selection", () => {
    const cursor = render();
    expect(cursor).toContain('aria-label="Note formatting"');
    expect(cursor.indexOf('role="toolbar"')).toBeLessThan(
      cursor.indexOf("data-note-body"),
    );
    state.empty = false;
    const selection = render();
    expect(selection.match(/role="toolbar"/g)).toHaveLength(1);
    expect(selection).not.toContain("note-selection");
  });

  it("hides formatting for a read-only note while keeping the body", () => {
    const html = render(true);
    expect(html).not.toContain('role="toolbar"');
    expect(html).toContain("data-note-body");
  });

  it("exposes cursor marks and alignment as pressed button states", () => {
    state.active = new Set(["bold", "italic", "link", "color:b"]);
    const html = render();
    for (const label of [
      "Bold",
      "Italic",
      "Link \\(Ctrl K\\)",
      "Blue text",
      "Align center",
    ]) {
      expect(html).toMatch(
        new RegExp('aria-label="' + label + '"[^>]*aria-pressed="true"'),
      );
    }
    expect(html).toMatch(/aria-label="Amber text"[^>]*aria-pressed="false"/);
  });

  it("shows unmarked cursor state without requiring selected text", () => {
    const html = render();
    for (const label of ["Bold", "Italic", "Link \\(Ctrl K\\)"]) {
      expect(html).toMatch(
        new RegExp('aria-label="' + label + '"[^>]*aria-pressed="false"'),
      );
    }
    expect(html).toMatch(/aria-label="No colour text"[^>]*aria-pressed="true"/);
  });
});

it("does not extend an existing link when typing immediately after it", () => {
  const schema = getSchema(noteExtensions);
  const href = "https://example.invalid/";
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("Existing link", [schema.marks.link.create({ href })]),
    ]),
  ]);
  let editor = EditorState.create({
    schema,
    doc,
    selection: TextSelection.atEnd(doc),
  });
  for (const character of " and more")
    editor = editor.apply(editor.tr.insertText(character));
  const paragraph = editor.doc.firstChild!;
  expect(paragraph.firstChild!.text).toBe("Existing link");
  expect(paragraph.firstChild!.marks[0].attrs.href).toBe(href);
  expect(paragraph.lastChild!.text).toBe(" and more");
  expect(paragraph.lastChild!.marks).toEqual([]);
});

it("inserts the URL as linked text at an empty selection and leaves following text unlinked", () => {
  const editor = new Editor({
    element: null,
    extensions: noteExtensions,
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  try {
    const href = "https://example.invalid/";
    applyNoteLink(editor, href);
    expect(editor.state.doc.firstChild!.firstChild!.text).toBe(href);
    expect(editor.state.doc.firstChild!.firstChild!.marks[0].attrs.href).toBe(
      href,
    );
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(1 + href.length);
    expect(editor.isActive("link")).toBe(false);
    for (const character of " and more")
      editor.view.dispatch(editor.state.tr.insertText(character));
    const paragraph = editor.state.doc.firstChild!;
    expect(paragraph.firstChild!.text).toBe(href);
    expect(paragraph.lastChild!.text).toBe(" and more");
    expect(paragraph.lastChild!.marks).toEqual([]);
  } finally {
    editor.destroy();
  }
});

it("updates the whole existing link when its cursor is inside it", () => {
  const editor = new Editor({
    element: null,
    extensions: noteExtensions,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Existing link",
              marks: [
                { type: "link", attrs: { href: "https://old.invalid/" } },
              ],
            },
          ],
        },
      ],
    },
  });
  try {
    editor.commands.setTextSelection(5);
    applyNoteLink(editor, "https://new.invalid/");
    const paragraph = editor.state.doc.firstChild!;
    expect(paragraph.childCount).toBe(1);
    expect(paragraph.firstChild!.text).toBe("Existing link");
    expect(paragraph.firstChild!.marks[0].attrs.href).toBe(
      "https://new.invalid/",
    );
  } finally {
    editor.destroy();
  }
});
