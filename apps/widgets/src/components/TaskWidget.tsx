import { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle2, Circle, LayoutGrid } from "lucide-react";
import { readSharedDataFresh } from "@/lib/sharedData";

interface Goal {
  id: string;
  title: string;
  completed: boolean;
  completed_dates: string[];
  completedDates: string[];
  date: string;
  repeat: string | null;
  repeat_days: number[] | null;
  repeatDays: number[] | null;
}

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// How long a widget-side toggle is held on screen while waiting for the main
// app to apply it and re-export widgets.json.
const PENDING_TTL_MS = 10_000;

function isActiveToday(g: Goal): boolean {
  const today = localToday();
  const dow = new Date().getDay();
  const rpt = g.repeat || (g.repeatDays ? "custom" : "none");
  if (!rpt || rpt === "none") return g.date === today;
  if (rpt === "daily") return true;
  if (rpt === "weekdays") return dow >= 1 && dow <= 5;
  if (rpt === "weekly") return new Date(g.date).getDay() === dow;
  const days = g.repeatDays || g.repeat_days || [];
  if (rpt === "custom" && days.length > 0) return days.includes(dow);
  return false;
}

function isDoneToday(g: Goal): boolean {
  const today = localToday();
  if (g.completed) return true;
  const dates = g.completedDates || g.completed_dates || [];
  if (Array.isArray(dates) && dates.includes(today)) return true;
  return false;
}

function toggleDoneToday(g: Goal): Goal {
  const today = localToday();
  const repeat = g.repeat || (g.repeatDays ? "custom" : "none") || "none";

  if (repeat === "none") {
    return { ...g, completed: !g.completed };
  }

  const dates = [...(g.completedDates || g.completed_dates || [])];
  const alreadyDone = dates.includes(today);
  return {
    ...g,
    completedDates: alreadyDone ? dates.filter((d) => d !== today) : [...dates, today],
    completed_dates: alreadyDone ? dates.filter((d) => d !== today) : [...dates, today],
  };
}

export default function TaskWidget() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const ownerRef = useRef<string | null>(null);
  const goalsRef = useRef<Goal[]>([]);
  // goalId -> expected done state, kept until the exported data agrees.
  const pending = useRef(new Map<string, { expected: boolean; until: number }>());

  const commit = useCallback((next: Goal[]) => {
    goalsRef.current = next;
    setGoals(next);
  }, []);

  async function load() {
    try {
      const data = await readSharedDataFresh();
      if (data) {
        if(ownerRef.current !== (data.user_id ?? null)) pending.current.clear();
        ownerRef.current = data.user_id ?? null;
        const now = Date.now();
        const fresh = (data?.goals || []) as Goal[];
        commit(fresh.map((g) => {
          const p = pending.current.get(g.id);
          if (!p) return g;
          if (isDoneToday(g) === p.expected || now > p.until) {
            pending.current.delete(g.id);
            return g;
          }
          return toggleDoneToday(g);
        }));
      }
    } catch {
      commit([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, []);

  const handleToggle = useCallback(async (goalId: string) => {
    const goal = goalsRef.current.find((g) => g.id === goalId);
    if (!goal) return;
    const toggled = toggleDoneToday(goal);
    pending.current.set(goalId, { expected: isDoneToday(toggled), until: Date.now() + PENDING_TTL_MS });
    commit(goalsRef.current.map((g) => (g.id === goalId ? toggled : g)));

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_action", {
        actionJson: JSON.stringify({
          type: "toggle_goal",
          goal_id: goalId,
          ...(ownerRef.current ? {user_id:ownerRef.current} : {}),
          id: crypto.randomUUID(),
        }),
      });
    } catch (e) { console.error("[TaskWidget] write_action failed:", e); }
  }, [commit]);

  const todayGoals = goals.filter(isActiveToday);
  const doneCount = todayGoals.filter(isDoneToday).length;

  if (loading) return <div className="widget-muted text-sm">Loading...</div>;

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-2 mb-2">
        <LayoutGrid size={13} className="widget-accent" />
        <span className="text-[11px] font-bold widget-accent uppercase tracking-wide">Today's Tasks</span>
      </div>
      {todayGoals.length === 0 ? (
        <p className="text-sm widget-muted text-center py-6">No goals for today</p>
      ) : (
        <div className="space-y-0.5">
          {todayGoals.map((g) => {
            const done = isDoneToday(g);
            return (
              <button
                key={g.id}
                onClick={() => handleToggle(g.id)}
                className="flex items-center gap-2 py-1.5 w-full text-left hover:opacity-80 transition-opacity"
              >
                {done ? (
                  <CheckCircle2 size={14} className="widget-accent shrink-0" />
                ) : (
                  <Circle size={14} className="widget-muted shrink-0" />
                )}
                <span className={`text-sm widget-text ${done ? "line-through opacity-50" : ""}`}>
                  {g.title}
                </span>
              </button>
            );
          })}
          <p className="text-[10px] widget-muted text-center mt-1">
            {doneCount}/{todayGoals.length} completed
          </p>
        </div>
      )}
    </div>
  );
}