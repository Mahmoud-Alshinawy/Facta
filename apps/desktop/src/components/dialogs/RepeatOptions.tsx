import { weekdayOrder } from "@facta/calendar";
import { usePrefs } from "@/hooks/usePrefs";
import type { GoalRepeat } from "@/types/planner";

const REPEATS: [GoalRepeat, string][] = [["none", "None"], ["daily", "Daily"], ["weekdays", "Weekdays"], ["weekly", "Weekly"], ["custom", "Custom"]];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function RepeatOptions({ id, repeat, days, onRepeat, onDays }: {
  id: string; repeat: GoalRepeat; days: number[]; onRepeat: (repeat: GoalRepeat) => void; onDays: (days: number[]) => void;
}) {
  const prefs = usePrefs();
  return <div className="repeat-options">
    <div role="radiogroup" aria-labelledby={id} className="option-row">
      {REPEATS.map(([value, label]) => <button key={value} type="button" className="b opt" role="radio" aria-checked={repeat === value} onClick={() => onRepeat(value)}><span>{label}</span></button>)}
    </div>
    {repeat === "custom" && <div role="group" aria-label="Repeat on days" className="option-row">
      {weekdayOrder(prefs.weekStart).map((day) => <button key={day} type="button" className="b day" aria-pressed={days.includes(day)} aria-label={DAYS[day]}
        onClick={() => onDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort())}>{DAYS[day][0]}</button>)}
    </div>}
  </div>;
}
