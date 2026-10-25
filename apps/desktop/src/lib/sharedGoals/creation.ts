import type { SharedDraftFields, SharedGroup } from "@/types/sharedGoals";
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const ICONS = [
  "dumbbell",
  "book",
  "run",
  "bulb",
  "drop",
  "moon",
  "goals",
  "flame",
];
export function creationFields(
  roundWeekday: number,
  timeZone: string,
): SharedDraftFields {
  return {
    name: "",
    icon: "dumbbell",
    template: "gym",
    schedule_kind: "n",
    weekdays: [],
    times_per_week: null,
    target: 3,
    time_zone: timeZone,
    round_weekday: roundWeekday,
  };
}
export function groupFields(
  g: SharedGroup,
  target: number | null,
): SharedDraftFields {
  return {
    name: g.name,
    icon: g.icon,
    template: g.template as "gym" | "custom",
    schedule_kind: g.scheduleKind as "every" | "days" | "n",
    weekdays: g.weekdays,
    times_per_week: g.timesPerWeek,
    target,
    time_zone: g.timeZone,
    round_weekday: g.roundWeekday,
  };
}
export function validateProfile(handle: string, name: string): string | null {
  return !/^[a-z0-9_]{3,24}$/.test(handle)
    ? "Use 3–24 lowercase letters, numbers or underscores."
    : !name.trim() || name.trim().length > 80
      ? "Enter a display name of 1–80 characters."
      : null;
}
export function validateCreation(f: SharedDraftFields): string | null {
  if (!f.name.trim() || f.name.trim().length > 120)
    return "Give it a name of 1–120 characters.";
  if (!ICONS.includes(f.icon ?? "goals")) return "Choose an icon.";
  try {
    new Intl.DateTimeFormat("en", { timeZone: f.time_zone });
  } catch {
    return "Choose a valid IANA time zone.";
  }
  if (
    !Number.isInteger(f.round_weekday) ||
    f.round_weekday < 0 ||
    f.round_weekday > 6
  )
    return "Choose when rounds start.";
  if (f.template === "gym")
    return Number.isInteger(f.target) &&
      f.target! >= 2 &&
      f.target! <= 7 &&
      f.schedule_kind === "n" &&
      f.times_per_week == null &&
      !f.weekdays?.length
      ? null
      : "Gym targets must be 2–7 days a week.";
  if (f.template !== "custom" || f.target != null)
    return "Choose a shared Custom schedule.";
  if (f.schedule_kind === "days")
    return f.weekdays?.length &&
      f.weekdays.length <= 7 &&
      new Set(f.weekdays).size === f.weekdays.length &&
      f.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
      f.times_per_week == null
      ? null
      : "Pick at least one weekday.";
  if (f.weekdays?.length)
    return "Use weekdays only for a specific-day schedule.";
  if (f.schedule_kind === "every")
    return f.times_per_week == null
      ? null
      : "Every day uses the same daily schedule.";
  return f.schedule_kind === "n" &&
    Number.isInteger(f.times_per_week) &&
    f.times_per_week! >= 1 &&
    f.times_per_week! <= 7
    ? null
    : "Choose 1–7 days per week.";
}
export function scheduleText(
  f: Pick<
    SharedDraftFields,
    "template" | "schedule_kind" | "weekdays" | "times_per_week"
  >,
) {
  return f.template === "gym"
    ? "Everyone chooses 2–7 days per week"
    : f.schedule_kind === "every"
      ? "Every day · same for everyone"
      : f.schedule_kind === "days"
        ? (f.weekdays ?? []).map((d) => WEEKDAYS[d].slice(0, 3)).join(", ") +
          " · same for everyone"
        : `${f.times_per_week} days a week · same for everyone`;
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(date + "T12:00:00Z"))
    .replace(",", "");
}
export function outcomeText(code: string): string {
  return (
    (
      {
        handle_taken: "That username is taken. Try another.",
        handle_immutable: "Your username cannot be changed.",
        rate_limited: "Too many attempts. Wait before making a new request.",
        full: "This goal is full (8 people). Ask the owner about a seat.",
        invalid_invite:
          "This invitation is invalid, expired or revoked. Ask for a new link.",
        expired: "This invitation has expired. Ask for a new link.",
        revoked: "This invitation was revoked. Ask for a new link.",
        declined: "This invitation was declined.",
        archived: "This goal has been archived and cannot accept people.",
        not_published:
          "This goal is not published yet. Ask the owner to finish creating it.",
        not_found: "That username could not be found.",
        already_invited: "This person already has a pending invitation.",
        already_joined: "You are already a member of this goal.",
        profile_required: "Set up your shared profile first.",
        forbidden: "This action is unavailable for this account.",
        conflict:
          "The draft changed. Review its current details before trying again.",
        confirmation_required:
          "The first round or draft changed. Review the updated date before confirming.",
        initial_target_required: "Choose at least 2 days per week.",
        command_mismatch:
          "This request identity does not match. Refresh and review before a new attempt.",
      } as Record<string, string>
    )[code] ?? code.replaceAll("_", " ")
  );
}
