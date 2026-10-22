import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { formatClock, parseClock } from "@facta/calendar";
import { toast } from "sonner";
import { useGoals, type NewGoal } from "@/hooks/useGoals";
import { useCreateGoal } from "@/hooks/useCreateGoal";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";
import { goalStats, goalStreak } from "@/lib/goalStats";
import {
  goalsMineSections,
  quickGoalDraft,
  sortGoalRows,
  type GoalRow,
  type GoalSort,
} from "@/lib/goalsMine";
import { toggledOn } from "@/lib/calendarData";
import type { Goal, GoalCategory } from "@/types/planner";
import type { GoalDraft } from "@/lib/dialogState";
import GoalDialog from "../GoalDialog";
import { Check, Commit } from "../calendar/common";
import { FootHints } from "../shell/Shortcuts";
import {
  IconBell,
  IconDown,
  IconEdit,
  IconPlus,
  IconRepeat,
  IconRight,
} from "../shell/Icons";
import GoalOverview from "./GoalOverview";

const PRIORITIES: [GoalCategory, string, string, number][] = [
  ["must-do", "Must", "must", 3],
  ["should-do", "Should", "should", 2],
  ["nice-to-have", "Nice", "nice", 1],
];

export default function GoalsPage({
  keyboardBlocked = false,
}: {
  keyboardBlocked?: boolean;
}) {
  const { goals, addGoal, updateGoal, deleteGoal } = useGoals();
  const createGoal = useCreateGoal(),
    prefs = usePrefs(),
    now = useNow();
  const today = format(now, "yyyy-MM-dd");
  const [tab, setTab] = useState<"mine" | "shared">("mine"),
    [view, setView] = useState<"list" | "board">("list");
  const [filter, setFilter] = useState<GoalCategory | "all">("all"),
    [sort, setSort] = useState<GoalSort>("time");
  const [doneOpen, setDoneOpen] = useState(false),
    [text, setText] = useState(""),
    [current, setCurrent] = useState(""),
    [live, setLive] = useState("");
  const [dialog, setDialog] = useState<{
    goal?: Goal;
    draft?: GoalDraft;
  } | null>(null);
  const addRef = useRef<HTMLInputElement>(null),
    listRef = useRef<HTMLDivElement>(null);
  const stats = useMemo(
    () => goalStats(goals, now, prefs),
    [goals, now, prefs],
  );
  const allSections = useMemo(
    () => goalsMineSections(goals, now, prefs),
    [goals, now, prefs],
  );
  const sections = allSections.map((section) => ({
    ...section,
    rows: sortGoalRows(
      section.rows.filter(
        (row) => filter === "all" || row.goal.category === filter,
      ),
      sort,
    ),
  }));
  const boardRows = sortGoalRows(
    allSections
      .slice(0, 2)
      .flatMap((section) => section.rows)
      .filter((row) => filter === "all" || row.goal.category === filter),
    sort,
  );
  const flat =
    view === "board"
      ? PRIORITIES.flatMap(([category]) =>
          boardRows.filter((row) => row.goal.category === category),
        )
      : sections.flatMap((section) =>
          section.id === "done" && !doneOpen ? [] : section.rows,
        );
  const index = Math.max(
      0,
      flat.findIndex((row) => row.key === current),
    ),
    active = flat[index];
  const startAdd = () => {
    setTab("mine");
    requestAnimationFrame(() => addRef.current?.focus());
  };
  const say = (message: string) => {
    setLive(message);
    toast.message(message);
  };
  const toggle = (row: GoalRow) => {
    if (row.rule) {
      setDialog({ goal: row.goal });
      return;
    }
    updateGoal(row.goal.id, toggledOn(row.goal, row.date));
    setLive(`${row.done ? "Not done" : "Done"}: ${row.goal.title}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        e.defaultPrevented ||
        keyboardBlocked ||
        dialog ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"]',
        )
      )
        return;
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setTab("mine");
        requestAnimationFrame(() => addRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardBlocked, dialog]);

  const rowContent = (row: GoalRow, board = false) => {
    const [, label, cls, bars] = PRIORITIES.find(
      ([category]) => category === row.goal.category,
    )!;
    const minutes = parseClock(row.goal.time),
      time =
        minutes === null ? "" : formatClock(minutes, prefs.timeFormat, "short");
    const when =
      row.rule || row.date === today
        ? time
        : `${format(new Date(row.date + "T12:00"), "EEE d MMM")}${time ? ` · ${time}` : ""}`;
    const streak = row.rule ? goalStreak([row.goal], now).current : 0;
    const title = (
      <span className="goal-row-title">
        <span className="tt">{row.goal.title}</span>
        {row.overdue && <span className="goal-overdue">Overdue</span>}
      </span>
    );
    const check = row.rule ? (
      <span className="rule-icon">
        <IconRepeat size={12} />
      </span>
    ) : (
      <Check
        done={row.done}
        label={row.goal.title}
        onToggle={() => {
          toggle(row);
          listRef.current?.focus({ preventScroll: true });
        }}
      />
    );
    const reminder = row.reminder && (
      <span
        className="rm"
        title="Reminder not sent"
        role="img"
        aria-label="Reminder not sent"
      >
        <IconBell size={14} />
      </span>
    );
    const repeat = (row.goal.repeat ?? "none") !== "none" && (
      <span className="chp rep">
        <IconRepeat size={12} />
        {row.goal.repeat === "weekdays"
          ? "Weekdays"
          : row.goal.repeat === "weekly"
            ? "Weekly"
            : row.goal.repeat === "custom"
              ? "Custom"
              : "Daily"}
      </span>
    );
    return (
      <div
        key={row.key}
        id={`goal-${row.key}`}
        role="option"
        aria-selected={active?.key === row.key}
        className={`${board ? "bcard" : "gr"}${row.done ? " is-done" : ""}${active?.key === row.key ? " is-cur" : ""}`}
        onClick={() => {
          setCurrent(row.key);
          listRef.current?.focus({ preventScroll: true });
        }}
        onDoubleClick={() => setDialog({ goal: row.goal })}
      >
        {board ? (
          <>
            <div className="r1">
              {check}
              {title}
              {reminder}
            </div>
            <div className="r2">
              {repeat}
              <span className="mt mono">{when}</span>
            </div>
          </>
        ) : (
          <>
            {check}
            {title}
            <span className={`chp ${cls}`} title={`Priority: ${label}`}>
              <span className="pb" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <i key={i} className={i < bars ? "on" : ""} />
                ))}
              </span>
              {label}
            </span>
            {repeat}
            {streak > 0 && (
              <span className="chp strk">{streak} day streak</span>
            )}
            <span className="sp" />
            {reminder}
            <button
              type="button"
              className="b b-icon edit"
              tabIndex={-1}
              aria-label={`Edit ${row.goal.title}`}
              onClick={(e) => {
                e.stopPropagation();
                setDialog({ goal: row.goal });
              }}
            >
              <IconEdit size={14} />
            </button>
            <span className="mt">{when}</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="gmain">
      <header className="hd">
        <div className="flex min-w-[150px] flex-col gap-0.5">
          <span className="mono sec">
            WEEK OF {format(stats.week.start, "d MMM").toUpperCase()} ·{" "}
            {format(addDays(stats.week.start, 6), "d MMM").toUpperCase()}
          </span>
          <h1>Goals</h1>
        </div>
        <div className="seg" role="radiogroup" aria-label="Goals">
          <button
            type="button"
            role="radio"
            aria-checked={tab === "mine"}
            onClick={() => setTab("mine")}
          >
            Mine{" "}
            <span className="mono">
              {
                allSections
                  .slice(0, 2)
                  .flatMap((section) => section.rows)
                  .filter((row) => !row.done).length
              }
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={tab === "shared"}
            onClick={() => setTab("shared")}
          >
            Shared
          </button>
        </div>
        <div className="flex-1" />
        <Commit keyHint="N" hideKeyNarrow onClick={startAdd}>
          <IconPlus />
          New goal
        </Commit>
      </header>
      <div className="gscroll">
        <div className="gwrap">
          {tab === "shared" ? (
            <div className="gempty">
              <h2>Shared goals are coming soon</h2>
              <p>Keep building your own routine in Mine.</p>
              <button
                type="button"
                className="ctl"
                onClick={() => setTab("mine")}
              >
                Back to Mine
              </button>
            </div>
          ) : (
            <>
              <GoalOverview
                stats={stats}
                now={now}
                prefs={prefs}
                onDone={() => {
                  if (stats.next)
                    updateGoal(stats.next.id, toggledOn(stats.next, today));
                }}
              />
              <div
                className="gbar"
                role="toolbar"
                aria-label="Filter, sort and view"
              >
                <div
                  className="seg"
                  role="radiogroup"
                  aria-label="Priority filter"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    All
                  </button>
                  {PRIORITIES.map(([category, label]) => (
                    <button
                      key={category}
                      type="button"
                      role="radio"
                      aria-checked={filter === category}
                      onClick={() => setFilter(category)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="mono sec">SORT</span>
                  <div className="seg" role="radiogroup" aria-label="Sort by">
                    {(
                      [
                        ["time", "Time"],
                        ["priority", "Priority"],
                        ["name", "A–Z"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={sort === value}
                        onClick={() => setSort(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="flex-1" />
                <div className="seg" role="radiogroup" aria-label="View">
                  {(["list", "board"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-label={`${value === "list" ? "List" : "Board"} view`}
                      aria-checked={view === value}
                      onClick={() => setView(value)}
                    >
                      {value === "list" ? "List" : "Board"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="addr">
                <IconPlus />
                <label htmlFor="g-add" className="sr-only">
                  New goal
                </label>
                <input
                  ref={addRef}
                  id="g-add"
                  autoComplete="off"
                  placeholder="New goal. Try: Gym daily 18:00 !must"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setText("");
                      e.currentTarget.blur();
                    }
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    if (!text.trim()) return;
                    const result = quickGoalDraft(text, now);
                    if (!result.complete) {
                      setDialog({ draft: result.draft });
                      setText("");
                      return;
                    }
                    const draft = result.draft,
                      saved = addGoal({
                        title: draft.title!,
                        category: draft.category!,
                        date: draft.date!,
                        time: draft.time || undefined,
                        repeat: draft.repeat,
                        repeatDays:
                          draft.repeat === "custom"
                            ? draft.repeatDays
                            : undefined,
                        notificationsEnabled: false,
                        notificationMessage: "",
                      });
                    if (saved) {
                      setText("");
                      say(`Goal added · ${saved.title}`);
                    } else
                      say("Your planner is still loading. Try again shortly.");
                  }}
                />
                <span className="kbd">Enter</span>
              </div>
              {goals.length === 0 && (
                <div className="gempty">
                  <h2>Nothing on your list yet</h2>
                  <p>
                    Add your first goal above. Pick a priority with !must,
                    !should or !nice, and a time like 18:00.
                  </p>
                  <div className="option-row">
                    <Commit keyHint="N" onClick={startAdd}>
                      New goal
                    </Commit>
                    <button
                      type="button"
                      className="ctl"
                      onClick={() => setTab("shared")}
                    >
                      Shared goals
                    </button>
                  </div>
                </div>
              )}
              <div
                ref={listRef}
                className={`glist${view === "board" ? " cols3" : ""}`}
                role="listbox"
                tabIndex={0}
                aria-label="Goals. Arrow keys or J and K move, X toggles done, E edits."
                aria-activedescendant={
                  active ? `goal-${active.key}` : undefined
                }
                onKeyDown={(e) => {
                  if (e.target !== listRef.current) return;
                  const key = e.key.toLowerCase();
                  let next = index;
                  if (key === "arrowdown" || key === "j")
                    next = Math.min(flat.length - 1, index + 1);
                  else if (key === "arrowup" || key === "k")
                    next = Math.max(0, index - 1);
                  else if (key === "home") next = 0;
                  else if (key === "end") next = flat.length - 1;
                  else if ((key === "x" || key === " ") && active) {
                    e.preventDefault();
                    toggle(active);
                    return;
                  } else if ((key === "e" || key === "enter") && active) {
                    e.preventDefault();
                    setDialog({ goal: active.goal });
                    return;
                  } else return;
                  e.preventDefault();
                  if (!flat[next]) return;
                  setCurrent(flat[next].key);
                  requestAnimationFrame(() =>
                    document
                      .getElementById(`goal-${flat[next].key}`)
                      ?.scrollIntoView({ block: "nearest" }),
                  );
                }}
              >
                {view === "board"
                  ? PRIORITIES.map(([category, label, , bars]) => (
                      <section
                        className="bcol"
                        key={category}
                        aria-label={label}
                      >
                        <div className="gsec">
                          <span className="pb" aria-hidden="true">
                            {[0, 1, 2].map((i) => (
                              <i key={i} className={i < bars ? "on" : ""} />
                            ))}
                          </span>
                          {label}
                          <span className="n">
                            {
                              boardRows.filter(
                                (r) => r.goal.category === category,
                              ).length
                            }
                          </span>
                        </div>
                        {boardRows
                          .filter((row) => row.goal.category === category)
                          .map((row) => rowContent(row, true))}
                        {!boardRows.some(
                          (row) => row.goal.category === category,
                        ) && <span className="dialog-note">Nothing here</span>}
                      </section>
                    ))
                  : sections.map((section) => (
                      <section key={section.id} aria-label={section.title}>
                        <div className="gsec">
                          {section.id === "done" ? (
                            <button
                              type="button"
                              className="tg"
                              aria-expanded={doneOpen}
                              onClick={() => setDoneOpen(!doneOpen)}
                            >
                              {doneOpen ? (
                                <IconDown size={14} />
                              ) : (
                                <IconRight size={14} />
                              )}
                              {section.title}
                            </button>
                          ) : (
                            <span>{section.title}</span>
                          )}
                          <span className="n">{section.rows.length}</span>
                          <span className="flex-1" />
                          <span className="mono sec">{section.note}</span>
                        </div>
                        {(section.id !== "done" || doneOpen) &&
                          (section.rows.length ? (
                            section.rows.map((row) => rowContent(row))
                          ) : (
                            <p className="goal-section-empty">Nothing here</p>
                          ))}
                      </section>
                    ))}
              </div>
            </>
          )}
        </div>
      </div>
      <FootHints view="goals" />
      <div className="sr-only" aria-live="polite">
        {active?.goal.title}
        {live ? `. ${live}` : ""}
      </div>
      <GoalDialog
        open={!!dialog}
        editGoal={dialog?.goal}
        draft={dialog?.draft}
        onClose={() => setDialog(null)}
        onDelete={deleteGoal}
        onSave={(data: NewGoal, addToCalendar) => {
          if (dialog?.goal) updateGoal(dialog.goal.id, data);
          else createGoal(data, addToCalendar);
        }}
      />
    </div>
  );
}
