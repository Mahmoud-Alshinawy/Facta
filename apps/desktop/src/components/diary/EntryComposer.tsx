import { useEffect, useId, useRef, useState } from "react";
import type { DiaryEntry } from "@/types/planner";
import { DIARY_PROMPTS, lineLength, MOODS } from "@/lib/diary";

export type DiaryDraft = Pick<
  DiaryEntry,
  "date" | "oneLine" | "mood" | "body" | "tags"
>;
export default function EntryComposer({
  date,
  entry,
  tags,
  onSave,
  focusRequest = 0,
  historical = false,
  onDone,
  initialDraft,
  onDraft,
  keyboardBlocked = false,
}: {
  date: string;
  entry?: DiaryEntry;
  tags: string[];
  onSave: (draft: DiaryDraft) => DiaryEntry | null;
  focusRequest?: number;
  historical?: boolean;
  onDone?: () => void;
  initialDraft?: DiaryDraft;
  onDraft?: (draft: DiaryDraft, dirty: boolean) => void;
  keyboardBlocked?: boolean;
}) {
  const [line, setLine] = useState(
    initialDraft?.oneLine ?? entry?.oneLine ?? "",
  );
  const [mood, setMood] = useState<DiaryEntry["mood"]>(
    initialDraft?.mood ?? entry?.mood ?? 3,
  );
  const [body, setBody] = useState(initialDraft?.body ?? entry?.body ?? "");
  const [selectedTags, setTags] = useState(
    initialDraft?.tags ?? entry?.tags ?? [],
  );
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState(
    !entry ||
      historical ||
      (!!initialDraft && initialDraft.oneLine !== entry.oneLine),
  );
  const [more, setMore] = useState(!!(initialDraft?.body ?? entry?.body));
  const [prompt, setPrompt] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const dirty =
    line !== (entry?.oneLine ?? "") ||
    mood !== (entry?.mood ?? 3) ||
    body !== (entry?.body ?? "") ||
    selectedTags.join("\0") !== (entry?.tags ?? []).join("\0");
  const baseline = useRef(entry);
  const localDirty =
    line !== (baseline.current?.oneLine ?? "") ||
    mood !== (baseline.current?.mood ?? 3) ||
    body !== (baseline.current?.body ?? "") ||
    selectedTags.join("\0") !== (baseline.current?.tags ?? []).join("\0");
  useEffect(() => {
    onDraft?.(
      { date, oneLine: line, mood, body: body || null, tags: selectedTags },
      dirty,
    );
  }, [date, line, mood, body, selectedTags, onDraft, dirty]);
  // Fresh remote data updates an idle composer without overwriting a local draft.
  useEffect(() => {
    const wasDirty = localDirty;
    baseline.current = entry;
    if (wasDirty || !entry) return;
    setLine(entry.oneLine);
    setMood(entry.mood);
    setBody(entry.body ?? "");
    setTags(entry.tags);
  }, [entry]);
  useEffect(() => {
    if (!focusRequest) return;
    setEditing(true);
    const timer = window.setTimeout(() => ref.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [focusRequest]);
  const save = () => {
    if (!line.trim() || lineLength(line.trim()) > 120) {
      setError("Write a line of 1 to 120 characters.");
      ref.current?.focus();
      return;
    }
    try {
      const saved = onSave({
        date,
        oneLine: line.trim(),
        mood,
        body: body.trim() ? body : null,
        tags: selectedTags,
      });
      if (!saved) throw new Error("Diary is still opening. Try saving again.");
      setLine(saved.oneLine);
      setBody(saved.body ?? "");
      setEditing(false);
      setError("");
      setStatus("Saved");
      onDone?.();
      if (!onDone) requestAnimationFrame(() => editRef.current?.focus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this entry.");
    }
  };
  // A saved day's details can change without committing an unfinished line.
  const saveDetails = (
    patch: Partial<Pick<DiaryDraft, "mood" | "tags" | "body">>,
  ) => {
    if (!entry) return;
    try {
      if (!onSave({ ...entry, ...patch }))
        throw new Error("Diary is still opening. Try again.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this entry.");
    }
  };
  const chooseMood = (next: DiaryEntry["mood"]) => {
    setMood(next);
    setStatus("");
    saveDetails({ mood: next });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (keyboardBlocked) return;
      const root = formRef.current;
      if (
        !root ||
        !target ||
        (!root.contains(target) && target.closest('[role="dialog"]'))
      )
        return;
      if (target.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if (/^[1-5]$/.test(e.key)) {
        e.preventDefault();
        chooseMood(Number(e.key) as DiaryEntry["mood"]);
      }
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPrompt((p) => (p + 1) % DIARY_PROMPTS.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardBlocked, entry, onSave]);
  const toggleTag = (value: string) => {
    const next = selectedTags.includes(value)
      ? selectedTags.filter((t) => t !== value)
      : [...selectedTags, value];
    setTags(next);
    setStatus("");
    saveDetails({ tags: next });
  };
  return (
    <form
      ref={formRef}
      className="diary-composer diary-col"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section className="diary-card" aria-label="One line a day">
        <div className="diary-row">
          <span className="sec">ONE LINE A DAY</span>
          <span className="diary-saved" role="status">
            {dirty ? "Unsaved changes" : entry ? "✓ Saved" : status}
          </span>
        </div>
        {editing ? (
          <>
            <div className="diary-line-wrap">
              <label htmlFor={id} className="sr-only">
                {historical ? "Entry line" : "Today's line"}
              </label>
              <input
                ref={ref}
                id={id}
                data-autofocus
                className="diary-line"
                autoComplete="off"
                placeholder="Try: Made time for a quiet walk."
                value={line}
                onChange={(e) => {
                  setLine(Array.from(e.target.value).slice(0, 120).join(""));
                  setStatus("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    formRef.current
                      ?.querySelector<HTMLButtonElement>(
                        'button[type="submit"]',
                      )
                      ?.focus();
                  }
                }}
              />
              <span className="mono diary-count">{lineLength(line)}/120</span>
            </div>
            <div className="diary-row diary-prompt">
              <span>{DIARY_PROMPTS[prompt]}</span>
              <button
                type="button"
                className="b b-quiet"
                onClick={() => setPrompt((p) => (p + 1) % DIARY_PROMPTS.length)}
              >
                Another prompt
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="diary-big">{line}</h3>
            <button
              ref={editRef}
              type="button"
              className="ctl diary-start"
              onClick={() => {
                setEditing(true);
                setTimeout(() => ref.current?.focus(), 0);
              }}
            >
              Edit line
            </button>
          </>
        )}
        {(editing || dirty) && (
          <div className="diary-row">
            <span className="diary-muted">
              Enter saves your line and details.
            </span>
            <button type="submit" className="b b-commit b-primary">
              <span className="lab">Save line</span>
              <span className="key">Enter</span>
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="diary-error">
            {error}
          </p>
        )}
      </section>
      <section className="diary-card" aria-label="Mood">
        <span className="sec">
          {historical ? "HOW WAS THAT DAY" : "HOW WAS TODAY"}
        </span>
        <div className="diary-moods" role="radiogroup" aria-label="Mood">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              className="opt"
              role="radio"
              aria-checked={mood === m.value}
              tabIndex={mood === m.value ? 0 : -1}
              onKeyDown={(e) => {
                if (
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                )
                  return;
                e.preventDefault();
                const next = (((m.value -
                  1 +
                  (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : 4)) %
                  5) +
                  1) as DiaryEntry["mood"];
                chooseMood(next);
                e.currentTarget.parentElement
                  ?.querySelector<HTMLButtonElement>(
                    `[title="${MOODS[next - 1].label} (${next})"]`,
                  )
                  ?.focus();
              }}
              title={`${m.label} (${m.value})`}
              onClick={() => {
                chooseMood(m.value);
              }}
            >
              <span>
                <i className={`diary-dot diary-m${m.value}`} />
                {m.label}
                <span className="mono">{m.value}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="diary-card" aria-label="Entry tags">
        <span className="sec">TAGS</span>
        <div className="diary-tags" role="group" aria-label="Entry tags">
          {[...new Set([...tags, ...selectedTags])].map((t) => (
            <button
              key={t}
              type="button"
              className="diary-chip"
              aria-pressed={selectedTags.includes(t)}
              disabled={selectedTags.length >= 20 && !selectedTags.includes(t)}
              onClick={() => toggleTag(t)}
            >
              # {t}
            </button>
          ))}
          <label className="sr-only" htmlFor={`${id}-tag`}>
            Add diary tag
          </label>
          <input
            id={`${id}-tag`}
            className="diary-tag-input"
            placeholder="Add tag"
            value={tag}
            maxLength={50}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (
                  tag.trim() &&
                  !selectedTags.includes(tag.trim()) &&
                  selectedTags.length < 20
                )
                  toggleTag(tag.trim());
                setTag("");
              }
            }}
          />
          <button
            type="button"
            className="ctl"
            disabled={!tag.trim() || selectedTags.length >= 20}
            onClick={() => {
              if (!selectedTags.includes(tag.trim())) toggleTag(tag.trim());
              setTag("");
            }}
          >
            Add
          </button>
        </div>
      </section>
      <section className="diary-card" aria-label="Longer entry">
        <div className="diary-row">
          <span className="sec">MORE, IF YOU WANT</span>
          <button
            type="button"
            className="ctl"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            {more ? "Collapse" : "+ Add more"}
          </button>
        </div>
        {more && (
          <>
            <label className="sr-only" htmlFor={`${id}-body`}>
              Longer entry
            </label>
            <textarea
              id={`${id}-body`}
              className="diary-text"
              placeholder="Anything else from that day?"
              value={body}
              onBlur={() => {
                if (body !== (entry?.body ?? "")) {
                  saveDetails({ body: body.trim() ? body : null });
                  if (!body.trim()) setBody("");
                }
              }}
              onChange={(e) => {
                setBody(e.target.value);
                setStatus("");
              }}
            />
          </>
        )}
      </section>
      {dirty && (
        <button type="submit" className="ctl diary-start">
          Save changes
        </button>
      )}
    </form>
  );
}
