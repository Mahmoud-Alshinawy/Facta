import type {
  SharedCommand,
  SharedCommandPayloads,
  SharedOperation,
  SharedSnapshot,
  SharedOutcome,
  SharedInvitePreview,
  HistoryRange,
} from "@/types/sharedGoals";
import { addDays, validDate, validInstant, groupDate } from "./dates";

export class SharedContractError extends Error {
  constructor() {
    super(
      "Shared goals returned incomplete or incompatible data. Saved data has been retained.",
    );
  }
}
export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
  );
}
export function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function assert(condition: unknown): asserts condition {
  if (!condition) throw new SharedContractError();
}
type Shape = Record<string, string>;
const meta: Shape = {
  created_at: "instant",
  updated_at: "instant",
  revision: "positive",
  deleted_at: "instant|null",
};
const shapes = {
  groups: {
    id: "uuid",
    owner_id: "uuid",
    name: "text",
    icon: "text",
    template: "text",
    schedule_kind: "text",
    weekdays: "days",
    times_per_week: "positive|null",
    time_zone: "zone",
    round_weekday: "day",
    first_round_date: "date|null",
    published_at: "instant|null",
    archived_at: "instant|null",
    ...meta,
  },
  profiles: { user_id: "uuid", handle: "text", display_name: "text", ...meta },
  memberships: {
    id: "uuid",
    group_id: "uuid",
    user_id: "uuid",
    joined_at: "instant",
    eligible_round: "date|null",
    left_at: "instant|null",
    initial_gym_target: "positive|null",
    ...meta,
  },
  targets: {
    id: "uuid",
    membership_id: "uuid",
    effective_round: "date",
    target: "positive",
    ...meta,
  },
  invites: {
    id: "uuid",
    group_id: "uuid",
    inviter_id: "uuid",
    recipient_id: "uuid|null",
    kind: "text",
    state: "text",
    expires_at: "instant",
    ...meta,
  },
  checkins: {
    id: "uuid",
    group_id: "uuid",
    user_id: "uuid",
    membership_id: "uuid",
    checkin_date: "date",
    completed: "bool",
    captured_at: "instant",
    created_at: "instant",
    updated_at: "instant",
    revision: "positive",
  },
};
const roundShape: Shape = {
  group_id: "uuid",
  round_start: "date",
  round_end: "date",
  activity_start: "instant",
  scheduled_end: "instant",
  activity_end: "instant",
  roster_size: "positive",
  end_reason: "text",
  is_active: "bool",
};
const scoreShape: Shape = {
  ...roundShape,
  membership_id: "uuid",
  user_id: "uuid",
  display_name: "text",
  handle: "text",
  target: "positive",
  completed_days: "int",
  left_at: "instant|null",
  adherence_pct: "percent",
  is_at_least_70: "bool",
  rank: "positive",
  group_average_pct: "percent",
};
function scalar(value: unknown, kind: string): boolean {
  if (kind.endsWith("|null"))
    return value === null || scalar(value, kind.slice(0, -5));
  switch (kind) {
    case "uuid":
      return isUuid(value);
    case "instant":
      return validInstant(value);
    case "date":
      return validDate(value);
    case "text":
      return typeof value === "string";
    case "bool":
      return typeof value === "boolean";
    case "int":
      return Number.isSafeInteger(value) && Number(value) >= 0;
    case "positive":
      return scalar(value, "int") && Number(value) > 0;
    case "day":
      return scalar(value, "int") && Number(value) <= 6;
    case "percent":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100
      );
    case "days":
      return (
        Array.isArray(value) &&
        value.length <= 7 &&
        new Set(value).size === value.length &&
        value.every((d) => scalar(d, "day"))
      );
    case "zone":
      try {
        if (typeof value !== "string") return false;
        groupDate(0, value);
        return true;
      } catch {
        return false;
      }
    default:
      return false;
  }
}
export function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function checked(value: unknown, shape: Shape): Record<string, unknown> {
  const row = object(value);
  assert(Object.keys(row).every((k) => Object.hasOwn(shape, k)));
  for (const [key, type] of Object.entries(shape)) {
    if (type.startsWith("?") && !Object.hasOwn(row, key)) continue;
    assert(scalar(row[key], type.replace(/^\?/, "")));
  }
  return row;
}
function camel<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()),
      structuredClone(value),
    ]),
  ) as T;
}
export function validateRange(range: HistoryRange): void {
  assert(
    validDate(range.from) &&
      validDate(range.until) &&
      range.until >= range.from &&
      range.until <= addDays(range.from, 366),
  );
}
export const emptySnapshot = (): SharedSnapshot => ({
  groups: [],
  profiles: [],
  memberships: [],
  targets: [],
  invites: [],
  checkins: [],
  rounds: [],
  scores: [],
});
function unique<T>(rows: T[], key: (row: T) => string) {
  assert(new Set(rows.map(key)).size === rows.length);
}
export function mapSnapshot(
  value: unknown,
  userId: string,
  range: HistoryRange,
): SharedSnapshot {
  validateRange(range);
  return decodeSnapshot(value, userId, range);
}
/** Saved history can span multiple separately validated <=366-day windows. */
export function mapSavedSnapshot(
  value: unknown,
  userId: string,
): SharedSnapshot {
  return decodeSnapshot(value, userId, {
    from: "0001-01-01",
    until: "9999-12-31",
  });
}
function decodeSnapshot(
  value: unknown,
  userId: string,
  range: HistoryRange,
): SharedSnapshot {
  assert(isUuid(userId));
  const source = object(value);
  const all = { ...shapes, rounds: roundShape, scores: scoreShape };
  assert(Object.keys(source).length === Object.keys(all).length);
  const result = emptySnapshot();
  for (const [key, shape] of Object.entries(all)) {
    const rows = source[key];
    assert(Array.isArray(rows) && rows.length <= 100_000);
    (result as unknown as Record<string, unknown>)[key] = rows.map((row) =>
      camel(checked(row, shape)),
    );
  }
  const {
    groups,
    profiles,
    memberships,
    targets,
    invites,
    checkins,
    rounds,
    scores,
  } = result;
  for (const rows of [groups, memberships, targets, invites, checkins])
    unique(rows as { id: string }[], (row) => row.id);
  unique(profiles, (p) => p.userId);
  unique(rounds, (r) => `${r.groupId}:${r.roundStart}`);
  unique(scores, (s) => `${s.groupId}:${s.roundStart}:${s.membershipId}`);
  unique(checkins, (c) => `${c.groupId}:${c.userId}:${c.checkinDate}`);
  const groupIds = new Set(groups.map((g) => g.id));
  const memberMap = new Map(memberships.map((m) => [m.id, m]));
  const profileIds = new Set(profiles.map((p) => p.userId));
  const roundMap = new Map(
    rounds.map((r) => [`${r.groupId}:${r.roundStart}`, r]),
  );
  for (const g of groups) {
    assert(
      !g.deletedAt &&
        memberships.some(
          (m) =>
            m.groupId === g.id &&
            m.userId === userId &&
            !m.leftAt &&
            !m.deletedAt,
        ),
    );
    assert(g.publishedAt !== null || g.ownerId === userId);
    assert((g.firstRoundDate === null) === (g.publishedAt === null));
    assert(
      ["gym", "custom"].includes(g.template) &&
        ["every", "days", "n"].includes(g.scheduleKind),
    );
  }
  memberships.forEach((m) =>
    assert(groupIds.has(m.groupId) && profileIds.has(m.userId)),
  );
  targets.forEach((t) =>
    assert(memberMap.has(t.membershipId) && t.target >= 2 && t.target <= 7),
  );
  invites.forEach((i) =>
    assert(
      groupIds.has(i.groupId) &&
        ["direct", "link"].includes(i.kind) &&
        ["pending", "accepted", "declined", "revoked"].includes(i.state),
    ),
  );
  const allowedProfiles = new Set([
    userId,
    ...memberships.map((m) => m.userId),
    ...invites.flatMap((i) => (i.recipientId ? [i.recipientId] : [])),
  ]);
  profiles.forEach((p) => assert(allowedProfiles.has(p.userId)));
  checkins.forEach((c) => {
    const m = memberMap.get(c.membershipId);
    assert(
      m?.groupId === c.groupId &&
        m.userId === c.userId &&
        c.checkinDate >= range.from &&
        c.checkinDate <= range.until,
    );
  });
  rounds.forEach((r) =>
    assert(
      groupIds.has(r.groupId) &&
        r.roundStart >= range.from &&
        r.roundStart <= range.until &&
        r.roundEnd === addDays(r.roundStart, 7) &&
        r.rosterSize >= 2 &&
        r.rosterSize <= 8 &&
        ["scheduled", "paused", "archived"].includes(r.endReason) &&
        Date.parse(r.activityEnd) > Date.parse(r.activityStart) &&
        Date.parse(r.activityEnd) <= Date.parse(r.scheduledEnd),
    ),
  );
  scores.forEach((s) => {
    const m = memberMap.get(s.membershipId),
      r = roundMap.get(`${s.groupId}:${s.roundStart}`);
    assert(
      m?.groupId === s.groupId &&
        m.userId === s.userId &&
        r &&
        s.target <= 7 &&
        s.completedDays <= 7 &&
        s.rank <= r.rosterSize,
    );
    for (const key of Object.keys(roundShape)) {
      const k = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      assert(
        (s as unknown as Record<string, unknown>)[k] ===
          (r as unknown as Record<string, unknown>)[k],
      );
    }
  });
  for (const r of rounds)
    assert(
      scores.filter(
        (s) => s.groupId === r.groupId && s.roundStart === r.roundStart,
      ).length === r.rosterSize,
    );
  return freeze(result);
}
export function snapshotToRows(snapshot: SharedSnapshot): unknown {
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, rows]) => [
      key,
      rows.map((row: object) => toSnake(row)),
    ]),
  );
}
export function toSnake(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key
        .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
        .replace(/([a-z])(\d)/g, "$1_$2"),
      structuredClone(v),
    ]),
  );
}
export function validateDraft(
  value: unknown,
): Partial<SharedCommandPayloads["create_draft"]> {
  const partial = Object.fromEntries(
    Object.entries(draftShape).map(([key, kind]) => [
      key,
      `?${kind.replace(/^\?/, "")}`,
    ]),
  );
  return freeze(structuredClone(checked(value, partial))) as Partial<
    SharedCommandPayloads["create_draft"]
  >;
}

