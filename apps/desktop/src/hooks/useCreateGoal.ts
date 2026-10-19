import { useCallback } from "react";
import { useEvents, type EventColor } from "@/hooks/useEvents";
import { useGoals, type NewGoal } from "@/hooks/useGoals";
import type { GoalCategory } from "@/types/planner";

const CATEGORY_EVENT_COLOR: Record<GoalCategory, EventColor> = {
  "must-do": "red",
  "should-do": "orange",
  "nice-to-have": "blue",
};

function addHour(time: string) {
  const [h, m] = time.split(":").map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Creates a goal from the goal dialog, optionally with a one-hour calendar
 * event for it. Shared by the Goals panel and Today's "New goal" button.
 */
export function useCreateGoal() {
  const { addGoal } = useGoals();
  const { addEvent } = useEvents();
  return useCallback((data: NewGoal, addToCalendar = false) => {
    const saved = addGoal(data);
    if (!saved || !addToCalendar) return;
    const start = data.time ?? "09:00";
    addEvent({
      title: data.title,
      date: data.date,
      startTime: start,
      endTime: addHour(start),
      color: CATEGORY_EVENT_COLOR[data.category],
      description: `Goal: ${data.title}`,
      allDay: false,
      repeat: "none",
    });
  }, [addGoal, addEvent]);
}
