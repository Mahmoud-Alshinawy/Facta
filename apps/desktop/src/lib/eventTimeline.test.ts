import { describe, expect, it } from "vitest";
import { buildTimeline, formatDuration } from "@/lib/eventTimeline";
import type { CalendarEvent } from "@/types/planner";

const ev = (title: string, startTime: string, endTime: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: title, title, date: "2026-10-17", startTime, endTime, color: "blue", ...over,
});
const at = (hh: number, mm: number) => new Date(2026, 9, 17, hh, mm);

describe("buildTimeline", () => {
  const events = [
    ev("meeting", "16:00", "17:00"),
    ev("lecture", "10:00", "11:30"),
    ev("holiday", "00:00", "00:00", { allDay: true }),
    ev("lunch", "12:30", "13:30"),
  ];

  it("sorts timed events, splits out all-day ones and places the now marker", () => {
    const t = buildTimeline(events, at(13, 12));
    expect(t.allDay.map((e) => e.title)).toEqual(["holiday"]);
    expect(t.timed.map((x) => [x.event.title, x.status])).toEqual([
      ["lecture", "ended"], ["lunch", "now"], ["meeting", "upcoming"],
    ]);
    expect(t.nowIndex).toBe(2);
    expect(t.timed[1].minutesAway).toBe(18); // until lunch ends
    expect(t.timed[2].minutesAway).toBe(168); // until the meeting starts
    expect(t.timed[0].minutes).toBe(90);
  });

  it("puts the marker first before anything starts, and last after everything", () => {
    expect(buildTimeline(events, at(8, 0)).nowIndex).toBe(0);
    expect(buildTimeline(events, at(23, 0)).nowIndex).toBe(3);
  });

  it("an event is 'now' from its start minute up to its end", () => {
    expect(buildTimeline([ev("x", "10:00", "11:00")], at(10, 0)).timed[0].status).toBe("now");
    expect(buildTimeline([ev("x", "10:00", "11:00")], at(11, 0)).timed[0].status).toBe("ended");
  });
});

describe("formatDuration", () => {
  it.each([[45, "45m"], [60, "1h"], [90, "1h 30m"], [168, "2h 48m"], [0, "0m"]])("%i -> %s", (m, s) => {
    expect(formatDuration(m)).toBe(s);
  });
});
