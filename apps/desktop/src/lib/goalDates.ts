// Date rules for goals: repeats, "done today", overdue. All functions take
// the current time as a parameter so they can be tested at fixed instants;
// "today" is always the local calendar day.

import { differenceInCalendarDays, format, getDay, isBefore, parseISO, startOfDay } from "date-fns";
import type { Goal, GoalCategory } from "@/types/planner";

export const OVERDUE_DELETE_AFTER_DAYS = 3;

/** Local calendar day as "yyyy-MM-dd". */
export function localDay(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export function isCompletedToday(goal: Goal, now: Date = new Date()): boolean {
  const repeat = goal.repeat ?? "none";
  if (repeat === "none") return goal.completed;
  return (goal.completedDates ?? []).includes(localDay(now));
}

/** Whether a repeating goal is due on the local day containing `now`. */
export function isActiveToday(goal: Goal, now: Date = new Date()): boolean {
  const repeat = goal.repeat ?? "none";
  if (repeat === "none") return false;

  const startDate = parseISO(goal.date);
  if (isBefore(startOfDay(now), startOfDay(startDate))) return false;

  const dow = getDay(now);
  if (repeat === "daily") return true;
  if (repeat === "weekdays") return dow >= 1 && dow <= 5;
  if (repeat === "weekly") return getDay(startDate) === dow;
  if (repeat === "custom") return (goal.repeatDays ?? []).includes(dow);
  return false;
}

/** Non-recurring, incomplete, due date before today. */
export function isOverdueGoal(goal: Goal, now: Date = new Date()): boolean {
  if (goal.completed) return false;
  if ((goal.repeat ?? "none") !== "none") return false;
  try {
    return isBefore(startOfDay(parseISO(goal.date)), startOfDay(now));
  } catch {
    return false;
  }
}

/** Overdue for more than OVERDUE_DELETE_AFTER_DAYS calendar days: eligible for auto-delete. */
export function isExpiredOverdueGoal(goal: Goal, now: Date = new Date()): boolean {
  if (!isOverdueGoal(goal, now)) return false;
  try {
    return differenceInCalendarDays(startOfDay(now), startOfDay(parseISO(goal.date))) > OVERDUE_DELETE_AFTER_DAYS;
  } catch {
    return false;
  }
}

/** The goal after ticking or unticking it for the local day containing `now`. */
export function toggleGoalCompletion(goal: Goal, now: Date = new Date()): Goal {
  if ((goal.repeat ?? "none") === "none") return { ...goal, completed: !goal.completed };
  const today = localDay(now);
  const dates = goal.completedDates ?? [];
  return {
    ...goal,
    completedDates: dates.includes(today) ? dates.filter((d) => d !== today) : [...dates, today],
  };
}

// ---------------------------------------------------------------------------
// The day's plan: which goals count today, in what order, and what's next.
// ---------------------------------------------------------------------------

export const PRIORITY_ORDER: readonly GoalCategory[] = ["must-do", "should-do", "nice-to-have"];

/**
 * The goals that count on the local day containing `now`: one-off goals due
 * that day, plus repeating goals active that day.
 */
export function goalsForDay(goals: readonly Goal[], now: Date = new Date()): Goal[] {
  const today = localDay(now);
  return goals.filter((g) => ((g.repeat ?? "none") === "none" ? g.date === today : isActiveToday(g, now)));
}

/** Timed goals first, earliest first; untimed after. Stable otherwise. */
function byTime(a: Goal, b: Goal): number {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return 0;
}

export interface DayGroup {
  category: GoalCategory;
  /** Unfinished first (next up at the top), then done; each part by time. */
  items: Goal[];
  done: number;
}

export interface DayPlan {
  goals: Goal[];
  done: number;
  total: number;
  /** The first unfinished goal by priority, then time. */
  next: Goal | undefined;
  /** Only categories that have goals today, in priority order. */
  groups: DayGroup[];
}

export function planDay(goals: readonly Goal[], now: Date = new Date()): DayPlan {
  const today = goalsForDay(goals, now);
  const isDone = (g: Goal) => isCompletedToday(g, now);
  const groups: DayGroup[] = [];
  let next: Goal | undefined;
  for (const category of PRIORITY_ORDER) {
    const inGroup = today.filter((g) => g.category === category);
    if (inGroup.length === 0) continue;
    const open = inGroup.filter((g) => !isDone(g)).sort(byTime);
    const closed = inGroup.filter(isDone).sort(byTime);
    if (!next && open.length > 0) next = open[0];
    groups.push({ category, items: [...open, ...closed], done: closed.length });
  }
  const done = today.filter(isDone).length;
  return { goals: today, done, total: today.length, next, groups };
}

/** Overdue one-off goals, oldest first. */
export function overdueGoals(goals: readonly Goal[], now: Date = new Date()): Goal[] {
  return goals.filter((g) => isOverdueGoal(g, now)).sort((a, b) => a.date.localeCompare(b.date));
}
