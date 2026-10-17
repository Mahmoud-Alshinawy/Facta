import { describe, expect, it } from "vitest";
import { eventFromRow, eventToRow, goalFromRow, goalToRow } from "@/lib/sync/mappers";
import type { CalendarEvent } from "@/types/planner";
import { createFakeServer } from "@/test/fakeServer";
import { USER, makeGoal } from "@/test/harness";

const T = "2026-10-16T09:00:00.000Z";
const server = () => createFakeServer(() => Date.parse(T) + 60_000);

describe("goal mapping", () => {
  it("round-trips through the server, normalising HH:mm:ss back to HH:mm", () => {
    const goal = makeGoal({ time: "07:30", repeat: "custom", repeatDays: [1, 3], completedDates: ["2026-10-15"], updatedAt: T });
    const s = server();
    const row = s.goals.write(goalToRow(goal, USER, T, null));
    expect(row?.time).toBe("07:30:00");
    expect(goalFromRow(row!)).toEqual(goal);
  });

  it("never sends lastNotifiedDate", () => {
    const row = goalToRow(makeGoal({ lastNotifiedDate: "2026-10-16" }), USER, T, null);
    expect(row).not.toHaveProperty("lastNotifiedDate");
    expect(row).not.toHaveProperty("last_notified_date");
  });

  it("sends user_id and maps a missing time to null", () => {
    const row = goalToRow(makeGoal(), USER, T, null);
    expect(row.user_id).toBe(USER);
    expect(row.time).toBeNull();
    expect(goalFromRow({ ...server().goals.write(row)!, time: null })).not.toHaveProperty("time");
  });
});

describe("event mapping", () => {
  it("round-trips start/end times and keeps 'no repeat' as undefined", () => {
    const event: CalendarEvent = {
      id: crypto.randomUUID(), title: "Standup", date: "2026-10-16",
      startTime: "09:00", endTime: "09:15", color: "green", allDay: false, updatedAt: T,
    };
    const row = server().events.write(eventToRow(event, USER, T, null))!;
    expect(row.start_time).toBe("09:00:00");
    expect(row.repeat).toBe("none");
    expect(eventFromRow(row)).toEqual(event);
  });

  it("normalises sloppy times on the way out", () => {
    const event: CalendarEvent = {
      id: crypto.randomUUID(), title: "x", date: "2026-10-16", startTime: "9:00", endTime: "", color: "blue",
    };
    const row = eventToRow(event, USER, T, null);
    expect(row.start_time).toBe("09:00");
    expect(row.end_time).toBe("00:00");
  });
});
