// One-line parsers for the calendar's quick add ("Lunch with Alex Fri 1pm")
// and the goals add row ("Gym daily 18:00 !must"). Both pull the parts they
// recognise out of the text and keep the rest, tidied, as the title.
//
// Pure: "now" is a parameter, dates are local calendar days ("yyyy-MM-dd"),
// times are minutes since midnight.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const WEEKDAY_RE = "sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?";
const MONTH_RE = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function pad(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function weekdayIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3);
  return WEEKDAYS.findIndex((d) => d.startsWith(w));
}

function monthIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(w));
}

/** A real calendar day, or null for things like 31 Feb. */
function validDate(y: number, m: number, d: number): Date | null {
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
}

/** A day and month with no year: this year, or next year if it has passed. */
function nextDayMonth(today: Date, m: number, d: number): Date | null {
  const y = today.getFullYear();
  const dt = validDate(y, m, d);
  if (!dt) return validDate(y + 1, m, d);
  return dt < today ? validDate(y + 1, m, d) : dt;
}

/** Text with matched parts cut out. Cuts are replaced by a space. */
class Cutter {
  text: string;
  /** Something looked like a date or time but made no sense (31 Feb, 25:00). */
  bad = false;
  constructor(text: string) {
    this.text = ` ${text} `;
  }
  take(re: RegExp): RegExpMatchArray | null {
    const m = this.text.match(re);
    if (!m || m.index === undefined) return null;
    this.text = this.text.slice(0, m.index) + " " + this.text.slice(m.index + m[0].length);
    return m;
  }
  rest(): string {
    return this.text
      .replace(/\s+(?:at|on|for|from|by)\s*$/i, " ")
      .replace(/^\s*(?:at|on)\s+/i, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

// ---- dates ----------------------------------------------------------------

function takeDate(c: Cutter, today: Date): Date | null {
  let m: RegExpMatchArray | null;

  if ((m = c.take(/\s(?:on\s+)?(\d{4})-(\d{2})-(\d{2})(?=\s)/))) {
    const dt = validDate(+m[1], +m[2] - 1, +m[3]);
    if (!dt) c.bad = true;
    return dt;
  }
  if ((m = c.take(/\s(?:on\s+)?(today|tonight|tmrw?|tomorrow|tmw)(?=\s)/i))) {
    return /^to(day|night)/i.test(m[1]) ? today : addDays(today, 1);
  }
  if ((m = c.take(/\sin\s+(\d{1,3})\s+(day|days|week|weeks)(?=\s)/i))) {
    return addDays(today, +m[1] * (/^w/i.test(m[2]) ? 7 : 1));
  }
  if ((m = c.take(new RegExp(`\\s(?:on\\s+)?(next\\s+)?(${WEEKDAY_RE})(?=\\s|,)`, "i")))) {
    const target = weekdayIndex(m[2]);
    // "fri" is the coming Friday, today included; "next fri" skips today.
    let diff = (target - today.getDay() + 7) % 7;
    if (m[1] && diff === 0) diff = 7;
    return addDays(today, diff);
  }
  // 24 Oct, 24 October, 24th Oct
  if ((m = c.take(new RegExp(`\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?(?=\\s)`, "i")))) {
    const mo = monthIndex(m[2]);
    const dt = m[3] ? validDate(+m[3], mo, +m[1]) : nextDayMonth(today, mo, +m[1]);
    if (!dt) c.bad = true;
    return dt;
  }
  // Oct 24, October 24th
  if ((m = c.take(new RegExp(`\\s(?:on\\s+)?(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s)`, "i")))) {
    const mo = monthIndex(m[1]);
    const dt = m[3] ? validDate(+m[3], mo, +m[2]) : nextDayMonth(today, mo, +m[2]);
    if (!dt) c.bad = true;
    return dt;
  }
  // 24/10 or 24/10/2026: day first.
  if ((m = c.take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?=\s)/))) {
    const dt = m[3] ? validDate(+m[3], +m[2] - 1, +m[1]) : nextDayMonth(today, +m[2] - 1, +m[1]);
    if (!dt) c.bad = true;
    return dt;
  }
  return null;
}

// ---- times ----------------------------------------------------------------

function clock(h: number, min: number, ap?: string): number | null {
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    const pm = /^p/i.test(ap);
    return ((h % 12) + (pm ? 12 : 0)) * 60 + min;
  }
  if (h > 23) return null;
  return h * 60 + min;
}

