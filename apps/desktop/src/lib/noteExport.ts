import { noteTitle } from "./notes";
import type { Note, NoteInline } from "@/types/planner";

const escapeMarkdown = (text: string) =>
  text
    .replace(/([\\`*_{}\[\]<>#|!])/g, "\\$1")
    .replace(/^(\s*)([-+=])(?=\s|$)/gm, "$1\\$2")
    .replace(/^(\s*\d+)([.)])(?=\s)/gm, "$1\\$2");
const wrapMark = (text: string, marker: string) =>
  text.replace(
    /^(\s*)([\s\S]*?)(\s*)$/,
    (_whole, before: string, value: string, after: string) =>
      value ? `${before}${marker}${value}${marker}${after}` : text,
  );
function inlineMarkdown(inline: NoteInline): string {
  let text = escapeMarkdown(
    inline.type === "text" ? inline.text : inline.label,
  );
  if (inline.type === "noteLink")
    text = `[${text}](facta://note/${inline.noteId})`;
  for (const mark of inline.marks ?? []) {
    if (mark.type === "bold") text = wrapMark(text, "**");
    if (mark.type === "italic") text = wrapMark(text, "*");
    if (mark.type === "link" && /^(https?:|mailto:)/i.test(mark.href))
      text = `[${text}](${mark.href.replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)})`;
  }
  return text;
}
export function exportNote(note: Note, kind: "md" | "txt"): string {
  const blocks = note.body.map((block) => {
    const plain = block.content
      .map((inline) => (inline.type === "text" ? inline.text : inline.label))
      .join("");
    if (kind === "txt") {
      if (block.type === "divider") return "---";
      return `${block.type === "checklist" ? `[${block.checked ? "x" : " "}] ` : block.type === "bullet" ? "• " : ""}${plain}`;
    }
    const text = block.content.map(inlineMarkdown).join("");
    switch (block.type) {
      case "heading":
        return `${"#".repeat(block.level ?? 2)} ${text}`;
      case "checklist":
        return `- [${block.checked ? "x" : " "}] ${text}`;
      case "bullet":
        return `- ${text}`;
      case "quote":
        return text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
      case "divider":
        return "---";
      case "code": {
        const longest = Math.max(
          0,
          ...(plain.match(/`+/g) ?? []).map((run) => run.length),
        );
        const fence = "`".repeat(Math.max(3, longest + 1));
        return `${fence}${(block.language ?? "").replace(/[^a-z0-9_+-]/gi, "")}\n${plain}\n${fence}`;
      }
      default:
        return text;
    }
  });
  return `${kind === "md" ? "# " : ""}${kind === "md" ? escapeMarkdown(noteTitle(note)) : noteTitle(note)}\n\n${blocks.join("\n\n")}\n`;
}
export function exportFilename(note: Note, kind: "md" | "txt"): string {
  const name =
    noteTitle(note)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 100) || "Untitled";
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? "Note-" : ""}${name}.${kind}`;
}
export function downloadNote(note: Note, kind: "md" | "txt") {
  const url = URL.createObjectURL(
    new Blob([exportNote(note, kind)], {
      type:
        kind === "md"
          ? "text/markdown;charset=utf-8"
          : "text/plain;charset=utf-8",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exportFilename(note, kind);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
