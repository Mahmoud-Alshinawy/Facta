import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarMonths,
  format,
  startOfMonth,
} from "date-fns";
import { Flame, Pencil, Search } from "lucide-react";
import { formatClock, parseClock } from "@facta/calendar";
import { useDiary } from "@/hooks/useDiary";
import { useNow } from "@/hooks/useNow";
import { usePrefs } from "@/hooks/usePrefs";
import { useGoals } from "@/hooks/useGoals";
import { useEvents } from "@/hooks/useEvents";
import { goalsOn, keyOf, noonOf } from "@/lib/calendarData";
import {
  diaryDays,
  diaryOnThisDay,
  diaryStreak,
  diaryTimeline,
  MOODS,
  searchDiary,
} from "@/lib/diary";
import type { DiaryEntry } from "@/types/planner";
import DiaryCalendar, { MonthNavigation } from "./DiaryCalendar";
import EntryComposer, { type DiaryDraft } from "./EntryComposer";
import DiaryDialog from "./DiaryDialog";
import "./diary.css";

type View = "today" | "timeline" | "calendar" | "search";
const VIEWS = [
  { id: "today", label: "Today", key: "T" },
  { id: "timeline", label: "Timeline", key: "L" },
  { id: "calendar", label: "Calendar", key: "C" },
  { id: "search", label: "Search", key: "/" },
] as const;
const CHEAT = [
  {
    title: "ANYWHERE",
    rows: [
      ["W", "Write today's line"],
      ["T", "Today"],
      ["L", "Timeline"],
      ["C", "Calendar"],
      ["/", "Search"],
      ["?", "This sheet"],
    ],
  },
  {
    title: "WRITING",
    rows: [
      ["Enter", "Save the line"],
      ["1 to 5", "Mood 1 to 5"],
      ["Esc", "Leave the field"],
      ["Tab", "Next control"],
      ["P", "Another prompt"],
    ],
  },
  {
    title: "TIMELINE AND CALENDAR",
    rows: [
      ["[", "Previous month"],
      ["]", "Next month"],
      ["Esc", "Close or exit"],
    ],
  },
];
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const index = q
    ? text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase())
    : -1;
  return index < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}
function EntryRow({
  entry,
  query,
  onEdit,
}: {
  entry: DiaryEntry;
  query: string;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article
      className="diary-entry"
      id={`diary-${entry.date}`}
      tabIndex={-1}
      aria-label={`Entry for ${format(noonOf(entry.date), "d MMMM yyyy")}`}
    >
      <div className="diary-date">
        <span className="mono">
          {format(noonOf(entry.date), "EEEE").toUpperCase()}
        </span>
        <strong>{format(noonOf(entry.date), "d MMM")}</strong>
        <span>
          <i className={`diary-dot diary-m${entry.mood}`} />
          {MOODS[entry.mood - 1].label}
        </span>
      </div>
      <div className="diary-col">
        <h3>
          <Highlight text={entry.oneLine} query={query} />
        </h3>
        {entry.body && (
          <div>
            <p className={`diary-entry-body ${expanded ? "" : "clamped"}`}>
              <Highlight text={entry.body} query={query} />
            </p>
            <button
              type="button"
              className="b b-quiet"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          </div>
        )}
        <div className="diary-tags">
          {entry.tags.map((t) => (
            <span key={t} className="diary-tag">
              # {t}
            </span>
          ))}
          <button
            type="button"
            className="b b-quiet"
            onClick={onEdit}
            aria-label={`Edit entry for ${format(noonOf(entry.date), "d MMMM")}`}
          >
            Edit
          </button>
        </div>
      </div>
    </article>
  );
}

