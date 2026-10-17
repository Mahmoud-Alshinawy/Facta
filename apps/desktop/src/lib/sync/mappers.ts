// Conversions between the app's records and the database rows. Rows are
// snake_case with real `date`/`time` columns; records are what the UI, the
// cache and the widgets use.

import type { Tables, TablesInsert } from "@/lib/database.types";
import type {
  CalendarEvent, EventColor, EventRepeat, Goal, GoalCategory, GoalRepeat,
} from "@/types/planner";
import { normalizeTime } from "@/lib/sync/time";

export type GoalRow = Tables<"goals">;
export type GoalInsert = TablesInsert<"goals">;
export type EventRow = Tables<"events">;
export type EventInsert = TablesInsert<"events">;

/** A row as the queue stores it: a full snapshot, sent as an upsert. */
export type GoalWrite = GoalInsert & { id: string; updated_at: string; user_id: string };
export type EventWrite = EventInsert & { id: string; updated_at: string; user_id: string };

const GOAL_CATEGORIES: readonly GoalCategory[] = ["must-do", "should-do", "nice-to-have"];
const REPEATS: readonly GoalRepeat[] = ["none", "daily", "weekdays", "weekly", "custom"];
const EVENT_COLORS: readonly EventColor[] = ["blue", "red", "green", "orange", "purple", "pink"];

function isGoalCategory(v: string): v is GoalCategory {
  return GOAL_CATEGORIES.some((c) => c === v);
}
function isRepeat(v: string): v is GoalRepeat & EventRepeat {
  return REPEATS.some((r) => r === v);
}
function isEventColor(v: string): v is EventColor {
  return EVENT_COLORS.some((c) => c === v);
}

function daysOrUndefined(days: number[] | null | undefined): number[] | undefined {
  return days && days.length > 0 ? [...days] : undefined;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export function goalToRow(goal: Goal, userId: string, updatedAt: string, deletedAt: string | null): GoalWrite {
  return {
    id: goal.id,
    user_id: userId,
    title: goal.title,
    category: goal.category,
    date: goal.date,
    time: normalizeTime(goal.time),
    completed: goal.completed,
    completed_dates: [...(goal.completedDates ?? [])],
    repeat: goal.repeat ?? "none",
    repeat_days: [...(goal.repeatDays ?? [])],
    notifications_enabled: goal.notificationsEnabled,
    notification_message: goal.notificationMessage,
    updated_at: updatedAt,
    deleted_at: deletedAt,
    // lastNotifiedDate is per-device and deliberately not sent.
  };
}

export function goalFromRow(row: GoalRow): Goal {
  const goal: Goal = {
    id: row.id,
    title: row.title,
    category: isGoalCategory(row.category) ? row.category : "should-do",
    date: row.date,
    completed: row.completed,
    completedDates: [...row.completed_dates],
    repeat: isRepeat(row.repeat) ? row.repeat : "none",
    notificationsEnabled: row.notifications_enabled,
    notificationMessage: row.notification_message,
    updatedAt: row.updated_at,
  };
  const time = normalizeTime(row.time);
  if (time) goal.time = time;
  const days = daysOrUndefined(row.repeat_days);
  if (days) goal.repeatDays = days;
  return goal;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function eventToRow(event: CalendarEvent, userId: string, updatedAt: string, deletedAt: string | null): EventWrite {
  return {
    id: event.id,
    user_id: userId,
    title: event.title,
    date: event.date,
    start_time: normalizeTime(event.startTime) ?? "00:00",
    end_time: normalizeTime(event.endTime) ?? "00:00",
    color: event.color,
    description: event.description ?? null,
    all_day: event.allDay ?? false,
    repeat: event.repeat ?? "none",
    repeat_days: [...(event.repeatDays ?? [])],
    updated_at: updatedAt,
    deleted_at: deletedAt,
  };
}

export function eventFromRow(row: EventRow): CalendarEvent {
  const event: CalendarEvent = {
    id: row.id,
    title: row.title,
    date: row.date,
    startTime: normalizeTime(row.start_time) ?? "00:00",
    endTime: normalizeTime(row.end_time) ?? "00:00",
    color: isEventColor(row.color) ? row.color : "blue",
    allDay: row.all_day,
    updatedAt: row.updated_at,
  };
  if (row.description !== null) event.description = row.description;
  // The event dialog stores "no repeat" as undefined; keep that shape.
  if (isRepeat(row.repeat) && row.repeat !== "none") event.repeat = row.repeat;
  const days = daysOrUndefined(row.repeat_days);
  if (days) event.repeatDays = days;
  return event;
}
