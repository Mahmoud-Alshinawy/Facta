import { describe, expect, it } from "vitest";
import { eventOccursOn, spanLanes } from "@facta/calendar";
import { allDaySpans, clockValue, durationText, eventMinutes, goalsOn, isoWeek, keyOf, noonOf, splitDay, toggledOn } from "./calendarData";
import type { CalendarEvent, Goal } from "@/types/planner";

const goal = (over: Partial<Goal>): Goal => ({
  id: "g", title: "G", category: "should-do", date: "2026-10-17", completed: false,
  notificationsEnabled: false, notificationMessage: "", ...over,
});
const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e", title: "E", date: "2026-10-17", startTime: "10:00", endTime: "11:30", color: "blue", ...over,
});

describe("calendarData", () => {
  it("days and keys round-trip at local noon", () => {
    expect(keyOf(noonOf("2026-10-17"))).toBe("2026-10-17");
    expect(noonOf("2026-03-29").getHours()).toBe(12);
  });

  it("goals on a day carry their done state and time", () => {
    const daily = goal({ id: "d", repeat: "daily", date: "2026-10-01", completedDates: ["2026-10-16"], time: "18:00" });
    const once = goal({ id: "o", date: "2026-10-17", completed: true });
    const other = goal({ id: "x", date: "2026-10-18" });
    const on16 = goalsOn([daily, once, other], "2026-10-16");
    expect(on16.map((g) => [g.goal.id, g.done, g.at])).toEqual([["d", true, 1080]]);
    const on17 = goalsOn([daily, once, other], "2026-10-17");
    expect(on17.map((g) => [g.goal.id, g.done, g.at])).toEqual([["d", false, 1080], ["o", true, null]]);
  });

  it("ticking a repeating goal marks only that day", () => {
    const daily = goal({ repeat: "daily", date: "2026-10-01", completedDates: [] });
    expect(toggledOn(daily, "2026-10-14").completedDates).toEqual(["2026-10-14"]);
    expect(toggledOn(goal({}), "2026-10-14")).toEqual({ completed: true, completedDates: undefined });
  });

  it("event minutes: 23:59 is the end of the day, a bad end becomes 30 minutes", () => {
    expect(eventMinutes(event({}))).toEqual({ start: 600, end: 690 });
    expect(eventMinutes(event({ startTime: "22:00", endTime: "23:59" }))).toEqual({ start: 1320, end: 1440 });
    expect(eventMinutes(event({ startTime: "10:00", endTime: "09:00" }))).toEqual({ start: 600, end: 630 });
  });

  it("splits all-day from timed, timed sorted by start then longest", () => {
    const r = splitDay([
      event({ id: "b", startTime: "12:00", endTime: "13:00" }),
      event({ id: "ad", allDay: true }),
      event({ id: "a", startTime: "12:00", endTime: "15:00" }),
      event({ id: "c", startTime: "09:00", endTime: "10:00" }),
    ]);
    expect(r.allDay.map((e) => e.id)).toEqual(["ad"]);
    expect(r.timed.map((t) => t.event.id)).toEqual(["c", "a", "b"]);
  });

  it("formats clock values, durations and ISO weeks", () => {
    expect(clockValue(0)).toBe("00:00");
    expect(clockValue(1440)).toBe("23:59");
    expect(clockValue(13 * 60 + 5)).toBe("13:05");
    expect(durationText(90)).toBe("1h 30m");
    expect(durationText(45)).toBe("45m");
    expect(durationText(120)).toBe("2h");
    expect(isoWeek(new Date(2026, 9, 17))).toBe(42);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  });
});

