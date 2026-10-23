import {
  buildDayTimeline,
  formatClock,
  monthMatrix,
  parseClock,
  weekdayOrder,
} from "@facta/calendar";
import { format } from "date-fns";
import { useGoals } from "@/hooks/useGoals";
import { useEvents } from "@/hooks/useEvents";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";
import { goalsForDay, isCompletedToday, PRIORITY_ORDER } from "@/lib/goalDates";
import { eventColorVar } from "@/lib/eventColors";
import { splitDay } from "@/lib/calendarData";
import { WIDGET_LABELS, type WidgetConfig } from "@/lib/widgetConfig";
import { IconCheck } from "../shell/Icons";
import { Calendar, Clock, LayoutGrid, Sun, Target } from "lucide-react";

import JournalPreview from "./JournalPreview";

const PREVIEW_ICONS = {
  tasks: LayoutGrid,
  events: Clock,
  progress: Target,
  calendar: Calendar,
  dayview: Sun,
  notes: LayoutGrid,
  diary: Calendar,
};

export default function WidgetPreview({
  widget,
}: {
  widget: Pick<WidgetConfig, "theme" | "type" | "translucent" | "noteStyle">;
}) {
  const now = useNow(),
    prefs = usePrefs(),
    { goals } = useGoals(),
    { getEventsForDate } = useEvents();
  const today = format(now, "yyyy-MM-dd"),
    due = goalsForDay(goals, now);
  const dayEvents = splitDay(getEventsForDate(today), today);
  const events = [
    ...dayEvents.allDay,
    ...dayEvents.timed.map((item) => item.event),
  ];
  const done = due.filter((goal) => isCompletedToday(goal, now)).length;
  const clock = (minute: number) =>
    formatClock(minute, prefs.timeFormat, "short");
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const HeaderIcon = PREVIEW_ICONS[widget.type];
  const timeline = buildDayTimeline(
    due.flatMap((goal) => {
      const start = parseClock(goal.time);
      return start === null ? [] : [{ id: goal.id, start }];
    }),
    dayEvents.timed.map(({id,start,end}) => ({id,start,end})),
    nowMin,
    { height: 280, taskHeight: 28 },
  );
  if(widget.type === "notes" || widget.type === "diary") return <JournalPreview widget={widget}/>;
  return (
    <div
      className="widget-preview-stage"
      role="img"
      aria-label={`${WIDGET_LABELS[widget.type]} widget preview, ${widget.theme}, ${widget.translucent ? "transparent" : "solid"}`}
    >
      <div className="widget-preview-wallpaper" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div
        data-theme={widget.theme}
        className={`widget-preview${widget.translucent ? " is-trans" : ""}`}
        aria-hidden="true"
      >
        <div className="widget-preview-head">
          <HeaderIcon size={14} />
          <span className="flex-1">
            {widget.type === "tasks"
              ? "TODAY"
              : widget.type === "events"
                ? "EVENTS · TODAY"
                : widget.type === "calendar"
                  ? format(now, "MMMM yyyy").toUpperCase()
                  : widget.type === "progress"
                    ? "PROGRESS"
                    : `DAY · ${format(now, "EEE d MMM").toUpperCase()}`}
          </span>
          {widget.type !== "calendar" && widget.type !== "progress" && (
            <span>
              {widget.type === "events"
                ? events.length
                : `${done}/${due.length}`}
            </span>
          )}
        </div>
        {widget.type === "tasks" && (
          <div className="widget-preview-list">
            <div className="preview-segments">
              {due.map((goal) => (
                <i
                  key={goal.id}
                  className={isCompletedToday(goal, now) ? "done" : ""}
                />
              ))}
            </div>
            {due.slice(0, 6).map((goal) => (
              <div className="widget-preview-row" key={goal.id}>
                <span
                  className={`preview-check${isCompletedToday(goal, now) ? " on" : ""}`}
                >
                  {isCompletedToday(goal, now) && <IconCheck size={11} />}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate${isCompletedToday(goal, now) ? " preview-done" : ""}`}
                >
                  {goal.title}
                </span>
                <span className="mono preview-meta">
                  {goal.time ? clock(parseClock(goal.time) ?? 0) : ""}
                </span>
              </div>
            ))}
            {!due.length && <p>No goals today</p>}
          </div>
        )}
        {widget.type === "events" && (
          <div className="widget-preview-list">
            {events.slice(0, 5).map((event) => (
              <div className="widget-preview-event" key={event.id}>
                <span className="mono preview-meta">
                  {event.allDay
                    ? "All day"
                    : clock(parseClock(event.startTime) ?? 0)}
                </span>
                <span
                  className="preview-event-dot"
                  style={{ background: eventColorVar(event.color) }}
                />
                <span className="min-w-0">
                  <span className="block truncate">{event.title}</span>
                  {!event.allDay && (
                    <span className="preview-meta">
                      until {clock(parseClock(event.endTime) ?? 0)}
                    </span>
                  )}
                </span>
              </div>
            ))}
            {!events.length && <p>No events today</p>}
          </div>
        )}
        {widget.type === "progress" && (
          <div className="widget-preview-list">
            <div className="preview-progress">
              <div className="preview-ring">
                <svg width="76" height="76" viewBox="0 0 76 76">
                  <circle
                    cx="38"
                    cy="38"
                    r="32"
                    fill="none"
                    strokeWidth="8"
                    className="preview-ring-track"
                  />
                  <circle
                    cx="38"
                    cy="38"
                    r="32"
                    fill="none"
                    strokeWidth="8"
                    strokeLinecap="round"
                    stroke="var(--accent)"
                    strokeDasharray={`${due.length ? (done / due.length) * 201.062 : 0} 201.062`}
                  />
                </svg>
                <span className="mono">
                  {done}/{due.length}
                </span>
              </div>
              <strong>
                {done} of {due.length} done today
              </strong>
            </div>
            {PRIORITY_ORDER.map((category) => {
              const inGroup = due.filter((goal) => goal.category === category),
                completed = inGroup.filter((goal) =>
                  isCompletedToday(goal, now),
                ).length;
              return (
                <div className="widget-preview-row" key={category}>
                  <span className="capitalize">
                    {category.replaceAll("-", " ")}
                  </span>
                  <span className="flex-1" />
                  <span className="mono">
                    {completed}/{inGroup.length}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {widget.type === "calendar" && (
          <div className="preview-month">
            <div className="preview-month-grid">
              {weekdayOrder(prefs.weekStart).map((day) => (
                <span className="mono" key={day}>
                  {["S", "M", "T", "W", "T", "F", "S"][day]}
                </span>
              ))}
              {monthMatrix(now.getFullYear(), now.getMonth(), prefs.weekStart)
                .flat()
                .map((date) => (
                  <span
                    key={format(date, "yyyy-MM-dd")}
                    className={
                      format(date, "yyyy-MM-dd") === today
                        ? "selected"
                        : date.getMonth() !== now.getMonth()
                          ? "out"
                          : ""
                    }
                  >
                    {date.getDate()}
                  </span>
                ))}
            </div>
          </div>
        )}
        {widget.type === "dayview" && (
          <div className="preview-day">
            {timeline.hours.map((hour) => (
              <div
                key={hour.hour}
                className="preview-hour"
                style={{ top: hour.top }}
              >
                <span
                  style={{ visibility: hour.hidden ? "hidden" : "visible" }}
                >
                  {clock(hour.hour * 60)}
                </span>
              </div>
            ))}
            {timeline.items.map((item) => {
              const goal = due.find((goal) => goal.id === item.id),
                event = dayEvents.timed.find((event) => event.id === item.id)?.event;
              return (
                <div
                  key={`${item.kind}:${item.id}`}
                  className={`preview-day-item ${item.kind}`}
                  style={{
                    top: item.top,
                    height: item.height,
                    left: `calc(40px + (100% - 40px) * ${item.col / item.cols})`,
                    width: `calc((100% - 40px) / ${item.cols} - 3px)`,
                    ...(event
                      ? { borderLeftColor: eventColorVar(event.color) }
                      : {}),
                  }}
                >
                  <span>{goal?.title ?? event?.title}</span>
                </div>
              );
            })}
            <span className="preview-now mono" style={{ top: timeline.nowTop }}>
              {clock(nowMin)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
