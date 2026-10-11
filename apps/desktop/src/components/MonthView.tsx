import { useMemo } from "react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, isToday,
} from "date-fns";
import { CalendarEvent, COLOR_MAP } from "@/hooks/useEvents";
import { Plus } from "lucide-react";

interface MonthViewProps {
  currentMonth: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  onSelectDate: (date: Date) => void;
  onNewEvent: (date: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
}

export default function MonthView({
  currentMonth,
  selectedDate,
  events,
  onSelectDate,
  onNewEvent,
  onEditEvent,
}: MonthViewProps) {
  const weeks = useMemo(() => {
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
    return weeks;
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
    }
    return map;
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      <div className="flex-1 grid grid-rows-[repeat(auto-fill,minmax(0,1fr))] overflow-hidden" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDate[dateStr] ?? [];
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = isSameDay(day, selectedDate);
              const today = isToday(day);

              return (
                <div
                  key={dateStr}
                  onClick={() => onSelectDate(day)}
                  className={`relative group border-r border-border last:border-r-0 p-1 flex flex-col cursor-pointer transition-colors
                    ${!isCurrentMonth ? "bg-muted/30" : "bg-card hover:bg-muted/30"}
                  `}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                        ${today ? "bg-primary text-primary-foreground" : ""}
                        ${isSelected && !today ? "bg-primary/15 text-primary" : ""}
                        ${!isCurrentMonth ? "text-muted-foreground/50" : !today && !isSelected ? "text-foreground" : ""}
                      `}
                    >
                      {format(day, "d")}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onNewEvent(dateStr); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayEvents.slice(0, 3).map((event) => {
                      const colors = COLOR_MAP[event.color];
                      return (
                        <button
                          key={event.id}
                          onClick={(e) => { e.stopPropagation(); onEditEvent(event); }}
                          className={`text-left text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${colors.bg} ${colors.text} hover:opacity-80 transition-opacity`}
                        >
                          {event.allDay ? "" : `${event.startTime} `}{event.title}
                        </button>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-muted-foreground px-1">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