interface TimeHit {
  start: number;
  end?: number;
}

const AP = "(a\\.?m\\.?|p\\.?m\\.?|a|p)";

function takeTime(c: Cutter): TimeHit | null {
  let m: RegExpMatchArray | null;

  // Ranges: 1-3pm, 1pm-3pm, 13:00-14:30, 9:30am–11
  m = c.take(new RegExp(`\\s(?:from\\s+|at\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*${AP}?\\s*(?:-|–|to|until|till)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*${AP}?(?=\\s)`, "i"));
  if (m) {
    const ap2 = m[6];
    const ap1 = m[3];
    let start = clock(+m[1], +(m[2] ?? 0), ap1);
    const end = clock(+m[4], +(m[5] ?? 0), ap2);
    if (start !== null && end !== null && !ap1 && ap2) {
      // "1-3pm": the start takes the end's half of the day when that keeps it first.
      const alt = clock(+m[1], +(m[2] ?? 0), ap2);
      if (alt !== null && alt < end) start = alt;
    }
    if (start === null || end === null || end <= start) { c.bad = true; return null; }
    return { start, end };
  }
  if ((m = c.take(/\s(?:at\s+)?(noon|midday)(?=\s)/i))) return { start: 12 * 60 };
  if ((m = c.take(/\s(?:at\s+)?midnight(?=\s)/i))) return { start: 0 };
  // 1pm, 1:30pm, 1.30 pm
  if ((m = c.take(new RegExp(`\\s(?:at\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*${AP}(?=\\s)`, "i")))) {
    const t = clock(+m[1], +(m[2] ?? 0), m[3]);
    if (t === null) { c.bad = true; return null; }
    return { start: t };
  }
  // 13:00, 9:30
  if ((m = c.take(/\s(?:at\s+)?(\d{1,2}):(\d{2})(?=\s)/))) {
    const t = clock(+m[1], +m[2]);
    if (t === null) { c.bad = true; return null; }
    return { start: t };
  }
  // at 7 (a bare hour needs "at" so "Read 20 pages" stays a title)
  if ((m = c.take(/\sat\s+(\d{1,2})(?=\s)/i))) {
    const t = clock(+m[1], 0);
    if (t === null) { c.bad = true; return null; }
    return { start: t };
  }
  return null;
}

function takeDuration(c: Cutter): number | null {
  let m: RegExpMatchArray | null;
  // for 1h30, for 1h 30m, 1h30m
  if ((m = c.take(/\s(?:for\s+)?(\d{1,2})\s*h(?:rs?|ours?)?\s*(\d{1,2})\s*(?:m|min|mins|minutes)?(?=\s)/i))) {
    return +m[1] * 60 + +m[2];
  }
  if ((m = c.take(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)(?=\s)/i))) {
    return Math.round(parseFloat(m[1]) * 60);
  }
  if ((m = c.take(/\s(?:for\s+)?(\d{1,3})\s*(m|min|mins|minute|minutes)(?=\s)/i))) {
    return +m[1];
  }
  return null;
}

// ---- the calendar quick add -------------------------------------------------

export interface QuickEvent {
  title: string;
  /** "yyyy-MM-dd": the day named in the text, else the default day. */
  date: string;
  /** Whether the text named a day. */
  hadDate: boolean;
  allDay: boolean;
  /** Minutes since midnight; null when no time was given. */
  start: number | null;
  end: number | null;
  /**
   * True when the line is enough to create the event straight away: a title,
   * and either a time or "all day". Anything else opens the full dialog,
   * filled in with what was understood.
   */
  complete: boolean;
}

