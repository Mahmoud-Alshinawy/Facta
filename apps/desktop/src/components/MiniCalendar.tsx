import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday,
} from "date-fns";
import { CalendarEvent } from "@/hooks/useEvents";

interface MiniCalendarProps {
  currentMonth: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  onSelectDate: (date: Date) => void;
  onMonthChange: (date: Date) => void;
}

export default function MiniCalendar({
  currentMonth,
  selectedDate,
  events,
  onSelectDate,
  onMonthChange,
}: MiniCalendarProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const weeks: Date[][] = [];
  let day = startDate;
  while (day <= endDate) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }

  const eventDates = new Set(events.map((e) => e.date));

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onMonthChange(subMonths(currentMonth, 1))}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => onMonthChange(addMonths(currentMonth, 1))}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {weeks.flat().map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const hasEvents = eventDates.has(dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(day)}
              className={`relative flex flex-col items-center justify-center w-full aspect-square text-xs rounded-full transition-colors
                ${!isCurrentMonth ? "text-muted-foreground/40" : ""}
                ${isSelected ? "bg-primary text-primary-foreground font-semibold" : ""}
                ${!isSelected && today ? "text-primary font-semibold" : ""}
                ${!isSelected && isCurrentMonth && !today ? "text-foreground hover:bg-muted" : ""}
                ${!isSelected && !isCurrentMonth ? "hover:bg-muted/50" : ""}
              `}
            >
              {format(day, "d")}
              {hasEvents && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
