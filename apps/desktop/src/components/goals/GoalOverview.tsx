import { format } from "date-fns";
import { formatClock, parseClock, type CalendarPrefs } from "@facta/calendar";
import { Flame } from "lucide-react";
import type { goalStats } from "@/lib/goalStats";
import { IconCheck } from "../shell/Icons";

export default function GoalOverview({
  stats,
  now,
  prefs,
  onDone,
}: {
  stats: ReturnType<typeof goalStats>;
  now: Date;
  prefs: CalendarPrefs;
  onDone: () => void;
}) {
  return (
    <section className="ov" aria-label="Overview">
      <div>
        <svg
          width="76"
          height="76"
          viewBox="0 0 76 76"
          role="img"
          aria-label={`Weekly completion ${stats.week.percent} percent`}
          className="shrink-0"
        >
          <circle
            cx="38"
            cy="38"
            r="31"
            fill="none"
            stroke="var(--raised-2)"
            strokeWidth="7"
          />
          <circle
            cx="38"
            cy="38"
            r="31"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${stats.week.percent * 1.9478} 194.78`}
            transform="rotate(-90 38 38)"
          />
          <text
            x="38"
            y="43"
            textAnchor="middle"
            fontSize="17"
            fontWeight="600"
            fill="var(--text)"
          >
            {stats.week.percent}%
          </text>
        </svg>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="k">THIS WEEK</span>
          <span className="text-[15px] font-semibold">
            {stats.week.total
              ? `${stats.week.done} of ${stats.week.total} goals`
              : "No goals yet"}
          </span>
          <div className="wkd" aria-hidden="true">
            {stats.week.days.map((day) => (
              <i
                key={day.key}
                className={`${day.done ? (day.done === day.total ? "on" : "part") : ""}${day.key === format(now, "yyyy-MM-dd") ? " td" : ""}`}
              >
                {format(day.date, "EEEEE")}
              </i>
            ))}
          </div>
        </div>
      </div>
      <div>
        <span className="k">STREAK</span>
        <span className="big flex items-center gap-2">
          <Flame aria-hidden="true" size={22} />
          {stats.streak.current}
          <span className="small font-normal">days</span>
        </span>
        <span className="small">Best: {stats.streak.best} days</span>
      </div>
      <div>
        <span className="k">DONE TODAY</span>
        <span className="big">
          {stats.today.done} of {stats.today.total}
        </span>
        <div className="mbar" aria-hidden="true">
          <i
            style={{
              width: `${stats.today.total ? (stats.today.done / stats.today.total) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
      <div>
        <span className="k">NEXT UP</span>
        <span className="truncate text-[15px] font-semibold">
          {stats.next?.title ??
            (stats.today.total ? "All done for today" : "Nothing yet")}
        </span>
        <div className="flex items-center gap-2">
          <span className="mono small">
            {stats.next
              ? stats.next.time
                ? formatClock(
                    parseClock(stats.next.time) ?? 0,
                    prefs.timeFormat,
                    "short",
                  )
                : "Anytime today"
              : ""}
          </span>
          <span className="flex-1" />
          {stats.next && (
            <button type="button" className="ctl goal-next" onClick={onDone}>
              <IconCheck size={13} />
              Mark done
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
