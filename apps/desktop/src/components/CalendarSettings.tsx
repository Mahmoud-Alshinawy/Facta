import {
  WEEK_START_OPTIONS,
  type TimeFormat,
  type Weekend,
} from "@facta/calendar";
import { savePrefs, usePrefs } from "@/hooks/usePrefs";
import ChoiceGroup from "./settings/ChoiceGroup";

export default function CalendarSettings() {
  const prefs = usePrefs();
  return (
    <section
      className="settings-card settings-stack"
      aria-labelledby="settings-calendar"
    >
      <div>
        <h2 id="settings-calendar">Calendar</h2>
        <p>Used by Month, Week, the Day widget and the dialogs.</p>
      </div>
      <ChoiceGroup
        label="Week starts on"
        value={prefs.weekStart}
        options={WEEK_START_OPTIONS}
        onChange={(weekStart) => savePrefs({ weekStart })}
      />
      <ChoiceGroup<TimeFormat>
        label="Time format"
        value={prefs.timeFormat}
        options={[
          { value: "24h", label: "24-hour (13:00)" },
          { value: "12h", label: "12-hour (1:00 PM)" },
        ]}
        onChange={(timeFormat) => savePrefs({ timeFormat })}
      />
      <ChoiceGroup<Weekend>
        label="Weekend"
        value={prefs.weekend}
        options={[
          { value: "sat-sun", label: "Saturday and Sunday" },
          { value: "fri-sat", label: "Friday and Saturday" },
        ]}
        onChange={(weekend) => savePrefs({ weekend })}
      />
    </section>
  );
}
