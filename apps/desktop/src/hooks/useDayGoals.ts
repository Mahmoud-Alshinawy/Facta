import { useCallback } from "react";
import { toast } from "sonner";
import { useGoals } from "@/hooks/useGoals";
import { useSharedGoals } from "@/hooks/useSharedGoals";
import { useNow } from "@/hooks/useNow";
import { goalsOn, toggledOn, type DayGoal } from "@/lib/calendarData";
import { sharedDayGoals } from "@/lib/sharedGoals/asGoals";
import { toggleSharedCheckin } from "@/lib/sharedGoals/checkin";
import { appLinks } from "@/lib/sharedGoals/deepLinks";

/**
 * Your goals and shared goals for a calendar day, and one way to tick either.
 * Shared goals are derived from the shared cache, never stored as goals.
 */
export function useDayGoals() {
  const { goals, updateGoal } = useGoals();
  const { engine, data } = useSharedGoals();
  const now = useNow();
  const dayGoals = useCallback(
    (key: string): DayGoal[] => [
      ...goalsOn(goals, key),
      ...(engine && data
        ? sharedDayGoals(data, engine.userId, key, now.getTime())
        : []),
    ],
    [goals, engine, data, now],
  );
  /** Personal: tick that day. Shared today: check in. Other shared days: open the group. */
  const toggleDay = useCallback(
    (item: DayGoal, key: string) => {
      if (item.goal) return updateGoal(item.goal.id, toggledOn(item.goal, key));
      if (!item.shared.canCheck || !engine)
        return appLinks.receive({ kind: "group", id: item.shared.groupId });
      toggleSharedCheckin(engine, item.shared.groupId, Date.now())
        .then(() => {
          if (navigator.onLine) void engine.syncNow();
        })
        .catch((e: Error) => toast.error(e.message));
    },
    [updateGoal, engine],
  );
  return { dayGoals, toggleDay };
}
