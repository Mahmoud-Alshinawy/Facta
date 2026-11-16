export const DEFAULT_NOTE_COLUMN_WIDTH = 720;
export const MIN_NOTE_COLUMN_WIDTH = 480;
export const NOTE_COLUMN_GUTTER = 24;

export function noteColumnWidthBounds(availableWidth: number): {
  min: number;
  max: number;
} {
  const paneWidth = Number.isFinite(availableWidth)
    ? Math.max(0, availableWidth)
    : DEFAULT_NOTE_COLUMN_WIDTH + NOTE_COLUMN_GUTTER;
  const max = Math.max(0, Math.floor(paneWidth - NOTE_COLUMN_GUTTER));
  return { min: Math.min(MIN_NOTE_COLUMN_WIDTH, max), max };
}

export function clampNoteColumnWidth(
  width: number,
  availableWidth: number,
): number {
  const { min, max } = noteColumnWidthBounds(availableWidth);
  const desired = Number.isFinite(width)
    ? Math.round(width)
    : DEFAULT_NOTE_COLUMN_WIDTH;
  return Math.min(max, Math.max(min, desired));
}

export function noteColumnWidthForKey(
  width: number,
  key: string,
  availableWidth: number,
): number | null {
  if (key === "Home") return DEFAULT_NOTE_COLUMN_WIDTH;
  if (key === "ArrowLeft")
    return clampNoteColumnWidth(width - 24, availableWidth);
  if (key === "ArrowRight")
    return clampNoteColumnWidth(width + 24, availableWidth);
  return null;
}

// Device-only UI preference; never enters a note or the sync queue.
export const NOTE_COLUMN_WIDTH_KEY = "facta.notes.columnWidth";

export function readNoteColumnWidth(
  storage?: Pick<Storage, "getItem">,
): number {
  try {
    const raw = (storage ?? window.localStorage).getItem(NOTE_COLUMN_WIDTH_KEY);
    const width = raw === null ? NaN : Number(raw);
    if (Number.isFinite(width) && width > 0) return Math.round(width);
  } catch {
    // Blocked storage still permits resizing during this session.
  }
  return DEFAULT_NOTE_COLUMN_WIDTH;
}

export function saveNoteColumnWidth(
  width: number,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? window.localStorage).setItem(
      NOTE_COLUMN_WIDTH_KEY,
      String(width),
    );
  } catch {
    // The current session keeps its width even when persistence is unavailable.
  }
}
