import { addDays, addMonths, startOfWeek } from "date-fns";
import type { WeekStart } from "@facta/calendar";

/** Calendar-key movement uses local dates and clamps month ends. */
export function datePickerNavigation(
  date: Date,
  key: string,
  weekStart: WeekStart,
): Date | undefined {
  const days: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  if (Object.hasOwn(days, key)) return addDays(date, days[key]);
  if (key === "PageUp" || key === "PageDown")
    return addMonths(date, key === "PageUp" ? -1 : 1);
  if (key === "Home" || key === "End")
    return addDays(
      startOfWeek(date, { weekStartsOn: weekStart }),
      key === "Home" ? 0 : 6,
    );
  return undefined;
}
