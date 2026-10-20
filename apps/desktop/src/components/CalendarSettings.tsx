import { WEEK_START_OPTIONS, type TimeFormat, type WeekStart, type Weekend } from "@facta/calendar";
import { savePrefs, usePrefs } from "@/hooks/usePrefs";

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Week start, time format and weekend: used by Month, Week, the sidebar calendar and the widgets. */
export default function CalendarSettings() {
  const prefs = usePrefs();
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">Calendar</h3>
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 text-sm">
        <label htmlFor="pref-week-start" className="text-muted-foreground">Week starts on</label>
        <select
          id="pref-week-start"
          className={selectClass}
          value={prefs.weekStart}
          onChange={(e) => savePrefs({ weekStart: Number(e.target.value) as WeekStart })}
        >
          {WEEK_START_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label htmlFor="pref-time-format" className="text-muted-foreground">Time format</label>
        <select
          id="pref-time-format"
          className={selectClass}
          value={prefs.timeFormat}
          onChange={(e) => savePrefs({ timeFormat: e.target.value as TimeFormat })}
        >
          <option value="24h">24-hour (13:00)</option>
          <option value="12h">12-hour (1:00 PM)</option>
        </select>

        <label htmlFor="pref-weekend" className="text-muted-foreground">Weekend</label>
        <select
          id="pref-weekend"
          className={selectClass}
          value={prefs.weekend}
          onChange={(e) => savePrefs({ weekend: e.target.value as Weekend })}
        >
          <option value="sat-sun">Saturday and Sunday</option>
          <option value="fri-sat">Friday and Saturday</option>
        </select>
      </div>
    </div>
  );
}
