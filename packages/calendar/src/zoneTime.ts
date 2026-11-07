// Wall-clock maths in an IANA zone. No imports, so Node can load it directly
// (the acceptance fixture scripts reach it through the desktop's dates.ts).
export const DAY = 86_400_000;
const wallFormatters = new Map<string, Intl.DateTimeFormat>();

export function dateMs(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 10) !== date
  )
    throw new Error("Invalid group date");
  return ms;
}

/** Wall-clock reading of an instant in a zone, encoded as a UTC millisecond. */
export function wall(instant: number, zone: string): number {
  let formatter = wallFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    wallFormatters.set(zone, formatter);
  }
  const p = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((x) => [x.type, x.value]),
  );
  return Date.parse(
    `${p.year.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
  );
}

// Match PostgreSQL's local timestamp conversion: the later (standard-time)
// occurrence at a fold, and the forward-shifted instant at a midnight gap.
export function zoneMidnight(date: string, zone: string): number {
  const target = dateMs(date);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = target + hours * 3_600_000;
    offsets.add(wall(sample, zone) - sample);
  }
  const candidates = [...offsets].map((offset) => target - offset);
  const exact = candidates.filter((t) => wall(t, zone) === target);
  if (exact.length) return Math.max(...exact);
  const forward = candidates
    .filter((t) => wall(t, zone) > target)
    .sort((a, b) => wall(a, zone) - wall(b, zone));
  if (!forward.length) throw new Error("Could not resolve group midnight");
  return forward[0];
}
