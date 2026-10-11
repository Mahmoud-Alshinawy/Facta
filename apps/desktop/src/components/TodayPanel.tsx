import { format, isToday, parseISO } from "date-fns";
import { CalendarEvent, COLOR_MAP } from "@/hooks/useEvents";
import { Goal, CATEGORY_META, isCompletedToday, isActiveToday, useGoals } from "@/hooks/useGoals";
import { CheckCircle2, Circle, Clock, CalendarDays, Target, Plus, Sunrise } from "lucide-react";

interface TodayPanelProps {
  events: CalendarEvent[];
  goals: Goal[];
  onNewEvent: (date: string, time?: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onToggleGoal: (id: string) => void;
  onGoToDay: () => void;
}

export default function TodayPanel({ events, goals, onNewEvent, onEditEvent, onToggleGoal, onGoToDay }: TodayPanelProps) {
  const today = format(new Date(), "yyyy-MM-dd");
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const todayEvents = events
    .filter((e) => e.date === today)
    .sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.startTime.localeCompare(b.startTime);
    });

  const todayGoals = goals.filter((g) => {
    const repeat = g.repeat ?? "none";
    if (repeat !== "none") return isActiveToday(g);
    return g.date === today;
  });

  const completedGoals = todayGoals.filter((g) => isCompletedToday(g));
  const completionPct = todayGoals.length > 0
    ? Math.round((completedGoals.length / todayGoals.length) * 100)
    : 0;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentEvent = todayEvents.find((e) => {
    if (e.allDay) return false;
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    return (sh * 60 + sm) <= nowMinutes && nowMinutes <= (eh * 60 + em);
  });
  const nextEvent = todayEvents.find((e) => {
    if (e.allDay) return false;
    const [sh, sm] = e.startTime.split(":").map(Number);
    return (sh * 60 + sm) > nowMinutes;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <div className="px-6 pt-8 pb-6 border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="flex items-center gap-2 mb-1">
          <Sunrise size={16} className="text-primary" />
          <span className="text-xs font-medium text-primary">{greeting}</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {format(new Date(), "EEEE, MMMM d")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {todayEvents.length === 0 && todayGoals.length === 0
            ? "Nothing scheduled — enjoy the free day!"
            : `${todayEvents.length} event${todayEvents.length !== 1 ? "s" : ""}, ${todayGoals.length} goal${todayGoals.length !== 1 ? "s" : ""} today`}
        </p>

        {(currentEvent || nextEvent) && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/8 px-4 py-3">
            {currentEvent && (
              <div>
                <div className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-0.5">Happening now</div>
                <button onClick={() => onEditEvent(currentEvent)} className="text-sm font-semibold text-foreground hover:text-primary transition-colors text-left">
                  {currentEvent.title}
                </button>
                <div className="text-xs text-muted-foreground">{currentEvent.startTime} – {currentEvent.endTime}</div>
              </div>
            )}
            {!currentEvent && nextEvent && (
              <div>
                <div className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-0.5">Up next</div>
                <button onClick={() => onEditEvent(nextEvent)} className="text-sm font-semibold text-foreground hover:text-primary transition-colors text-left">
                  {nextEvent.title}
                </button>
                <div className="text-xs text-muted-foreground">{nextEvent.startTime} – {nextEvent.endTime}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 px-6 py-5 grid md:grid-cols-2 gap-6 content-start">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays size={14} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Today's Schedule</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onGoToDay}
                className="text-xs text-primary hover:underline font-medium"
              >
                Day view
              </button>
              <button
                onClick={() => onNewEvent(today)}
                className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {todayEvents.length === 0 ? (
            <button
              onClick={() => onNewEvent(today)}
              className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/40 py-8 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-colors group"
            >
              <Plus size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium">Add an event</span>
            </button>
          ) : (
            <div className="space-y-2">
              {todayEvents.map((event) => {
                const colors = COLOR_MAP[event.color];
                const [sh, sm] = event.allDay ? [0, 0] : event.startTime.split(":").map(Number);
                const [eh, em] = event.allDay ? [24, 0] : event.endTime.split(":").map(Number);
                const isPast = !event.allDay && (sh * 60 + sm) < nowMinutes;
                return (
                  <button
                    key={event.id}
                    onClick={() => onEditEvent(event)}
                    className={`w-full flex items-stretch gap-0 rounded-xl overflow-hidden border text-left hover:shadow-sm transition-all ${
                      isPast ? "opacity-50" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className={`w-1.5 shrink-0 ${colors.bg.replace("/15", "").replace("/20", "")}`} />
                    <div className={`flex-1 flex items-center gap-3 px-3 py-2.5 ${colors.bg} ${colors.text}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{event.title}</div>
                        <div className="text-[10px] opacity-70 flex items-center gap-1 mt-0.5">
                          <Clock size={9} />
                          {event.allDay ? "All day" : `${event.startTime} – ${event.endTime}`}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Today's Goals</h2>
            </div>
            {todayGoals.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{completedGoals.length}/{todayGoals.length}</span>
                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {todayGoals.length === 0 ? (
            <div className="w-full rounded-xl border-2 border-dashed border-border py-8 flex flex-col items-center gap-2 text-muted-foreground">
              <Target size={20} className="opacity-40" />
              <span className="text-xs font-medium">No goals for today</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {todayGoals.map((goal) => {
                const meta = CATEGORY_META[goal.category];
                const done = isCompletedToday(goal);
                return (
                  <div
                    key={goal.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                      done ? "opacity-50 bg-muted/20 border-border/30" : "bg-card border-border hover:border-primary/30"
                    }`}
                  >
                    <button
                      onClick={() => onToggleGoal(goal.id)}
                      className={`shrink-0 transition-colors ${done ? "text-green-500" : "text-muted-foreground hover:text-primary"}`}
                    >
                      {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </button>
                    <span className={`flex-1 text-sm font-medium min-w-0 truncate ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {goal.title}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${meta.bg} ${meta.text}`}>
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {completionPct === 100 && todayGoals.length > 0 && (
            <div className="mt-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-center">
              <div className="text-lg">🎉</div>
              <div className="text-xs font-semibold text-green-700 mt-0.5">All goals complete!</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
