import { format } from "date-fns";
import {
  parseClock,
  parseQuickGoal,
  startOfWeekFor,
  type CalendarPrefs,
} from "@facta/calendar";
import type { Goal, GoalCategory } from "@/types/planner";
import type { GoalDraft } from "./dialogState";
import { isActiveToday, PRIORITY_ORDER } from "./goalDates";
import { goalCompletionDays, reminderPending } from "./goalStats";

export type GoalSort = "time" | "priority" | "name";
export type GoalGroup = "today" | "upcoming" | "rules" | "done";
export interface GoalRow {
  key: string;
  goal: Goal;
  date: string;
  done: boolean;
  rule: boolean;
  reminder: boolean;
}
export interface GoalSection {
  id: GoalGroup;
  title: string;
  note: string;
  rows: GoalRow[];
}

export function goalsMineSections(
  goals: readonly Goal[],
  now: Date,
  prefs: Pick<CalendarPrefs, "weekStart">,
): GoalSection[] {
  const today = format(now, "yyyy-MM-dd"),
    week = format(startOfWeekFor(now, prefs.weekStart), "yyyy-MM-dd");
  const sections: GoalSection[] = [
    { id: "today", title: "Today", note: format(now, "EEE d MMM"), rows: [] },
    { id: "upcoming", title: "Upcoming", note: "Scheduled", rows: [] },
    { id: "rules", title: "Daily and recurring", note: "Rules", rows: [] },
    { id: "done", title: "Done", note: "This week", rows: [] },
  ];
  const row = (goal: Goal, date: string, rule = false): GoalRow => {
    const done =
      !rule &&
      ((goal.repeat ?? "none") === "none"
        ? goal.completed
        : (goal.completedDates ?? []).includes(date));
    return {
      key: `${rule ? "rule" : "day"}:${goal.id}:${date}`,
      goal,
      date,
      rule,
      done,
      reminder: !rule && !done && date <= today && reminderPending(goal, now),
    };
  };
  for (const goal of goals) {
    const repeats = (goal.repeat ?? "none") !== "none";
    if (repeats) {
      sections[2].rows.push(row(goal, goal.date, true));
      if (isActiveToday(goal, now)) sections[0].rows.push(row(goal, today));
    } else {
      if (goal.date === today || (goal.date < today && !goal.completed))
        sections[0].rows.push(row(goal, goal.date));
      else if (goal.date > today) sections[1].rows.push(row(goal, goal.date));
    }
    for (const date of goalCompletionDays(goal))
      if (date >= week && date < today) sections[3].rows.push(row(goal, date));
  }
  return sections;
}

export function sortGoalRows(
  rows: readonly GoalRow[],
  sort: GoalSort,
): GoalRow[] {
  const byTime = (a: GoalRow, b: GoalRow) =>
    a.date.localeCompare(b.date) ||
    (parseClock(a.goal.time) ?? Infinity) -
      (parseClock(b.goal.time) ?? Infinity) ||
    PRIORITY_ORDER.indexOf(a.goal.category) -
      PRIORITY_ORDER.indexOf(b.goal.category) ||
    a.goal.title.localeCompare(b.goal.title);
  return [...rows].sort(
    sort === "name"
      ? (a, b) => a.goal.title.localeCompare(b.goal.title) || byTime(a, b)
      : sort === "priority"
        ? (a, b) =>
            PRIORITY_ORDER.indexOf(a.goal.category) -
              PRIORITY_ORDER.indexOf(b.goal.category) || byTime(a, b)
        : byTime,
  );
}

export function quickGoalDraft(
  text: string,
  now: Date,
): { complete: boolean; draft: GoalDraft } {
  const parsed = parseQuickGoal(text, now);
  const categories: Record<typeof parsed.priority, GoalCategory> = {
    must: "must-do",
    should: "should-do",
    nice: "nice-to-have",
  };
  return {
    complete: parsed.complete,
    draft: {
      title: parsed.title,
      category: categories[parsed.priority],
      date: parsed.date,
      time: parsed.time,
      repeat: parsed.repeat,
      repeatDays: parsed.repeatDays,
    },
  };
}
