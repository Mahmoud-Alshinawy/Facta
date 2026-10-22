import type { CalendarEvent, EventColor } from "@/types/planner";

export type CalendarView = "day" | "week" | "month" | "agenda";

/** What the full event dialog opens with. */
export interface EventDraft {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  color?: EventColor;
}

export interface CalendarActions {
  newEvent: (draft?: EventDraft) => void;
  editEvent: (event: CalendarEvent) => void;
  newGoal: (date?: string) => void;
}
