import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeNote } from "@/test/contentFixtures";
import NoteEditor from "./NoteEditor";
import { getSchema } from "@tiptap/core";
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

it("keeps an applied link on all text typed at an empty selection", () => {
  const schema = getSchema(noteExtensions);
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("Link ")]),
  ]);
  let editor = EditorState.create({
    schema,
    doc,
    selection: TextSelection.atEnd(doc),
  });
  editor = editor.apply(
    editor.tr.addStoredMark(
      schema.marks.link.create({ href: "https://example.invalid" }),
    ),
  );
  for (const character of "linked words")
    editor = editor.apply(editor.tr.insertText(character));
  const linked = editor.doc.firstChild!.lastChild!;
  expect(linked.text).toBe("linked words");
  expect(linked.marks.some((mark) => mark.type.name === "link")).toBe(true);
});
