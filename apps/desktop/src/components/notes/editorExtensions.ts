import {
  Extension,
  Mark,
  Node,
  mergeAttributes,
  textblockTypeInputRule,
} from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions/undo-redo";
import { Plugin } from "@tiptap/pm/state";
import { baseKeymap } from "@tiptap/pm/commands";
import { keymap } from "@tiptap/pm/keymap";

const Document = Node.create({ name: "doc", topNode: true, content: "block+" });
const Text = Node.create({ name: "text", group: "inline" });
const Paragraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  parseHTML: () => [{ tag: "p" }],
  renderHTML: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
});
const Heading = Node.create({
  name: "heading",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes: () => ({ level: { default: 2 } }),
  parseHTML: () =>
    [1, 2, 3].map((level) => ({ tag: `h${level}`, attrs: { level } })),
  renderHTML: ({ node, HTMLAttributes }) => [
    `h${node.attrs.level}`,
    HTMLAttributes,
    0,
  ],
  addInputRules() {
    return [1, 2, 3].map((level) =>
      textblockTypeInputRule({
        find: new RegExp(`^(#{${level}})\\s$`),
        type: this.type,
        getAttributes: () => ({ level }),
      }),
    );
  },
});
const Bullet = Node.create({
  name: "bullet",
  group: "block",
  content: "inline*",
  parseHTML: () => [{ tag: 'div[data-block="bullet"]' }, { tag: "li" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-block": "bullet" }),
    0,
  ],
  addInputRules() {
    return [textblockTypeInputRule({ find: /^[-*] $/, type: this.type })];
  },
});
const Checklist = Node.create({
  name: "checklist",
  group: "block",
  content: "inline*",
  addAttributes: () => ({
    checked: {
      default: false,
      parseHTML: (el) => el.getAttribute("data-checked") === "true",
    },
  }),
  parseHTML: () => [{ tag: 'div[data-block="checklist"]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, {
      "data-block": "checklist",
      "data-checked": String(node.attrs.checked),
    }),
    0,
  ],
  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^\[([ x])\] $/,
        type: this.type,
        getAttributes: (match) => ({ checked: match[1] === "x" }),
      }),
    ];
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div"),
        button = document.createElement("button"),
        contentDOM = document.createElement("span");
      dom.dataset.block = "checklist";
      button.type = "button";
      button.contentEditable = "false";
      button.setAttribute("role", "checkbox");
      button.setAttribute("aria-label", "Toggle checklist item");
      const update = (checked: boolean) => {
        dom.dataset.checked = String(checked);
        button.setAttribute("aria-checked", String(checked));
        button.textContent = checked ? "✓" : "";
      };
      update(Boolean(node.attrs.checked));
      button.addEventListener("click", () => {
        if (!editor.isEditable) return;
        const pos = getPos();
        if (typeof pos === "number") {
          const current = editor.state.doc.nodeAt(pos);
          if (current)
            editor.view.dispatch(
              editor.state.tr.setNodeMarkup(pos, undefined, {
                ...current.attrs,
                checked: !current.attrs.checked,
              }),
            );
        }
      });
      dom.append(button, contentDOM);
      return {
        dom,
        contentDOM,
        stopEvent: (event) => button.contains(event.target as globalThis.Node),
        update: (updated) => {
          if (updated.type.name !== "checklist") return false;
          update(Boolean(updated.attrs.checked));
          return true;
        },
      };
    };
  },
});
const Quote = Node.create({
  name: "quote",
  group: "block",
  content: "inline*",
  parseHTML: () => [{ tag: "blockquote" }],
  renderHTML: ({ HTMLAttributes }) => ["blockquote", HTMLAttributes, 0],
  addInputRules() {
    return [textblockTypeInputRule({ find: /^> $/, type: this.type })];
  },
});
const Code = Node.create({
  name: "code",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes: () => ({ language: { default: "" } }),
  parseHTML: () => [{ tag: "pre", preserveWhitespace: "full" }],
  renderHTML: ({ HTMLAttributes }) => ["pre", HTMLAttributes, ["code", 0]],
  addKeyboardShortcuts() {
    return {
      Enter: () =>
        this.editor.isActive("code")
          ? this.editor.commands.insertContent("\n")
          : false,
      "Mod-Enter": () =>
        this.editor.isActive("code")
          ? this.editor
              .chain()
              .insertContentAt(this.editor.state.selection.$from.after(), {
                type: "paragraph",
              })
              .focus()
              .run()
          : false,
    };
  },
  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^```([a-z0-9]*) $/,
        type: this.type,
        getAttributes: (m) => ({ language: m[1] }),
      }),
    ];
  },
});
const Divider = Node.create({
  name: "divider",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: "hr" }],
  renderHTML: ({ HTMLAttributes }) => ["hr", HTMLAttributes],
});
const NoteLink = Node.create({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({
    noteId: { default: "" },
    label: { default: "Untitled" },
  }),
  parseHTML: () => [
    {
      tag: "a[data-note-id]",
      getAttrs: (el) => ({
        noteId: el.getAttribute("data-note-id"),
        label: el.textContent,
      }),
    },
  ],
  renderHTML: ({ node }) => [
    "a",
    {
      "data-note-id": node.attrs.noteId,
      href: `#note-${node.attrs.noteId}`,
      class: "note-reference",
    },
    node.attrs.label,
  ],
});
const Bold = Mark.create({
  name: "bold",
  parseHTML: () => [{ tag: "strong" }, { tag: "b" }],
  renderHTML: () => ["strong", 0],
  addKeyboardShortcuts() {
    return { "Mod-b": () => this.editor.commands.toggleMark("bold") };
  },
});
const Italic = Mark.create({
  name: "italic",
  parseHTML: () => [{ tag: "em" }, { tag: "i" }],
  renderHTML: () => ["em", 0],
  addKeyboardShortcuts() {
    return { "Mod-i": () => this.editor.commands.toggleMark("italic") };
  },
});
const Color = Mark.create({
  name: "color",
  addAttributes: () => ({
    color: {
      default: "a",
      parseHTML: (el) => el.getAttribute("data-text-color"),
    },
  }),
  parseHTML: () => [
    {
      tag: "span[data-text-color]",
      getAttrs: (el) =>
        ["a", "b", "c", "d"].includes(el.getAttribute("data-text-color") ?? "")
          ? null
          : false,
    },
  ],
  renderHTML: ({ mark }) => [
    "span",
    { "data-text-color": mark.attrs.color },
    0,
  ],
});
const Link = Mark.create({
  name: "link",
  inclusive: false,
  addAttributes: () => ({
    href: { default: "", parseHTML: (el) => el.getAttribute("href") },
  }),
  parseHTML: () => [
    {
      tag: "a[href]:not([data-note-id])",
      getAttrs: (el) =>
        /^(https?:|mailto:)/i.test(el.getAttribute("href") ?? "")
          ? null
          : false,
    },
  ],
  renderHTML: ({ HTMLAttributes }) => [
    "a",
    mergeAttributes(HTMLAttributes, {
      rel: "noopener noreferrer",
      target: "_blank",
    }),
    0,
  ],
});
const BlockIdentity = Extension.create({
  name: "blockIdentity",
  addGlobalAttributes: () => [
    {
      types: [
        "paragraph",
        "heading",
        "bullet",
        "checklist",
        "quote",
        "code",
        "divider",
      ],
      attributes: { id: { default: null, rendered: false } },
    },
  ],
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const tr = state.tr,
            seen = new Set<string>();
          state.doc.forEach((node, pos) => {
            const id = node.attrs.id;
            if (!id || seen.has(id)) {
              const next = crypto.randomUUID();
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: next });
              seen.add(next);
            } else seen.add(id);
          });
          return tr.docChanged ? tr : null;
        },
      }),
      keymap(baseKeymap),
    ];
  },
});

export const noteExtensions = [
  Document,
  Text,
  Paragraph,
  Heading,
  Bullet,
  Checklist,
  Quote,
  Code,
  Divider,
  NoteLink,
  Bold,
  Italic,
  Color,
  Link,
  UndoRedo,
  BlockIdentity,
];
