import type {
  SharedCommand,
  SharedSnapshot,
  SharedOutcome,
} from "@/types/sharedGoals";
import { assert, freeze, makeCommand } from "@/lib/sharedGoals/contracts";
import { canReplay, roundStart } from "@/lib/sharedGoals/dates";

export interface CheckinIntent {
  id: string;
  groupId: string;
  membershipId: string;
  userId: string;
  date: string;
  capturedAt: string;
  completed: boolean;
  baseRevision: number;
  after: string | null;
  command: SharedCommand<"set_checkin"> | null;
  phase: "queued" | "attempted" | "failed";
  failure: string | null;
}
export interface SharedReceipt {
  id: string;
  groupId: string;
  membershipId: string;
  date: string;
  outcome: SharedOutcome;
  confirmedAt: number;
}
export interface CheckinInput {
  groupId: string;
  date: string;
  completed: boolean;
  capturedAt?: string;
}
export const intentKey = (
  i: Pick<CheckinIntent, "groupId" | "membershipId" | "date">,
) => `${i.groupId}:${i.membershipId}:${i.date}`;

/** Only check-ins may be queued offline. An intent has no command until its
 * predecessor is acknowledged. Once prepared, UUID and body never change. */
export function appendCheckin(
  entries: CheckinIntent[],
  receipts: SharedReceipt[],
  snapshot: SharedSnapshot,
  userId: string,
  input: CheckinInput,
  now: number,
): CheckinIntent[] {
  const group = snapshot.groups.find((g) => g.id === input.groupId);
  const member = snapshot.memberships.find(
    (m) =>
      m.groupId === input.groupId &&
      m.userId === userId &&
      !m.leftAt &&
      !m.deletedAt,
  );
  assert(
    group &&
      member &&
      group.firstRoundDate &&
      member.eligibleRound &&
      !group.archivedAt,
  );
  const capturedAt = input.capturedAt ?? new Date(now).toISOString();
  assert(
    typeof input.completed === "boolean" &&
      canReplay(capturedAt, now, input.date, group.timeZone) &&
      input.date >= member.eligibleRound,
  );
  const boundary = roundStart(group.firstRoundDate, input.date);
  assert(boundary >= member.eligibleRound);
  if (group.scheduleKind === "days")
    assert(
      group.weekdays.includes(new Date(`${input.date}T00:00:00Z`).getUTCDay()),
    );
  const key = intentKey({
    groupId: group.id,
    membershipId: member.id,
    date: input.date,
  });
  const same = entries.filter((e) => intentKey(e) === key);
  if (same.some((e) => e.phase === "failed"))
    throw new Error(
      "Review the rejected check-in before making another attempt.",
    );
  const unattempted = same.findLast((e) => e.command === null);
  const predecessor = same.findLast((e) => e.command !== null);
  const row = snapshot.checkins.find(
    (c) =>
      c.groupId === group.id &&
      c.userId === userId &&
      c.checkinDate === input.date &&
      c.membershipId === member.id,
  );
  const acknowledgedRevision = Math.max(
    0,
    ...receipts
      .filter(
        (r) =>
          intentKey(r) === key && r.outcome.ok && r.outcome.code === "checked",
      )
      .map((r) => r.outcome.revision ?? 0),
  );
  const intent: CheckinIntent = {
    id: crypto.randomUUID(),
    groupId: group.id,
    membershipId: member.id,
    userId,
    date: input.date,
    capturedAt,
    completed: input.completed,
    baseRevision: Math.max(row?.revision ?? 0, acknowledgedRevision),
    after: unattempted?.after ?? predecessor?.id ?? null,
    command: null,
    phase: "queued",
    failure: null,
  };
  return freeze([...entries.filter((e) => e.id !== unattempted?.id), intent]);
}

export function prepareCheckin(
  intent: CheckinIntent,
  receipts: SharedReceipt[],
  snapshot: SharedSnapshot,
  now: number,
): CheckinIntent {
  if (intent.command || intent.phase === "failed") return intent;
  const group = snapshot.groups.find((g) => g.id === intent.groupId);
  const member = snapshot.memberships.find(
    (m) =>
      m.id === intent.membershipId &&
      m.userId === intent.userId &&
      !m.leftAt &&
      !m.deletedAt,
  );
  if (!group || !member || group.archivedAt)
    return freeze({
      ...intent,
      phase: "failed",
      failure: group?.archivedAt ? "archived" : "forbidden",
    });
  let revision = intent.baseRevision;
  if (intent.after) {
    const previous = receipts.find((r) => r.id === intent.after);
    if (!previous) return intent;
    if (!previous.outcome.ok || previous.outcome.code !== "checked")
      return freeze({
        ...intent,
        phase: "failed",
        failure: "dependency_failed",
      });
    revision = previous.outcome.revision!;
  }
  if (!canReplay(intent.capturedAt, now, intent.date, group.timeZone))
    return freeze({ ...intent, phase: "failed", failure: "invalid_date" });
  return freeze({
    ...intent,
    phase: "attempted",
    command: makeCommand(
      "set_checkin",
      {
        group_id: intent.groupId,
        membership_id: intent.membershipId,
        date: intent.date,
        captured_at: intent.capturedAt,
        completed: intent.completed,
        base_revision: revision,
      },
      intent.id,
    ),
  });
}

export function acknowledge(
  entries: CheckinIntent[],
  receipts: SharedReceipt[],
  intent: CheckinIntent,
  outcome: SharedOutcome,
  now: number,
): { outbox: CheckinIntent[]; receipts: SharedReceipt[] } {
  assert(intent.command && !outcome.token);
  const receipt: SharedReceipt = {
    id: intent.id,
    groupId: intent.groupId,
    membershipId: intent.membershipId,
    date: intent.date,
    outcome,
    confirmedAt: now,
  };
  const outbox = outcome.ok
    ? entries.filter((e) => e.id !== intent.id)
    : entries.map((e) =>
        e.id === intent.id
          ? { ...e, phase: "failed" as const, failure: outcome.code }
          : e,
      );
  const all = [...receipts.filter((r) => r.id !== receipt.id), receipt];
  const needed = new Set(outbox.flatMap((e) => (e.after ? [e.after] : [])));
  return freeze({
    outbox,
    receipts: all.filter(
      (r, index) => needed.has(r.id) || index >= all.length - 256,
    ),
  });
}
