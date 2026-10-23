import type { JSONContent } from "@tiptap/core";
import { validateNoteBody } from "./noteBody";
import type { NoteBlock, NoteInline, NoteMark } from "@/types/planner";

export function bodyToEditor(body: readonly NoteBlock[]): JSONContent {
  return {
    type: "doc",
    content: body.length
      ? body.map((block) => ({
          type: block.type,
          attrs: {
            id: block.id,
            ...(block.level ? { level: block.level } : {}),
            ...(block.type === "checklist"
              ? { checked: Boolean(block.checked) }
              : {}),
            ...(block.type === "code"
              ? { language: block.language ?? "" }
              : {}),
          },
          ...(block.type === "divider"
            ? {}
            : {
                content: block.content.flatMap((inline): JSONContent[] => {
                  const marks = inline.marks?.map((mark) =>
                    mark.type === "color"
                      ? { type: "color", attrs: { color: mark.color } }
                      : mark.type === "link"
                        ? { type: "link", attrs: { href: mark.href } }
                        : { type: mark.type },
                  );
                  if (inline.type === "noteLink")
                    return [
                      {
                        type: "noteLink",
                        attrs: { noteId: inline.noteId, label: inline.label },
                        marks,
                      },
                    ];
                  return inline.text
                    ? [{ type: "text", text: inline.text, marks }]
                    : [];
                }),
              }),
        }))
      : [{ type: "paragraph", attrs: { id: crypto.randomUUID() } }],
  };
}
export function editorToBody(doc: JSONContent): NoteBlock[] {
  const ids = new Set<string>();
  const body = (doc.content ?? []).map((node): NoteBlock => {
    const id =
      node.attrs?.id && !ids.has(node.attrs.id)
        ? (node.attrs.id as string)
        : crypto.randomUUID();
    ids.add(id);
    const content: NoteInline[] = (node.content ?? []).map(
      (inline): NoteInline => {
        const marks: NoteMark[] = (inline.marks ?? []).map((mark): NoteMark => {
          if (mark.type === "color")
            return { type: "color", color: mark.attrs?.color };
          if (mark.type === "link")
            return { type: "link", href: mark.attrs?.href };
          return { type: mark.type as "bold" | "italic" };
        });
        const value: NoteInline =
          inline.type === "noteLink"
            ? {
                type: "noteLink",
                noteId: inline.attrs?.noteId,
                label: inline.attrs?.label,
              }
            : { type: "text", text: inline.text ?? "" };
        if (marks.length) value.marks = marks;
        return value;
      },
    );
    return {
      id,
      type: node.type as NoteBlock["type"],
      content,
      ...(node.type === "heading" ? { level: node.attrs?.level ?? 2 } : {}),
      ...(node.type === "checklist"
        ? { checked: Boolean(node.attrs?.checked) }
        : {}),
      ...(node.type === "code" && node.attrs?.language
        ? { language: node.attrs.language }
        : {}),
    };
  });
  validateNoteBody(body);
  return body;
}
