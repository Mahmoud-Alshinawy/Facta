import type { SharedState } from "@/lib/sync/shared/state";

export interface SharedProgress {
  groupId: string;
  name: string;
  timeZone: string;
  confirmedAt: number | null;
  archived: boolean;
  pending: boolean;
  stale: boolean;
  round: {
    start: string;
    end: string;
    activityEnd: string;
    endReason: string;
    active: boolean;
    averagePct: number;
  } | null;
  rows: {
    userId: string;
    name: string;
    rank: number;
    adherencePct: number;
    isAtLeast70: boolean;
    self: boolean;
    left: boolean;
  }[];
}

/** Data-only handoff for Today/Progress. Call after store.flush and recheck the
 * active account before exporting. Native/widget wiring belongs to Step 5.
 * Missing rounds never become synthetic 0% rows; all scores/ranks come from SQL. */
export function projectSharedProgress(
  state: SharedState,
  userId: string,
  now: number,
  selectedGroupId?: string,
): SharedProgress | null {
  if (state.userId !== userId || !state.cache) return null;
  const { snapshot, windows } = state.cache;
  const active = (id: string) =>
    snapshot.rounds.some(
      (r) =>
        r.groupId === id &&
        r.isActive &&
        Date.parse(r.activityStart) <= now &&
        now < Date.parse(r.activityEnd),
    );
  const groups = snapshot.groups.filter(
    (g) =>
      g.publishedAt &&
      !g.deletedAt &&
      snapshot.memberships.some(
        (m) =>
          m.groupId === g.id &&
          m.userId === userId &&
          !m.leftAt &&
          !m.deletedAt,
      ),
  );
  groups.sort(
    (a, b) =>
      Number(active(b.id)) - Number(active(a.id)) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  const group = selectedGroupId
    ? groups.find((g) => g.id === selectedGroupId)
    : groups[0];
  if (!group) return null;
  const latest = snapshot.rounds
    .filter((r) => r.groupId === group.id && Date.parse(r.activityStart) <= now)
    .sort((a, b) => b.roundStart.localeCompare(a.roundStart))[0];
  const confirmedAt = windows.reduce<number | null>((newest, window) => {
    if (
      !latest ||
      window.versions[group.id] !== group.revision ||
      window.from > latest.roundStart ||
      window.until < latest.roundStart
    )
      return newest;
    return newest === null
      ? window.confirmedAt
      : Math.max(newest, window.confirmedAt);
  }, null);
  const scores = latest
    ? snapshot.scores
        .filter(
          (s) => s.groupId === group.id && s.roundStart === latest.roundStart,
        )
        .sort((a, b) => a.rank - b.rank || a.userId.localeCompare(b.userId))
    : [];
  const rows = scores.slice(0, 3);
  const own = scores.find((s) => s.userId === userId);
  if (own && !rows.includes(own)) rows.push(own);
  const pending = state.outbox.some((e) => e.groupId === group.id);
  return {
    groupId: group.id,
    name: group.name.slice(0, 120),
    timeZone: group.timeZone,
    confirmedAt,
    archived: group.archivedAt !== null,
    pending,
    stale:
      state.needsRefresh ||
      !latest ||
      confirmedAt === null ||
      now < confirmedAt ||
      now - confirmedAt > 120_000 ||
      (latest.isActive && now >= Date.parse(latest.activityEnd)),
    round: latest
      ? {
          start: latest.roundStart,
          end: latest.roundEnd,
          activityEnd: latest.activityEnd,
          endReason: latest.endReason,
          active: active(group.id),
          averagePct: scores[0].groupAveragePct,
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
    })),
  };
}
