import { useEffect, useState } from "react";
import { Sun, CheckCircle2, Circle, Clock as ClockIcon } from "lucide-react";
import { readSharedDataFresh } from "@/lib/sharedData";

interface Goal {
  id: string; title: string; completed: boolean;
  completed_dates: string[]; date: string;
  repeat: string | null; repeat_days: number[] | null;
}

interface Event {
  id: string; title: string; date: string;
  start_time: string; all_day: boolean;
}

function isActiveToday(g: Goal): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const dow = new Date().getDay();
  if (!g.repeat || g.repeat === "none") return g.date === today;
  if (g.repeat === "daily") return true;
  if (g.repeat === "weekdays") return dow >= 1 && dow <= 5;
  if (g.repeat === "weekly") return new Date(g.date).getDay() === dow;
  if (g.repeat === "custom" && g.repeat_days) return g.repeat_days.includes(dow);
  return false;
}

function isDoneToday(g: Goal): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return g.completed || (Array.isArray(g.completed_dates) && g.completed_dates.includes(today));
}

export default function DayViewWidget() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await readSharedDataFresh();
      if (data) {
        setGoals((data?.goals || []) as Goal[]);
        setEvents((data?.events || []) as Event[]);
      }
    } catch {
      setGoals([]); setEvents([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="widget-muted text-sm">Loading...</div>;

  const today = new Date().toISOString().slice(0, 10);
  const todayGoals = goals.filter(isActiveToday);
  const todayEvents = events.filter((e) => e.date === today).sort((a, b) => (a.start_time || "00:00").localeCompare(b.start_time || "00:00"));
  const doneCount = todayGoals.filter(isDoneToday).length;

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-2 mb-2">
        <Sun size={13} className="widget-accent" />
        <span className="text-[11px] font-bold widget-accent uppercase tracking-wide">Today</span>
        <span className="widget-muted text-[10px] ml-auto">Goals: {doneCount}/{todayGoals.length || 0}</span>
      </div>

      {todayEvents.length > 0 && (
        <div className="mb-2">
          {todayEvents.map((e) => (
            <div key={e.id} className="flex items-center gap-2 py-1">
              <ClockIcon size={11} className="widget-accent shrink-0" />
              <span className="text-[10px] widget-muted shrink-0 w-10">{e.start_time || "All day"}</span>
              <span className="text-sm widget-text truncate">{e.title}</span>
            </div>
          ))}
        </div>
      )}

      {todayGoals.length > 0 && (
        <div>
          {todayGoals.map((g) => {
            const done = isDoneToday(g);
            return (
              <div key={g.id} className="flex items-center gap-2 py-0.5">
                {done ? <CheckCircle2 size={12} className="widget-accent shrink-0" /> : <Circle size={12} className="widget-muted shrink-0" />}
                <span className={`text-xs widget-text ${done ? "line-through opacity-50" : ""}`}>{g.title}</span>
              </div>
            );
          })}
        </div>
      )}

      {todayGoals.length === 0 && todayEvents.length === 0 && (
        <p className="widget-muted text-sm text-center py-6">Nothing planned for today</p>
      )}
    </div>
  );
}