describe("allDaySpans", () => {
  const week = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"];
  it("joins consecutive days of one event and looks past the edges", () => {
    const daily = event({ id: "ex", allDay: true });
    const on = (k: string) => (k >= "2026-10-12" && k <= "2026-10-18" ? [daily] : k === "2026-10-14" ? [] : []);
    const spans = allDaySpans(week, on);
    expect(spans.map((s) => [s.id, s.first, s.last])).toEqual([["ex:2026-10-12", "2026-10-12", "2026-10-18"]]);
  });
  it("breaks a run on a gap, ignores timed events and runs outside the row", () => {
    const e = event({ id: "w", allDay: true });
    const timed = event({ id: "t" });
    const on = (k: string) => (["2026-10-10", "2026-10-12", "2026-10-13", "2026-10-15"].includes(k) ? [e, timed] : []);
    const spans = allDaySpans(week, on);
    expect(spans.map((s) => [s.first, s.last])).toEqual([["2026-10-12", "2026-10-13"], ["2026-10-15", "2026-10-15"]]);
  });
});

describe("multi-day calendar data",()=>{
  it("clips timed continuations while keeping canonical records for editing",()=>{
    const e=event({date:"2026-10-22",endDate:"2026-10-24",startTime:"20:00",endTime:"09:00"});
    expect(splitDay([e],"2026-10-23").timed).toEqual([{id:e.id,event:e,start:0,end:1440}]);
    expect(splitDay([e],"2026-10-24").timed[0]).toMatchObject({start:0,end:540});
    expect(e.date).toBe("2026-10-22");expect(e.startTime).toBe("20:00");
  });
  it("gives disjoint recurring pieces unique layout keys",()=>{
    const e=event({date:"2026-10-22",endDate:"2026-10-23",startTime:"20:00",endTime:"09:00",repeat:"daily"});
    const pieces=splitDay([e],"2026-10-23").timed;
    expect(pieces.map(t=>[t.start,t.end])).toEqual([[0,540],[1200,1440]]);
    expect(new Set(pieces.map(t=>t.id)).size).toBe(2);
    expect(pieces.every(t=>t.event===e)).toBe(true);
  });
  it("joins a real inclusive span and continues correctly across week/month/year edges",()=>{
    const e=event({allDay:true,date:"2026-12-30",endDate:"2027-01-04"});
    const keys=["2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02","2027-01-03"];
    const on=(key:string)=>eventOccursOn(e,key)?[e]:[];
    const spans=allDaySpans(keys,on);
    expect(spanLanes(spans,keys).segments[0]).toMatchObject({from:2,to:6,contL:false,contR:true});
    const next=["2027-01-04","2027-01-05","2027-01-06","2027-01-07","2027-01-08","2027-01-09","2027-01-10"];
    expect(spanLanes(allDaySpans(next,on),next).segments[0]).toMatchObject({from:0,to:0,contL:true,contR:false});
  });
});


describe("timed spanning band", () => {
  it("moves a 24h event out of every grid portion, retains its canonical times, and joins its bar", () => {
    const e = event({ date:"2026-10-22", endDate:"2026-10-23", startTime:"10:00", endTime:"10:00" });
    for (const key of [e.date, e.endDate!]) {
      expect(splitDay([e],key,true)).toEqual({ allDay:[e], timed:[] });
      expect(splitDay([e],key).timed).toHaveLength(1); // Today/Agenda keep timed semantics.
    }
    expect(e.allDay).toBeUndefined();
    const keys=["2026-10-22","2026-10-23"];
    expect(spanLanes(allDaySpans(keys,k=>eventOccursOn(e,k)?[e]:[]),keys).segments[0]).toMatchObject({from:0,to:1});
  });
  it("keeps a 22:00–02:00 overnight in split grid segments", () => {
    const e=event({date:"2026-10-22",endDate:"2026-10-23",startTime:"22:00",endTime:"02:00"});
    expect(splitDay([e],e.date,true).timed[0]).toMatchObject({start:1320,end:1440});
    expect(splitDay([e],e.endDate,true).timed[0]).toMatchObject({start:0,end:120});
    expect(allDaySpans([e.date,e.endDate!],k=>eventOccursOn(e,k)?[e]:[])).toEqual([]);
  });
});
