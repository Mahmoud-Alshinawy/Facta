// Shared value fixtures for the data-layer tests; no remote behavior lives here.
import type { Note, DiaryEntry } from "@/types/planner";
export const CONTENT_TIME = "2026-10-22T09:00:00.000Z";
export const makeNote = (patch: Partial<Note> = {}): Note => ({
  id: crypto.randomUUID(),
  title: null,
  body: [],
  color: null,
  tags: [],
  pinned: false,
  pinnedToWidget: false,
  font: null,
  align: null,
  links: [],
  trashedAt: null,
  createdAt: CONTENT_TIME,
  ...patch,
});
export const makeDiary = (patch: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id: crypto.randomUUID(),
  date: "2026-10-22",
  oneLine: "A quiet afternoon",
  mood: 3,
  body: null,
  tags: [],
  createdAt: CONTENT_TIME,
  ...patch,
});
