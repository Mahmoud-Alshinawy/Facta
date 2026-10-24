import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  StickyNote,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  List,
} from "lucide-react";
import {
  WIDGET_EDIT_CHARS,
  type JournalAction,
  type WidgetJournal,
  type WidgetNote,
  type WidgetNoteColor,
} from "@facta/calendar";
import "./journal-cards.css";
import {
  readStickyDraft,
  sameStickyFields,
  stickySaveAction,
  type StickySave,
} from "../lib/stickyDraft";

type Edit = Omit<
  Extract<JournalAction, { type: "edit_note" }>,
  "id" | "user_id"
>;
type Quick = Omit<
  Extract<JournalAction, { type: "quick_note" }>,
  "id" | "user_id"
>;
type Line = Omit<
  Extract<JournalAction, { type: "diary_line" }>,
  "id" | "user_id"
>;
export type JournalDraft = Edit | Quick | Line;
interface Common {
  theme: string;
  translucent: boolean;
  journal: WidgetJournal;
  onSend?: (action: JournalDraft, actionId?: string) => Promise<void>;
  onOpen?: (section: "notes" | "diary", id?: string) => void;
  status?: string;
  disabled?: boolean;
  draftScope?: string;
}
const COLORS = [
  ["a", "Yellow"],
  ["b", "Blue"],
  ["c", "Pink"],
  ["d", "Green"],
] as const;
const noteColor = (color: WidgetNoteColor | null) =>
  `var(--note-${color ?? "a"})`;
const dateLabel = (key: string) =>
  new Date(`${key}T12:00`)
    .toLocaleDateString(undefined, { day: "numeric", month: "short" })
    .toUpperCase();
