// Record shapes for goals and events, as the app and the widgets see them.
// The localStorage cache (and therefore widgets.json) holds arrays of these.

export type GoalCategory = "must-do" | "should-do" | "nice-to-have";
export type GoalRepeat = "none" | "daily" | "weekdays" | "weekly" | "custom";

export interface Goal {
  id: string;
  title: string;
  category: GoalCategory;
  date: string;
  time?: string;
  completed: boolean;
  completedDates?: string[];
  repeat?: GoalRepeat;
  repeatDays?: number[];
  notificationsEnabled: boolean;
  notificationMessage: string;
  /** Local only: which day this device last sent a reminder. Never synced. */
  lastNotifiedDate?: string;
  /** Edit time (ISO). Missing only on records cached before sync existed. */
  updatedAt?: string;
}

export type EventColor = "blue" | "red" | "green" | "orange" | "purple" | "pink";
export type EventRepeat = "none" | "daily" | "weekdays" | "weekly" | "custom";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  color: EventColor;
  description?: string;
  allDay?: boolean;
  repeat?: EventRepeat;
  repeatDays?: number[];
  /** Edit time (ISO). Missing only on records cached before sync existed. */
  updatedAt?: string;
}
