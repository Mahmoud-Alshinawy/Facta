// Conversions between the app's records and the database rows. Rows are
// snake_case with real `date`/`time` columns; records are what the UI, the
// cache and the widgets use.

import type { Tables, TablesInsert } from "@/lib/database.types";
import { dayIndex } from "@facta/calendar";
import type {
  CalendarEvent,
  EventColor,
  EventRepeat,
  Goal,
  GoalCategory,
  GoalRepeat,
  Note,
  DiaryEntry,
} from "@/types/planner";
import { normalizeTime } from "@/lib/sync/time";
import { extractNoteLinks, validateNoteBody, validTags } from "@/lib/noteBody";

export type GoalRow = Tables<"goals">;
export type GoalInsert = TablesInsert<"goals">;
export type EventRow = Tables<"events">;
export type EventInsert = TablesInsert<"events">;
export type NoteRow = Tables<"notes">;
export type DiaryRow = Tables<"diary_entries">;
export type NoteWrite = TablesInsert<"notes"> & {
  id: string;
  updated_at: string;
  user_id: string;
};
export type DiaryWrite = TablesInsert<"diary_entries"> & {
  id: string;
  updated_at: string;
  user_id: string;
};

/** A row as the queue stores it: a full snapshot, sent as an upsert. */
export type GoalWrite = GoalInsert & {
  id: string;
  updated_at: string;
  user_id: string;
};
export type EventWrite = EventInsert & {
  id: string;
  updated_at: string;
  user_id: string;
};

const GOAL_CATEGORIES: readonly GoalCategory[] = [
  "must-do",
  "should-do",
  "nice-to-have",
];
const REPEATS: readonly GoalRepeat[] = [
  "none",
  "daily",
  "weekdays",
  "weekly",
  "custom",
];
const EVENT_COLORS: readonly EventColor[] = [
  "blue",
  "red",
  "green",
  "orange",
  "purple",
  "pink",
];

function isGoalCategory(v: string): v is GoalCategory {
  return GOAL_CATEGORIES.some((c) => c === v);
}
function isRepeat(v: string): v is GoalRepeat & EventRepeat {
  return REPEATS.some((r) => r === v);
}
function isEventColor(v: string): v is EventColor {
  return EVENT_COLORS.some((c) => c === v);
}

function daysOrUndefined(
  days: number[] | null | undefined,
): number[] | undefined {
  return days && days.length > 0 ? [...days] : undefined;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export function goalToRow(
  goal: Goal,
  userId: string,
  updatedAt: string,
  deletedAt: string | null,
): GoalWrite {
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

export function eventToRow(
  event: CalendarEvent,
  userId: string,
  updatedAt: string,
  deletedAt: string | null,
): EventWrite {
  if (event.endDate !== undefined && (!Number.isFinite(dayIndex(event.endDate)) || !Number.isFinite(dayIndex(event.date)) || event.endDate < event.date))
    throw new Error("End date must be a valid date on or after start date");
  return {
    id: event.id,
    user_id: userId,
    title: event.title,
    date: event.date,
    end_date: event.endDate ?? null,
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
  if (row.end_date != null) event.endDate = row.end_date;
  // The event dialog stores "no repeat" as undefined; keep that shape.
  if (isRepeat(row.repeat) && row.repeat !== "none") event.repeat = row.repeat;
  const days = daysOrUndefined(row.repeat_days);
  if (days) event.repeatDays = days;
  return event;
}

export function prepareNote(note: Note): Note {
  validateNoteBody(note.body);
  if (note.title !== null && [...note.title].length > 500)
    throw new Error("Note title exceeds 500 characters");
  if (!validTags(note.tags))
    throw new Error("Use at most 20 tags, each 1–50 characters");
  if (note.font !== null && [...note.font].length > 50)
    throw new Error("Note font exceeds 50 characters");
  const links = extractNoteLinks(note.body);
  if (links.length > 500) throw new Error("Note exceeds 500 linked notes");
  return {
    ...note,
    title: note.title?.trim() || null,
    links,
  };
}

export function noteToRow(
  record: Note,
  userId: string,
  updatedAt: string,
  deletedAt: string | null,
): NoteWrite {
  const note = prepareNote(record);
  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    body: structuredClone(
      note.body,
    ) as unknown as import("@/lib/database.types").Json,
    color: note.color,
    tags: [...note.tags],
    pinned: note.pinned,
    pinned_to_widget: note.pinnedToWidget,
    font: note.font,
    align: note.align,
    links: [...note.links],
    trashed_at: note.trashedAt,
    created_at: note.createdAt,
    updated_at: updatedAt,
    deleted_at: deletedAt,
  };
}
export function noteFromRow(row: NoteRow): Note {
  validateNoteBody(row.body);
  return prepareNote({
    id: row.id,
    title: row.title,
    body: structuredClone(row.body),
    color: ["a", "b", "c", "d"].includes(row.color ?? "")
      ? (row.color as Note["color"])
      : null,
    tags: [...row.tags],
    pinned: row.pinned,
    pinnedToWidget: row.pinned_to_widget,
    font: row.font,
    align: ["left", "center", "right", "justify"].includes(row.align ?? "")
      ? (row.align as Note["align"])
      : null,
    links: [],
    trashedAt: row.trashed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function prepareDiary(entry: DiaryEntry): DiaryEntry {
  const date = new Date(`${entry.date}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== entry.date
  )
    throw new Error("Invalid diary date");
  if (
    [...entry.oneLine].length < 1 ||
    [...entry.oneLine].length > 120 ||
    !entry.oneLine.trim()
  )
    throw new Error("Diary line must contain 1–120 characters");
  if (![1, 2, 3, 4, 5].includes(entry.mood))
    throw new Error("Choose a mood from 1 to 5");
  if (!validTags(entry.tags))
    throw new Error("Use at most 20 tags, each 1–50 characters");
  return entry;
}
export function diaryToRow(
  record: DiaryEntry,
  userId: string,
  updatedAt: string,
  deletedAt: string | null,
): DiaryWrite {
  const entry = prepareDiary(record);
  return {
    id: entry.id,
    user_id: userId,
    date: entry.date,
    one_line: entry.oneLine,
    mood: entry.mood,
    body: entry.body,
    tags: [...entry.tags],
    created_at: entry.createdAt,
    updated_at: updatedAt,
    deleted_at: deletedAt,
  };
}
export function diaryFromRow(row: DiaryRow): DiaryEntry {
  return prepareDiary({
    id: row.id,
    date: row.date,
    oneLine: row.one_line,
    mood: row.mood as DiaryEntry["mood"],
    body: row.body,
    tags: [...row.tags],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
