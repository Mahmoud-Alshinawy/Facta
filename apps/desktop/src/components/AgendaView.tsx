import { useMemo, useRef, useEffect } from "react";
import {
  format, addDays, isToday, isTomorrow, parseISO, startOfDay,
  isBefore, isSameDay,
} from "date-fns";
import { CalendarEvent, COLOR_MAP } from "@/hooks/useEvents";
import { Goal, CATEGORY_META, isCompletedToday, isActiveToday } from "@/hooks/useGoals";
import { Plus, CheckCircle2, Circle, CalendarDays } from "lucide-react";

interface AgendaViewProps {
  events: CalendarEvent[];
  goals: Goal[];
  onNewEvent: (date: string, time?: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onToggleGoal: (id: string) => void;
}

function dateLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE, MMMM d");
}

export default function AgendaView({ events, goals, onNewEvent, onEditEvent, onToggleGoal }: AgendaViewProps) {
  const todayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    const result: Array<{
      date: Date;
      dateStr: string;
      events: CalendarEvent[];
      goals: Goal[];
    }> = [];

    const start = addDays(new Date(), -14);
    const end = addDays(new Date(), 60);

    let cur = startOfDay(start);
    while (isBefore(cur, end)) {
      const dateStr = format(cur, "yyyy-MM-dd");
      const dayEvents = events
        .filter((e) => e.date === dateStr)
        .sort((a, b) => {
          if (a.allDay && !b.allDay) return -1;
          if (!a.allDay && b.allDay) return 1;
          return a.startTime.localeCompare(b.startTime);
        });

      const dayGoals = goals.filter((g) => {
        const repeat = g.repeat ?? "none";
        if (repeat !== "none") return isToday(cur) ? isActiveToday(g) : false;
        return g.date === dateStr;
      });

      if (dayEvents.length > 0 || dayGoals.length > 0) {
        result.push({ date: cur, dateStr, events: dayEvents, goals: dayGoals });
      }

      cur = addDays(cur, 1);
    }
    return result;
  }, [events, goals]);

  const hasFutureOrToday = days.some((d) => !isBefore(startOfDay(d.date), startOfDay(new Date())) || isToday(d.date));

  useEffect(() => {
    if (todayRef.current && scrollRef.current) {
      const offset = todayRef.current.offsetTop - 24;
      scrollRef.current.scrollTop = offset;
    }
  }, []);

  if (days.length === 0 || !hasFutureOrToday) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <CalendarDays size={48} className="text-muted-foreground/30 mb-4" />
        <p className="text-sm font-semibold text-muted-foreground">No upcoming events</p>
        <p className="text-xs text-muted-foreground/60 mt-1 mb-4">Click a day in the calendar to add events</p>
        <button
          onClick={() => onNewEvent(format(new Date(), "yyyy-MM-dd"))}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Add first event
        </button>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
      <div className="max-w-2xl mx-auto space-y-1">
        {days.map(({ date, dateStr, events: dayEvents, goals: dayGoals }) => {
          const isPastDay = isBefore(startOfDay(date), startOfDay(new Date())) && !isToday(date);
          const isCurrentDay = isToday(date);

          return (
            <div
              key={dateStr}
              ref={isCurrentDay ? todayRef : undefined}
              className={`flex gap-4 py-3 border-b border-border/50 last:border-b-0 group ${isPastDay ? "opacity-50" : ""}`}
            >
              <div className="w-24 shrink-0 pt-0.5">
                <div className={`text-xs font-semibold ${isCurrentDay ? "text-primary" : "text-muted-foreground"}`}>
                  {dateLabel(date)}
                </div>
                {!["Today", "Tomorrow"].includes(dateLabel(date)) && (
                  <div className="text-[10px] text-muted-foreground/60">{format(date, "EEE")}</div>
                )}
                {isCurrentDay && (
                  <span className="inline-block mt-0.5 text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                    Now
                  </span>
                )}
              </div>

              <div className="flex-1 space-y-1.5 min-w-0">
                {dayEvents.map((event) => {
                  const colors = COLOR_MAP[event.color];
                  return (
                    <button
                      key={event.id}
                      onClick={() => onEditEvent(event)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:opacity-90 transition-all hover:shadow-sm ${colors.bg} ${colors.text} group/event`}
                    >
                      <div className="shrink-0">
                        {event.allDay ? (
                          <span className="text-[10px] font-semibold opacity-70">All day</span>
                        ) : (
                          <span className="text-[11px] font-mono opacity-80 whitespace-nowrap">{event.startTime}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{event.title}</div>
                        {!event.allDay && (
                          <div className="text-[10px] opacity-70">{event.startTime} – {event.endTime}</div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {dayGoals.map((goal) => {
                  const meta = CATEGORY_META[goal.category];
                  const done = isCompletedToday(goal);
                  return (
                    <div
                      key={goal.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                        done ? "opacity-40 bg-muted/30 border-border/30" : "bg-card border-border hover:border-primary/30"
                      }`}
                    >
                      <button
                        onClick={() => onToggleGoal(goal.id)}
                        className={`shrink-0 transition-colors ${done ? "text-green-500" : "text-muted-foreground hover:text-primary"}`}
                      >
                        {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {goal.title}
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${meta.bg} ${meta.text}`}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => onNewEvent(dateStr)}
                className="opacity-0 group-hover:opacity-100 self-start mt-0.5 p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shrink-0"
                title="Add event"
              >
                <Plus size={14} />
              </button>
            </div>
          );
        })}

        <div className="py-6 text-center text-xs text-muted-foreground/40">
          Nothing scheduled beyond this point
        </div>
      </div>
    </div>
  );
}
