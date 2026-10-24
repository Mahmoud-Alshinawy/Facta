import { parseClock } from "@facta/calendar";
import { format, isValid, parseISO } from "date-fns";
import type { CalendarEvent, Goal, GoalCategory, GoalRepeat } from "@/types/planner";
import type { EventDraft } from "@/components/calendar/types";

export interface GoalDraft {
  title?: string; date?: string; time?: string; category?: GoalCategory;
  repeat?: GoalRepeat; repeatDays?: number[];
}
export type GoalForm = Required<GoalDraft> & { reminder: boolean; message: string; addToCalendar: boolean };
export type EventForm = Required<EventDraft> & { description: string; repeat: GoalRepeat; repeatDays: number[] };

export function nextHour(time: string): string {
  const end = Math.min(1439, (parseClock(time) ?? 540) + 60);
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export function goalForm(goal: Goal | null | undefined, initialDate: string, draft?: GoalDraft): GoalForm {
  return {
    title: goal?.title ?? draft?.title ?? "", category: goal?.category ?? draft?.category ?? "must-do",
    date: goal?.date ?? draft?.date ?? initialDate, time: goal?.time ?? draft?.time ?? "",
    repeat: goal?.repeat ?? draft?.repeat ?? "none", repeatDays: [...(goal?.repeatDays ?? draft?.repeatDays ?? [])],
    reminder: !!goal?.time && !!goal.notificationsEnabled, message: goal?.notificationMessage ?? "", addToCalendar: false,
  };
}

export function eventForm(event: CalendarEvent | null | undefined, initialDate: string, draft?: EventDraft): EventForm {
  const startTime = event?.startTime ?? draft?.startTime ?? "09:00";
  return {
    title: event?.title ?? draft?.title ?? "", date: event?.date ?? draft?.date ?? initialDate,
    endDate: event?.endDate ?? draft?.endDate ?? event?.date ?? draft?.date ?? initialDate,
    startTime, endTime: event?.endTime ?? draft?.endTime ?? nextHour(startTime),
    color: event?.color ?? draft?.color ?? "blue", allDay: event?.allDay ?? draft?.allDay ?? false,
    description: event?.description ?? "", repeat: event?.repeat ?? "none", repeatDays: [...(event?.repeatDays ?? [])],
  };
}

function validDay(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = parseISO(date);
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === date;
}

function commonError(form: { title: string; date: string; repeat: string; repeatDays: number[] }): string {
  if (!form.title.trim()) return "Type a title before saving.";
  if (!validDay(form.date)) return "Choose a valid date.";
  if (form.repeat === "custom" && !form.repeatDays.some((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return "Choose at least one repeat day.";
  return "";
}

export function goalFormError(form: GoalForm): string {
  return commonError(form) || (form.time && parseClock(form.time) === null ? "Choose a valid time." : "")
    || (form.reminder && !form.time ? "Set a time before enabling the reminder." : "");
}

export function eventFormError(form: EventForm): string {
  const common = commonError(form);
  if (common) return common;
  if (!validDay(form.endDate)) return "Choose a valid end date.";
  if (form.endDate < form.date) return "End date must be on or after start date.";
  if (form.allDay) return "";
  const start = parseClock(form.startTime), end = parseClock(form.endTime);
  if (start === null || end === null) return "Choose a start and end time.";
  return form.endDate === form.date && end <= start ? "End time must be after start time." : "";
}
