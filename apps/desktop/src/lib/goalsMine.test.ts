import { describe, expect, it } from "vitest";
import { goalsMineSections, quickGoalDraft, sortGoalRows } from "./goalsMine";
import type { Goal } from "@/types/planner";

const goal = (over: Partial<Goal>): Goal => ({
  id: crypto.randomUUID(),
  title: "Read",
  date: "2026-10-21",
  category: "should-do",
  repeat: "none",
  completed: false,
  notificationsEnabled: false,
  notificationMessage: "",
  ...over,
});
const now = new Date(2026, 9, 21, 12);

describe("Goals Mine sections", () => {
  it("marks only unfinished past one-offs as overdue, retaining their own date", () => {
    const sections = goalsMineSections([
      goal({ id: "past", date: "2026-10-20" }),
      goal({ id: "today" }),
      goal({ id: "future", date: "2026-10-22" }),
      goal({ id: "done", date: "2026-10-20", completed: true }),
      goal({ id: "repeat", date: "2026-10-19", repeat: "daily", completedDates: ["2026-10-20"] }),
    ], now, { weekStart: 1 });
    const overdue = sections.flatMap(section => section.rows).filter(row => row.overdue);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({ goal: { id: "past" }, date: "2026-10-20", done: false, rule: false });
    expect(sections[0].rows).toHaveLength(3);
  });
  it("separates recurring rules from today's ticks and dated history", () => {
    const repeat = goal({
      repeat: "daily",
      date: "2026-10-19",
      completedDates: ["2026-10-19", "2026-10-20"],
    });
    const sections = goalsMineSections(
      [
        repeat,
        goal({ title: "Overdue", date: "2026-10-20" }),
        goal({ title: "Future", date: "2026-10-24" }),
        goal({ title: "Past done", date: "2026-10-18", completed: true }),
      ],
      now,
      { weekStart: 1 },
    );
    expect(sections[0].rows.map((r) => r.goal.title)).toEqual([
      "Read",
      "Overdue",
    ]);
    expect(sections[1].rows.map((r) => r.goal.title)).toEqual(["Future"]);
    expect(sections[2].rows[0]).toMatchObject({
      goal: repeat,
      rule: true,
      done: false,
    });
    expect(sections[3].rows.map((r) => r.date)).toEqual([
      "2026-10-19",
      "2026-10-20",
    ]);
    expect(
      new Set(sections.flatMap((s) => s.rows.map((r) => r.key))).size,
    ).toBe(6);
  });
  it("sorts without mutating the section and keeps untimed after timed goals", () => {
    const rows = goalsMineSections(
      [
        goal({ title: "Untimed", category: "must-do" }),
        goal({ title: "Timed", time: "09:00", category: "nice-to-have" }),
      ],
      now,
      { weekStart: 0 },
    )[0].rows;
    expect(sortGoalRows(rows, "time")[0].goal.title).toBe("Timed");
    expect(sortGoalRows(rows, "priority")[0].goal.title).toBe("Untimed");
    expect(rows[0].goal.title).toBe("Untimed");
  });
  it("maps quick-add priority/repeat/time to the actual dialog shape", () => {
    expect(quickGoalDraft("Gym daily 18:00 !must", now)).toMatchObject({
      complete: true,
      draft: {
        title: "Gym",
        category: "must-do",
        repeat: "daily",
        time: "18:00",
        date: "2026-10-21",
      },
    });
    expect(quickGoalDraft("Gym 25:00", now).complete).toBe(false);
  });
  it("keeps distant scheduled goals reachable and historical completions free of today's reminder", () => {
    const sections = goalsMineSections(
      [
        goal({ date: "2027-01-01" }),
        goal({
          date: "2026-10-19",
          repeat: "daily",
          time: "09:00",
          notificationsEnabled: true,
          completedDates: ["2026-10-20"],
        }),
      ],
      now,
      { weekStart: 1 },
    );
    expect(sections[1].rows[0].date).toBe("2027-01-01");
    expect(sections[0].rows[0].reminder).toBe(true);
    expect(sections[3].rows[0].reminder).toBe(false);
  });
});
