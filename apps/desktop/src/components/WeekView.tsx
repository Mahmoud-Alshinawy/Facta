import { useMemo, useRef, useEffect } from "react";
import {
  format, startOfWeek, addDays, isSameDay, isToday,
} from "date-fns";
import { CalendarEvent, COLOR_MAP } from "@/hooks/useEvents";
import { Plus } from "lucide-react";

interface WeekViewProps {
  selectedDate: Date;
  events: CalendarEvent[];
  onSelectDate: (date: Date) => void;
  onNewEvent: (date: string, startTime: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 56;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getCurrentTimePercent(): number {
  const now = new Date();
  return (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
}

export default function WeekView({
  selectedDate,
  events,
  onSelectDate,
  onNewEvent,
  onEditEvent,
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (scrollRef.current) {
      const hour = new Date().getHours();
      scrollRef.current.scrollTop = Math.max(0, (hour - 2) * HOUR_HEIGHT);
    }
  }, []);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
    }
    return map;
  }, [events]);

  const totalHeight = HOURS.length * HOUR_HEIGHT;
  const timePercent = getCurrentTimePercent();

  return (
    <div className="flex flex-col h-full">
      <div className="grid border-b border-border" style={{ gridTemplateColumns: "4rem repeat(7, 1fr)" }}>
        <div className="border-r border-border" />
        {days.map((day) => {
          const today = isToday(day);
          const isSelected = isSameDay(day, selectedDate);
          return (
            <button
              key={format(day, "yyyy-MM-dd")}
              onClick={() => onSelectDate(day)}
              className={`py-2 flex flex-col items-center border-r border-border last:border-r-0 transition-colors hover:bg-muted/50`}
            >
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {format(day, "EEE")}
              </span>
              <span
                className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full
                  ${today ? "bg-primary text-primary-foreground" : ""}
                  ${isSelected && !today ? "text-primary" : ""}
                  ${!isSelected && !today ? "text-foreground" : ""}
                `}
              >
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="relative" style={{ height: totalHeight }}>
          <div
            className="absolute left-0 right-0 top-0 bottom-0"
            style={{ display: "grid", gridTemplateColumns: "4rem repeat(7, 1fr)" }}
          >
            <div className="relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 flex justify-end pr-2 border-t border-border/60"
                  style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                >
                  {hour !== 0 && (
                    <span className="text-[10px] text-muted-foreground font-medium pt-1">
                      {format(new Date(2000, 0, 1, hour), "h a")}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayEvents = (eventsByDate[dateStr] ?? []).filter((e) => !e.allDay);
              const dayIsToday = isToday(day);

              return (
                <div key={dateStr} className="relative border-l border-border/40">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-border/40 hover:bg-muted/30 cursor-pointer group transition-colors"
                      style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      onClick={() => onNewEvent(dateStr, `${String(hour).padStart(2, "0")}:00`)}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Plus size={12} className="text-muted-foreground" />
                      </div>
                    </div>
                  ))}

                  {dayIsToday && (
                    <div
                      className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
                      style={{ top: timePercent * totalHeight }}
                    >
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                      <div className="flex-1 h-px bg-red-500" />
                    </div>
                  )}

                  {dayEvents.map((event) => {
                    const startMin = timeToMinutes(event.startTime);
                    const endMin = timeToMinutes(event.endTime);
                    const duration = Math.max(endMin - startMin, 15);
                    const top = (startMin / 60) * HOUR_HEIGHT;
                    const height = Math.max((duration / 60) * HOUR_HEIGHT, 18);
                    const colors = COLOR_MAP[event.color];

                    return (
                      <button
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); onEditEvent(event); }}
                        className={`absolute inset-x-0.5 rounded px-1.5 py-0.5 text-left overflow-hidden z-10 ${colors.bg} ${colors.text} hover:opacity-80 transition-opacity`}
                        style={{ top: top + 1, height: height - 2 }}
                      >
                        <div className="text-[10px] font-semibold truncate leading-tight">{event.title}</div>
                        {height > 28 && (
                          <div className="text-[9px] opacity-70 truncate">{event.startTime}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
