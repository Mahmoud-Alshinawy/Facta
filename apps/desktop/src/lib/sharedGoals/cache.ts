import type {
  SharedSnapshot,
  HistoryRange,
  SharedOutcome,
} from "@/types/sharedGoals";
import { freeze } from "./contracts";
export interface HistoryWindow extends HistoryRange {
  confirmedAt: number;
  versions: Record<string, number>;
}
export interface SharedCache {
  snapshot: SharedSnapshot;
  confirmedAt: number;
  windows: HistoryWindow[];
}

/** A confirmed leave revokes this group immediately, even if the next read
 * fails. Keep confirmation times for surviving data unchanged. */
export function forgetGroup(
  cache: SharedCache | null,
  groupId: string,
  userId: string,
): SharedCache | null {
  if (!cache) return null;
  const members = cache.snapshot.memberships.filter(
    (m) => m.groupId !== groupId,
  );
  const memberIds = new Set(members.map((m) => m.id));
  const invites = cache.snapshot.invites.filter((i) => i.groupId !== groupId);
  const profileIds = new Set([
    userId,
    ...members.map((m) => m.userId),
    ...invites.flatMap((i) => (i.recipientId ? [i.recipientId] : [])),
  ]);
  const snapshot = {
    ...cache.snapshot,
    groups: cache.snapshot.groups.filter((g) => g.id !== groupId),
    ...(cache.snapshot.lifecycle && {
      lifecycle: cache.snapshot.lifecycle.filter((l) => l.groupId !== groupId),
    }),
    memberships: members,
    invites,
    profiles: cache.snapshot.profiles.filter((p) => profileIds.has(p.userId)),
    targets: cache.snapshot.targets.filter((t) =>
      memberIds.has(t.membershipId),
    ),
    checkins: cache.snapshot.checkins.filter((c) => c.groupId !== groupId),
    rounds: cache.snapshot.rounds.filter((r) => r.groupId !== groupId),
    scores: cache.snapshot.scores.filter((s) => s.groupId !== groupId),
  };
  const windows = cache.windows.flatMap((w) => {
    const versions = Object.fromEntries(
      Object.entries(w.versions).filter(([id]) => id !== groupId),
    );
    return Object.keys(versions).length ? [{ ...w, versions }] : [];
  });
  return freeze({ ...cache, snapshot, windows });
}

/** An accepted check-in is the server's answer for that day, so the cached row
 * takes its id, revision and checked state at once instead of showing the old
 * row until the next read. Scores still wait for that read. A row already at a
 * later revision is newer than this answer and stays. */
export function confirmCheckin(
  cache: SharedCache | null,
  intent: {
    groupId: string;
    membershipId: string;
    userId: string;
    date: string;
    capturedAt: string;
  },
  outcome: SharedOutcome,
  now: number,
): SharedCache | null {
  if (
    !cache ||
    !outcome.ok ||
    outcome.code !== "checked" ||
    !outcome.id ||
    outcome.revision === undefined ||
    outcome.completed === undefined
  )
    return cache;
  const old = cache.snapshot.checkins.find(
    (c) =>
      c.membershipId === intent.membershipId && c.checkinDate === intent.date,
  );
  if (old && old.revision > outcome.revision) return cache;
  // A first check-in has no row yet; its times are placeholders the next read
  // replaces. The server clamps a stamp from a clock ahead to its own time.
  const stamp = new Date(now).toISOString();
  const row = old
    ? {
        ...old,
        id: outcome.id,
        revision: outcome.revision,
        completed: outcome.completed,
      }
    : {
        id: outcome.id,
        groupId: intent.groupId,
        userId: intent.userId,
        membershipId: intent.membershipId,
        checkinDate: intent.date,
        completed: outcome.completed,
        capturedAt: intent.capturedAt < stamp ? intent.capturedAt : stamp,
        createdAt: stamp,
        updatedAt: stamp,
        revision: outcome.revision,
      };
  return freeze({
    ...cache,
    snapshot: {
      ...cache.snapshot,
      checkins: [...cache.snapshot.checkins.filter((c) => c !== old), row],
    },
  });
}

/** Complete identity lists replace old lists. History pages replace only their
 * interval; a changed group invalidates its older pages rather than relabelling
 * stale scores as freshly confirmed. Revocation purges every cached group row. */
export function reconcileSnapshot(
  previous: SharedCache | null,
  fresh: SharedSnapshot,
  range: HistoryRange,
  now: number,
): SharedCache {
  const versions = Object.fromEntries(
    fresh.groups.map((g) => [g.id, g.revision]),
  );
  const oldVersions = new Map(
    previous?.snapshot.groups.map((g) => [g.id, g.revision]),
  );
  const keep = (id: string, date: string) =>
    versions[id] !== undefined &&
    oldVersions.get(id) === versions[id] &&
    (date < range.from || date > range.until);
  const snapshot: SharedSnapshot = {
    ...fresh,
    checkins: [
      ...(previous?.snapshot.checkins.filter((c) =>
        keep(c.groupId, c.checkinDate),
      ) ?? []),
      ...fresh.checkins,
    ],
    rounds: [
      ...(previous?.snapshot.rounds.filter((r) =>
        keep(r.groupId, r.roundStart),
      ) ?? []),
      ...fresh.rounds,
    ],
    scores: [
      ...(previous?.snapshot.scores.filter((s) =>
        keep(s.groupId, s.roundStart),
      ) ?? []),
      ...fresh.scores,
    ],
  };
  const windows = (previous?.windows ?? []).flatMap((w) => {
    const kept = Object.fromEntries(
      Object.entries(w.versions).filter(
        ([id, revision]) => versions[id] === revision,
      ),
    );
    return Object.keys(kept).length &&
      !(w.from === range.from && w.until === range.until)
      ? [{ ...w, versions: kept }]
      : [];
  });
  windows.push({ ...range, confirmedAt: now, versions });
  return freeze({ snapshot, confirmedAt: now, windows });
}
