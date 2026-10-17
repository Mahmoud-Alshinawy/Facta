// Date rules for goals: repeats, "done today", overdue. All functions take
// the current time as a parameter so they can be tested at fixed instants;
// "today" is always the local calendar day.

import { differenceInCalendarDays, format, getDay, isBefore, parseISO, startOfDay } from "date-fns";
import type { Goal } from "@/types/planner";

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
