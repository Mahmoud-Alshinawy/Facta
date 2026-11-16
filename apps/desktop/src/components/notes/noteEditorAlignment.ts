import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { NoteAlign } from "@/types/planner";

const TYPES = ["paragraph", "heading", "bullet", "checklist", "quote"];
const ALIGNS = ["left", "center", "right", "justify"];

function selectedBlocks(state: EditorState) {
  const blocks: { node: ProseMirrorNode; pos: number }[] = [];
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    if (TYPES.includes($from.parent.type.name))
      blocks.push({ node: $from.parent, pos: $from.before() });
  } else {
    state.doc.nodesBetween(from, to, (node, pos) => {
      // Ending at the next paragraph's start does not select that paragraph.
      if (TYPES.includes(node.type.name) && to > pos + 1)
        blocks.push({ node, pos });
      return !node.isTextblock;
    });
  }
  return blocks;
}

export function noteSelectionAlignment(
  state: EditorState,
  fallback: NoteAlign,
): NoteAlign | null {
  const blocks = selectedBlocks(state);
  const first = blocks[0]?.node.attrs.align ?? fallback;
  return blocks.length &&
    blocks.every(({ node }) => (node.attrs.align ?? fallback) === first)
    ? first
    : null;
}

export function applyNoteAlignment(editor: Editor, align: NoteAlign): void {
  editor
    .chain()
    .focus()
    .command(({ state, tr, dispatch }) => {
      const blocks = selectedBlocks(state);
      if (dispatch)
        for (const { node, pos } of blocks)
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, align });
      return blocks.length > 0;
    })
    .run();
}

export const NoteAlignment = Extension.create({
  name: "noteAlignment",
  addGlobalAttributes: () => [
    {
      types: TYPES,
      attributes: {
        align: {
          default: null,
          parseHTML: (element) =>
            ALIGNS.includes(element.style.textAlign)
              ? element.style.textAlign
              : null,
          renderHTML: (attrs) =>
            ALIGNS.includes(attrs.align)
              ? { style: `text-align: ${attrs.align}` }
              : {},
        },
      },
    },
  ],
});
