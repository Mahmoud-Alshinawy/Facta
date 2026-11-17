import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { baseKeymap } from "@tiptap/pm/commands";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { editorToBody } from "@/lib/noteEditorAdapter";
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

const splitText = "Title here";
const splitPositions = [
  ["end", splitText.length],
  ["middle", 5],
  ["start", 0],
] as const;

function splitFixture(type: string, align: string | null, offset: number) {
  const editor = new Editor({
    element: null,
    extensions: noteExtensions,
    content: {
      type: "doc",
      content: [
        {
          type,
          attrs: {
            id: "source",
            ...(align ? { align } : {}),
            ...(type === "heading" ? { level: 2 } : {}),
            ...(type === "checklist" ? { checked: false } : {}),
          },
          content: [{ type: "text", text: splitText }],
        },
      ],
    },
  });
  // Include the real appendTransaction plugins, including BlockIdentity.
  let state = EditorState.create({
    schema: editor.schema,
    doc: editor.state.doc,
    plugins: editor.extensionManager.plugins,
    selection: TextSelection.create(editor.state.doc, 1 + offset),
  });
  const enter = () =>
    baseKeymap.Enter(state, (transaction) => {
      state = state.applyTransaction(transaction).state;
    });
  return {
    editor,
    enter,
    get state() {
      return state;
    },
  };
}

describe("alignment inherited by Enter", () => {
  const alignedBlocks = [
    ["paragraph", "center"],
    ["heading", "right"],
    ["bullet", "center"],
    ["checklist", "center"],
    ["quote", "center"],
  ] as const;
  const cases = alignedBlocks.flatMap(([type, align]) =>
    splitPositions.map(([position, offset]) => ({
      type,
      align,
      position,
      offset,
    })),
  );
  it.each(cases)(
    "keeps $align alignment when Enter splits $type at $position",
    ({ type, align, offset }) => {
      const fixture = splitFixture(type, align, offset);
      try {
        expect(fixture.enter()).toBe(true);
        const blocks = fixture.state.doc.content.content;
        expect(blocks).toHaveLength(2);
        expect(blocks.map((block) => block.attrs.align)).toEqual([
          align,
          align,
        ]);
        expect(blocks.map((block) => block.textContent)).toEqual([
          splitText.slice(0, offset),
          splitText.slice(offset),
        ]);
        const ids = blocks.map((block) => block.attrs.id);
        expect(new Set(ids).size).toBe(2);
        expect(ids.filter((id) => id === "source")).toHaveLength(1);
        expect(ids.find((id) => id !== "source")).toMatch(
          /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
        );
        if (type === "heading" && offset === splitText.length)
          expect(blocks[1].type.name).toBe("paragraph");
      } finally {
        fixture.editor.destroy();
      }
    },
  );

  it.each(splitPositions)(
    "keeps note-default alignment implicit after Enter at %s",
    (_position, offset) => {
      const fixture = splitFixture("paragraph", null, offset);
      try {
        expect(fixture.enter()).toBe(true);
        expect(fixture.state.doc.childCount).toBe(2);
        expect(
          fixture.state.doc.content.content.map((block) => block.attrs.align),
        ).toEqual([null, null]);
        expect(
          editorToBody(fixture.state.doc.toJSON()).every(
            (block) => !("align" in block),
          ),
        ).toBe(true);
        expect(noteSelectionAlignment(fixture.state, "right")).toBe("right");
        expect(
          new Set(
            fixture.state.doc.content.content.map((block) => block.attrs.id),
          ).size,
        ).toBe(2);
      } finally {
        fixture.editor.destroy();
      }
    },
  );

  it("leaves a separately inserted paragraph on the note default", () => {
    const fixture = splitFixture("paragraph", "center", splitText.length);
    try {
      const paragraph = fixture.state.schema.nodes.paragraph.create(
        null,
        fixture.state.schema.text("Separate paragraph"),
      );
      const state = fixture.state.applyTransaction(
        fixture.state.tr.insert(fixture.state.doc.content.size, paragraph),
      ).state;
      expect(
        state.doc.content.content.map((block) => block.attrs.align),
      ).toEqual(["center", null]);
    } finally {
      fixture.editor.destroy();
    }
  });

  it("keeps code-block Enter as a newline inside the same block", () => {
    const fixture = splitFixture("code", null, 5);
    try {
      expect(fixture.enter()).toBe(true);
      expect(fixture.state.doc.childCount).toBe(1);
      expect(fixture.state.doc.firstChild!.textContent).toBe("Title\n here");
      expect(fixture.state.doc.firstChild!.attrs.id).toBe("source");
      expect(fixture.state.doc.firstChild!.attrs).not.toHaveProperty("align");
    } finally {
      fixture.editor.destroy();
    }
  });
});
