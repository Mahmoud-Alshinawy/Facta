// Shared date planning for disposable acceptance fixtures (not product code).
import {
  addDays,
  groupDate,
  nextRoundDate,
  roundInterval,
} from "../lib/sharedGoals/dates.ts";

export function publicationDate(
  now: number,
  zone: string,
  weekday: number,
): string {
  return nextRoundDate(now, zone, weekday);
}

export function nativeScoringPlan(now: number, zone = "Asia/Riyadh") {
  const createdAt = new Date(now - 14 * 86400000).toISOString();
  const today = groupDate(now, zone),
    seedDate = addDays(today, -1);
  const roundWeekday = new Date(`${seedDate}T00:00:00Z`).getUTCDay();
  const seedCapturedAt = new Date(
    Date.parse(roundInterval(seedDate, zone).start) + 12 * 3600000,
  ).toISOString();
  if (
    groupDate(seedCapturedAt, zone) !== seedDate ||
    Date.parse(seedCapturedAt) >= now
  )
    throw Error(
      "Fixture seed day cannot be captured before the action instant",
    );
  return {
    createdAt,
    creationDate: groupDate(createdAt, zone),
    today,
    roundWeekday,
    firstRoundDate: publicationDate(Date.parse(createdAt), zone, roundWeekday),
    seedDate,
    seedCapturedAt,
    actionCapturedAt: new Date(now).toISOString(),
    zone,
  };
}
