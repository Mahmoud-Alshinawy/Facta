import { useMemo, useRef, useEffect } from "react";
import { format, isToday } from "date-fns";
import { CalendarEvent, COLOR_MAP } from "@/hooks/useEvents";
import { Plus } from "lucide-react";

interface DayViewProps {
  selectedDate: Date;
  events: CalendarEvent[];
  onNewEvent: (date: string, startTime: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getCurrentTimePercent(): number {
  const now = new Date();
  return (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
}

export default function DayView({
  selectedDate,
  events,
  onNewEvent,
  onEditEvent,
}: DayViewProps) {
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const dayEvents = events.filter((e) => e.date === dateStr && !e.allDay);
  const allDayEvents = events.filter((e) => e.date === dateStr && e.allDay);
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = isToday(selectedDate);

  useEffect(() => {
    if (scrollRef.current) {
      const hour = new Date().getHours();
      const scrollTo = Math.max(0, (hour - 2) * HOUR_HEIGHT);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, [selectedDate]);

  const processedEvents = useMemo(() => {
    const sorted = [...dayEvents].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );

    const columns: CalendarEvent[][] = [];

    function overlaps(a: CalendarEvent, b: CalendarEvent) {
      return timeToMinutes(a.startTime) < timeToMinutes(b.endTime) &&
             timeToMinutes(a.endTime) > timeToMinutes(b.startTime);
    }

    for (const event of sorted) {
      let placed = false;
      for (const col of columns) {
        if (!col.some((e) => overlaps(e, event))) {
          col.push(event);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([event]);
    }

    const result: Array<{ event: CalendarEvent; col: number; totalCols: number }> = [];
    for (let ci = 0; ci < columns.length; ci++) {
      for (const event of columns[ci]) {
        const totalCols = columns.filter((col) =>
          col.some((e) => overlaps(e, event))
        ).length;
        result.push({ event, col: ci, totalCols });
      }
    }

    return result;
  }, [dayEvents]);

  const totalHeight = HOURS.length * HOUR_HEIGHT;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-light ${today ? "text-primary" : "text-foreground"}`}>
            {format(selectedDate, "d")}
          </span>
          <span className="text-base font-medium text-muted-foreground">
            {format(selectedDate, "EEEE, MMMM yyyy")}
          </span>
          {today && (
            <span className="ml-auto text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              Today
            </span>
          )}
        </div>

        {allDayEvents.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allDayEvents.map((event) => {
              const colors = COLOR_MAP[event.color];
              return (
                <button
                  key={event.id}
                  onClick={() => onEditEvent(event)}
                  className={`text-xs font-medium px-2 py-1 rounded-md ${colors.bg} ${colors.text} hover:opacity-80 transition-opacity`}
                >
                  {event.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div className="relative" style={{ height: totalHeight }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-border/60 flex group"
              style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              onClick={() => onNewEvent(dateStr, `${String(hour).padStart(2, "0")}:00`)}
            >
              <div className="w-16 shrink-0 flex items-start justify-end pr-3 pt-1">
                <span className="text-[10px] text-muted-foreground font-medium">
                  {hour === 0 ? "" : format(new Date(2000, 0, 1, hour), "h a")}
                </span>
              </div>
              <div className="flex-1 hover:bg-muted/40 transition-colors cursor-pointer relative">
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Plus size={14} className="text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}

          {today && (
            <div
              className="absolute left-0 right-0 pointer-events-none z-20 flex items-center"
              style={{ top: getCurrentTimePercent() * totalHeight }}
            >
              <div className="w-16 flex justify-end pr-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              </div>
              <div className="flex-1 h-px bg-red-500" />
            </div>
          )}

          <div className="absolute left-16 right-0 top-0 bottom-0">
            {processedEvents.map(({ event, col, totalCols }) => {
              const startMin = timeToMinutes(event.startTime);
              const endMin = timeToMinutes(event.endTime);
              const duration = Math.max(endMin - startMin, 15);
              const top = (startMin / 60) * HOUR_HEIGHT;
              const height = Math.max((duration / 60) * HOUR_HEIGHT, 20);
              const colors = COLOR_MAP[event.color];
              const width = `calc((100% - ${col * 2}px) / ${totalCols})`;
              const left = `calc(${col} * (100% / ${totalCols}) + ${col * 2}px)`;

              return (
                <button
                  key={event.id}
                  onClick={(e) => { e.stopPropagation(); onEditEvent(event); }}
                  className={`absolute rounded-md px-2 py-1 text-left overflow-hidden ${colors.bg} ${colors.text} hover:opacity-80 transition-opacity`}
                  style={{ top: top + 1, height: height - 2, width, left, zIndex: 10 }}
                >
                  <div className="text-[11px] font-semibold truncate leading-tight">{event.title}</div>
                  <div className="text-[10px] opacity-80 truncate">
                    {event.startTime} – {event.endTime}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
