import { describe, expect, it } from "vitest";
import { makeNote } from "@/test/contentFixtures";
import { exportFilename, exportNote } from "./noteExport";

describe("note export", () => {
  it("preserves paragraph text that looks like Markdown structure or HTML", () => {
    const note = makeNote({
      body: [
        {
          id: "p",
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "1. literal\n- literal bullet\n<script>alert(1)</script>",
            },
          ],
        },
      ],
    });
    expect(exportNote(note, "md")).toContain(
      "1\\. literal\n\\- literal bullet\n\\<script\\>alert(1)\\</script\\>",
    );
  });
  it("exports readable Markdown for every stored block and mark, safely escaping literals", () => {
    const note = makeNote({
      title: "A [plan]",
      body: [
        {
          id: "p",
          type: "paragraph",
          content: [
            { type: "text", text: "literal *star*", marks: [{ type: "bold" }] },
            { type: "text", text: " italic", marks: [{ type: "italic" }] },
            {
              type: "text",
              text: " link",
              marks: [{ type: "link", href: "https://example.com/a(b)" }],
            },
          ],
        },
        {
          id: "h",
          type: "heading",
          level: 2,
          content: [{ type: "text", text: "Section" }],
        },
        {
          id: "check",
          type: "checklist",
          checked: true,
          content: [{ type: "text", text: "Done" }],
        },
        {
          id: "bullet",
          type: "bullet",
          content: [{ type: "text", text: "Item" }],
        },
        {
          id: "quote",
          type: "quote",
          content: [{ type: "text", text: "First\nSecond" }],
        },
        { id: "divider", type: "divider", content: [] },
        {
          id: "code",
          type: "code",
          language: "ts",
          content: [{ type: "text", text: "```\nconst n = 1;" }],
        },
      ],
    });
    const exported = exportNote(note, "md");
    expect(exported).toContain("# A \\[plan\\]");
    expect(exported).toContain("**literal \\*star\\***");
    expect(exported).toContain(" *italic*");
    expect(exported).toContain("https://example.com/a%28b%29");
    expect(exported).toContain(
      "## Section\n\n- [x] Done\n\n- Item\n\n> First\n> Second\n\n---",
    );
    expect(exported).toContain("````ts\n```\nconst n = 1;\n````");
  });
  it("keeps note references in Markdown and plain labels in TXT, without HTML marks", () => {
    const id = "aaaaaaaa-0000-4000-8000-000000000001";
    const note = makeNote({
      body: [
        {
          id: "p",
          type: "paragraph",
          content: [
            {
              type: "noteLink",
              noteId: id,
              label: "Lab",
              marks: [{ type: "color", color: "a" }],
            },
          ],
        },
        {
          id: "c",
          type: "checklist",
          checked: false,
          content: [{ type: "text", text: "Read" }],
        },
      ],
    });
    expect(exportNote(note, "md")).toContain(`[Lab](facta://note/${id})`);
    expect(exportNote(note, "txt")).toBe("Untitled\n\nLab\n\n[ ] Read\n");
  });
  it("creates safe Windows filenames, including blank and reserved names", () => {
    expect(exportFilename(makeNote(), "txt")).toBe("Untitled.txt");
    expect(exportFilename(makeNote({ title: 'A:/\\<>?|*"B.' }), "md")).toBe(
      "A---------B.md",
    );
    expect(exportFilename(makeNote({ title: "CON" }), "md")).toBe(
      "Note-CON.md",
    );
    expect(exportFilename(makeNote({ title: "🙂 / idea" }), "txt")).toBe(
      "🙂 - idea.txt",
    );
  });
});
