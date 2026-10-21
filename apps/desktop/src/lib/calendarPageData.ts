import { addDays, addMonths, format, getISOWeek } from "date-fns";
import { parseQuickEvent, startOfWeekFor, toClockValue, type CalendarPrefs } from "@facta/calendar";
import type { CalendarView, EventDraft } from "@/components/calendar/types";

export function shiftCalendar(anchor: Date, view: CalendarView, direction: -1 | 1): Date {
  return view === "month" ? addMonths(anchor, direction)
    : addDays(anchor, direction * (view === "week" ? 7 : view === "agenda" ? 14 : 1));
}

export function calendarHeading(anchor: Date, now: Date, view: CalendarView, prefs: CalendarPrefs) {
  if (view === "day") return {
    title: format(anchor, "EEEE d"),
    subtitle: `${format(anchor, "yyyy-MM-dd") === format(now, "yyyy-MM-dd") ? "TODAY · " : ""}${format(anchor, "MMMM yyyy").toUpperCase()}`,
  };
  if (view === "week") {
    const start = startOfWeekFor(anchor, prefs.weekStart), end = addDays(start, 6), middle = addDays(start, 3);
    return { title: format(middle, "MMMM yyyy"), subtitle: `WEEK ${getISOWeek(middle)} · ${format(start, start.getMonth() === end.getMonth() ? "d" : "d MMM").toUpperCase()}–${format(end, "d MMM").toUpperCase()}` };
  }
  if (view === "month") {
    const first = startOfWeekFor(new Date(anchor.getFullYear(), anchor.getMonth(), 1), prefs.weekStart);
    const last = startOfWeekFor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0), prefs.weekStart);
    return { title: format(anchor, "MMMM yyyy"), subtitle: `WEEKS ${getISOWeek(addDays(first, 3))}–${getISOWeek(addDays(last, 3))}` };
  }
  const end = addDays(anchor, 13);
  return { title: "Next 14 days", subtitle: `AGENDA · ${format(anchor, anchor.getMonth() === end.getMonth() ? "d" : "d MMM").toUpperCase()}–${format(end, "d MMM yyyy").toUpperCase()}` };
}

/** The parser's minutes become the dialog/storage's clock strings. */
export function quickEventDraft(text: string, now: Date, anchor: Date): { complete: boolean; draft: EventDraft } {
  const parsed = parseQuickEvent(text, now, anchor);
  return { complete: parsed.complete, draft: {
    title: parsed.title, date: parsed.date, allDay: parsed.allDay, color: "blue",
    startTime: parsed.start === null ? undefined : toClockValue(parsed.start),
    endTime: parsed.end === null ? undefined : toClockValue(Math.min(1439, parsed.end)),
  } };
}
