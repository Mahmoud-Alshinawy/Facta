import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfDay,
} from "date-fns";
import {
  parseClock,
  startOfWeekFor,
  type CalendarPrefs,
} from "@facta/calendar";
import type { Goal } from "@/types/planner";
import {
  goalsForDay,
  isActiveToday,
  isCompletedToday,
  PRIORITY_ORDER,
} from "./goalDates";

export function validGoalDay(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = parseISO(key);
  return isValid(date) && format(date, "yyyy-MM-dd") === key;
}

/** One-offs have no completion timestamp; their own date is the history date. */
export function goalCompletionDays(goal: Goal): string[] {
  const dates =
    (goal.repeat ?? "none") === "none"
      ? goal.completed
        ? [goal.date]
        : []
      : (goal.completedDates ?? []);
  return [...new Set(dates.filter(validGoalDay))].sort();
}

export function goalStreak(goals: readonly Goal[], now: Date) {
  const today = format(now, "yyyy-MM-dd");
  const days = [
    ...new Set(goals.flatMap(goalCompletionDays).filter((key) => key <= today)),
  ].sort();
  const set = new Set(days);
  let current = 0,
    best = 0,
    run = 0;
  let anchor = startOfDay(now);
  if (!set.has(today)) anchor = addDays(anchor, -1);
  while (set.has(format(anchor, "yyyy-MM-dd"))) {
    current++;
    anchor = addDays(anchor, -1);
  }
  days.forEach((day, index) => {
    run =
      index > 0 &&
      differenceInCalendarDays(parseISO(day), parseISO(days[index - 1])) === 1
        ? run + 1
        : 1;
    best = Math.max(best, run);
  });
  return { current, best };
}

export function goalStats(
  goals: readonly Goal[],
  now: Date,
  prefs: Pick<CalendarPrefs, "weekStart">,
) {
  const start = startOfWeekFor(now, prefs.weekStart);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index),
      scheduled = goalsForDay(goals, date);
    return {
      date,
      key: format(date, "yyyy-MM-dd"),
      total: scheduled.length,
      done: scheduled.filter((g) => isCompletedToday(g, date)).length,
    };
  });
  const total = days.reduce((n, day) => n + day.total, 0),
    done = days.reduce((n, day) => n + day.done, 0);
  const todayGoals = goalsForDay(goals, now);
  const next = todayGoals
    .filter((goal) => !isCompletedToday(goal, now))
    .sort(
      (a, b) =>
        (parseClock(a.time) ?? Infinity) - (parseClock(b.time) ?? Infinity) ||
        PRIORITY_ORDER.indexOf(a.category) -
          PRIORITY_ORDER.indexOf(b.category) ||
        a.title.localeCompare(b.title),
    )[0];
  return {
    week: {
      start,
      days,
      done,
      total,
      percent: total ? Math.round((done / total) * 100) : 0,
    },
    today: {
      done: todayGoals.filter((goal) => isCompletedToday(goal, now)).length,
      total: todayGoals.length,
    },
    streak: goalStreak(goals, now),
    next,
  };
}

/** Per-device unsent-reminder state, shared by the bell and notification loop. */
export function reminderPending(goal: Goal, now: Date): boolean {
  if (
    !goal.notificationsEnabled ||
    !validGoalDay(goal.date) ||
    isCompletedToday(goal, now)
  )
    return false;
  const at = parseClock(goal.time);
  if (at === null) return false;
  const today = format(now, "yyyy-MM-dd");
  if (goal.lastNotifiedDate === today || goal.date > today) return false;
  if ((goal.repeat ?? "none") !== "none" && !isActiveToday(goal, now))
    return false;
  return (
    ((goal.repeat ?? "none") === "none" && goal.date < today) ||
    now.getHours() * 60 + now.getMinutes() >= at
  );
}
