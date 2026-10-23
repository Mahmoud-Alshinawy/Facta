import { useRef, type KeyboardEvent } from "react";
import { addDays, addMonths, format, getDaysInMonth } from "date-fns";
import { weekdayOrder, type WeekStart } from "@facta/calendar";
import type { DiaryEntry } from "@/types/planner";
import { keyOf, noonOf } from "@/lib/calendarData";
import { dayUnit, diaryMonth, diaryMonthCells, MOODS } from "@/lib/diary";

export function MonthNavigation({
  month,
  onMonth,
  today,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  today: string;
}) {
  return (
    <div className="diary-month-head">
      <h2>{format(month, "MMMM yyyy")}</h2>
      <button
        type="button"
        className="ctl"
        aria-label="Previous month"
        title="Previous month ([)"
        onClick={() => onMonth(addMonths(month, -1))}
      >
        ‹
      </button>
      <button
        type="button"
        className="ctl"
        onClick={() => onMonth(noonOf(today))}
      >
        This month
      </button>
      <button
        type="button"
        className="ctl"
        aria-label="Next month"
        title="Next month (])"
        onClick={() => onMonth(addMonths(month, 1))}
      >
        ›
      </button>
    </div>
  );
}
export default function DiaryCalendar({
  entries,
  month,
  onMonth,
  today,
  selected,
  onSelect,
  weekStart,
  streak,
  onWrite,
  onTimeline,
}: {
  entries: DiaryEntry[];
  month: Date;
  onMonth: (d: Date) => void;
  today: string;
  selected: string;
  onSelect: (key: string) => void;
  weekStart: WeekStart;
  streak: number;
  onWrite: (key: string) => void;
  onTimeline: (key: string) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const cells = diaryMonthCells(month, weekStart);
  const summary = diaryMonth(entries, month, today);
  const current = byDate.get(selected);
  const move = (e: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const offset: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    let next: Date;
    if (e.key in offset) next = addDays(noonOf(date), offset[e.key]);
    else if (e.key === "Home" || e.key === "End") {
      const back = (noonOf(date).getDay() - weekStart + 7) % 7;
      next = addDays(noonOf(date), e.key === "Home" ? -back : 6 - back);
    } else if (e.key === "PageUp" || e.key === "PageDown")
      next = addMonths(noonOf(date), e.key === "PageUp" ? -1 : 1);
    else return;
    e.preventDefault();
    const key = keyOf(next);
    onSelect(key);
    if (key.slice(0, 7) !== keyOf(month).slice(0, 7)) onMonth(next);
    requestAnimationFrame(() =>
      grid.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${key}"]`)
        ?.focus(),
    );
  };
  const points = [...summary.entries].reverse().map((e) => ({
    x: 8 + ((Number(e.date.slice(8)) - 1) / (getDaysInMonth(month) - 1)) * 274,
    y: 92 - (e.mood - 1) * 21,
    entry: e,
  }));
  return (
    <div className="diary-calendar">
      <section aria-label="Month of entries" className="diary-month">
        <MonthNavigation month={month} onMonth={onMonth} today={today} />
        <div
          ref={grid}
          role="grid"
          aria-label={format(month, "MMMM yyyy")}
          className="diary-grid"
        >
          <div role="row" className="diary-week">
            {weekdayOrder(weekStart).map((d) => (
              <span key={d} role="columnheader" className="diary-weekday">
                {format(new Date(2026, 0, 4 + d), "EEE").toUpperCase()}
              </span>
            ))}
          </div>
          {cells.map((week, i) => (
            <div role="row" key={i} className="diary-week">
              {week.map((date) => {
                const e = byDate.get(date);
                const outside = date.slice(0, 7) !== keyOf(month).slice(0, 7);
                return (
                  <div
                    role="gridcell"
                    key={date}
                    aria-selected={date === selected}
                  >
                    <button
                      type="button"
                      data-date={date}
                      disabled={outside}
                      tabIndex={!outside && date === selected ? 0 : -1}
                      onKeyDown={(event) => move(event, date)}
                      onClick={() => onSelect(date)}
                      className={`diary-cell ${outside ? "outside" : ""} ${date === selected ? "selected" : ""} ${date === today ? "today" : ""} diary-m${e?.mood ?? 0}`}
                      aria-label={`${format(noonOf(date), "EEEE d MMMM yyyy")}${e ? `, ${MOODS[e.mood - 1].label}, ${e.oneLine}` : ", no entry"}`}
                      aria-current={date === today ? "date" : undefined}
                    >
                      <span className="diary-day-number">
                        {Number(date.slice(8))}
                      </span>
                      {e && (
                        <>
                          <span className="diary-mood-bar" />
                          <span className="diary-preview">{e.oneLine}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="diary-legend">
          <span className="sec">MOOD</span>
          {MOODS.map((m) => (
            <span key={m.value}>
              <i className={`diary-dot diary-m${m.value}`} />
              {m.label}
            </span>
          ))}
        </div>
      </section>
      <aside className="diary-col" aria-label="Month summary">
        <div className="diary-stats">
          <div>
            <span className="sec">STREAK</span>
            <strong>{streak}</strong>
            <small>{dayUnit(streak)}</small>
          </div>
          <div>
            <span className="sec">WRITTEN</span>
            <strong>
              {summary.written} of {summary.possible}
            </strong>
            <small>this month</small>
          </div>
          <div>
            <span className="sec">AVG MOOD</span>
            <strong>{summary.average?.toFixed(1) ?? "—"}</strong>
            <small>of 5</small>
          </div>
        </div>
        <section className="diary-card">
          <span className="sec">MOOD THIS MONTH</span>
          <svg
            viewBox="0 0 290 100"
            role="img"
            aria-label={
              points.length
                ? `${points.length} entries, average mood ${summary.average?.toFixed(1)} of 5`
                : "No mood entries this month"
            }
          >
            {[8, 50, 92].map((y) => (
              <line
                key={y}
                x1="0"
                x2="290"
                y1={y}
                y2={y}
                stroke="var(--border-strong)"
              />
            ))}
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--text-2)"
              strokeWidth="1.5"
            />
            {points.map((p) => (
              <circle
                key={p.entry.id}
                cx={p.x}
                cy={p.y}
                r="3.5"
                className={`diary-trend-dot diary-m${p.entry.mood}`}
              >
                <title>
                  {p.entry.date}: {MOODS[p.entry.mood - 1].label}
                </title>
              </circle>
            ))}
          </svg>
          <div className="diary-row diary-muted mono">
            <span>1</span>
            <span>15</span>
            <span>{getDaysInMonth(month)}</span>
          </div>
        </section>
        <section className="diary-card" aria-live="polite">
          <span className="sec">
            {format(noonOf(selected), "EEEE d MMM").toUpperCase()}
          </span>
          {current ? (
            <>
              <h3>{current.oneLine}</h3>
              <span className="diary-legend">
                <i className={`diary-dot diary-m${current.mood}`} />
                {MOODS[current.mood - 1].label}
                {current.tags.map((t) => (
                  <span key={t} className="diary-tag">
                    # {t}
                  </span>
                ))}
              </span>
              <button
                type="button"
                className="ctl diary-start"
                onClick={() => onTimeline(selected)}
              >
                Open in timeline
              </button>
            </>
          ) : (
            <>
              <p>No line on this day.</p>
              <button
                type="button"
                className="ctl diary-start"
                disabled={selected > today}
                onClick={() => onWrite(selected)}
              >
                {selected > today
                  ? "This day is still ahead"
                  : "Add a line for this day"}
              </button>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