const draftShape = {
  name: "text",
  icon: "?text",
  template: "text",
  schedule_kind: "text",
  weekdays: "?days",
  times_per_week: "?positive|null",
  time_zone: "zone",
  round_weekday: "day",
  target: "?positive|null",
};
const commandShapes: Record<SharedOperation, Shape> = {
  set_profile: { handle: "text", display_name: "text" },
  create_draft: draftShape,
  update_draft: {
    ...draftShape,
    group_id: "uuid",
    expected_revision: "positive",
  },
  publish: {
    group_id: "uuid",
    expected_revision: "positive",
    first_round_date: "date",
  },
  invite: { group_id: "uuid", handle: "text" },
  issue_link: { group_id: "uuid" },
  rotate_invite: { invite_id: "uuid" },
  revoke_invite: { invite_id: "uuid" },
  decline_invite: { invite_id: "uuid" },
  join: { token: "?text", invite_id: "?uuid", target: "?positive|null" },
  set_target: { group_id: "uuid", target: "positive|null" },
  set_checkin: {
    group_id: "uuid",
    membership_id: "uuid",
    date: "date",
    captured_at: "instant",
    completed: "bool",
    base_revision: "int",
  },
  transfer_owner: { group_id: "uuid", user_id: "uuid" },
  leave: { group_id: "uuid", transfer_to: "?uuid|null" },
  archive: { group_id: "uuid" },
};
export function makeCommand<K extends SharedOperation>(
  operation: K,
  payload: SharedCommandPayloads[K],
  id: string = crypto.randomUUID(),
): SharedCommand<K> {
  assert(isUuid(id) && Object.hasOwn(commandShapes, operation));
  const clean = structuredClone(checked(payload, commandShapes[operation]));
  assert(new TextEncoder().encode(JSON.stringify(clean)).length <= 8192);
  if (operation === "join")
    assert(
      "token" in clean !== "invite_id" in clean &&
        (!clean.token || /^[A-Za-z0-9_-]{43}$/.test(clean.token as string)),
    );
  return freeze({
    command_id: id,
    operation,
    payload: clean,
  }) as SharedCommand<K>;
}
export function parseCommand(value: unknown): SharedCommand {
  const row = object(value);
  assert(Object.keys(row).sort().join() === "command_id,operation,payload");
  return makeCommand(
    row.operation as SharedOperation,
    row.payload as never,
    row.command_id as string,
  );
}
const outcomeCodes = new Set(
  "already_invited already_joined already_published archived checked command_mismatch confirmation_required conflict draft_created draft_updated forbidden full handle_immutable handle_taken inactive_period ineligible initial_target_required invalid_date invalid_invite invite_issued invite_rotated joined membership_changed not_applicable not_found not_published owner_transfer_required profile_required profile_saved published rate_limited rest_day target_scheduled expired revoked declined left owner_transferred".split(
    " ",
  ),
);
export function mapOutcome(value: unknown): SharedOutcome {
  const r = checked(value, {
    ok: "bool",
    code: "text",
    group_id: "?uuid",
    membership_id: "?uuid",
    revision: "?int",
    first_round_date: "?date",
    time_zone: "?zone",
    id: "?uuid",
    completed: "?bool",
    invite_id: "?uuid",
    token: "?text",
    effective_round: "?date",
    target: "?positive",
    scope: "?text",
  });
  assert(outcomeCodes.has(r.code as string));
  if (
    r.ok &&
    ["left", "owner_transferred", "archived"].includes(r.code as string)
  )
    assert(isUuid(r.group_id));
  if (r.code === "checked" && r.ok)
    assert(
      isUuid(r.id) &&
        Number(r.revision) > 0 &&
        typeof r.completed === "boolean",
    );
  if (r.token)
    assert(
      r.ok &&
        ["invite_issued", "invite_rotated"].includes(r.code as string) &&
        /^[A-Za-z0-9_-]{43}$/.test(r.token as string),
    );
  return freeze(camel<SharedOutcome>(r));
}
export function mapPreview(
  value: unknown,
): SharedInvitePreview | SharedOutcome {
  const row = object(value);
  if (row.ok === false) return mapOutcome(value);
  const r = checked(row, {
    ok: "bool",
    invite_id: "uuid",
    group_id: "uuid",
    name: "text",
    inviter: "text",
    template: "text",
    schedule_kind: "text",
    weekdays: "days",
    times_per_week: "positive|null",
    time_zone: "zone",
    round_weekday: "day",
    first_round_date: "date|null",
    published: "bool",
    expires_at: "instant",
    accepted_count: "positive",
  });
  assert(r.ok === true && Number(r.accepted_count) <= 8);
  return freeze(camel<SharedInvitePreview>(r));
}
