import { useEffect, useRef, useState } from "react";
import { addMonths, format, isSameMonth } from "date-fns";
import { monthMatrix, weekdayOrder } from "@facta/calendar";
import { usePrefs } from "@/hooks/usePrefs";
import { IconLeft, IconRight } from "../shell/Icons";
import { datePickerNavigation } from "@/lib/datePickerNavigation";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function DatePickerGrid({
  selected,
  month,
  onMonth,
  onSelect,
  id = "ev-month",
  mini = false,
  hasEvent,
}: {
  selected: Date;
  month: Date;
  onMonth: (date: Date) => void;
  onSelect: (date: Date) => void;
  id?: string;
  mini?: boolean;
  hasEvent?: (date: Date) => boolean;
}) {
  const { weekStart } = usePrefs();
  const [cursor, setCursor] = useState(selected);
  const ref = useRef<HTMLDivElement>(null);
  const selectedKey = format(selected, "yyyy-MM-dd");
  useEffect(() => {
    setCursor(selected);
  }, [selectedKey]);
  const weeks = monthMatrix(
    month.getFullYear(),
    month.getMonth(),
    weekStart,
  ).filter((week) => week.some((day) => isSameMonth(day, month)));
  const focused = isSameMonth(cursor, month)
    ? cursor
    : isSameMonth(selected, month)
      ? selected
      : new Date(month.getFullYear(), month.getMonth(), 1);
  const move = (date: Date) => {
    setCursor(date);
    onMonth(date);
    requestAnimationFrame(() =>
      ref.current
        ?.querySelector<HTMLButtonElement>(
          `[data-date="${format(date, "yyyy-MM-dd")}"]`,
        )
        ?.focus(),
    );
  };
  return (
    <div className="date-picker">
      <div className="date-picker-head">
        <span id={id}>{format(month, "MMMM yyyy")}</span>
        <div className="option-row">
          <button
            type="button"
            className="b b-icon"
            tabIndex={mini ? -1 : undefined}
            aria-label="Previous month (Page Up)"
            onClick={() => onMonth(addMonths(month, -1))}
          >
            <IconLeft />
          </button>
          <button
            type="button"
            className="b b-icon"
            tabIndex={mini ? -1 : undefined}
            aria-label="Next month (Page Down)"
            onClick={() => onMonth(addMonths(month, 1))}
          >
            <IconRight />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className={`date-grid${mini ? " mm" : ""}`}
        role="grid"
        aria-labelledby={id}
        onKeyDown={(e) => {
          const next = datePickerNavigation(focused, e.key, weekStart);
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(focused);
          }
          if (next) {
            e.preventDefault();
            move(next);
          }
        }}
      >
        <div role="row" className="date-grid-row">
          {weekdayOrder(weekStart).map((day) => (
            <span role="columnheader" className="date-dow mono" key={day}>
              {DAYS[day]}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div
            role="row"
            className="date-grid-row"
            key={format(week[0], "yyyy-MM-dd")}
          >
            {week.map((day) => {
              const key = format(day, "yyyy-MM-dd"),
                out = !isSameMonth(day, month),
                today = key === format(new Date(), "yyyy-MM-dd");
              if (out && !mini)
                return (
                  <span key={key} className="cell blank" aria-hidden="true" />
                );
              return (
                <button
                  key={key}
                  type="button"
                  className={`cell${key < format(new Date(), "yyyy-MM-dd") ? " past" : ""}${out ? " out" : ""}${today ? " today" : ""}${mini ? " d" : ""}`}
                  role="gridcell"
                  data-date={key}
                  tabIndex={key === format(focused, "yyyy-MM-dd") ? 0 : -1}
                  aria-label={`${format(day, "EEEE d MMMM yyyy")}${hasEvent?.(day) ? ", has events" : ""}`}
                  aria-current={today ? "date" : undefined}
                  aria-selected={key === selectedKey}
                  aria-pressed={key === selectedKey}
                  onFocus={() => setCursor(day)}
                  onClick={() => {
                    setCursor(day);
                    onSelect(day);
                    if (out) onMonth(day);
                  }}
                >
                  {day.getDate()}
                  {hasEvent?.(day) && (
                    <span className="dt" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
