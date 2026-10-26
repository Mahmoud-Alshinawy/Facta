import {
  emptySharedWidgetExport,
  SHARED_EXPORT_BYTES,
  SHARED_EXPORT_GROUPS,
  type SharedProgress,
  type SharedWidgetExport,
} from "@facta/calendar";
import type { SharedState } from "@/lib/sync/shared/state";
import { sharedGroupView, type SharedGroupView } from "./view";
export type { SharedProgress } from "@facta/calendar";
export function sharedProgressChoices(
  state: SharedState,
  userId: string,
  now: number,
) {
  if (state.userId !== userId || !state.cache) return [];
  return state.cache.snapshot.groups
    .filter((g) => g.publishedAt && !g.deletedAt)
    .flatMap((g) => {
      const v = sharedGroupView(state, userId, g.id, now);
      return v ? [v] : [];
    })
    .sort(
      (a, b) =>
        Number(b.phase === "active") - Number(a.phase === "active") ||
        a.group.createdAt.localeCompare(b.group.createdAt) ||
        a.group.id.localeCompare(b.group.id),
    );
}
/** Same lifecycle/coverage as Shared. Only server values enter the small handoff. */
export function projectSharedProgress(
  state: SharedState,
  userId: string,
  now: number,
  selectedGroupId?: string,
): SharedProgress | null {
  const choices = sharedProgressChoices(state, userId, now);
  const view = selectedGroupId
    ? choices.find((v) => v.group.id === selectedGroupId)
    : choices[0];
  if (!view) return null;
  return projectSharedView(view, userId);
}
export function projectSharedView(
  view: SharedGroupView,
  userId: string,
): SharedProgress {
  const rows = view.scores.slice(0, 3),
    own = view.scores.find((s) => s.userId === userId);
  if (own && !rows.includes(own)) rows.push(own);
  return {
    groupId: view.group.id,
    revision: view.group.revision,
    name: view.group.name.slice(0, 120),
    timeZone: view.group.timeZone,
    today: view.today,
    phase: view.phase as SharedProgress["phase"],
    reason: view.reason,
    confirmedAt: view.confirmedAt,
    archived: !!view.group.archivedAt,
    pending: view.intentions.length > 0,
    stale: view.stale,
    round: view.round
      ? {
          start: view.round.roundStart,
          end: view.round.roundEnd,
          activityEnd: view.round.activityEnd,
          endReason: view.round.endReason,
          active:
            view.phase === "active" &&
            view.round.roundStart === view.current?.roundStart,
          averagePct: view.scores[0]?.groupAveragePct ?? 0,
        }
      : null,
    rows: rows.map((s) => ({
      userId: s.userId,
      name: s.displayName.slice(0, 80),
      rank: s.rank,
      adherencePct: s.adherencePct,
      isAtLeast70: s.isAtLeast70,
      self: s.userId === userId,
      left: s.leftAt !== null,
      completedDays: s.completedDays,
      target: s.target,
    })),
  };
}
export function projectSharedWidgetExport(
  state: SharedState | null,
  userId: string | null,
  now: number,
  preferred: readonly string[] = [],
  offline = false,
): SharedWidgetExport {
  const data = emptySharedWidgetExport(userId);
  if (!userId || !state || state.userId !== userId || !state.cache)
    return { ...data, unavailable: !!userId };
  const choices = sharedProgressChoices(state, userId, now);
  const defaultId = choices[0]?.group.id ?? null;
  const preferredSet = new Set(preferred);
  const ordered = [
    ...choices.filter((v) => preferredSet.has(v.group.id)),
    ...choices.filter((v) => !preferredSet.has(v.group.id)),
  ];
  for (const v of ordered) {
    if (data.groups.length === SHARED_EXPORT_GROUPS) {
      data.truncated = true;
      break;
    }
    const group = projectSharedView(v, userId);
    group.stale ||= offline;
    const next = { ...data, groups: [...data.groups, group] };
    if (
      new TextEncoder().encode(JSON.stringify(next)).length >
      SHARED_EXPORT_BYTES - 128
    ) {
      data.truncated = true;
      break;
    }
    data.groups.push(group);
  }
  data.defaultGroupId = data.groups.some((g) => g.groupId === defaultId)
    ? defaultId
    : (data.groups[0]?.groupId ?? null);
  return data;
}
