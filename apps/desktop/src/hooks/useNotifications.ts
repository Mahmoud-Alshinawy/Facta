import { useEffect, useCallback, useState } from "react";
import { Goal } from "./useGoals";
import { format, isBefore, parseISO, startOfDay } from "date-fns";

export function useNotifications(goals: Goal[], markNotified: (id: string, date: string) => void) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const sendNotification = useCallback((goal: Goal) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(`Goal reminder: ${goal.title}`, {
      body: goal.notificationMessage || `You haven't completed "${goal.title}" yet!`,
      icon: "/favicon.ico",
      tag: goal.id,
    });
    n.onclick = () => window.focus();
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;

    function checkGoals() {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");

      for (const goal of goals) {
        if (!goal.notificationsEnabled || goal.completed) continue;

        const goalDate = parseISO(goal.date);
        const isOverdue = isBefore(startOfDay(goalDate), startOfDay(now));
        const isDueToday = goal.date === todayStr;

        if (!isOverdue && !isDueToday) continue;

        if (goal.lastNotifiedDate === todayStr) continue;

        if (isDueToday && goal.time) {
          const [h, m] = goal.time.split(":").map(Number);
          const dueTime = new Date(now);
          dueTime.setHours(h, m, 0, 0);
          if (isBefore(now, dueTime)) continue;
        }

        sendNotification(goal);
        markNotified(goal.id, todayStr);
      }
    }

    checkGoals();
    const interval = setInterval(checkGoals, 60 * 1000);
    return () => clearInterval(interval);
  }, [goals, permission, sendNotification, markNotified]);

  return { permission, requestPermission, sendNotification };
}