function Plate({
  theme,
  translucent,
  children,
}: {
  theme: string;
  translucent: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`journal-widget${translucent ? " is-trans" : ""}`}
      data-theme={theme}
    >
      {children}
    </section>
  );
}
export function NotesCard(props: Common & { style?: "sticky" | "stack" }) {
  const { journal, style = "sticky", onOpen } = props;
  const pinned = journal.notes.filter((n) => n.pinned),
    [selected, setSelected] = useState<string | null>(null);
  const current = pinned.find((n) => n.id === selected) ?? pinned[0];
  useEffect(() => {
    if (current && selected !== current.id) setSelected(current.id);
  }, [current?.id, selected]);
  const beforeLeave = useRef<(() => Promise<boolean>) | null>(null);
  async function navigate(delta: number) {
    if (beforeLeave.current && !(await beforeLeave.current())) return;
    setSelected(pinned[(idx + delta + pinned.length) % pinned.length].id);
  }
  const idx = current ? pinned.indexOf(current) : 0;
  return (
    <Plate theme={props.theme} translucent={props.translucent}>
      <header className="jw-head">
        <span className="jw-drag" data-tauri-drag-region>
          {style === "sticky" ? <StickyNote size={14} /> : <List size={14} />}{" "}
          {style === "sticky" ? "PINNED" : "NOTES"}
        </span>
        {style === "sticky" ? (
          <>
            <button
              className="jw-nav"
              type="button"
              disabled={!pinned.length}
              aria-label="Previous note"
              onClick={() => void navigate(-1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span>{pinned.length ? `${idx + 1}/${pinned.length}` : "0/0"}</span>
            <button
              className="jw-nav"
              type="button"
              disabled={!pinned.length}
              aria-label="Next note"
              onClick={() => void navigate(1)}
            >
              <ChevronRight size={14} />
            </button>
          </>
        ) : (
          <span>{journal.noteCount}</span>
        )}
        <button
          type="button"
          className="jw-nav"
          aria-label="Open Notes in Facta"
          onClick={() => onOpen?.("notes", current?.id)}
        >
          <ExternalLink size={13} />
        </button>
      </header>
      {style === "sticky" ? (
        current ? (
          <StickyEditor
            key={current.id}
            {...props}
            note={current}
            beforeLeave={beforeLeave}
          />
        ) : (
          <p className="jw-empty">
            Pin a note to your desktop from Notes in Facta.
          </p>
        )
      ) : (
        <NoteStack {...props} />
      )}
      {journal.omittedPinned > 0 && style === "sticky" && (
        <p className="jw-status">More pinned notes are available in Facta.</p>
      )}
      {props.status && (
        <p className="jw-status" role="status">
          {props.status}
        </p>
      )}
    </Plate>
  );
}
function StickyEditor({
  note,
  onSend,
  disabled,
  beforeLeave,
  draftScope,
}: Common & {
  note: WidgetNote;
  beforeLeave: React.RefObject<(() => Promise<boolean>) | null>;
}) {
  const draftKey = draftScope
    ? `facta.widget-draft.${draftScope}.${note.id}`
    : null;
  const [initial] = useState(() => {
    try {
      return readStickyDraft(
        draftKey ? localStorage.getItem(draftKey) : null,
        note,
      );
    } catch {
      /* Recovery is best effort; queued actions remain in the native file. */
    }
    return readStickyDraft(null, note);
  });
  const id = useId(),
    [title, setTitle] = useState(initial.title),
    [preview, setPreview] = useState(initial.preview),
    [color, setColor] = useState(initial.color);
  const [base, setBase] = useState(initial.base),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const attempt = useRef<StickySave | null>(initial.attempt);
  const dirty =
    title !== base.title ||
    preview !== base.preview ||
    color !== base.color ||
    attempt.current !== null;
  const saving = useRef(false);
  const latest = useRef({ title, preview, color });
  latest.current = { title, preview, color };
  useEffect(() => {
    if (!dirty && !busy) {
      setTitle(note.title);
      setPreview(note.preview);
      setColor(note.color);
      setBase(note);
    }
  }, [note, dirty, busy]);
  useEffect(() => {
    if (!draftKey) return;
    try {
      if (dirty)
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            title,
            preview,
            color,
            base,
            attempt: attempt.current,
          }),
        );
      else localStorage.removeItem(draftKey);
    } catch {
      setMessage(
        "Could not keep a recovery draft. Keep this widget open until Saved.",
      );
    }
  }, [draftKey, title, preview, color, base, dirty]);
  async function save() {
    if (!dirty) return true;
    if (!onSend || disabled || saving.current) return false;
    saving.current = true;
    setBusy(true);
    setMessage("Queued · open Facta to finish saving.");
    const captured = attempt.current ?? {
      id: crypto.randomUUID(),
      base: { title: base.title, preview: base.preview, color: base.color },
      values: { title, preview, color },
    };
    attempt.current = captured;
    try {
      // Persist the identity before native delivery. A recovered draft must
      // replay the same receipt even if Facta applied it while we were closed.
      if (draftKey)
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            title,
            preview,
            color,
            base,
            attempt: captured,
          }),
        );
      await onSend(stickySaveAction(note.id, captured), captured.id);
      // Keep the exact acknowledged prefix while further typing is in flight.
      // Once idle, the effect above adopts the freshly exported bounded preview.
      setBase({ ...base, ...captured.values });
      attempt.current = null;
      setFailed(false);
      setMessage("Saved");
      // Typing while the acknowledgement was pending must not rotate away
      // from a newer draft. Its own autosave will run next.
      return sameStickyFields(latest.current, captured.values);
    } catch (error) {
      setFailed(true);
      setMessage(String(error instanceof Error ? error.message : error));
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!dirty || busy || failed || disabled || !onSend) return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [title, preview, color, base, busy, failed, disabled, onSend]);
  beforeLeave.current = save;
  return (
    <div
      className="jw-sticky-editor"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div
        className="jw-paper"
        style={{ "--note-color": noteColor(color) } as CSSProperties}
      >
        <span className="jw-fold" aria-hidden="true" />
        <label className="jw-sr" htmlFor={`${id}-title`}>
          Note title
        </label>
        <input
          id={`${id}-title`}
          className="jw-field jw-title"
          value={title}
          maxLength={500}
          placeholder="Untitled"
          disabled={disabled}
          onChange={(e) => {
            if (failed) {
              attempt.current = null;
              setMessage("");
            }
            setTitle(e.target.value);
            setFailed(false);
          }}
        />
        <label className="jw-sr" htmlFor={`${id}-body`}>
          Note preview
        </label>
        <textarea
          id={`${id}-body`}
          className="jw-field jw-body"
          rows={6}
          value={preview}
          maxLength={WIDGET_EDIT_CHARS}
          placeholder="Write anything…"
          disabled={disabled}
          onChange={(e) => {
            if (failed) {
              attempt.current = null;
              setMessage("");
            }
            setPreview(e.target.value);
            setFailed(false);
          }}
        />
        {note.truncated && (
          <span className="jw-status">
            Preview · remaining text stays in Facta
          </span>
        )}
      </div>
      <div className="jw-footer">
        <div role="group" aria-label="Note colour" className="jw-colors">
          {COLORS.map(([key, name]) => (
            <button
              key={key}
              type="button"
              aria-label={`${name} note`}
              aria-pressed={color === key}
              className="jw-dot"
              style={{ background: noteColor(key) }}
              disabled={disabled}
              onClick={() => {
                if (failed) {
                  attempt.current = null;
                  setMessage("");
                }
                setColor(key);
                setFailed(false);
              }}
            />
          ))}
        </div>
        <span className="jw-count">
          {note.words} {note.words === 1 ? "word" : "words"}
        </span>
        <button
          type="button"
          className="jw-save"
          disabled={!dirty || disabled || busy}
          onClick={() => void save()}
          title="Save (Ctrl Enter)"
        >
          <span>{busy ? "Queued" : "Save"}</span>
        </button>
      </div>
      {message && (
        <p className="jw-status" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
function NoteStack({ journal, onSend, onOpen, disabled }: Common) {
  const id = useId(),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const sending = useRef(false);
  const CaptureForm = onSend ? "form" : "div";
  return (
    <>
      <CaptureForm
        className="jw-quick-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || !onSend || sending.current) return;
          sending.current = true;
          setBusy(true);
          setMessage("Queued · open Facta to finish saving.");
          try {
            await onSend({ type: "quick_note", text: text.trim() });
            setText("");
            setMessage("Note saved");
          } catch (error) {
            setMessage(String(error instanceof Error ? error.message : error));
          } finally {
            sending.current = false;
            setBusy(false);
          }
        }}
      >
        <label className="jw-sr" htmlFor={id}>
          Quick note
        </label>
        <input
          id={id}
          className="jw-quick"
          autoComplete="off"
          maxLength={500}
          value={text}
          disabled={disabled || busy}
          placeholder="Jot something…"
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="jw-enter"
          disabled={disabled || busy || !text.trim()}
          aria-label="Save quick note"
        >
          Enter
        </button>
      </CaptureForm>
      <ul className="jw-stack">
        {journal.recentIds
          .map((noteId) => journal.notes.find((n) => n.id === noteId))
          .filter((n): n is WidgetNote => !!n)
          .map((n) => (
            <li key={n.id}>
              <button
                className="jw-note-row"
                type="button"
                onClick={() => onOpen?.("notes", n.id)}
              >
                <span
                  className="jw-note-stripe"
                  style={{ background: noteColor(n.color) }}
                />
                <span className="jw-note-copy">
                  <strong>{n.title || "Untitled"}</strong>
                  <span>{n.preview.split("\n")[0] || "Empty note"}</span>
                </span>
                <time className="jw-when" dateTime={n.updatedAt}>
                  {new Date(n.updatedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </time>
              </button>
            </li>
          ))}
      </ul>
      {!journal.recentIds.length && (
        <p className="jw-empty">A thought worth keeping? Jot it here.</p>
      )}
      {message && (
        <p className="jw-status" role="status">
          {message}
        </p>
      )}
    </>
  );
}
export function DiaryCard({
  journal,
  theme,
  translucent,
  onSend,
  onOpen,
  disabled,
  status,
}: Common) {
  const id = useId(),
    [line, setLine] = useState(journal.diary.today?.oneLine ?? ""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [base, setBase] = useState(journal.diary.today?.oneLine ?? null),
    previousDate = useRef(journal.diary.date),
    sending = useRef(false);
  const saved = journal.diary.today;
  const LineForm = onSend ? "form" : "div";
  useEffect(() => {
    if (previousDate.current !== journal.diary.date) {
      previousDate.current = journal.diary.date;
      setLine(saved?.oneLine ?? "");
      setBase(saved?.oneLine ?? null);
      setEditing(false);
      setMessage("");
    } else if (!editing && !busy) {
      setLine(saved?.oneLine ?? "");
      setBase(saved?.oneLine ?? null);
    }
  }, [journal.diary.date, saved, editing, busy]);
  return (
    <Plate theme={theme} translucent={translucent}>
      <header className="jw-head">
        <span className="jw-drag" data-tauri-drag-region>
          <BookOpen size={14} /> ONE LINE A DAY
        </span>
        <time dateTime={journal.diary.date}>
          {dateLabel(journal.diary.date)}
        </time>
        <button
          type="button"
          className="jw-nav"
          aria-label="Open Diary in Facta"
          onClick={() => onOpen?.("diary")}
        >
          <ExternalLink size={13} />
        </button>
      </header>
      {(!saved || editing) && (
        <LineForm
          className="jw-line-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!line.trim() || !onSend || sending.current) return;
            sending.current = true;
            setBusy(true);
            setMessage("Queued · open Facta to finish saving.");
            try {
              await onSend({
                type: "diary_line",
                date: journal.diary.date,
                line: line.trim(),
                baseLine: base,
              });
              setEditing(false);
              setMessage("Saved");
            } catch (error) {
              setMessage(
                String(error instanceof Error ? error.message : error),
              );
            } finally {
              sending.current = false;
              setBusy(false);
            }
          }}
        >
          <label className="jw-sr" htmlFor={id}>
            Today in one line
          </label>
          <input
            id={id}
            className="jw-oneline"
            autoComplete="off"
            value={line}
            disabled={disabled || busy}
            placeholder="Today in one line…"
            onChange={(e) => {
              setLine([...e.target.value].slice(0, 120).join(""));
              setEditing(true);
            }}
          />
          <div className="jw-line-footer">
            <span>{[...line].length}/120</span>
            <button type="submit" disabled={!line.trim() || disabled || busy}>
              Enter
            </button>
          </div>
        </LineForm>
      )}
      <span className="jw-section">ON THIS DAY</span>
      <ul className="jw-past">
        {saved && (
          <li className="is-today">
            <span>TODAY</span>
            <button
              type="button"
              aria-label="Edit today's diary line"
              disabled={busy || disabled}
              onClick={() => {
                setLine(saved.oneLine);
                setBase(saved.oneLine);
                setEditing(true);
                requestAnimationFrame(() =>
                  document.getElementById(id)?.focus(),
                );
              }}
            >
              {saved.oneLine}
            </button>
          </li>
        )}
        {journal.diary.past.map((p) => (
          <li key={p.date}>
            <time dateTime={p.date} title={p.date}>
              {dateLabel(p.date)}
            </time>
            <span>{p.oneLine}</span>
          </li>
        ))}
      </ul>
      {!journal.diary.past.length && (
        <p className="jw-empty">
          Your past lines will find their way back here.
        </p>
      )}
      {(message || status) && (
        <p className="jw-status" role="status">
          {message || status}
        </p>
      )}
    </Plate>
  );
}