export const DEFAULT_EVENT_MINUTES = 60;

export function parseQuickEvent(text: string, now: Date, defaultDate?: Date): QuickEvent {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const c = new Cutter(text);
  const allDay = !!c.take(/\s(all[\s-]?day)(?=\s)/i);
  const date = takeDate(c, today);
  const time = allDay ? null : takeTime(c);
  const dur = allDay ? null : takeDuration(c);
  const title = c.rest();
  let start: number | null = null;
  let end: number | null = null;
  if (time) {
    start = time.start;
    end = time.end ?? Math.min(24 * 60, start + (dur ?? DEFAULT_EVENT_MINUTES));
    if (end <= start) end = Math.min(24 * 60, start + DEFAULT_EVENT_MINUTES);
  }
  const day = date ?? defaultDate ?? today;
  return {
    title,
    date: dayKey(day),
    hadDate: !!date,
    allDay,
    start,
    end,
    complete: !c.bad && title.length > 0 && (allDay || start !== null),
  };
}

// ---- the goals add row ------------------------------------------------------

export type QuickPriority = "must" | "should" | "nice";
export type QuickRepeat = "none" | "daily" | "weekdays" | "weekly" | "custom";

export interface QuickGoal {
  title: string;
  priority: QuickPriority;
  /** "HH:mm", or "" for no time. */
  time: string;
  date: string;
  hadDate: boolean;
  repeat: QuickRepeat;
  /** getDay numbers for a custom repeat ("every mon wed"). */
  repeatDays: number[];
  /** A title and nothing that looked wrong: add it straight away. */
  complete: boolean;
}

export function parseQuickGoal(text: string, now: Date): QuickGoal {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const c = new Cutter(text);
  let priority: QuickPriority = "should";
  const p = c.take(/\s!(must|should|nice|1|2|3)(?=\s)/i);
  if (p) {
    const v = p[1].toLowerCase();
    priority = v === "must" || v === "1" ? "must" : v === "nice" || v === "3" ? "nice" : "should";
  }
  let repeat: QuickRepeat = "none";
  let repeatDays: number[] = [];
  let m: RegExpMatchArray | null;
  if ((m = c.take(/\s(daily|every\s*day|each\s+day)(?=\s)/i))) repeat = "daily";
  else if ((m = c.take(/\s(weekdays|every\s+weekday)(?=\s)/i))) repeat = "weekdays";
  else if ((m = c.take(/\s(weekly|every\s+week)(?=\s)/i))) repeat = "weekly";
  else if ((m = c.take(new RegExp(`\\s(?:every|each)\\s+((?:(?:${WEEKDAY_RE})(?:\\s*(?:,|and|&)\\s*|\\s+))*(?:${WEEKDAY_RE}))(?=\\s)`, "i")))) {
    const days = m[1].split(/[\s,&]+|and/i).filter(Boolean).map(weekdayIndex).filter((d) => d >= 0);
    repeatDays = [...new Set(days)].sort((a, b) => a - b);
    repeat = repeatDays.length === 1 ? "weekly" : "custom";
  }
  const date = takeDate(c, today);
  const time = takeTime(c);
  const title = c.rest();
  // A weekly repeat named by its day starts on that day's next occurrence.
  let day = date ?? today;
  if (!date && repeat === "weekly" && repeatDays.length === 1) {
    day = addDays(today, (repeatDays[0] - today.getDay() + 7) % 7);
    repeatDays = [];
  }
  if (!date && repeat === "custom" && repeatDays.length && !repeatDays.includes(today.getDay())) {
    const next = Array.from({ length: 7 }, (_, i) => addDays(today, i)).find((d) => repeatDays.includes(d.getDay()));
    if (next) day = next;
  }
  return {
    title,
    priority,
    time: time ? `${pad(Math.floor(time.start / 60))}:${pad(time.start % 60)}` : "",
    date: dayKey(day),
    hadDate: !!date,
    repeat,
    repeatDays,
    complete: !c.bad && title.length > 0,
  };
}
