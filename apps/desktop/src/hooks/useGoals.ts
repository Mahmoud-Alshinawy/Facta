import type { ReactNode } from "react";
import { createContext, createElement, useContext, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useSyncEngine } from "@/hooks/useSync";
import { isExpiredOverdueGoal, toggleGoalCompletion } from "@/lib/goalDates";
import { setWidgetExportUser } from "@/lib/widgetExportBus";
import type { Goal, GoalCategory, GoalRepeat } from "@/types/planner";

export type { Goal, GoalCategory, GoalRepeat } from "@/types/planner";
export { isActiveToday, isCompletedToday, isExpiredOverdueGoal, isOverdueGoal } from "@/lib/goalDates";

export const CATEGORY_META: Record<GoalCategory, { label: string; color: string; bg: string; text: string; border: string }> = {
  "must-do":      { label: "Must Do",      color: "red",    bg: "bg-red-500/15",    text: "text-red-700",    border: "border-red-300" },
  "should-do":    { label: "Should Do",    color: "orange", bg: "bg-orange-500/15", text: "text-orange-700", border: "border-orange-300" },
  "nice-to-have": { label: "Nice to Have", color: "blue",   bg: "bg-blue-500/15",   text: "text-blue-700",   border: "border-blue-300" },
};

export const REPEAT_META: Record<GoalRepeat, { label: string; short: string }> = {
  none:     { label: "No repeat",     short: "" },
  daily:    { label: "Every day",     short: "Daily" },
  weekdays: { label: "Weekdays",      short: "Weekdays" },
  weekly:   { label: "Every week",    short: "Weekly" },
  custom:   { label: "Custom days",   short: "Custom" },
};

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const NO_GOALS: Goal[] = [];
const noopSubscribe = () => () => {};

export type NewGoal = Omit<Goal, "id" | "completed" | "completedDates" | "lastNotifiedDate" | "updatedAt">;

function useGoalsState() {
  const engine = useSyncEngine();
  const goals = useSyncExternalStore(
    engine ? engine.subscribe : noopSubscribe,
    engine ? engine.goals.getSnapshot : () => NO_GOALS,
  );

  // Goals overdue for more than OVERDUE_DELETE_AFTER_DAYS are deleted through
  // the normal path (tombstone + queue), so other devices drop them too and a
  // pull doesn't bring them back. Only runs once the engine exists, i.e. after
  // auth has resolved.
  const purgeToastShown = useRef<string | null>(null);
  useEffect(() => {
    if (!engine) return;
    const expired = goals.filter((g) => isExpiredOverdueGoal(g));
    if (expired.length === 0) return;
    for (const g of expired) engine.goals.remove(g.id);
    if (purgeToastShown.current !== engine.userId) {
      purgeToastShown.current = engine.userId;
      toast.message(
        expired.length === 1 ? "1 overdue goal was removed" : `${expired.length} overdue goals were removed`,
        { description: "Goals overdue for more than 3 days are cleaned up automatically." },
      );
    }
  }, [engine, goals]);

  /** Returns the saved goal, or null if there is no signed-in engine yet. */
  const addGoal = useCallback((goal: NewGoal): Goal | null => {
    if (!engine) return null;
    return engine.goals.upsert({ ...goal, id: crypto.randomUUID(), completed: false, completedDates: [] });
  }, [engine]);

  const updateGoal = useCallback((id: string, updates: Partial<Goal>) => {
    const current = engine?.goals.get(id);
    if (!engine || !current) return;
    engine.goals.upsert({ ...current, ...updates, id });
  }, [engine]);

  const deleteGoal = useCallback((id: string) => {
    engine?.goals.remove(id);
  }, [engine]);

  const toggleComplete = useCallback((id: string) => {
    const current = engine?.goals.get(id);
    if (!engine || !current) return;
    engine.goals.upsert(toggleGoalCompletion(current));
  }, [engine]);

  // Per-device reminder bookkeeping: no new updatedAt, nothing queued.
  const markNotified = useCallback((id: string, date: string) => {
    engine?.goals.patchLocal(id, { lastNotifiedDate: date });
  }, [engine]);

  return useMemo(
    () => ({ goals, addGoal, updateGoal, deleteGoal, toggleComplete, markNotified }),
    [goals, addGoal, updateGoal, deleteGoal, toggleComplete, markNotified],
  );
}

// One shared instance for the whole app. Each independent useGoals() call
// used to hold its own state, so a change made through one (e.g. a widget
// toggle applied in App) never reached the others until a remount.
const GoalsContext = createContext<ReturnType<typeof useGoalsState> | null>(null);

export function GoalsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const userId = loading ? null : user?.id ?? null;
  useEffect(() => { setWidgetExportUser(userId); }, [userId]);
  return createElement(GoalsContext.Provider, { value: useGoalsState() }, children);
}

export function useGoals() {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error("useGoals must be used inside <GoalsProvider>");
  return ctx;
}
