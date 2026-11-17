import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, type EditorState } from "@tiptap/pm/state";
import { Mapping, ReplaceStep } from "@tiptap/pm/transform";
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
  addProseMirrorPlugins: () => [
    new Plugin({
      appendTransaction: (transactions, _old, state) => {
        const tr = state.tr;
        transactions.forEach((transaction, transactionIndex) => {
          transaction.steps.forEach((step, stepIndex) => {
            // A flat text-block split inserts two empty open block wrappers.
            // Ignore text edits, closed block insertions and code newlines.
            if (
              !(step instanceof ReplaceStep) ||
              step.from !== step.to ||
              step.slice.openStart !== 1 ||
              step.slice.openEnd !== 1 ||
              step.slice.content.childCount !== 2 ||
              !step.slice.content.content.every(
                (node) => node.isTextblock && node.content.size === 0,
              )
            )
              return;
            const source = transaction.docs[stepIndex].resolve(step.from);
            const align = source.parent.attrs.align;
            if (
              !TYPES.includes(source.parent.type.name) ||
              !ALIGNS.includes(align)
            )
              return;
            const mapping = new Mapping(
              transaction.mapping.maps.slice(stepIndex + 1),
            );
            for (const later of transactions.slice(transactionIndex + 1))
              mapping.appendMapping(later.mapping);
            // Follow both sides through default-type conversion and ID updates.
            for (const [position, association] of [
              [source.before(), -1],
              [step.from + 1, 1],
            ]) {
              const pos = mapping.map(position, association);
              const block = tr.doc.nodeAt(pos);
              if (
                block &&
                TYPES.includes(block.type.name) &&
                block.attrs.align == null
              )
                tr.setNodeMarkup(pos, undefined, { ...block.attrs, align });
            }
          });
        });
        return tr.docChanged ? tr : null;
      },
    }),
  ],
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
