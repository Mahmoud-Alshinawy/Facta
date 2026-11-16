import type { Editor } from "@tiptap/core";

export function applyNoteLink(editor: Editor, href: string | null): void {
  const chain = editor.chain().focus();
  if (href && editor.state.selection.empty && !editor.isActive("link")) {
    chain
      .insertContent({
        type: "text",
        text: href,
        marks: [{ type: "link", attrs: { href } }],
      })
      .unsetMark("link")
      .run();
  } else if (href) {
    chain.extendMarkRange("link").setMark("link", { href }).run();
  } else {
    chain.extendMarkRange("link").unsetMark("link").run();
  }
}
