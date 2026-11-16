import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { noteExtensions } from "./editorExtensions";
import {
  applyNoteAlignment,
  noteSelectionAlignment,
} from "./noteEditorAlignment";

function makeEditor(aligns: (string | null)[] = [null, null, null]) {
  return new Editor({
    element: null,
    extensions: noteExtensions,
    content: {
      type: "doc",
      content: ["One", "Two", "Three"].map((text, index) => ({
        type: "paragraph",
        attrs: { id: `paragraph-${index}`, align: aligns[index] },
        content: [{ type: "text", text }],
      })),
    },
  });
}
const alignments = (editor: Editor) =>
  editor.state.doc.content.content.map((node) => node.attrs.align);

describe("paragraph alignment", () => {
  it("aligns only the two paragraphs touched by a selection", () => {
    const editor = makeEditor();
    try {
      editor.commands.setTextSelection({ from: 2, to: 8 });
      applyNoteAlignment(editor, "center");
      expect(alignments(editor)).toEqual(["center", "center", null]);
      expect(editor.state.selection.from).toBe(2);
      expect(editor.state.selection.to).toBe(8);
      expect(noteSelectionAlignment(editor.state, "left")).toBe("center");
    } finally {
      editor.destroy();
    }
  });

  it("aligns only the cursor paragraph with an empty selection", () => {
    const editor = makeEditor();
    try {
      editor.commands.setTextSelection(7);
      applyNoteAlignment(editor, "right");
      expect(alignments(editor)).toEqual([null, "right", null]);
    } finally {
      editor.destroy();
    }
  });

  it("leaves a paragraph unchanged when selection ends at its start", () => {
    const editor = makeEditor();
    try {
      editor.commands.setTextSelection({ from: 1, to: 6 });
      applyNoteAlignment(editor, "justify");
      expect(alignments(editor)).toEqual(["justify", null, null]);
    } finally {
      editor.destroy();
    }
  });

  it("uses the note default for legacy blocks and shows no pressed alignment for a mixed selection", () => {
    const editor = makeEditor([null, "right", "left"]);
    try {
      expect(noteSelectionAlignment(editor.state, "center")).toBe("center");
      editor.commands.setTextSelection({ from: 1, to: 9 });
      expect(noteSelectionAlignment(editor.state, "center")).toBeNull();
      editor.commands.setTextSelection(7);
      expect(noteSelectionAlignment(editor.state, "center")).toBe("right");
    } finally {
      editor.destroy();
    }
  });

  it("renders explicit alignment as a paragraph style", () => {
    const editor = makeEditor(["right", null, null]);
    try {
      const node = editor.state.doc.firstChild!;
      expect(node.type.spec.toDOM!(node)).toEqual([
        "p",
        { style: "text-align: right" },
        0,
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("does not apply paragraph alignment to code blocks", () => {
    const editor = new Editor({
      element: null,
      extensions: noteExtensions,
      content: {
        type: "doc",
        content: [
          { type: "code", content: [{ type: "text", text: "const x = 1;" }] },
        ],
      },
    });
    try {
      applyNoteAlignment(editor, "center");
      expect(editor.state.doc.firstChild!.attrs).not.toHaveProperty("align");
      expect(noteSelectionAlignment(editor.state, "left")).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});
