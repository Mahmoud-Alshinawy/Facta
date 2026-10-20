import { format } from "date-fns";

/** Full label for a Month cell: "Tuesday, 20 October 2026, today, 3 events, 1 of 2 goals done". */
export function dayAriaLabel(date: Date, isToday: boolean, events: number, goalsDone: number, goalsTotal: number): string {
  const parts = [format(date, "EEEE, d MMMM yyyy")];
  if (isToday) parts.push("today");
  if (events > 0) parts.push(`${events} ${events === 1 ? "event" : "events"}`);
  if (goalsTotal > 0) parts.push(`${goalsDone} of ${goalsTotal} ${goalsTotal === 1 ? "goal" : "goals"} done`);
  return parts.join(", ");
}
