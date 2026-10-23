import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Editor } from "@tiptap/core";
import {
  Plus,
  Search,
  List,
  LayoutGrid,
  Pin,
  Clock,
  Inbox,
  Hash,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Download,
  PanelsTopLeft,
  Link as LinkIcon,
  Undo2,
} from "lucide-react";
import { useNotes } from "@/hooks/useNotes";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";
import { useSyncStatus } from "@/hooks/useSync";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { noteBacklinks, noteBodyText, noteWordCount } from "@/lib/noteBody";
import {
  NOTE_COLORS,
  captureNote,
  noteColor,
  noteSection,
  noteTitle,
  selectNotes,
  type NoteFilter,
} from "@/lib/notes";
import { downloadNote } from "@/lib/noteExport";
import { externalNoteUrl, openExternalNoteLink } from "@/lib/externalLinks";
import type { Note, NoteColor } from "@/types/planner";
import NoteEditor, { noteFont } from "./NoteEditor";
import NotesDialog from "./NotesDialog";
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-400-italic.css";
import "@fontsource/source-serif-4/latin-700.css";
import "./notes.css";

type Overlay = "capture" | "switcher" | "cheat" | "link" | "delete" | null;
const SHORTCUTS = [
  [
    "ANYWHERE",
    [
      ["Quick switcher", "Ctrl P"],
      ["Quick capture", "Ctrl Shift N"],
      ["New note", "Ctrl N"],
      ["Search notes", "/"],
      ["This sheet", "?"],
      ["Close or exit", "Esc"],
    ],
  ],
  [
    "LIST",
    [
      ["Next note", "J"],
      ["Previous note", "K"],
      ["Pin to top", "P"],
      ["Desktop widget", "W"],
      ["List or grid", "G"],
      ["Collapse list", "["],
      ["Trash note", "Del"],
      ["Undo", "Ctrl Z"],
    ],
  ],
  [
    "EDITOR",
    [
      ["Block menu", "/"],
      ["Bold", "Ctrl B"],
      ["Italic", "Ctrl I"],
      ["Export", "Ctrl Shift E"],
      ["Link", "Ctrl K"],
      ["Link a note", "[["],
      ["Focus mode", "Ctrl ."],
    ],
  ],
] as const;
const editedLabel = (note: Note) =>
  new Date(note.updatedAt ?? note.createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

function ColourPicker({
  value,
  onChange,
  label = "Note colour",
}: {
  value: NoteColor | null;
  onChange: (value: NoteColor | null) => void;
  label?: string;
}) {
  return (
    <div className="note-colours" role="group" aria-label={label}>
      {NOTE_COLORS.map((color) => (
        <button
          type="button"
          key={color.label}
          title={color.label}
          aria-label={color.label}
          aria-pressed={value === color.value}
          style={{ "--c": color.token } as CSSProperties}
          onClick={() => onChange(color.value)}
        />
      ))}
    </div>
  );
}

export default function NotesPage({
  captureRequest = 0,
  openRequest,
  onOpenRequestHandled,
  keyboardBlocked = false,
}: {
  captureRequest?: number;
  openRequest?: {id:string;request:number}|null;
  onOpenRequestHandled?: () => void;
  keyboardBlocked?: boolean;
}) {
  const {
    notes,
    addNote,
    updateNote,
    trashNote,
    restoreNote,
    deleteNotePermanently,
  } = useNotes();
  const status = useSyncStatus();
  const prefs = usePrefs(),
    now = useNow();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<NoteFilter>("all"),
    [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [collapsed, setCollapsed] = useState(false);
  const [focus, setFocus] = useState(false),
    [overlay, setOverlay] = useState<Overlay>(null);
  const [error, setError] = useState(""),
    [undoId, setUndoId] = useState<string | null>(null);
  const [fast, setFast] = useState(""),
    [tag, setTag] = useState(""),
    [addingTag, setAddingTag] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [capture, setCapture] = useState(""),
    [captureColor, setCaptureColor] = useState<NoteColor | null>(null);
  const [switchQuery, setSwitchQuery] = useState(""),
    [switchIndex, setSwitchIndex] = useState(0);
  const [url, setUrl] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const titleId = useRef<string | null>(null);
  const linkEditor = useRef<Editor | null>(null);
  const exportOpener = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null),
    listRef = useRef<HTMLDivElement>(null),
    titleRef = useRef<HTMLInputElement>(null),
    pageRef = useRef<HTMLDivElement>(null),
    exportRef = useRef<HTMLDivElement>(null);
  useDialogFocus(pageRef, focus && !overlay);
  const live = useMemo(() => notes.filter((note) => !note.trashedAt), [notes]);
  const visible = useMemo(
    () => selectNotes(notes, filter, query, now.getTime()),
    [notes, filter, query, now],
  );
  const selected =
    visible.find((note) => note.id === selectedId) ?? visible[0] ?? null;
  const tags = useMemo(
    () => [...new Set(live.flatMap((n) => n.tags))].sort(),
    [live],
  );
  const backlinks = selected ? noteBacklinks(notes, selected.id) : [];
  const switchResults = useMemo(
    () => selectNotes(notes, "all", switchQuery).slice(0, 12),
    [notes, switchQuery],
  );
  const collections = [
    { key: "all" as const, name: "All notes", count: live.length, Icon: Inbox },
    {
      key: "pinned" as const,
      name: "Pinned",
      count: live.filter((n) => n.pinned).length,
      Icon: Pin,
    },
    {
      key: "recent" as const,
      name: "Recent",
      count: selectNotes(notes, "recent", "").length,
      Icon: Clock,
    },
  ];
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    setError("");
  }, []);
  const openOverlay = useCallback((kind: Overlay) => {
    setExportOpen(false);
    setError("");
    setOverlay(kind);
    if (kind === "capture") {
      setCapture("");
      setCaptureColor(null);
    }
    if (kind === "switcher") {
      setSwitchQuery("");
      setSwitchIndex(0);
    }
  }, []);
  useEffect(() => {
    if (captureRequest) openOverlay("capture");
  }, [captureRequest, openOverlay]);
  useEffect(() => {
    setAddingTag(false);
    setTag("");
    setError("");
    setExportOpen(false);
  }, [selected?.id]);
  useEffect(() => {
    if (
      titleId.current !== selected?.id ||
      document.activeElement !== titleRef.current
    )
      setTitleDraft(selected?.title ?? "");
    titleId.current = selected?.id ?? null;
  }, [selected?.id, selected?.title]);
  const change = useCallback(
    (id: string, patch: Partial<Note>) => {
      try {
        const saved = updateNote(id, patch);
        setSelectedId(id);
        setError("");
        return saved;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the note");
        return null;
      }
    },
    [updateNote],
  );
  const create = useCallback(
    (text = "", color: NoteColor | null = null, inbox = false) => {
      try {
        const note = addNote(
          inbox
            ? captureNote(text, color)
            : { title: text.trim() || null, color },
        );
        if (!note)
          throw new Error("Your saved planner is not ready. Try again.");
        setSelectedId(note.id);
        setView("list");
        setFilter("all");
        setQuery("");
        setCollapsed(false);
        setError("");
        setOverlay(null);
        requestAnimationFrame(() => titleRef.current?.focus());
        return note;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the note");
        return null;
      }
    },
    [addNote],
  );
  const handledOpen = useRef<number|null>(null);
  const openNote = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      if (!note) {
        setError(
          "This linked note was permanently deleted or has not synced yet.",
        );
        return;
      }
      setFilter(note.trashedAt ? "trash" : "all");
      setQuery("");
      setSelectedId(id);
      setView("list");
      setOverlay(null);
      setError("");
    },
    [notes],
  );
  useEffect(()=>{
    if(!openRequest || handledOpen.current===openRequest.request || !notes.some(n=>n.id===openRequest.id)) return;
    handledOpen.current=openRequest.request;openNote(openRequest.id);onOpenRequestHandled?.();
  },[openRequest,openNote,notes,onOpenRequestHandled]);
  const trash = useCallback(() => {
    if (!selected || selected.trashedAt) return;
    trashNote(selected.id);
    setUndoId(selected.id);
    setFocus(false);
    setError("");
    listRef.current?.focus();
  }, [selected, trashNote]);
  const undo = useCallback(() => {
    if (undoId) {
      restoreNote(undoId);
      setSelectedId(undoId);
      setView("list");
      setFilter("all");
      setQuery("");
      setUndoId(null);
    }
  }, [undoId, restoreNote]);
  const move = useCallback(
    (direction: number) => {
      const index = visible.findIndex((note) => note.id === selected?.id);
      const next =
        visible[Math.max(0, Math.min(visible.length - 1, index + direction))];
      if (next) {
        setSelectedId(next.id);
        requestAnimationFrame(() =>
          document
            .getElementById(`note-row-${next.id}`)
            ?.scrollIntoView({ block: "nearest" }),
        );
      }
    },
    [visible, selected],
  );
  useEffect(() => {
    if (!exportOpen) return;
    exportOpener.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() =>
      exportRef.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
    const dismiss = (e: MouseEvent) => {
      if (
        !exportRef.current?.parentElement?.contains(e.target as globalThis.Node)
      )
        setExportOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [exportOpen]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (keyboardBlocked || e.defaultPrevented || overlay) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const typing = Boolean(
        target?.closest('input,textarea,select,[contenteditable="true"]'),
      );
      const inList = Boolean(target?.closest(".nitems,.ngrid"));
      const mod = e.ctrlKey || e.metaKey,
        key = e.key.toLowerCase();
      if (mod && e.shiftKey && key === "n") {
        e.preventDefault();
        openOverlay("capture");
      } else if (mod && key === "n") {
        e.preventDefault();
        create();
      } else if (mod && key === "p") {
        e.preventDefault();
        openOverlay("switcher");
      } else if (mod && e.shiftKey && key === "e" && selected) {
        e.preventDefault();

        setExportOpen((v) => !v);
      } else if (mod && key === "." && selected && !selected.trashedAt) {
        e.preventDefault();
        setFocus((v) => !v);
        setView("list");
      } else if (mod && key === "z" && undoId && !typing) {
        e.preventDefault();
        undo();
      } else if (key === "escape") {
        e.preventDefault();
        setExportOpen(false);
        if (focus) setFocus(false);
        else if (query) setQuery("");
      } else if (!typing && !mod && !e.altKey) {
        if (key === "?") {
          e.preventDefault();
          openOverlay("cheat");
        } else if (key === "/") {
          e.preventDefault();
          searchRef.current?.focus();
        } else if (key === "g") {
          e.preventDefault();
          setView((v) => (v === "list" ? "grid" : "list"));
        } else if (key === "[") {
          e.preventDefault();
          setCollapsed((v) => !v);
          setView("list");
        } else if (inList && (key === "j" || key === "arrowdown")) {
          e.preventDefault();
          move(1);
        } else if (inList && (key === "k" || key === "arrowup")) {
          e.preventDefault();
          move(-1);
        } else if (inList && key === "p" && selected && !selected.trashedAt) {
          e.preventDefault();
          change(selected.id, { pinned: !selected.pinned });
        } else if (inList && key === "w" && selected && !selected.trashedAt) {
          e.preventDefault();
          change(selected.id, { pinnedToWidget: !selected.pinnedToWidget });
        } else if (
          inList &&
          key === "delete" &&
          selected &&
          !selected.trashedAt
        ) {
          e.preventDefault();
          trash();
        } else if (key === "enter" && target === listRef.current && selected) {
          e.preventDefault();
          setView("list");
          titleRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    keyboardBlocked,
    overlay,
    selected,
    create,
    openOverlay,
    move,
    change,
    trash,
    undoId,
    undo,
    focus,
    query,
  ]);
  const applyTag = () => {
    if (!selected || !tag.trim()) {
      setAddingTag(false);
      return;
    }
    if (
      change(selected.id, {
        tags: [...new Set([...selected.tags, tag.trim()])],
      })
    ) {
      setTag("");
      setAddingTag(false);
    }
  };
  const saveLink = () => {
    const editor = linkEditor.current;
    if (!editor || editor.isDestroyed) {
      closeOverlay();
      return;
    }
    if (url.trim() && !externalNoteUrl(url)) {
      setError("Use an https, http or mailto link.");
      return;
    }
    if (url.trim())
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setMark("link", { href: externalNoteUrl(url)! })
        .run();
    else editor.chain().focus().extendMarkRange("link").unsetMark("link").run();
    closeOverlay();
  };
  const exportNotes = (kind: "md" | "txt") => {
    if (selected) downloadNote(selected, kind);
    setExportOpen(false);
    requestAnimationFrame(() => exportOpener.current?.focus());
  };
  const folderNav = (
    <>
      <div className="note-collections">
        {collections.map(({ key, name, count, Icon }) => (
          <button
            type="button"
            className="npi"
            key={key}
            aria-current={filter === key ? "true" : undefined}
            onClick={() => setFilter(key)}
          >
            <Icon size={16} />
            <span>{name}</span>
            <span className="n">{count}</span>
          </button>
        ))}
      </div>
      <div className="note-tag-filters">
        <span className="sec">TAGS</span>
        {tags.map((name) => (
          <button
            type="button"
            className="npi"
            key={name}
            aria-current={filter === `tag:${name}` ? "true" : undefined}
            onClick={() => setFilter(`tag:${name}`)}
          >
            <Hash size={15} />
            <span>{name}</span>
            <span className="n">
              {live.filter((n) => n.tags.includes(name)).length}
            </span>
          </button>
        ))}
        {!tags.length && <p>Tags you add show up here.</p>}
      </div>
      <button
        type="button"
        className="npi note-trash-filter"
        aria-current={filter === "trash" ? "true" : undefined}
        onClick={() => {
          setFilter("trash");
          setFocus(false);
        }}
      >
        <Trash2 size={16} />
        <span>Trash</span>
        <span className="n">{notes.length - live.length}</span>
      </button>
    </>
  );
  return (
    <div
      className={`notes-page ${focus ? "notes-focus" : ""}`}
      ref={pageRef}
      tabIndex={focus ? -1 : undefined}
      role={focus ? "dialog" : undefined}
      aria-modal={focus ? true : undefined}
      aria-label={focus ? "Focus mode" : undefined}
    >
      {!focus && (
        <header className="hd notes-header">
          <div className="notes-heading">
            <span className="mono">YOUR SPACE</span>
            <h1>Notes</h1>
          </div>
          <div className="seg" role="group" aria-label="Notes layout">
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={14} />
              List
            </button>
            <button
              type="button"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={14} />
              Grid
            </button>
          </div>
          <div className="qa notes-search">
            <Search size={15} />
            <label className="sr-only" htmlFor="notes-search">
              Search notes
            </label>
            <input
              ref={searchRef}
              id="notes-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
            />
            <span className="kbd">/</span>
          </div>
          <button
            type="button"
            className="ctl note-switch"
            title="Quick switcher (Ctrl P)"
            onClick={() => openOverlay("switcher")}
          >
            Switch <span className="kbd">Ctrl P</span>
          </button>
          <button
            type="button"
            className="ctl note-capture"
            title="Quick capture (Ctrl Shift N)"
            onClick={() => openOverlay("capture")}
          >
            Capture
          </button>
          <button
            type="button"
            className="b b-commit b-primary"
            onClick={() => create()}
          >
            <span className="lab">
              <Plus size={16} />
              New note
            </span>
            <span className="key">Ctrl N</span>
          </button>
        </header>
      )}
      {!focus && (
        <div className="note-compact-filters">
          <label>
            Collection
            <select
              aria-label="Notes collection"
              value={filter}
              onChange={(e) => setFilter(e.target.value as NoteFilter)}
            >
              {collections.map((c) => (
                <option value={c.key} key={c.key}>
                  {c.name} ({c.count})
                </option>
              ))}
              {tags.map((t) => (
                <option key={t} value={`tag:${t}`}>
                  #{t}
                </option>
              ))}
              <option value="trash">
                Trash ({notes.length - live.length})
              </option>
            </select>
          </label>
          <button
            type="button"
            className="b b-quiet"
            onClick={() => openOverlay("switcher")}
          >
            Switch
          </button>
          <button
            type="button"
            className="b b-quiet"
            onClick={() => openOverlay("capture")}
          >
            Capture
          </button>
        </div>
      )}
      <div className="nwrap">
        {!focus && (
          <nav className="npa" aria-label="Notes folders and tags">
            {folderNav}
          </nav>
        )}
        {!focus && view === "list" && !collapsed && (
          <section className="nlist" aria-label="Note list">
            <div className="nlh">
              <div className="note-list-label">
                <span className="sec">
                  {filter === "trash" ? "TRASH" : "NOTES"} · {visible.length}
                </span>
                <button
                  type="button"
                  className="b b-icon"
                  aria-label="Collapse notes list"
                  aria-expanded="true"
                  onClick={() => setCollapsed(true)}
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
              <form
                className="ncap"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (fast.trim() && create(fast, null, true)) setFast("");
                }}
              >
                <label htmlFor="note-fast" className="sr-only">
                  Fast capture
                </label>
                <input
                  id="note-fast"
                  value={fast}
                  onChange={(e) => setFast(e.target.value)}
                  placeholder="Capture a thought"
                />
                <span className="kbd">Enter</span>
              </form>
            </div>
            <div
              className="nitems"
              ref={listRef}
              role="listbox"
              aria-label="Notes"
              tabIndex={0}
              aria-activedescendant={
                selected ? `note-row-${selected.id}` : undefined
              }
            >
              {visible.map((note, index) => {
                const section = noteSection(note, now, prefs.weekStart);
                return (
                  <Fragment key={note.id}>
                    {(index === 0 ||
                      noteSection(visible[index - 1], now, prefs.weekStart) !==
                        section) && (
                      <div className="sec note-section">{section}</div>
                    )}
                    <button
                      type="button"
                      tabIndex={-1}
                      id={`note-row-${note.id}`}
                      role="option"
                      aria-selected={selected?.id === note.id}
                      className={`nit ${selected?.id === note.id ? "is-sel" : ""}`}
                      style={{ "--c": noteColor(note) } as CSSProperties}
                      onClick={() => {
                        setSelectedId(note.id);
                        listRef.current?.focus();
                      }}
                    >
                      <span className="bar" />
                      <span className="tx">
                        <span className="tl">{noteTitle(note)}</span>
                        <span className="pv">
                          {noteBodyText(note.body).slice(0, 180)}
                        </span>
                        <span className="dt">
                          Edited {editedLabel(note)}
                          {note.pinned && (
                            <span className="wgt">
                              <Pin size={10} />
                              Pinned
                            </span>
                          )}
                          {note.pinnedToWidget && (
                            <span className="wgt">
                              <PanelsTopLeft size={10} />
                              Widget
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </Fragment>
                );
              })}
              {!visible.length && (
                <p className="note-no-match">No notes match.</p>
              )}
            </div>
          </section>
        )}
        {view === "grid" && !focus ? (
          <div className="note-grid-scroll">
            <div className="note-grid-top">
              <span className="sec">
                {filter === "trash" ? "TRASH" : "YOUR NOTES"} · {visible.length}
              </span>
            </div>
            <div
              className="ngrid"
              ref={listRef}
              tabIndex={0}
              role="listbox"
              aria-label="Notes"
              aria-activedescendant={
                selected ? `note-row-${selected.id}` : undefined
              }
            >
              {visible.map((note) => (
                <button
                  type="button"
                  className="nc"
                  key={note.id}
                  id={`note-row-${note.id}`}
                  role="option"
                  aria-selected={selected?.id === note.id}
                  style={{ "--c": noteColor(note) } as CSSProperties}
                  onClick={() => openNote(note.id)}
                >
                  <span className="tl">{noteTitle(note)}</span>
                  <span className="pv">
                    {noteBodyText(note.body).slice(0, 440)}
                  </span>
                  <span className="ft">
                    {note.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                    <span>Edited {editedLabel(note)}</span>
                    {note.pinned && <Pin size={12} />}
                    {note.pinnedToWidget && <PanelsTopLeft size={12} />}
                  </span>
                </button>
              ))}
            </div>
            {!visible.length && (
              <EmptyNotes
                empty={!notes.length}
                trash={filter === "trash"}
                onNew={() => create()}
                onClear={() => {
                  setQuery("");
                  setFilter("all");
                }}
              />
            )}
          </div>
        ) : (
          <section className="ned" aria-label="Editor">
            {selected ? (
              <>
                <div className="nbar" role="toolbar" aria-label="Note actions">
                  {focus ? (
                    <>
                      <span className="sec">FOCUS MODE</span>
                      <button
                        type="button"
                        className="ctl"
                        onClick={() => setFocus(false)}
                      >
                        <Minimize2 size={15} />
                        Exit <span className="kbd">Esc</span>
                      </button>
                    </>
                  ) : (
                    collapsed && (
                      <button
                        type="button"
                        className="ctl"
                        aria-expanded="false"
                        onClick={() => setCollapsed(false)}
                      >
                        <ChevronRight size={14} />
                        Notes <span className="mono">{visible.length}</span>
                      </button>
                    )
                  )}
                  <span className="note-spacer" />
                  {selected.trashedAt ? (
                    <>
                      <button
                        type="button"
                        className="ctl"
                        onClick={() => {
                          restoreNote(selected.id);
                          openNote(selected.id);
                          setFilter("all");
                        }}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="b b-del"
                        onClick={() => openOverlay("delete")}
                      >
                        Delete permanently
                      </button>
                    </>
                  ) : (
                    <>
                      <ColourPicker
                        value={selected.color}
                        onChange={(color) => change(selected.id, { color })}
                      />
                      <button
                        type="button"
                        className="ctl ctl-icon"
                        title="Pin to top (P)"
                        aria-label="Pin note to top"
                        aria-pressed={selected.pinned}
                        onClick={() =>
                          change(selected.id, { pinned: !selected.pinned })
                        }
                      >
                        <Pin size={16} />
                      </button>
                      <button
                        type="button"
                        className="ctl note-widget-toggle"
                        title="Desktop widget (W)"
                        aria-pressed={selected.pinnedToWidget}
                        onClick={() =>
                          change(selected.id, {
                            pinnedToWidget: !selected.pinnedToWidget,
                          })
                        }
                      >
                        <PanelsTopLeft size={15} />
                        <span>Desktop widget</span>
                      </button>
                      {!focus && (
                        <button
                          type="button"
                          className="ctl ctl-icon"
                          aria-label="Focus mode"
                          title="Focus mode (Ctrl .)"
                          onClick={() => setFocus(true)}
                        >
                          <Maximize2 size={16} />
                        </button>
                      )}
                    </>
                  )}
                  <div className="note-export-anchor">
                    <button
                      type="button"
                      className="ctl"
                      aria-haspopup="menu"
                      aria-expanded={exportOpen}
                      onClick={() => {
                        setExportOpen((v) => !v);
                      }}
                    >
                      <Download size={15} />
                      Export
                    </button>
                  </div>
                  {!selected.trashedAt && (
                    <button
                      type="button"
                      className="b b-icon"
                      aria-label="Move to trash"
                      title="Move to trash (Del)"
                      onClick={trash}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="nbody">
                  <article
                    className="ndoc"
                    style={{
                      fontFamily: noteFont(selected.font),
                      textAlign: selected.align ?? "left",
                    }}
                  >
                    {selected.pinnedToWidget && !selected.trashedAt && (
                      <div className="note-widget-banner">
                        <PanelsTopLeft size={16} />
                        <span>Pinned for your desktop Notes widget.</span>
                        <button
                          type="button"
                          className="b b-quiet"
                          onClick={() =>
                            change(selected.id, { pinnedToWidget: false })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {selected.trashedAt && (
                      <div className="note-widget-banner">
                        This note is in Trash. Restore it to edit.
                      </div>
                    )}
                    <label htmlFor="note-title" className="sr-only">
                      Note title
                    </label>
                    <input
                      id="note-title"
                      ref={titleRef}
                      className="ntitle"
                      placeholder="Untitled"
                      value={titleDraft}
                      readOnly={Boolean(selected.trashedAt)}
                      onChange={(e) => {
                        if ([...e.target.value].length > 500) {
                          setError("Note title exceeds 500 characters");
                          return;
                        }
                        setTitleDraft(e.target.value);
                        change(selected.id, { title: e.target.value });
                      }}
                      onBlur={() => setTitleDraft(selected.title ?? "")}
                    />
                    <div className="note-tags">
                      {selected.tags.map((name) => (
                        <span className="tagc" key={name}>
                          #{name}
                          {!selected.trashedAt && (
                            <button
                              type="button"
                              aria-label={`Remove tag ${name}`}
                              onClick={() =>
                                change(selected.id, {
                                  tags: selected.tags.filter((t) => t !== name),
                                })
                              }
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      {!selected.trashedAt &&
                        (addingTag ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              applyTag();
                            }}
                          >
                            <label className="sr-only" htmlFor="note-tag">
                              New tag
                            </label>
                            <input
                              autoFocus
                              id="note-tag"
                              value={tag}
                              onChange={(e) => setTag(e.target.value)}
                              placeholder="Tag name"
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  e.stopPropagation();
                                  setAddingTag(false);
                                }
                              }}
                            />
                            <button type="submit" className="b b-quiet">
                              Add
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="b b-quiet"
                            onClick={() => setAddingTag(true)}
                          >
                            <Plus size={12} />
                            Tag
                          </button>
                        ))}
                    </div>
                    <div className="nmeta">
                      <span>
                        {status.storageError
                          ? "Couldn't save on this device"
                          : `Edited ${editedLabel(selected)}`}
                      </span>
                      <span>·</span>
                      <span>{noteWordCount(selected)} words</span>
                      <span>·</span>
                      <span>
                        Created{" "}
                        {new Date(selected.createdAt).toLocaleDateString(
                          undefined,
                          { day: "numeric", month: "short" },
                        )}
                      </span>
                    </div>
                    <NoteEditor
                      key={selected.id}
                      note={selected}
                      notes={notes}
                      readOnly={Boolean(selected.trashedAt)}
                      onBody={(body) => {
                        if (!change(selected.id, { body }))
                          throw new Error(
                            "Couldn't save this edit. Keep the note open and retry.",
                          );
                      }}
                      onPatch={(patch) => change(selected.id, patch)}
                      onOpen={openNote}
                      onLink={(editor) => {
                        linkEditor.current = editor;
                        setUrl(editor.getAttributes("link").href ?? "");
                        openOverlay("link");
                      }}
                    />
                    {!!backlinks.length && (
                      <section className="backl" aria-label="Backlinks">
                        <span className="sec">
                          LINKED FROM {backlinks.length}
                        </span>
                        {backlinks.map((note) => (
                          <button
                            type="button"
                            key={note.id}
                            onClick={() => openNote(note.id)}
                          >
                            <LinkIcon size={16} />
                            <span>{noteTitle(note)}</span>
                            <span className="mono">{editedLabel(note)}</span>
                          </button>
                        ))}
                      </section>
                    )}
                  </article>
                </div>
              </>
            ) : (
              <EmptyNotes
                empty={!notes.length}
                trash={filter === "trash"}
                onNew={() => create()}
                onClear={() => {
                  setQuery("");
                  setFilter("all");
                }}
              />
            )}
          </section>
        )}
      </div>
      {exportOpen && (
        <div
          className="note-export-menu"
          ref={exportRef}
          role="menu"
          aria-label="Export note"
          onKeyDown={(e) => {
            const items = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            ];
            const i = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              items[
                (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                  items.length
              ]?.focus();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setExportOpen(false);
              exportOpener.current?.focus();
            }
          }}
        >
          <span className="sec">EXPORT AS</span>
          <button
            type="button"
            role="menuitem"
            onClick={() => exportNotes("md")}
          >
            <b className="mono">.md</b>Markdown
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => exportNotes("txt")}
          >
            <b className="mono">.txt</b>Plain text
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="note-page-error">
          {error}
        </p>
      )}
      {!focus && (
        <footer className="foot">
          <span className="k">
            <span className="kbd">Ctrl N</span>new note
          </span>
          <span className="k">
            <span className="kbd">/</span>search
          </span>
          <span className="k">
            <span className="kbd">G</span>list or grid
          </span>
          <span className="k">
            <span className="kbd">Ctrl P</span>switch
          </span>
          <span className="note-spacer" />
          <button
            type="button"
            className="b b-quiet"
            onClick={() => openOverlay("cheat")}
          >
            <span className="kbd">?</span>all shortcuts
          </button>
        </footer>
      )}
      {undoId && notes.some((n) => n.id === undoId && n.trashedAt) && (
        <div className="note-undo" role="status">
          <span>
            Moved “{noteTitle(notes.find((n) => n.id === undoId)!)}” to Trash
          </span>
          <button type="button" onClick={undo}>
            <Undo2 size={14} />
            Undo <span className="kbd">Ctrl Z</span>
          </button>
        </div>
      )}
      {overlay === "capture" && (
        <NotesDialog title="Quick capture" onClose={closeOverlay}>
          <p className="note-dialog-help">
            In-app capture. First line becomes the title.
          </p>
          <label className="sr-only" htmlFor="capture-text">
            Capture text
          </label>
          <textarea
            id="capture-text"
            data-autofocus
            placeholder="What is on your mind?"
            value={capture}
            onChange={(e) => setCapture(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                if (capture.trim()) create(capture, captureColor, true);
              }
            }}
          />
          <div className="notes-dialog-foot">
            <ColourPicker
              value={captureColor}
              label="Capture colour"
              onChange={setCaptureColor}
            />
            <span className="tagc">#inbox</span>
            <span className="note-spacer" />
            <button type="button" className="ctl" onClick={closeOverlay}>
              Cancel <span className="kbd">Esc</span>
            </button>
            <button
              type="button"
              className="b b-commit b-primary"
              onClick={() => {
                if (capture.trim()) create(capture, captureColor, true);
                else setError("Write a thought before saving.");
              }}
            >
              <span className="lab">Save note</span>
              <span className="key">Ctrl Enter</span>
            </button>
          </div>
          {error && (
            <p role="alert" className="note-error">
              {error}
            </p>
          )}
        </NotesDialog>
      )}
      {overlay === "switcher" && (
        <NotesDialog title="Quick switcher" onClose={closeOverlay}>
          <label className="sr-only" htmlFor="note-switch-query">
            Jump to a note
          </label>
          <input
            id="note-switch-query"
            data-autofocus
            className="note-switch-query"
            value={switchQuery}
            onChange={(e) => {
              setSwitchQuery(e.target.value);
              setSwitchIndex(0);
            }}
            placeholder="Jump to a note or search text"
            role="combobox"
            aria-expanded="true"
            aria-controls="note-switch-results"
            aria-activedescendant={
              switchResults[switchIndex]
                ? `switch-${switchResults[switchIndex].id}`
                : undefined
            }
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSwitchIndex((i) =>
                  Math.max(
                    0,
                    Math.min(
                      switchResults.length - 1,
                      i + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if ((e.ctrlKey || e.metaKey) && switchQuery.trim())
                  create(switchQuery);
                else if (switchResults[switchIndex])
                  openNote(switchResults[switchIndex].id);
                else if (switchQuery.trim()) create(switchQuery);
              }
            }}
          />
          <div
            className="note-switch-results"
            id="note-switch-results"
            role="listbox"
            aria-label="Results"
          >
            {switchResults.map((note, i) => (
              <button
                type="button"
                id={`switch-${note.id}`}
                key={note.id}
                role="option"
                aria-selected={i === switchIndex}
                onClick={() => openNote(note.id)}
              >
                <span
                  className="evdot"
                  style={{ "--c": noteColor(note) } as CSSProperties}
                />
                <span>
                  <b>{noteTitle(note)}</b>
                  <small>{noteBodyText(note.body).slice(0, 120)}</small>
                </span>
              </button>
            ))}
            {switchQuery.trim() && (
              <button type="button" onClick={() => create(switchQuery)}>
                Create “{switchQuery}” <span className="kbd">Ctrl Enter</span>
              </button>
            )}
            {!switchResults.length && !switchQuery.trim() && (
              <p>No notes yet. Create your first note.</p>
            )}
          </div>
          <div className="foot">↑ ↓ move · Enter open · Esc close</div>
        </NotesDialog>
      )}
      {overlay === "cheat" && (
        <NotesDialog
          title="Notes shortcuts"
          className="note-cheat-dialog"
          onClose={closeOverlay}
        >
          <div className="note-cheat-groups">
            {SHORTCUTS.map(([name, rows]) => (
              <section key={name}>
                <span className="sec">{name}</span>
                {rows.map(([description, keys]) => (
                  <div key={description}>
                    <span>{description}</span>
                    <span className="kbd">{keys}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </NotesDialog>
      )}
      {overlay === "link" && (
        <NotesDialog title="Link" onClose={closeOverlay}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveLink();
            }}
          >
            <label htmlFor="note-link-url">Web address or email link</label>
            <input
              data-autofocus
              id="note-link-url"
              value={url}
              placeholder="https://example.com"
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="note-dialog-help">
              Clear the address to remove the link.
            </p>
            {error && (
              <p role="alert" className="note-error">
                {error}
              </p>
            )}
            <div className="notes-dialog-foot">
              <button
                type="button"
                className="ctl"
                onClick={() => {
                  void openExternalNoteLink(url).catch((e) =>
                    setError(e instanceof Error ? e.message : String(e)),
                  );
                }}
              >
                Open
              </button>
              <button type="submit" className="b b-commit b-primary">
                <span className="lab">Save link</span>
                <span className="key">Enter</span>
              </button>
            </div>
          </form>
        </NotesDialog>
      )}
      {overlay === "delete" && selected && (
        <NotesDialog title="Delete permanently?" onClose={closeOverlay}>
          <p className="note-dialog-help">
            “{noteTitle(selected)}” will be permanently deleted. This cannot be
            undone.
          </p>
          <div className="notes-dialog-foot">
            <button
              type="button"
              data-autofocus
              className="ctl"
              onClick={closeOverlay}
            >
              Keep in Trash
            </button>
            <button
              type="button"
              className="b b-del"
              onClick={() => {
                deleteNotePermanently(selected.id);
                setUndoId(null);
                closeOverlay();
              }}
            >
              Delete permanently
            </button>
          </div>
        </NotesDialog>
      )}
    </div>
  );
}

function EmptyNotes({
  empty,
  trash,
  onNew,
  onClear,
}: {
  empty: boolean;
  trash: boolean;
  onNew: () => void;
  onClear: () => void;
}) {
  return (
    <div className="note-empty">
      <Inbox size={32} />
      <h2>
        {trash
          ? "Trash is empty"
          : empty
            ? "Your first note starts here"
            : "No notes match"}
      </h2>
      <p>
        {trash
          ? "Notes you move to Trash stay here until you restore or permanently delete them."
          : empty
            ? "Write something small. A to-do, a line from a lecture, a gift idea. Everything stays on this device and syncs when you are online."
            : "Try a different word, or clear the search and filters."}
      </p>
      <button type="button" className="ctl" onClick={empty ? onNew : onClear}>
        {empty ? "New note" : "Show all notes"}
      </button>
    </div>
  );
}
