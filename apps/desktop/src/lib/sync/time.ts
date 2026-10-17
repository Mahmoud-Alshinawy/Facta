// Small, pure helpers for the timestamps and clock times that cross the wire.

/**
 * Milliseconds since the epoch for an ISO timestamp, or -Infinity when it is
 * missing or unparseable. Postgres returns microseconds ("…12:00:00.123456+00:00"),
 * so timestamps are always compared as numbers, never as strings.
 */
export function toMillis(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  // Keep at most milliseconds: some JS engines (older WebKit) reject or
  // misread more than 3 fractional digits.
  const ms = Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** Positive when a is newer than b, zero when equal, negative when older. */
export function compareTimestamps(a: string | null | undefined, b: string | null | undefined): number {
  const ma = toMillis(a);
  const mb = toMillis(b);
  if (ma === mb) return 0;
  return ma > mb ? 1 : -1;
}

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/**
 * Normalises a clock time to "HH:mm". Accepts "H:mm", "HH:mm", "HH:mm:ss" and
 * "HH:mm:ss.ffffff" (what Postgres returns for a `time` column). Returns null
 * for anything else.
 */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = TIME_RE.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
