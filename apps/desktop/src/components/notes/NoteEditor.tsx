import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, type Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ChevronDown,
} from "lucide-react";
import { noteExtensions } from "./editorExtensions";
import { bodyToEditor, editorToBody } from "@/lib/noteEditorAdapter";
import { extractNoteLinks } from "@/lib/noteBody";
import { NOTE_COLORS, noteTitle } from "@/lib/notes";
import type { Note, NoteBlock, NoteAlign } from "@/types/planner";

export const NOTE_FONTS = [
  { name: "Geist", family: "'Geist', sans-serif" },
  { name: "Geist Mono", family: "'Geist Mono', monospace" },
  { name: "Source Serif 4", family: "'Source Serif 4', serif" },
];
export const noteFont = (font: string | null) =>
  NOTE_FONTS.find((f) => f.name === font)?.family ?? NOTE_FONTS[0].family;
const BLOCKS = [
  { type: "heading", label: "Heading", key: "#" },
  { type: "checklist", label: "Checklist", key: "[ ]" },
  { type: "bullet", label: "Bullet list", key: "-" },
  { type: "divider", label: "Divider", key: "---" },
  { type: "quote", label: "Quote", key: ">" },
  { type: "code", label: "Code", key: "```" },
];
type InsertMenu = {
  kind: "slash" | "reference";
  query: string;
  from: number;
  to: number;
};
function insertionMenu(editor: Editor): InsertMenu | null {
  const { $from, empty, from } = editor.state.selection;
  if (!empty || $from.parent.type.name === "code") return null;
  const text = $from.parent.textBetween(0, $from.parentOffset, "", "\ufffc");
  if (/^\/[a-z ]*$/i.test(text))
    return {
      kind: "slash",
      query: text.slice(1),
      from: from - text.length,
      to: from,
    };
  const ref = text.match(/\[\[([^\]]*)$/);
  return ref
    ? { kind: "reference", query: ref[1], from: from - ref[0].length, to: from }
    : null;
}

interface Props {
  note: Note;
  notes: readonly Note[];
  readOnly?: boolean;
  onBody: (body: NoteBlock[]) => void;
  onPatch: (patch: Partial<Note>) => void;
  onOpen: (id: string) => void;
  onLink: (editor: Editor) => void;
}

export default function NoteEditor({
  note,
  notes,
  readOnly,
  onBody,
  onPatch,
  onOpen,
  onLink,
}: Props) {
  const latest = useRef({ onBody, onOpen, onLink });
  latest.current = { onBody, onOpen, onLink };
  const root = useRef<HTMLDivElement>(null);
  const fontMenu = useRef<HTMLDivElement>(null);
  const fontButton = useRef<HTMLButtonElement>(null);
  const [fontOpen, setFontOpen] = useState(false);
  useEffect(() => {
    if (fontOpen)
      requestAnimationFrame(() =>
        fontMenu.current
          ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
          ?.focus(),
      );
  }, [fontOpen]);
  const menuBox = useRef<HTMLDivElement>(null);
  const [menuTop, setMenuTop] = useState(0);
  const [tick, setTick] = useState(0),
    [error, setError] = useState("");
  const [menuIndex, setMenuIndex] = useState(0),
    [dismissed, setDismissed] = useState(false);
  const [toolbarTop, setToolbarTop] = useState(0);
  const menuRef = useRef<{
    menu: InsertMenu | null;
    count: number;
    select: (index: number) => void;
  }>({ menu: null, count: 0, select: () => {} });
  const lastBody = useRef(JSON.stringify(note.body));
  const [limits] = useState(() =>
    Extension.create({
      name: "noteLimits",
      addProseMirrorPlugins: () => [
        new Plugin({
          filterTransaction: (tr) => {
            if (!tr.docChanged) return true;
            try {
              const body = editorToBody(tr.doc.toJSON());
              if (extractNoteLinks(body).length > 500)
                throw new Error("A note can link to at most 500 other notes.");
              return true;
            } catch (e) {
              queueMicrotask(() =>
                setError(
                  e instanceof Error ? e.message : "Unable to edit note",
                ),
              );
              return false;
            }
          },
        }),
      ],
    }),
  );
  const editor = useEditor({
    extensions: [...noteExtensions, limits],
    content: bodyToEditor(note.body),
    editable: !readOnly,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Note body",
        "aria-multiline": "true",
        tabindex: "0",
        spellcheck: "true",
      },
      handleClick: (_view, _pos, event) => {
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          "a[data-note-id]",
        );
        if (anchor) {
          event.preventDefault();
          latest.current.onOpen(anchor.dataset.noteId!);
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (editor) latest.current.onLink(editor);
          return true;
        }
        const current = menuRef.current;
        if (current.menu && !dismissed) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setMenuIndex((i) =>
              Math.max(
                0,
                Math.min(
                  current.count - 1,
                  i + (event.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
            return true;
          }
          if (event.key === "Enter" && current.count) {
            event.preventDefault();
            current.select(menuIndex);
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(true);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      try {
        const body = editorToBody(current.getJSON());
        if (extractNoteLinks(body).length > 500)
          throw new Error("A note can link to at most 500 other notes.");
        lastBody.current = JSON.stringify(body);
        latest.current.onBody(body);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save this edit");
      }
    },
    onTransaction: () => {
      setTick((v) => v + 1);
    },
  });
  // Remote edits replace the document only when its canonical body changed.
  // Local echoes preserve the selection and undo history.
  useEffect(() => {
    const body = JSON.stringify(note.body);
    if (editor && body !== lastBody.current) {
      lastBody.current = body;
      editor.commands.setContent(bodyToEditor(note.body), {
        emitUpdate: false,
      });
    }
  }, [note.body, editor]);
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);
  const menu = editor && !dismissed ? insertionMenu(editor) : null;
  const rawMenu = editor ? insertionMenu(editor) : null;
  const menuKey = rawMenu
    ? `${rawMenu.kind}:${rawMenu.from}:${rawMenu.query}`
    : "";
  useEffect(() => {
    setMenuIndex(0);
    setDismissed(false);
  }, [menuKey]);
  const blockItems = BLOCKS.filter((block) =>
    block.label.toLowerCase().includes(menu?.query.toLowerCase() ?? ""),
  );
  const referenceItems = notes
    .filter(
      (n) =>
        n.id !== note.id &&
        !n.trashedAt &&
        noteTitle(n)
          .toLowerCase()
          .includes(menu?.query.toLowerCase() ?? ""),
    )
    .slice(0, 12);
  const count =
    menu?.kind === "slash" ? blockItems.length : referenceItems.length;
  const choose = (index: number) => {
    if (!editor || !menu) return;
    if (menu.kind === "reference") {
      const linked = referenceItems[index];
      if (!linked) return;
      editor
        .chain()
        .focus()
        .deleteRange(menu)
        .insertContent({
          type: "noteLink",
          attrs: { noteId: linked.id, label: noteTitle(linked) },
        })
        .insertContent(" ")
        .run();
    } else {
      const block = blockItems[index];
      if (!block) return;
      const chain = editor.chain().focus().deleteRange(menu);
      if (block.type === "divider")
        chain.insertContent([{ type: "divider" }, { type: "paragraph" }]).run();
      else
        chain
          .setNode(
            block.type,
            block.type === "heading"
              ? { level: 2 }
              : block.type === "checklist"
                ? { checked: false }
                : {},
          )
          .run();
    }
    setDismissed(true);
  };
  menuRef.current = { menu, count, select: choose };
  const selected = editor && !editor.state.selection.empty && !readOnly;
  useEffect(() => {
    if (!editor || !menu || !root.current) return;
    const position = () => {
      if (!root.current || editor.isDestroyed) return;
      const rootBounds = root.current.getBoundingClientRect();
      const bounds = root.current.closest(".nbody")?.getBoundingClientRect();
      const cursor = editor.view.coordsAtPos(editor.state.selection.from);
      const height = menuBox.current?.getBoundingClientRect().height ?? 280;
      const bottom = bounds?.bottom ?? window.innerHeight;
      const above = cursor.top - rootBounds.top - height - 8;
      const below = cursor.bottom - rootBounds.top + 8;
      setMenuTop(
        Math.max(
          (bounds?.top ?? 0) - rootBounds.top + 8,
          cursor.bottom + height + 16 > bottom ? above : below,
        ),
      );
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [editor, menuKey, tick, Boolean(menu)]);
  useEffect(() => {
    if (!editor || !selected || !root.current) return;
    const position = () => {
      if (!root.current || editor.isDestroyed) return;
      const rect = editor.view.coordsAtPos(editor.state.selection.from);
      setToolbarTop(
        Math.max(0, rect.top - root.current.getBoundingClientRect().top - 48),
      );
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [editor, selected, tick]);

  return (
    <div className="note-editor-input" ref={root}>
      <EditorContent editor={editor} />
      {!readOnly && !editor?.getText() && (
        <span className="note-editor-placeholder" aria-hidden="true">
          Type / for blocks
        </span>
      )}
      {selected && editor && (
        <div
          className="note-selection"
          role="toolbar"
          aria-label="Format selection"
          style={{ top: toolbarTop }}
          onMouseDown={(e) => {
            if (!(e.target instanceof HTMLSelectElement)) e.preventDefault();
          }}
        >
          <div
            className="note-font-picker"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget))
                setFontOpen(false);
            }}
          >
            <button
              ref={fontButton}
              type="button"
              className="note-font-button"
              aria-label={`Font: ${note.font ?? "Geist"}`}
              aria-haspopup="listbox"
              aria-expanded={fontOpen}
              onClick={() => setFontOpen((v) => !v)}
            >
              {note.font ?? "Geist"}
              <ChevronDown size={14} />
            </button>
            {fontOpen && (
              <div
                ref={fontMenu}
                className="note-font-menu"
                role="listbox"
                aria-label="Fonts"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setFontOpen(false);
                    fontButton.current?.focus();
                  }
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const buttons = [
                      ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                        "button",
                      ),
                    ];
                    const i = buttons.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    buttons[
                      (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                        buttons.length
                    ]?.focus();
                  }
                }}
              >
                {NOTE_FONTS.map((font) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={(note.font ?? "Geist") === font.name}
                    key={font.name}
                    style={{ fontFamily: font.family }}
                    onClick={() => {
                      onPatch({ font: font.name });
                      setFontOpen(false);
                      editor.commands.focus();
                    }}
                  >
                    {font.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Bold"
            title="Bold (Ctrl B)"
            aria-pressed={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleMark("bold").run()}
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            aria-label="Italic"
            title="Italic (Ctrl I)"
            aria-pressed={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleMark("italic").run()}
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            aria-label="Link (Ctrl K)"
            onClick={() => onLink(editor)}
          >
            <Link size={16} />
          </button>
          <span
            className="note-text-colors"
            role="group"
            aria-label="Text colour"
          >
            {NOTE_COLORS.map((color) => (
              <button
                type="button"
                key={color.label}
                aria-label={`${color.label} text`}
                aria-pressed={
                  color.value
                    ? editor.isActive("color", { color: color.value })
                    : !editor.isActive("color")
                }
                style={{ "--c": color.token } as React.CSSProperties}
                onClick={() =>
                  color.value
                    ? editor
                        .chain()
                        .focus()
                        .setMark("color", { color: color.value })
                        .run()
                    : editor.chain().focus().unsetMark("color").run()
                }
              />
            ))}
          </span>
          {(
            [
              ["left", AlignLeft],
              ["center", AlignCenter],
              ["right", AlignRight],
              ["justify", AlignJustify],
            ] as const
          ).map(([align, Icon]) => (
            <button
              type="button"
              key={align}
              aria-label={`Align ${align}`}
              aria-pressed={(note.align ?? "left") === align}
              onClick={() => onPatch({ align: align as NoteAlign })}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      )}
      {menu && (
        <div
          className="note-insert-menu"
          ref={menuBox}
          style={{ top: menuTop }}
          role="listbox"
          aria-label={menu.kind === "slash" ? "Insert block" : "Link a note"}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setDismissed(true);
              editor?.commands.focus();
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              e.stopPropagation();
              const buttons = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              ];
              const i = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                buttons.length;
              buttons[next]?.focus();
              setMenuIndex(next);
            }
          }}
        >
          <div className="sec">
            {menu.kind === "slash" ? "INSERT BLOCK" : "LINK A NOTE"}
          </div>
          {menu.kind === "slash"
            ? blockItems.map((block, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={i === menuIndex}
                  key={block.type}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                >
                  <span>{block.label}</span>
                  <span className="mono">{block.key}</span>
                </button>
              ))
            : referenceItems.map((linked, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={i === menuIndex}
                  key={linked.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                >
                  {noteTitle(linked)}
                </button>
              ))}
          {!count && (
            <p>
              {menu.kind === "slash"
                ? "No block matches. Keep typing a paragraph."
                : "No notes match."}
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="note-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
