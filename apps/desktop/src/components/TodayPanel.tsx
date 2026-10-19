import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { format, parseISO, subDays } from "date-fns";
import { Bell, Check, Clock, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { COLOR_MAP, useEvents, type CalendarEvent } from "@/hooks/useEvents";
import { REPEAT_META, useGoals, type Goal } from "@/hooks/useGoals";
import { useNow } from "@/hooks/useNow";
import { isCompletedToday, localDay, overdueGoals, planDay } from "@/lib/goalDates";
import { buildTimeline, formatDuration } from "@/lib/eventTimeline";
import type { GoalCategory } from "@/types/planner";
import { LetGoStore } from "@/lib/letGo";

interface TodayPanelProps {
  onNewEvent: (date: string, time?: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
}

const GROUP_META: Record<GoalCategory, { label: string; bars: number }> = {
  "must-do": { label: "Must do", bars: 3 },
  "should-do": { label: "Should do", bars: 2 },
  "nice-to-have": { label: "Nice to have", bars: 1 },
};

// ---------------------------------------------------------------------------
// "Let it go": see lib/letGo.ts. The store lives outside React so a goal stays
// hidden if Today remounts while its toast is still up.
// ---------------------------------------------------------------------------

const UNDO_MS = 5_000;
const letGoStore = new LetGoStore();

function useLettingGo(): ReadonlySet<string> {
  return useSyncExternalStore(letGoStore.subscribe, letGoStore.getHidden);
}

function letGoWithUndo(goal: Goal, deleteGoal: (id: string) => void) {
  letGoStore.letGo(goal.id, {
    deleteGoal,
    toast: {
      show: ({ onUndo, onClosed }) => {
        toast("Goal removed", {
          description: goal.title,
          duration: UNDO_MS,
          // No swipe-to-dismiss: a real click on Undo must never count as a swipe.
          dismissible: false,
          action: { label: "Undo", onClick: onUndo },
          onAutoClose: onClosed,
          onDismiss: onClosed,
        });
      },
    },
  });
}

export default function TodayPanel({ onNewEvent, onEditEvent }: TodayPanelProps) {
  const { goals, updateGoal, deleteGoal, toggleComplete } = useGoals();
  const { getEventsForDate } = useEvents();
  const now = useNow();
  const hidden = useLettingGo();
  const today = localDay(now);

  const plan = useMemo(() => planDay(goals, now), [goals, now]);
  const overdue = useMemo(() => overdueGoals(goals, now).filter((g) => !hidden.has(g.id)), [goals, now, hidden]);
  const timeline = useMemo(() => buildTimeline(getEventsForDate(today), now), [getEventsForDate, today, now]);

  // Brief celebration on the row that was just ticked.
  const [popId, setPopId] = useState<string | null>(null);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (popTimer.current) clearTimeout(popTimer.current); }, []);
  function toggle(goal: Goal) {
    const willBeDone = !isCompletedToday(goal, now);
    toggleComplete(goal.id);
    if (popTimer.current) clearTimeout(popTimer.current);
    setPopId(willBeDone ? goal.id : null);
    if (willBeDone) popTimer.current = setTimeout(() => setPopId(null), 1_100);
  }

  const left = plan.total - plan.done;
  let subline: string;
  if (plan.total === 0) subline = "Nothing planned for today yet. Add a goal to get going.";
  else if (left === 0) subline = "Day closed. Every box ticked.";
  else if (left === 1) subline = `One left: ${plan.next?.title}. Finish it.`;
  else subline = `${left} left. Next up: ${plan.next?.title}.`;

  const firstOverdue = overdue[0];
  const yesterday = format(subDays(now, 1), "yyyy-MM-dd");

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-wrap items-start gap-8 px-10 pb-10 pt-7">
        {/* ===== Left: goals ===== */}
        <section aria-label="Today's goals" className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          {/* Progress */}
          <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-[22px]">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-mono text-5xl font-medium leading-none tracking-[-0.04em] tabular">{plan.done}</span>
              <span className="text-lg font-medium text-text-2">of {plan.total} done today</span>
              {plan.total > 0 && left === 0 && (
                <span className="ml-1 rounded-[7px] bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">Clean sweep</span>
              )}
            </div>
            {plan.total > 0 && (
              <div aria-hidden="true" className="flex gap-1.5 pl-[3px]">
                {plan.goals.map((g, i) => (
                  <span
                    key={g.id}
                    className={`h-2.5 flex-1 -skew-x-[18deg] rounded-[3px] transition-colors duration-300 ${i < plan.done ? "bg-primary" : "bg-raised-2"}`}
                  />
                ))}
              </div>
            )}
            <p className="m-0 text-sm text-text-2">{subline}</p>
          </div>

          {/* Overdue nudge */}
          {firstOverdue && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border-strong py-2.5 pl-4 pr-2.5">
              <Clock aria-hidden="true" size={16} className="shrink-0 text-warning" />
              <p className="m-0 min-w-0 flex-[1_1_260px] text-sm text-text-2">
                Left over from {firstOverdue.date === yesterday ? "yesterday" : format(parseISO(firstOverdue.date), "EEE d MMM")}:{" "}
                <span className="text-foreground">{firstOverdue.title}</span>
                {overdue.length > 1 && <span className="ml-2 font-mono text-xs text-subtle">+{overdue.length - 1} more</span>}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => updateGoal(firstOverdue.id, { date: today })}
                  className="h-[34px] rounded-lg border border-input px-3 text-[13px] font-medium hover:bg-raised-2"
                >
                  Move to today
                </button>
                <button
                  type="button"
                  onClick={() => letGoWithUndo(firstOverdue, deleteGoal)}
                  className="h-[34px] rounded-lg px-3 text-[13px] text-subtle hover:bg-raised-2"
                >
                  Let it go
                </button>
              </div>
            </div>
          )}

          {/* Groups */}
          {plan.groups.map((group) => {
            const meta = GROUP_META[group.category];
            return (
              <div key={group.category} className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5 px-1">
                  <span aria-hidden="true" className="flex items-end gap-0.5">
                    {[1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`w-1 -skew-x-[18deg] rounded-[1px] ${i <= meta.bars ? "bg-text-2" : "bg-border-strong"}`}
                        style={{ height: 4 + i * 3 }}
                      />
                    ))}
                  </span>
                  <h2 className="m-0 text-sm font-semibold tracking-[-0.01em]">{meta.label}</h2>
                  <span className="font-mono text-xs text-subtle">{group.done} of {group.items.length}</span>
                </div>
                <ul className="m-0 flex list-none flex-col gap-0.5 rounded-[14px] border border-border bg-card p-1">
                  {group.items.map((goal) => (
                    <GoalRow
                      key={goal.id}
                      goal={goal}
                      done={isCompletedToday(goal, now)}
                      isNext={plan.next?.id === goal.id}
                      popping={popId === goal.id}
                      onToggle={() => toggle(goal)}
                      onToggleBell={() => updateGoal(goal.id, { notificationsEnabled: !goal.notificationsEnabled })}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        {/* ===== Right: shared goals and events ===== */}
        <aside aria-label="Shared goals and events" className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
          <SharedGoalsEmpty />

          <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-[22px] py-5">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[15px] font-semibold tracking-[-0.01em]">Today's events</h2>
              <span className="font-mono text-xs text-subtle">{timeline.allDay.length + timeline.timed.length}</span>
            </div>

            {timeline.allDay.length + timeline.timed.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-1">
                <p className="m-0 text-sm text-text-2">No events today.</p>
                <button
                  type="button"
                  onClick={() => onNewEvent(today)}
                  className="flex h-[30px] items-center gap-1.5 rounded-lg border border-input px-2.5 text-[13px] font-medium hover:bg-raised-2"
                >
                  <Plus aria-hidden="true" size={14} /> Add event
                </button>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {timeline.allDay.map((e) => (
                  <EventRow key={e.id} event={e} times={["All day"]} meta={e.description} onClick={() => onEditEvent(e)} />
                ))}
                {timeline.timed.map((t, i) => (
                  <Fragment key={t.event.id}>
                    {i === timeline.nowIndex && <NowMarker now={now} />}
                    <EventRow
                      event={t.event}
                      times={[t.event.startTime, t.event.endTime]}
                      dimmed={t.status === "ended"}
                      meta={[
                        formatDuration(t.minutes),
                        t.status === "ended" ? "ended" : t.status === "now" ? `ends in ${formatDuration(t.minutesAway)}` : `in ${formatDuration(t.minutesAway)}`,
                      ].join(" · ")}
                      onClick={() => onEditEvent(t.event)}
                    />
                  </Fragment>
                ))}
                {timeline.nowIndex === timeline.timed.length && timeline.timed.length > 0 && <NowMarker now={now} />}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function GoalRow({ goal, done, isNext, popping, onToggle, onToggleBell }: {
  goal: Goal;
  done: boolean;
  isNext: boolean;
  popping: boolean;
  onToggle: () => void;
  onToggleBell: () => void;
}) {
  const repeat = goal.repeat ?? "none";
  const bellOn = goal.notificationsEnabled;
  const toggleLabel = `${done ? "Mark not done" : "Mark done"}: ${goal.title}`;

  return (
    <li
      className={`flex min-h-[50px] items-center gap-3.5 rounded-[10px] py-1.5 pl-3 pr-2 transition-colors hover:bg-raised ${
        isNext ? "bg-raised shadow-[inset_0_0_0_1px_var(--border-strong)]" : ""
      } ${popping ? "goal-pop" : ""}`}
    >
      <span className="relative flex shrink-0">
        <span aria-hidden="true" className="goal-ring pointer-events-none absolute inset-0 rounded-lg border-2 border-primary opacity-0" />
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={toggleLabel}
          onClick={onToggle}
          className={`goal-cb flex h-6 w-6 items-center justify-center rounded-lg border-[1.5px] p-0 transition-colors hover:border-primary ${
            done ? "border-primary bg-primary" : "border-input bg-transparent"
          }`}
        >
          {done && <Check aria-hidden="true" size={15} strokeWidth={3.2} className="text-primary-foreground" />}
        </button>
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-2">
        {isNext && (
          <span className="shrink-0 rounded-[5px] bg-raised-2 px-1.5 py-[3px] font-mono text-[10px] font-medium tracking-[0.08em] text-foreground">NEXT</span>
        )}
        <span className={`truncate text-[15px] font-medium ${done ? "text-subtle line-through decoration-subtle" : "text-foreground"}`}>
          {goal.title}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2 text-subtle">
        {isNext && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={toggleLabel}
            className="flex h-[30px] items-center gap-1.5 rounded-lg border border-accent-border pl-2 pr-2.5 text-[13px] font-semibold text-primary hover:bg-accent-soft"
          >
            <Check aria-hidden="true" size={14} strokeWidth={2.8} />
            Mark done
          </button>
        )}
        {repeat !== "none" && (
          <span className="flex h-6 items-center gap-1.5 rounded-md bg-raised-2 px-2 text-xs text-text-2">
            <Repeat aria-hidden="true" size={12} strokeWidth={2.2} />
            {REPEAT_META[repeat].short}
          </span>
        )}
        {goal.time && (
          <span className={`font-mono text-[13px] tabular ${done ? "text-subtle" : "text-text-2"}`}>{goal.time}</span>
        )}
        <button
          type="button"
          aria-pressed={bellOn}
          aria-label={`${bellOn ? "Turn off reminder" : "Turn on reminder"} for ${goal.title}`}
          title={bellOn ? "Reminder on" : "Reminder off"}
          onClick={onToggleBell}
          className={`flex h-8 w-8 items-center justify-center rounded-lg p-0 hover:bg-raised-2 hover:text-foreground ${
            bellOn && !done ? "text-text-2" : "text-subtle"
          }`}
        >
          <Bell aria-hidden="true" size={16} fill={bellOn && !done ? "currentColor" : "none"} />
        </button>
      </span>
    </li>
  );
}

function SharedGoalsEmpty() {
  return (
    <section aria-label="Shared goals" className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-[22px] py-5">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-subtle">Shared goals</span>
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Do it with friends</h2>
        <p className="m-0 text-[13px] text-text-2">Start a shared goal and see who keeps it up each week.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SharedTile icon={<DumbbellIcon />} title="Gym" detail="Template" />
        <SharedTile icon={<Plus aria-hidden="true" size={17} strokeWidth={2.2} />} title="Custom" detail="Set your own goal" />
      </div>
    </section>
  );
}

/** Disabled until shared goals exist; the tooltip says so. */
function SharedTile({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <span className="tip" data-tip="Coming soon">
      <button
        type="button"
        disabled
        aria-label={`${title}: coming soon`}
        className="flex w-full cursor-not-allowed flex-col items-start gap-2.5 rounded-xl border border-input bg-background p-3.5 text-left opacity-70"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-raised-2 text-foreground">{icon}</span>
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-subtle">{detail}</span>
        </span>
      </button>
    </span>
  );
}

function DumbbellIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.4 14.4 9.6 9.6" />
      <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
      <path d="m21.5 21.5-1.4-1.4" />
      <path d="M3.9 3.9 2.5 2.5" />
      <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
    </svg>
  );
}

function eventDotClass(color: CalendarEvent["color"]): string {
  if (color === "blue") return "bg-event-blue";
  if (color === "purple") return "bg-event-purple";
  return COLOR_MAP[color].dot;
}

function EventRow({ event, times, meta, dimmed, onClick }: {
  event: CalendarEvent;
  times: string[];
  meta?: string;
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <li className={dimmed ? "opacity-[0.62]" : ""}>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full gap-3.5 rounded-lg py-2.5 text-left hover:bg-raised"
      >
        <span className="flex w-[52px] shrink-0 flex-col whitespace-nowrap font-mono text-xs leading-normal text-text-2 tabular">
          <span>{times[0]}</span>
          {times[1] && <span className="text-subtle">{times[1]}</span>}
        </span>
        <span aria-hidden="true" className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px] ${eventDotClass(event.color)}`} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{event.title}</span>
          {meta && <span className="truncate text-xs text-subtle">{meta}</span>}
        </span>
      </button>
    </li>
  );
}

function NowMarker({ now }: { now: Date }) {
  const time = format(now, "HH:mm");
  return (
    <li aria-label={`Now ${time}`} className="flex items-center gap-2">
      <span className="w-[52px] font-mono text-[11px] text-foreground tabular">{time}</span>
      <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-foreground" />
      <span aria-hidden="true" className="h-px flex-1 bg-border-strong" />
      <span aria-hidden="true" className="text-[11px] text-subtle">now</span>
    </li>
  );
}
