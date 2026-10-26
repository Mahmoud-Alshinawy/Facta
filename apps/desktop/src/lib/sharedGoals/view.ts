import type { SharedGroup, SharedMembership } from "@/types/sharedGoals";
import type { SharedState } from "@/lib/sync/shared/state";
import { addDays, groupDate, roundStart, roundInterval } from "./dates";

export function roundConfirmation(
  state: SharedState,
  group: SharedGroup,
  start: string,
) {
  return (
    state.cache?.windows.reduce<number | null>(
      (last, w) =>
        w.versions[group.id] === group.revision &&
        w.from <= start &&
        w.until >= start
          ? Math.max(last ?? 0, w.confirmedAt)
          : last,
      null,
    ) ?? null
  );
}
export function olderHistoryRange(
  state: SharedState,
  group: SharedGroup,
  today: string,
) {
  if (!group.firstRoundDate) return null;
  const earliest =
    state.cache?.windows
      .filter((w) => w.versions[group.id] === group.revision)
      .map((w) => w.from)
      .sort()[0] ?? today;
  if (earliest <= group.firstRoundDate) return null;
  const until = addDays(earliest, -1);
  return { from: [addDays(until, -41), group.firstRoundDate].sort()[1], until };
}
export function sharedGroupView(
  state: SharedState,
  userId: string,
  id: string,
  now: number,
  selected?: string,
) {
  if (state.userId !== userId || !state.cache) return null;
  const s = state.cache.snapshot;
  const group = s.groups.find((g) => g.id === id && !g.deletedAt);
  const member = s.memberships.find(
    (m) => m.groupId === id && m.userId === userId && !m.leftAt && !m.deletedAt,
  );
  if (!group || !member) return null;
  const today = groupDate(now, group.timeZone);
  const slot =
    group.firstRoundDate && today >= group.firstRoundDate
      ? roundStart(group.firstRoundDate, today)
      : null;
  const rounds = s.rounds
    .filter((r) => r.groupId === id)
    .sort((a, b) => b.roundStart.localeCompare(a.roundStart));
  const current = rounds.find((r) => r.roundStart === slot);
  const active =
    !!current &&
    current.isActive &&
    Date.parse(current.activityStart) <= now &&
    now < Date.parse(current.activityEnd);
  const anchorCovered =
    !!group.firstRoundDate &&
    roundConfirmation(state, group, group.firstRoundDate) !== null;
  const slotConfirmedAt = slot ? roundConfirmation(state, group, slot) : null;
  const boundaryConfirmed =
    !!slot &&
    slotConfirmedAt !== null &&
    slotConfirmedAt >= Date.parse(roundInterval(slot, group.timeZone).start);
  const phase = !group.publishedAt
    ? "draft"
    : group.archivedAt
      ? "archived"
      : active
        ? "active"
        : current?.endReason === "paused" ||
            (rounds.length && boundaryConfirmed)
          ? "paused"
          : (anchorCovered && boundaryConfirmed && !rounds.length) ||
              (group.firstRoundDate && today < group.firstRoundDate)
            ? "waiting"
            : "unconfirmed";
  const round = selected
    ? rounds.find((r) => r.roundStart === selected)
    : (current ?? rounds[0]);
  const scores = round
    ? s.scores
        .filter((r) => r.groupId === id && r.roundStart === round.roundStart)
        .sort((a, b) => a.rank - b.rank || a.userId.localeCompare(b.userId))
    : [];
  const confirmedAt = round
    ? roundConfirmation(state, group, round.roundStart)
    : null;
  const stale =
    state.needsRefresh ||
    confirmedAt === null ||
    now < confirmedAt ||
    now - confirmedAt > 120_000;
  const ownScore = scores.find((r) => r.membershipId === member.id);
  const intentions = state.outbox.filter((e) => e.groupId === id);
  const todayIntent = intentions.findLast(
    (e) => e.membershipId === member.id && e.date === today,
  );
  const checkedRow = s.checkins.find(
    (c) => c.membershipId === member.id && c.checkinDate === today,
  );
  const checked = todayIntent
    ? todayIntent.completed
    : (checkedRow?.completed ?? false);
  const eligible =
    !!slot &&
    !!member.eligibleRound &&
    member.eligibleRound <= slot &&
    !!current &&
    s.scores.some(
      (r) =>
        r.groupId === id &&
        r.roundStart === slot &&
        r.membershipId === member.id,
    );
  const rest =
    group.scheduleKind === "days" &&
    !group.weekdays.includes(new Date(`${today}T00:00:00Z`).getUTCDay());
  const canCheck =
    phase === "active" && eligible && !rest && !todayIntent?.failure;
  const targets = s.targets
    .filter((t) => t.membershipId === member.id && !t.deletedAt)
    .sort((a, b) => b.effectiveRound.localeCompare(a.effectiveRound));
  const boundary = slot ?? group.firstRoundDate;
  const effectiveTarget =
    group.template === "gym"
      ? (targets.find((t) => boundary && t.effectiveRound <= boundary)
          ?.target ?? member.initialGymTarget)
      : group.scheduleKind === "every"
        ? 7
        : group.scheduleKind === "days"
          ? group.weekdays.length
          : group.timesPerWeek;
  const pendingTarget = targets.find(
    (t) =>
      boundary && t.effectiveRound > boundary && t.target !== effectiveTarget,
  );
  const members = s.memberships.filter(
    (m) =>
      m.groupId === id &&
      !m.deletedAt &&
      (!m.leftAt || scores.some((r) => r.membershipId === m.id)),
  );
  const invited = s.invites.filter(
    (i) =>
      i.groupId === id &&
      i.kind === "direct" &&
      i.state === "pending" &&
      !i.deletedAt &&
      Date.parse(i.expiresAt) > now,
  );
  const days = round
    ? Array.from({ length: 7 }, (_, i) => {
        const date = addDays(round.roundStart, i),
          interval = roundInterval(date, group.timeZone);
        return {
          date,
          start: Date.parse(interval.start),
          end: Date.parse(
            roundInterval(addDays(date, 1), group.timeZone).start,
          ),
        };
      })
    : [];
  const reason = group.archivedAt
    ? "Archived · read only"
    : !member.eligibleRound
      ? "Not published"
      : slot === null || member.eligibleRound > slot
        ? `Starts ${member.eligibleRound}`
        : phase === "paused"
          ? "Paused · waiting for an eligible boundary"
          : phase === "waiting"
            ? "Waiting for two eligible members at a round boundary"
            : !active
              ? "Reconnect to confirm the current round"
              : rest
                ? "Rest day"
                : todayIntent?.failure
                  ? "Review rejected check-in"
                  : null;
  return {
    group,
    member,
    today,
    slot,
    phase,
    current,
    round,
    rounds,
    scores,
    ownScore,
    confirmedAt,
    stale,
    checked,
    pending: !!todayIntent,
    todayIntent,
    intentions,
    eligible,
    rest,
    canCheck,
    effectiveTarget,
    pendingTarget,
    members,
    invited,
    days,
    reason,
  };
}
export type SharedGroupView = NonNullable<ReturnType<typeof sharedGroupView>>;
export function sharedCell(
  state: SharedState,
  view: SharedGroupView,
  member: SharedMembership,
  date: string,
) {
  const round = view.round,
    day = view.days.find((d) => d.date === date);
  if (!round || !day || !view.scores.some((s) => s.membershipId === member.id))
    return "ineligible";
  const cutoff = Math.min(
    Date.parse(round.activityEnd),
    member.leftAt ? Date.parse(member.leftAt) : Infinity,
  );
  if (day.start >= cutoff || day.end <= Date.parse(round.activityStart))
    return "inactive";
  if (
    view.group.scheduleKind === "days" &&
    !view.group.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())
  )
    return "rest";
  if (date > view.today) return "future";
  const pending = state.outbox.findLast(
    (e) =>
      e.membershipId === member.id &&
      e.date === date &&
      e.groupId === view.group.id,
  );
  if (pending)
    return pending.phase === "failed"
      ? "conflict"
      : pending.completed
        ? "pending"
        : "pending undo";
  if (
    state.cache?.snapshot.checkins.some(
      (c) =>
        c.membershipId === member.id && c.checkinDate === date && c.completed,
    )
  )
    return "done";
  return date === view.today ? "today" : "not done";
}
export const percent = (value: number) =>
  `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)}%`;