export default function DiaryPage({
  keyboardBlocked = false,
  onOpenToday,
}: {
  keyboardBlocked?: boolean;
  onOpenToday: () => void;
}) {
  const { entries: raw, saveEntry } = useDiary();
  const now = useNow();
  const today = keyOf(now);
  const yesterday = keyOf(addDays(noonOf(today), -1));
  const entries = useMemo(() => diaryDays(raw), [raw]);
  const [drafts, setDrafts] = useState<Record<string, DiaryDraft>>({});
  const rememberDraft = useCallback(
    (draft: DiaryDraft, dirty: boolean) =>
      setDrafts((all) => {
        if (dirty) return { ...all, [draft.date]: draft };
        if (!(draft.date in all)) return all;
        const next = { ...all };
        delete next[draft.date];
        return next;
      }),
    [],
  );
  const [view, setView] = useState<View>("today");
  const [month, setMonth] = useState(() => startOfMonth(now));
  const [selected, setSelected] = useState(today);
  const [focusRequest, setFocusRequest] = useState(0);
  const [cheat, setCheat] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [moods, setMoods] = useState<number[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [timelineError, setTimelineError] = useState("");
  const [skipYesterday, setSkipYesterday] = useState<string | null>(null);
  const [yLine, setYLine] = useState("");
  const [yError, setYError] = useState("");
  useEffect(() => {
    setYLine("");
    setYError("");
  }, [yesterday]);
  const searchRef = useRef<HTMLInputElement>(null);
  const prefs = usePrefs();
  const { goals } = useGoals();
  const { getEventsForDate } = useEvents();
  const byDate = useMemo(
    () => new Map(entries.map((e) => [e.date, e])),
    [entries],
  );
  const entry = byDate.get(today);
  const allTags = useMemo(
    () =>
      [...new Set(entries.flatMap((e) => e.tags))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [entries],
  );
  const streak = diaryStreak(entries, today);
  const onThisDay = diaryOnThisDay(entries, today);
  const results = searchDiary(entries, query, moods, tags);
  const rows = diaryTimeline(entries, month, today);
  const writeToday = useCallback(() => {
    setView("today");
    setFocusRequest((n) => n + 1);
  }, []);
  const changeMonth = (date: Date) => {
    setMonth(startOfMonth(date));
    setSelected(keyOf(date));
  };
  const showTimeline = (date: string) => {
    setMonth(startOfMonth(noonOf(date)));
    setView("timeline");
    requestAnimationFrame(() =>
      document.getElementById(`diary-${date}`)?.focus(),
    );
  };
  useEffect(() => {
    if (view === "search") searchRef.current?.focus();
  }, [view]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        keyboardBlocked ||
        cheat ||
        editingDate ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        target?.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      const k = e.key.toLowerCase();
      if (k === "w") {
        e.preventDefault();
        writeToday();
      } else if (k === "t" || k === "l" || k === "c" || k === "/") {
        e.preventDefault();
        setView(
          k === "t"
            ? "today"
            : k === "l"
              ? "timeline"
              : k === "c"
                ? "calendar"
                : "search",
        );
        if (k === "/") requestAnimationFrame(() => searchRef.current?.focus());
      } else if (k === "?") {
        e.preventDefault();
        setCheat(true);
      } else if (
        (k === "[" || k === "]") &&
        (view === "calendar" || view === "timeline")
      ) {
        e.preventDefault();
        setMonth((m) => {
          const next = addMonths(m, k === "[" ? -1 : 1);
          setSelected(keyOf(next));
          return next;
        });
      } else if (k === "Escape" && view !== "today") {
        e.preventDefault();
        setView("today");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [keyboardBlocked, cheat, editingDate, view, writeToday]);
  const writeDate = (date: string) => {
    if (date > today) return;
    if (date === today) writeToday();
    else setEditingDate(date);
  };
  const saveYesterday = () => {
    try {
      if (!yLine.trim()) throw new Error("Write a few words for yesterday.");
      const saved = saveEntry({ date: yesterday, oneLine: yLine.trim() });
      if (!saved) throw new Error("Diary is still opening. Try again.");
      setYLine("");
      setYError("");
    } catch (e) {
      setYError(e instanceof Error ? e.message : "Could not save yesterday.");
    }
  };
  const recallLabel = (date: string) => {
    const n = differenceInCalendarMonths(noonOf(today), noonOf(date));
    return `${n} MONTH${n === 1 ? "" : "S"} AGO · ${format(noonOf(date), "d MMM yyyy")}`;
  };
  const context = [
    ...goalsOn(goals, today).map(({ goal, done, at }) => ({
      id: goal.id,
      title: goal.title,
      mark: done ? "✓" : "○",
      time: at === null ? "" : formatClock(at, prefs.timeFormat),
    })),
    ...getEventsForDate(today).map((e) => ({
      id: e.id,
      title: e.title,
      mark: "◇",
      time: e.allDay
        ? "All day"
        : formatClock(parseClock(e.startTime) ?? 0, prefs.timeFormat),
    })),
  ];
  const toggleMood = (n: number) =>
    setMoods((v) => (v.includes(n) ? v.filter((m) => m !== n) : [...v, n]));
  const toggleTag = (t: string) =>
    setTags((v) => (v.includes(t) ? v.filter((m) => m !== t) : [...v, t]));
  return (
    <div className="diary-page">
      <header className="hd diary-header">
        <div>
          <span className="mono diary-subtitle">
            {entries.length} {entries.length === 1 ? "ENTRY" : "ENTRIES"} ·{" "}
            {format(
              view === "calendar" || view === "timeline" ? month : now,
              "MMMM yyyy",
            ).toUpperCase()}
          </span>
          <h1>Diary</h1>
        </div>
        <div className="seg" role="radiogroup" aria-label="Diary view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-label={v.label}
              aria-checked={view === v.id}
              tabIndex={view === v.id ? 0 : -1}
              onKeyDown={(e) => {
                if (
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                )
                  return;
                e.preventDefault();
                const i = VIEWS.findIndex((item) => item.id === v.id);
                const next =
                  VIEWS[
                    (i +
                      (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : 3)) %
                      4
                  ];
                setView(next.id);
                e.currentTarget.parentElement
                  ?.querySelector<HTMLButtonElement>(
                    `[aria-label="${next.label}"]`,
                  )
                  ?.focus();
              }}
              title={`${v.label} (${v.key})`}
              onClick={() => setView(v.id)}
            >
              <span>{v.label}</span>
              <span className="mono diary-view-key">{v.key}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="b b-commit b-primary diary-write"
          aria-label={entry ? "Edit today's line" : "Write today's line"}
          onClick={writeToday}
        >
          <span className="lab">
            <Pencil size={15} />
            <span>{entry ? "Edit today's line" : "Write today's line"}</span>
          </span>
          <span className="key">W</span>
        </button>
      </header>
      <div className="diary-scroll">
        {view === "today" && (
          <div className="diary-today">
            <div className="diary-col">
              <div className="diary-day-head">
                <h2>{format(now, "EEEE d MMM")}</h2>
                <span>
                  {entry
                    ? "A little piece of today, kept."
                    : "One line is plenty."}
                </span>
              </div>
              {entries.some((e) => e.date < yesterday) &&
                !byDate.has(yesterday) &&
                skipYesterday !== yesterday && (
                  <div
                    className="diary-banner"
                    role="group"
                    aria-label="Yesterday"
                  >
                    <p>
                      <b>Write yesterday's line?</b>{" "}
                      {format(noonOf(yesterday), "EEE d MMM")} is empty. A few
                      words is enough, and your run is only paused.
                    </p>
                    <label className="sr-only" htmlFor="diary-yesterday">
                      Yesterday's line
                    </label>
                    <input
                      id="diary-yesterday"
                      className="diary-line"
                      value={yLine}
                      onChange={(e) =>
                        setYLine(
                          Array.from(e.target.value).slice(0, 120).join(""),
                        )
                      }
                      placeholder="What stood out yesterday?"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveYesterday();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ctl"
                      onClick={saveYesterday}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="b b-quiet"
                      onClick={() => setSkipYesterday(yesterday)}
                    >
                      Not now
                    </button>
                    {yError && (
                      <p role="alert" className="diary-error">
                        {yError}
                      </p>
                    )}
                  </div>
                )}
              {!entries.length && (
                <section className="diary-card diary-empty">
                  <h3>Welcome to your diary</h3>
                  <p>
                    One line a day is the whole idea. Write it, pick a mood,
                    done. Add more only when you feel like it.
                  </p>
                </section>
              )}
              <EntryComposer
                key={today}
                date={today}
                entry={entry}
                tags={allTags}
                onSave={saveEntry}
                initialDraft={drafts[today]}
                onDraft={rememberDraft}
                keyboardBlocked={keyboardBlocked || cheat}
                focusRequest={focusRequest}
              />
            </div>
            <aside className="diary-col" aria-label="Today for context">
              <section className="diary-card">
                <span className="sec">
                  {streak.paused ? "LAST RUN" : "STREAK"}
                </span>
                <div className="diary-streak">
                  <Flame size={30} />
                  {streak.paused ? streak.lastRun : streak.current}
                  <small>days</small>
                </div>
                <p>
                  {streak.paused
                    ? `Paused, not lost. Write today to begin again. Best: ${streak.best} days.`
                    : streak.current
                      ? `One line at a time. Your best is ${streak.best} days.`
                      : "Start with today. One line is enough."}
                </p>
                <div className="diary-week-strip" aria-label="Last 7 days">
                  {Array.from({ length: 7 }, (_, i) =>
                    keyOf(addDays(now, i - 6)),
                  ).map((d) => {
                    const e = byDate.get(d);
                    return (
                      <span
                        key={d}
                        title={`${d}: ${e ? MOODS[e.mood - 1].label : "not written"}`}
                      >
                        <i
                          className={`diary-week-tile diary-m${e?.mood ?? 0} ${d === today ? "today" : ""}`}
                        />
                        <span className="mono">
                          {format(noonOf(d), "EEEEE")}
                        </span>
                        <span className="sr-only">
                          {d}: {e ? MOODS[e.mood - 1].label : "not written"}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </section>
              <section className="diary-card" aria-label="Today at a glance">
                <div className="diary-row">
                  <span className="sec">TODAY, FOR CONTEXT</span>
                  <button
                    type="button"
                    className="b b-quiet"
                    onClick={onOpenToday}
                  >
                    Open Today ›
                  </button>
                </div>
                <div>
                  {context.length ? (
                    context.map((c) => (
                      <div key={c.id} className="diary-context">
                        <span>{c.mark}</span>
                        <span>{c.title}</span>
                        <span className="mono">{c.time}</span>
                      </div>
                    ))
                  ) : (
                    <p>No goals or events scheduled today.</p>
                  )}
                </div>
                <small>Read only. Edit goals and events in Today.</small>
              </section>
              <section className="diary-card" aria-label="On this day">
                <span className="sec">ON THIS DAY</span>
                {onThisDay.length ? (
                  onThisDay.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="diary-recall"
                      onClick={() => showTimeline(e.date)}
                    >
                      <span className="mono">{recallLabel(e.date)}</span>
                      <span>{e.oneLine}</span>
                    </button>
                  ))
                ) : (
                  <p>
                    As your diary grows, earlier months' lines will appear here.
                  </p>
                )}
              </section>
            </aside>
          </div>
        )}
        {(view === "timeline" || view === "search") && (
          <div className="diary-timeline">
            {view === "search" ? (
              <div className="diary-search">
                <label className="sr-only" htmlFor="diary-search">
                  Search the diary
                </label>
                <div className="diary-search-field">
                  <Search size={15} />
                  <input
                    id="diary-search"
                    ref={searchRef}
                    type="search"
                    placeholder="Search lines and entries"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <span className="kbd">/</span>
                </div>
                <div
                  className="diary-tags"
                  role="group"
                  aria-label="Filter by mood"
                >
                  <span className="sec">MOOD</span>
                  {MOODS.map((m) => (
                    <button
                      key={m.value}
                      className="diary-chip"
                      type="button"
                      aria-pressed={moods.includes(m.value)}
                      onClick={() => toggleMood(m.value)}
                    >
                      <i className={`diary-dot diary-m${m.value}`} />
                      {m.label}
                    </button>
                  ))}
                </div>
                <div
                  className="diary-tags"
                  role="group"
                  aria-label="Filter by tag"
                >
                  <span className="sec">TAG</span>
                  {allTags.map((t) => (
                    <button
                      type="button"
                      className="diary-chip"
                      aria-pressed={tags.includes(t)}
                      key={t}
                      onClick={() => toggleTag(t)}
                    >
                      # {t}
                    </button>
                  ))}
                  {(query || moods.length > 0 || tags.length > 0) && (
                    <button
                      type="button"
                      className="b b-quiet"
                      onClick={() => {
                        setQuery("");
                        setMoods([]);
                        setTags([]);
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
                <span className="diary-muted" role="status">
                  {results.length} {results.length === 1 ? "entry" : "entries"}{" "}
                  found
                </span>
              </div>
            ) : (
              <>
                <MonthNavigation
                  month={month}
                  onMonth={changeMonth}
                  today={today}
                />
                {!entry && (
                  <form
                    className="diary-quick-line diary-col"
                    onSubmit={(e) => {
                      e.preventDefault();
                      try {
                        const line = drafts[today]?.oneLine.trim() ?? "";
                        if (!line)
                          throw new Error(
                            "Write a line of 1 to 120 characters.",
                          );
                        const saved = saveEntry({
                          ...drafts[today],
                          date: today,
                          oneLine: line,
                        });
                        if (!saved)
                          throw new Error("Diary is still opening. Try again.");
                        rememberDraft({ ...saved }, false);
                        setTimelineError("");
                      } catch (error) {
                        setTimelineError(
                          error instanceof Error
                            ? error.message
                            : "Could not save your line.",
                        );
                      }
                    }}
                  >
                    <span className="sec">TODAY'S LINE</span>
                    <label className="sr-only" htmlFor="diary-timeline-line">
                      Today's line
                    </label>
                    <input
                      id="diary-timeline-line"
                      className="diary-line"
                      placeholder="What stood out today?"
                      value={drafts[today]?.oneLine ?? ""}
                      onChange={(e) =>
                        rememberDraft(
                          {
                            date: today,
                            oneLine: Array.from(e.target.value)
                              .slice(0, 120)
                              .join(""),
                            mood: drafts[today]?.mood ?? 3,
                            body: drafts[today]?.body ?? null,
                            tags: drafts[today]?.tags ?? [],
                          },
                          true,
                        )
                      }
                    />
                    <button type="submit" className="ctl diary-start">
                      Save line <span className="kbd">Enter</span>
                    </button>
                    {timelineError && (
                      <p role="alert" className="diary-error">
                        {timelineError}
                      </p>
                    )}
                  </form>
                )}
                {!!onThisDay.length && (
                  <section className="diary-col">
                    <span className="sec">
                      ON THIS DAY, {format(now, "d MMM").toUpperCase()}
                    </span>
                    <div className="diary-recalls">
                      {onThisDay.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="diary-card"
                          onClick={() => showTimeline(e.date)}
                        >
                          <span className="mono diary-muted">
                            {recallLabel(e.date)}
                          </span>
                          <span>{e.oneLine}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
            {(view === "search" ? results.length === 0 : rows.length === 0) && (
              <div className="diary-empty">
                <h2>
                  {view === "search" && entries.length
                    ? "No matching entries"
                    : "A day at a time"}
                </h2>
                <p>
                  {view === "search" && entries.length
                    ? "Try another word, mood or tag."
                    : "Your lines will collect here. Start with a few words from today."}
                </p>
                <button type="button" className="ctl" onClick={writeToday}>
                  Write today's line <span className="kbd">W</span>
                </button>
              </div>
            )}
            {view === "search"
              ? results.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    query={query}
                    onEdit={() => writeDate(e.date)}
                  />
                ))
              : rows.map((r) =>
                  r.entry ? (
                    <EntryRow
                      key={r.date}
                      entry={r.entry}
                      query=""
                      onEdit={() => writeDate(r.date)}
                    />
                  ) : (
                    <div key={r.date} className="diary-entry diary-gap">
                      <span className="mono">
                        {format(noonOf(r.date), "EEE d MMM")}
                      </span>
                      <div className="diary-row">
                        <span>No line for this day. Add one if you like.</span>
                        <button
                          type="button"
                          className="ctl"
                          onClick={() => writeDate(r.date)}
                        >
                          Write a line
                        </button>
                      </div>
                    </div>
                  ),
                )}
          </div>
        )}
        {view === "calendar" && (
          <DiaryCalendar
            entries={entries}
            month={month}
            onMonth={changeMonth}
            today={today}
            selected={selected}
            onSelect={setSelected}
            weekStart={prefs.weekStart}
            streak={streak.current}
            onWrite={writeDate}
            onTimeline={showTimeline}
          />
        )}
      </div>
      <footer className="foot">
        <span className="k">
          <span className="kbd">W</span>write today's line
        </span>
        <span className="k">
          <span className="kbd">1</span>
          <span className="kbd">5</span>set mood
        </span>
        <span className="k">
          <span className="kbd">T</span>
          <span className="kbd">L</span>
          <span className="kbd">C</span>switch view
        </span>
        <button
          type="button"
          className="b b-quiet diary-help"
          onClick={() => setCheat(true)}
        >
          <span className="kbd">?</span>all shortcuts
        </button>
      </footer>
      {cheat && (
        <DiaryDialog title="Diary shortcuts" onClose={() => setCheat(false)}>
          <div className="diary-cheat">
            {CHEAT.map((g) => (
              <div className="diary-col" key={g.title}>
                <span className="sec">{g.title}</span>
                {g.rows.map(([k, d]) => (
                  <div className="diary-row" key={k}>
                    <span>{d}</span>
                    <span className="kbd">{k}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </DiaryDialog>
      )}
      {editingDate && (
        <DiaryDialog
          title={format(noonOf(editingDate), "EEEE d MMMM yyyy")}
          onClose={() => setEditingDate(null)}
        >
          <div className="diary-dialog-body">
            <EntryComposer
              key={editingDate}
              date={editingDate}
              entry={byDate.get(editingDate)}
              tags={allTags}
              onSave={saveEntry}
              historical
              focusRequest={1}
              onDone={() => setEditingDate(null)}
            />
          </div>
        </DiaryDialog>
      )}
    </div>
  );
}
