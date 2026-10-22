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

export type EventColor =
  "blue" | "red" | "green" | "orange" | "purple" | "pink";
export type EventRepeat = "none" | "daily" | "weekdays" | "weekly" | "custom";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  /** Inclusive final day; null/absent means the same day as date. */
  endDate?: string;
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

export type NoteColor = "a" | "b" | "c" | "d";
export type NoteAlign = "left" | "center" | "right" | "justify";
export type NoteBlockType =
  | "paragraph"
  | "heading"
  | "checklist"
  | "bullet"
  | "quote"
  | "code"
  | "divider";
export type NoteMark =
  | { type: "bold" | "italic" }
  | { type: "color"; color: NoteColor }
  | { type: "link"; href: string };
export type NoteInline =
  | { type: "text"; text: string; marks?: NoteMark[] }
  | { type: "noteLink"; noteId: string; label: string; marks?: NoteMark[] };
/** Editor-independent storage format. Never persist an editor's doc wrapper. */
export interface NoteBlock {
  id: string;
  type: NoteBlockType;
  content: NoteInline[];
  level?: 1 | 2 | 3;
  checked?: boolean;
  language?: string;
}
export interface Note {
  id: string;
  title: string | null;
  body: NoteBlock[];
  color: NoteColor | null;
  tags: string[];
  pinned: boolean;
  pinnedToWidget: boolean;
  font: string | null;
  align: NoteAlign | null;
  /** Derived from body on every save. Backlinks are never persisted. */
  links: string[];
  /** Restorable Trash; permanent deletes live only in the sync queue/server. */
  trashedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}
export interface DiaryEntry {
  id: string;
  date: string;
  oneLine: string;
  mood: 1 | 2 | 3 | 4 | 5;
  body: string | null;
  tags: string[];
  createdAt: string;
  updatedAt?: string;
}
