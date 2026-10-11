import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { readSharedDataFresh } from "@/lib/sharedData";

interface Event {
  id: string;
  title: string;
  date: string;
  start_time: string;
  all_day: boolean;
}

export default function EventsWidget() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

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
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const upcoming = events
    .filter((e) => {
      if (e.date > today) return true;
      if (e.date === today && !e.all_day) {
        const [h, m] = (e.start_time || "00:00").split(":").map(Number);
        return h * 60 + m >= nowMin;
      }
      return false;
    })
    .slice(0, 6);

  if (loading) return <div className="widget-muted text-sm">Loading...</div>;

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-2 mb-2">
        <Clock size={13} className="widget-accent" />
        <span className="text-[11px] font-bold widget-accent uppercase tracking-wide">Upcoming</span>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm widget-muted text-center py-6">No upcoming events</p>
      ) : (
        <div className="space-y-0.5">
          {upcoming.map((e) => (
            <div key={e.id} className="flex items-center gap-2 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full widget-accent shrink-0" />
              <span className="text-sm widget-text truncate flex-1">{e.title}</span>
              <span className="text-[10px] widget-muted shrink-0">
                {e.date === today ? e.start_time : new Date(e.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
