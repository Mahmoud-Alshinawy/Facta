/** Small, versioned file contract. Never put RPC snapshots or invitations here. */
export const SHARED_EXPORT_GROUPS = 16;
export const SHARED_EXPORT_BYTES = 65_536;
/** UTF-8 size without a browser/Node runtime dependency. */
export function sharedExportByteLength(value: object): number {
  let bytes = 0;
  for (const character of JSON.stringify(value)) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}
export type ProgressPhase =
  "active" | "waiting" | "paused" | "archived" | "unconfirmed";
export interface SharedProgress {
  groupId: string;
  revision: number;
  name: string;
  timeZone: string;
  today: string;
  phase: ProgressPhase;
  reason: string | null;
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
    completedDays: number;
    target: number;
  }[];
}
export interface SharedWidgetExport {
  version: 1;
  userId: string | null;
  defaultGroupId: string | null;
  groups: SharedProgress[];
  truncated: boolean;
  unavailable: boolean;
}
export const emptySharedWidgetExport = (
  userId: string | null,
): SharedWidgetExport => ({
  version: 1,
  userId,
  defaultGroupId: null,
  groups: [],
  truncated: false,
  unavailable: false,
});
export const progressUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string) =>
  Object.keys(v).sort().join() === keys.split(" ").sort().join();
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
const number = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
const date = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(v).toISOString().slice(0, 10) === v;
const instant = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export function progressDay(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** Reject incomplete/cross-account files; an old file simply has no shared field. */
export function parseSharedWidgetExport(
  value: unknown,
  userId: string | null,
): SharedWidgetExport {
  const empty = emptySharedWidgetExport(userId);
  if (value === undefined) return empty;
  try {
    if (
      !object(value) ||
      !exact(
        value,
        "version userId defaultGroupId groups truncated unavailable",
      ) ||
      value.version !== 1 ||
      value.userId !== userId ||
      (userId !== null && !progressUuid(userId)) ||
      !Array.isArray(value.groups) ||
      value.groups.length > SHARED_EXPORT_GROUPS ||
      typeof value.truncated !== "boolean" ||
      typeof value.unavailable !== "boolean" ||
      sharedExportByteLength(value) > SHARED_EXPORT_BYTES ||
      (!userId && value.groups.length)
    )
      throw Error();
    const ids = new Set<string>();
    for (const g of value.groups) {
      if (
        !object(g) ||
        !exact(
          g,
          "groupId revision name timeZone today phase reason confirmedAt archived pending stale round rows",
        ) ||
        !progressUuid(g.groupId) ||
        ids.has(g.groupId) ||
        !Number.isSafeInteger(g.revision) ||
        Number(g.revision) < 1 ||
        !text(g.name, 120) ||
        !text(g.timeZone, 100) ||
        !date(g.today) ||
        !["active", "waiting", "paused", "archived", "unconfirmed"].includes(
          String(g.phase),
        ) ||
        !(g.reason === null || text(g.reason, 200)) ||
        !(g.confirmedAt === null || number(g.confirmedAt)) ||
        ![g.archived, g.pending, g.stale].every(
          (v) => typeof v === "boolean",
        ) ||
        !Array.isArray(g.rows) ||
        g.rows.length > 4
      )
        throw Error();
      progressDay(0, g.timeZone);
      ids.add(g.groupId);
      if (g.round !== null) {
        const r = g.round;
        if (
          !object(r) ||
          !exact(r, "start end activityEnd endReason active averagePct") ||
          !date(r.start) ||
          !date(r.end) ||
          r.end <= r.start ||
          !instant(r.activityEnd) ||
          !["scheduled", "paused", "archived"].includes(String(r.endReason)) ||
          typeof r.active !== "boolean" ||
          !number(r.averagePct, 100)
        )
          throw Error();
      } else if (g.rows.length) throw Error();
      const users = new Set();
      for (const r of g.rows) {
        if (
          !object(r) ||
          !exact(
            r,
            "userId name rank adherencePct isAtLeast70 self left completedDays target",
          ) ||
          !progressUuid(r.userId) ||
          users.has(r.userId) ||
          !text(r.name, 80) ||
          !Number.isSafeInteger(r.rank) ||
          Number(r.rank) < 1 ||
          Number(r.rank) > 8 ||
          !number(r.adherencePct, 100) ||
          typeof r.isAtLeast70 !== "boolean" ||
          typeof r.self !== "boolean" ||
          r.self !== (r.userId === userId) ||
          typeof r.left !== "boolean" ||
          !Number.isSafeInteger(r.completedDays) ||
          !number(r.completedDays, 7) ||
          !Number.isSafeInteger(r.target) ||
          !number(r.target, 7) ||
          Number(r.target) < 1
        )
          throw Error();
        users.add(r.userId);
      }
    }
    if (
      value.defaultGroupId !== null &&
      (!progressUuid(value.defaultGroupId) || !ids.has(value.defaultGroupId))
    )
      throw Error();
    return value as unknown as SharedWidgetExport;
  } catch {
    return { ...empty, unavailable: true };
  }
}
export interface ProgressSelection {
  userId: string;
  groupId: string | null;
  configuredId: string | null;
}
/** Missing selections stay unavailable, rather than silently switching groups. */
export function resolveProgressSelection(
  data: SharedWidgetExport,
  previous: ProgressSelection | null,
  configuredId: string | null = null,
): ProgressSelection | null {
  if (!data.userId) return null;
  const clearedInaccessiblePreference =
    previous?.userId === data.userId &&
    previous.configuredId !== null &&
    configuredId === null &&
    !data.groups.some((g) => g.groupId === previous.configuredId);
  const groupId =
    previous?.userId === data.userId &&
    (previous.configuredId === configuredId || clearedInaccessiblePreference)
      ? (previous.groupId ?? configuredId ?? data.defaultGroupId)
      : (configuredId ?? data.defaultGroupId);
  return { userId: data.userId, groupId, configuredId };
}
export function parseProgressSelection(
  value: unknown,
): ProgressSelection | null {
  if (
    !object(value) ||
    !exact(value, "userId groupId configuredId") ||
    !progressUuid(value.userId) ||
    !(value.groupId === null || progressUuid(value.groupId)) ||
    !(value.configuredId === null || progressUuid(value.configuredId))
  )
    return null;
  return value as unknown as ProgressSelection;
}
/** Age an unchanged file while the planner is closed; never invent new scores. */
export function currentSharedProgress(
  group: SharedProgress,
  now: number,
): SharedProgress {
  const today = progressDay(now, group.timeZone);
  const expired =
    !!group.round?.active && now >= Date.parse(group.round.activityEnd);
  return {
    ...group,
    today,
    phase: expired ? "unconfirmed" : group.phase,
    stale:
      group.stale ||
      group.confirmedAt === null ||
      now < group.confirmedAt ||
      now - group.confirmedAt > 120_000 ||
      today !== group.today ||
      expired,
    round: group.round && {
      ...group.round,
      active: group.round.active && !expired,
    },
  };
}
