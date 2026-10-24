import { expect, it } from "vitest";
import { eventsToday, type WidgetEvent } from "../../../widgets/src/lib/today";
import { eventDayRanges } from "@facta/calendar";

it("the existing Day widget selects and clips an ending-day event without changing its record", () => {
  const event: WidgetEvent = {
    id: "trip",
    title: "Trip",
    date: "2026-10-22",
    endDate: "2026-10-23",
    startTime: "22:00",
    endTime: "07:00",
    color: "blue",
  };
  const selected = eventsToday([event], new Date(2026, 9, 23, 6));
  expect(selected).toEqual([event]);
  expect(eventDayRanges(selected[0], "2026-10-23")).toEqual([
    { start: 0, end: 420 },
  ]);
  expect(eventsToday([event], new Date(2026, 9, 24))).toEqual([]);
  expect(event.date).toBe("2026-10-22");
});
