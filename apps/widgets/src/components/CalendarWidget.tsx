import { useEffect, useState } from "react";
import { readSharedDataFresh } from "@/lib/sharedData";

interface Event {
  id: string;
  title: string;
  date: string;
  all_day: boolean;
}

export default function CalendarWidget() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();

  async function load() {
    try {
      const data = await readSharedDataFresh();
      if (data) setEvents((data?.events || []) as Event[]);
    } catch {
      setEvents([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="widget-muted text-sm">Loading...</div>;

  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 0).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const eventDates = new Set(events.map((e) => e.date));
  const todayStr = today.toISOString().slice(0, 10);

  return (
    <div className="h-full overflow-auto">
      <div className="text-center mb-2">
        <span className="text-xs font-bold widget-text">{monthNames[month]} {year}</span>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-[9px] widget-muted py-0.5">{d}</span>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const hasEvent = eventDates.has(dateStr);
          const isToday = dateStr === todayStr;
          return (
          <div key={d} className="relative py-1 rounded-sm text-[10px]" style={isToday ? { backgroundColor: "var(--widget-accent-soft)" } : undefined}>
              <span className={`${isToday ? "widget-accent font-bold" : "widget-text"}`}>{d}</span>
              {hasEvent && <div className="w-1 h-1 rounded-full mx-auto mt-0.5" style={{ backgroundColor: "var(--widget-accent)" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
