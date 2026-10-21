import { useEffect } from "react";
import { format } from "date-fns";
import type { Goal } from "@/types/planner";
import { reminderPending } from "@/lib/goalStats";

/** Called only from an explicit reminder-switch click. */
export async function requestGoalNotificationPermission(): Promise<void> {
  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "default"
  ) {
    await Notification.requestPermission();
  }
}

export function useNotifications(
  goals: Goal[],
  markNotified: (id: string, date: string) => void,
) {
  useEffect(() => {
    const checkGoals = () => {
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      )
        return;
      const now = new Date(),
        today = format(now, "yyyy-MM-dd");
      for (const goal of goals) {
        if (!reminderPending(goal, now)) continue;
        try {
          const notification = new Notification(
            `Goal reminder: ${goal.title}`,
            {
              body:
                goal.notificationMessage ||
                `You haven't completed "${goal.title}" yet!`,
              icon: "/favicon.svg",
              tag: goal.id,
            },
          );
          notification.onclick = () => window.focus();
          markNotified(goal.id, today);
        } catch {
          // Keep the bell unsent if this platform refuses a notification.
        }
      }
    };
    checkGoals();
    const interval = setInterval(checkGoals, 60_000);
    return () => clearInterval(interval);
  }, [goals, markNotified]);
}
