import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildDayTimeline, formatClock, formatRange, parsePrefs, type CalendarPrefs } from "@facta/calendar";
import { readSharedDataFresh } from "@/lib/sharedData";
import {
  eventsToday, goalsToday, isDoneToday, localDay, parseClock, prefsFrom,
  type WidgetEvent, type WidgetGoal,
} from "@/lib/today";

// How long a widget-side tick is held while the main app applies it and
// re-exports widgets.json (same as the Tasks widget).
const PENDING_TTL_MS = 10_000;
const THEMES = new Set(["default", "midnight", "ember", "light"]);

const EVENT_COLORS: Record<string, string> = {
  blue: "var(--event-blue)",
  purple: "var(--event-purple)",
  red: "var(--event-red)",
  green: "var(--event-green)",
  orange: "var(--event-orange)",
  pink: "var(--event-pink)",
};

function toggledToday(g: WidgetGoal): WidgetGoal {
  if ((g.repeat ?? "none") === "none") return { ...g, completed: !g.completed };
  const today = localDay();
  const dates = g.completedDates ?? [];
  return { ...g, completedDates: dates.includes(today) ? dates.filter((d) => d !== today) : [...dates, today] };
}

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function DayViewWidget({ theme, translucent }: { theme: string; translucent: boolean }) {
  const [goals, setGoals] = useState<WidgetGoal[]>([]);
  const [events, setEvents] = useState<WidgetEvent[]>([]);
  const [prefs, setPrefs] = useState<CalendarPrefs>(() => parsePrefs(undefined));
  const [loading, setLoading] = useState(true);
  const goalsRef = useRef<WidgetGoal[]>([]);
  const pending = useRef(new Map<string, { expected: boolean; until: number }>());
  const now = useMinuteClock();

  const commitGoals = useCallback((next: WidgetGoal[]) => {
    goalsRef.current = next;
    setGoals(next);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const data = await readSharedDataFresh();
      if (!alive) return;
      if (data) {
        const t = Date.now();
        commitGoals(((data.goals ?? []) as WidgetGoal[]).map((g) => {
          const p = pending.current.get(g.id);
          if (!p) return g;
          if (isDoneToday(g) === p.expected || t > p.until) { pending.current.delete(g.id); return g; }
          return toggledToday(g);
        }));
        setEvents((data.events ?? []) as WidgetEvent[]);
        setPrefs(prefsFrom(data.config));
      }
      setLoading(false);
    };
    void load();
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [commitGoals]);

  const toggle = useCallback(async (id: string) => {
    const goal = goalsRef.current.find((g) => g.id === id);
    if (!goal) return;
    const next = toggledToday(goal);
    pending.current.set(id, { expected: isDoneToday(next), until: Date.now() + PENDING_TTL_MS });
    commitGoals(goalsRef.current.map((g) => (g.id === id ? next : g)));
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_action", { actionJson: JSON.stringify({ type: "toggle_goal", goal_id: id, id: crypto.randomUUID() }) });
    } catch (e) {
      console.error("[DayWidget] write_action failed:", e);
    }
  }, [commitGoals]);

  // The timeline fills whatever height the window leaves it.
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaH, setAreaH] = useState(0);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setAreaH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  const themeKey = THEMES.has(theme) ? theme : "default";
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = goalsToday(goals, now);
  const done = today.filter((g) => isDoneToday(g, now)).length;
  const goalById = new Map(today.map((g) => [g.id, g]));
  const evToday = eventsToday(events, now).filter((e) => !e.allDay);
  const evById = new Map(evToday.map((e) => [e.id, e]));

  const tasks = today.flatMap((g) => {
    const start = parseClock(g.time);
    return start === null ? [] : [{ id: g.id, start }];
  });
  const evs = evToday.flatMap((e) => {
    const start = parseClock(e.startTime);
    if (start === null) return [];
    return [{ id: e.id, start, end: Math.max(start, parseClock(e.endTime) ?? start) }];
  });
  // Leave one task chip's height under the last hour, so an item that starts
  // near the end of the window isn't cut off.
  const TASK_H = 28;
  const tl = areaH > 0 ? buildDayTimeline(tasks, evs, nowMin, { height: Math.max(60, areaH - TASK_H), taskHeight: TASK_H }) : null;
  const tf = prefs.timeFormat;

  return (
    <div
      data-theme={themeKey}
      className={`wg ${translucent ? "is-trans" : ""}`}
      aria-label="Today"
    >
      <div className="wg-head" data-tauri-drag-region style={{ cursor: "grab" }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        <span className="wg-date">{now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "").toUpperCase()}</span>
        <span aria-label={`${done} of ${today.length} goals done`}>{done}/{today.length}</span>
      </div>

      <div ref={areaRef} className="wg-area">
        {loading ? null : tl && (
          <>
            {tl.hours.map((h) => (
              <div key={h.hour} className="wg-hour" style={{ top: h.top }}>
                <span className="wg-hour-label" style={{ visibility: h.hidden ? "hidden" : "visible" }}>
                  {formatClock(h.hour * 60, tf, "hour")}
                </span>
                <span className="wg-hour-line" />
              </div>
            ))}

            <div className="wg-items">
              {tl.items.map((it) => {
                const pos: React.CSSProperties = {
                  top: it.top,
                  height: it.height,
                  left: `calc(4px + (100% - 4px) * ${it.col / it.cols})`,
                  width: `calc((100% - 4px) / ${it.cols} - ${it.cols > 1 ? 3 : 0}px)`,
                };
                const narrow = it.cols > 1;
                if (it.kind === "task") {
                  const g = goalById.get(it.id);
                  if (!g) return null;
                  const isDone = isDoneToday(g, now);
                  const time = formatClock(it.start, tf, "short");
                  return (
                    <div key={`t:${it.id}`} className={`wg-item wg-task ${isDone ? "is-done" : ""}`} style={pos} title={`${g.title}, ${formatClock(it.start, tf)}`}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isDone}
                        aria-label={`${isDone ? "Mark not done" : "Mark done"}: ${g.title}, ${formatClock(it.start, tf)}`}
                        onClick={() => void toggle(g.id)}
                        className="wg-cb"
                      >
                        {isDone && <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                      </button>
                      <span className="wg-title">{g.title}</span>
                      {!narrow && <span className="wg-time">{time}</span>}
                    </div>
                  );
                }
                const e = evById.get(it.id);
                if (!e) return null;
                const past = it.end <= nowMin;
                const tall = it.height >= 40;
                const range = formatRange(it.start, it.end, tf, "short");
                const full = `${e.title}, ${formatRange(it.start, it.end, tf)}${past ? ", ended" : ""}`;
                return (
                  <div
                    key={`e:${it.id}`}
                    tabIndex={0}
                    aria-label={full}
                    title={full}
                    className={`wg-item wg-event ${past ? "is-past" : ""} ${tall ? "is-tall" : ""}`}
                    style={{ ...pos, "--c": EVENT_COLORS[e.color] ?? "var(--event-blue)" } as React.CSSProperties}
                  >
                    <span aria-hidden="true" className="wg-ev-fill" />
                    <span aria-hidden="true" className="wg-ev-edge" />
                    <span className="wg-ev-body">
                      <span className="wg-title">{e.title}</span>
                      {(tall || !narrow) && <span className="wg-time">{range}</span>}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="wg-now" style={{ top: tl.nowTop }} role="img" aria-label={`Now ${formatClock(nowMin, tf)}`}>
              <span className="wg-now-pill">{formatClock(nowMin, tf, "short")}</span>
            </div>

            {tl.items.length === 0 && (
              <p className="wg-empty">Nothing timed between {formatClock(tl.startHour * 60, tf, "hour")} and {formatClock(tl.endHour * 60, tf, "hour")}.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
