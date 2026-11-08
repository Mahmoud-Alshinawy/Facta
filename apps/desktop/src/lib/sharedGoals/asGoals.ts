// Shared goals shown as goals. Everything here is derived from the shared
// cache at render time; no personal copy is ever stored or synced.
import type { SharedState } from "@/lib/sync/shared/state";
import type { CheckinIntent } from "@/lib/sync/shared/outbox";
import { sharedGroupView, type SharedGroupView } from "./view";

/**
 * "due": counts towards today's total. "optional": a weekly-count goal with
 * enough days left; counts only once ticked. "met": this week's target is
 * already reached; counts only once ticked.
 */
export type SharedDue = "due" | "optional" | "met";

export interface SharedTodayItem {
  id: string;
  groupId: string;
  title: string;
  /** The group's own date for today, in the group's zone. */
  day: string;
  due: SharedDue;
  /** Checked, counting a queued check-in; a refused one falls back to the saved row. */
  done: boolean;
  pending: boolean;
  canCheck: boolean;
  weekDone: number;
  weekTarget: number;
  /** Display names of the other current members. */
  others: string[];
  /** Refused check-ins for this group, for Try again or Discard on the row. */
  failed: CheckinIntent[];
  view: SharedGroupView;
}

const DAY = 86_400_000;
const days = (from: string, until: string) =>
  Math.round((Date.parse(until) - Date.parse(from)) / DAY);

function todayItem(
  state: SharedState,
  view: SharedGroupView,
  userId: string,
): SharedTodayItem | null {
  if (view.phase !== "active" || !view.eligible || view.rest || !view.current)
    return null;
  const s = state.cache!.snapshot;
  const savedToday = s.checkins.some(
    (c) =>
      c.membershipId === view.member.id &&
      c.checkinDate === view.today &&
      c.completed,
  );
  // The server's count may already include today's saved check-in.
  const before = Math.max(
    0,
    (view.ownScore?.completedDays ?? 0) - (savedToday ? 1 : 0),
  );
  const target = view.effectiveTarget ?? 7;
  const fixedDays =
    view.group.template !== "gym" &&
    (view.group.scheduleKind === "every" || view.group.scheduleKind === "days");
  const due: SharedDue = fixedDays
    ? "due"
    : before >= target
      ? "met"
      : days(view.today, view.current.roundEnd) <= target - before
        ? "due"
        : "optional";
  const names = new Map(s.profiles.map((p) => [p.userId, p.displayName]));
  return {
    id: `shared:${view.group.id}`,
    groupId: view.group.id,
    title: view.group.name,
    day: view.today,
    due,
    done: view.checked,
    pending: view.pending,
    canCheck: view.canCheck,
    weekDone: before + (view.checked ? 1 : 0),
    weekTarget: target,
    others: view.members
      .filter((m) => m.userId !== userId && !m.leftAt)
      .map((m) => names.get(m.userId) ?? "Someone"),
    failed: view.failed,
    view,
  };
}

/** One item per group you're in that has today in an active week. */
export function sharedTodayItems(
  state: SharedState,
  userId: string,
  now: number,
): SharedTodayItem[] {
  if (state.userId !== userId || !state.cache) return [];
  return state.cache.snapshot.groups
    .filter((g) => g.publishedAt && !g.deletedAt)
    .flatMap((g) => {
      const view = sharedGroupView(state, userId, g.id, now);
      const item = view && todayItem(state, view, userId);
      return item ? [item] : [];
    });
}

/** "Tue 20 Oct" for a calendar date. */
const shortDay = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(Date.parse(`${date}T12:00:00Z`))
    .replace(",", "");

/** "with Ana, Ben +1 · 2 of 4 this week", plus the group's day when it isn't yours. */
export function sharedSubline(item: SharedTodayItem, localDay: string): string {
  const shown = item.others.slice(0, 2).join(", "),
    more = item.others.length - 2;
  return [
    item.others.length ? `with ${shown}${more > 0 ? ` +${more}` : ""}` : null,
    `${item.weekDone} of ${item.weekTarget} this week`,
    item.due === "met" ? "target met" : null,
    item.day !== localDay ? `for ${shortDay(item.day)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "N of M done today": due shared goals always count, others once ticked. */
export function combineDay(
  plan: { done: number; total: number },
  items: readonly Pick<SharedTodayItem, "id" | "due" | "done">[],
): { done: number; total: number; counted: string[] } {
  const counted = items.filter((i) => i.due === "due" || i.done);
  return {
    done: plan.done + counted.filter((i) => i.done).length,
    total: plan.total + counted.length,
    counted: counted.map((i) => i.id),
  };
}
