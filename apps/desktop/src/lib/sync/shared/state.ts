import type { SharedCommand, SharedDraftFields } from "@/types/sharedGoals";
import type { SharedCache } from "@/lib/sharedGoals/cache";
import {
  assert,
  freeze,
  isUuid,
  mapOutcome,
  mapSavedSnapshot,
  object,
  parseCommand,
  snapshotToRows,
  toSnake,
  validateDraft,
  validateRange,
} from "@/lib/sharedGoals/contracts";
import { validDate, validInstant } from "@/lib/sharedGoals/dates";
import type { CheckinIntent, SharedReceipt } from "./outbox";

export type SharedDraftServer =
  | { groupId: string; source: "created"; commandId: string }
  | { groupId: string; source: "snapshot" };
export interface SharedLocalDraft {
  id: string;
  fields: Partial<SharedDraftFields>;
  updatedAt: number;
  server?: SharedDraftServer;
}
export function validateDraftServer(
  value: unknown,
  id: string,
): SharedDraftServer {
  const server = object(value);
  if (server.source === "created") {
    keys(server, ["groupId", "source", "commandId"]);
    assert(isUuid(server.commandId));
  } else {
    keys(server, ["groupId", "source"]);
    assert(server.source === "snapshot");
  }
  assert(isUuid(server.groupId) && server.groupId === id);
  return server as unknown as SharedDraftServer;
}
export interface SharedState {
  version: 1;
  userId: string;
  cache: SharedCache | null;
  needsRefresh: boolean;
  outbox: CheckinIntent[];
  receipts: SharedReceipt[];
  drafts: SharedLocalDraft[];
}
export const sharedStorageKey = (userId: string) => `planner_shared_${userId}`;
export function emptySharedState(userId: string): SharedState {
  assert(isUuid(userId));
  return {
    version: 1,
    userId,
    cache: null,
    needsRefresh: false,
    outbox: [],
    receipts: [],
    drafts: [],
  };
}
function keys(row: Record<string, unknown>, fields: string[]) {
  assert(
    Object.keys(row).length === fields.length &&
      fields.every((k) => Object.hasOwn(row, k)),
  );
}
function time(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function array(value: unknown): unknown[] {
  assert(Array.isArray(value) && value.length <= 100_000);
  return value;
}
export function encodeSharedState(state: SharedState): string {
  return JSON.stringify({
    ...state,
    cache: state.cache && {
      ...state.cache,
      snapshot: snapshotToRows(state.cache.snapshot),
    },
    receipts: state.receipts.map((r) => ({
      ...r,
      outcome: toSnake(r.outcome),
    })),
  });
}

/** No fallback on corrupt data: a malformed record must never erase intent. */
export function decodeSharedState(raw: string, userId: string): SharedState {
  const row = object(JSON.parse(raw));
  keys(row, [
    "version",
    "userId",
    "cache",
    "needsRefresh",
    "outbox",
    "receipts",
    "drafts",
  ]);
  assert(row.version === 1 && row.userId === userId && isUuid(userId));
  const state = emptySharedState(userId);
  assert(typeof row.needsRefresh === "boolean");
  state.needsRefresh = row.needsRefresh;
  if (row.cache !== null) {
    const cache = object(row.cache);
    keys(cache, ["snapshot", "confirmedAt", "windows"]);
    assert(time(cache.confirmedAt));
    const snapshot = mapSavedSnapshot(cache.snapshot, userId);
    const windows = array(cache.windows).map((value) => {
      const w = object(value);
      keys(w, ["from", "until", "confirmedAt", "versions"]);
      validateRange(w as unknown as { from: string; until: string });
      assert(time(w.confirmedAt));
      const versions = object(w.versions);
      for (const [id, revision] of Object.entries(versions))
        assert(
          snapshot.groups.some((g) => g.id === id && g.revision === revision),
        );
      return {
        from: w.from as string,
        until: w.until as string,
        confirmedAt: w.confirmedAt,
        versions: versions as Record<string, number>,
      };
    });
    state.cache = { snapshot, confirmedAt: cache.confirmedAt, windows };
  }
  state.receipts = array(row.receipts).map((value) => {
    const r = object(value);
    keys(r, [
      "id",
      "groupId",
      "membershipId",
      "date",
      "outcome",
      "confirmedAt",
    ]);
    assert(
      isUuid(r.id) &&
        isUuid(r.groupId) &&
        isUuid(r.membershipId) &&
        validDate(r.date) &&
        time(r.confirmedAt),
    );
    assert(!Object.hasOwn(object(r.outcome), "token"));
    return {
      id: r.id,
      groupId: r.groupId,
      membershipId: r.membershipId,
      date: r.date,
      confirmedAt: r.confirmedAt,
      outcome: mapOutcome(r.outcome),
    };
  });
  const seen = new Set(state.receipts.map((r) => r.id));
  assert(seen.size === state.receipts.length);
  const intentIds = new Set<string>();
  state.outbox = array(row.outbox).map((value) => {
    const r = object(value);
    keys(r, [
      "id",
      "groupId",
      "membershipId",
      "userId",
      "date",
      "capturedAt",
      "completed",
      "baseRevision",
      "after",
      "command",
      "phase",
      "failure",
    ]);
    assert(
      isUuid(r.id) &&
        isUuid(r.groupId) &&
        isUuid(r.membershipId) &&
        r.userId === userId &&
        validDate(r.date) &&
        validInstant(r.capturedAt) &&
        typeof r.completed === "boolean",
    );
    assert(
      Number.isSafeInteger(r.baseRevision) &&
        Number(r.baseRevision) >= 0 &&
        ["queued", "attempted", "failed"].includes(r.phase as string),
    );
    assert(
      r.failure === null ||
        (typeof r.failure === "string" && /^[a-z_]{1,80}$/.test(r.failure)),
    );
    assert(
      r.after === null ||
        (isUuid(r.after) && (seen.has(r.after) || r.phase === "failed")),
    );
    let command: SharedCommand<"set_checkin"> | null = null;
    if (r.command !== null) {
      const parsed = parseCommand(r.command);
      assert(
        parsed.operation === "set_checkin" &&
          parsed.command_id === r.id &&
          r.phase !== "queued",
      );
      const p = parsed.payload;
      assert(
        p.group_id === r.groupId &&
          p.membership_id === r.membershipId &&
          p.date === r.date &&
          p.captured_at === r.capturedAt &&
          p.completed === r.completed,
      );
      const prior = state.receipts.find((receipt) => receipt.id === r.after);
      assert(
        p.base_revision ===
          (prior?.outcome.ok ? prior.outcome.revision : r.baseRevision),
      );
      command = parsed;
    } else assert(r.phase !== "attempted");
    assert(!intentIds.has(r.id));
    intentIds.add(r.id);
    const ownReceipt = state.receipts.find((receipt) => receipt.id === r.id);
    if (ownReceipt) assert(r.phase === "failed" && !ownReceipt.outcome.ok);
    seen.add(r.id);
    return { ...r, command } as unknown as CheckinIntent;
  });
  assert(new Set(state.outbox.map((e) => e.id)).size === state.outbox.length);
  state.drafts = array(row.drafts).map((value) => {
    const d = object(value);
    keys(d, [
      "id",
      "fields",
      "updatedAt",
      ...(Object.hasOwn(d, "server") ? ["server"] : []),
    ]);
    assert(isUuid(d.id) && time(d.updatedAt));
    // Old three-field drafts still load. An authorized cached owner row can
    // establish their binding; UUID shape or a missing row cannot establish it.
    const server = Object.hasOwn(d, "server")
      ? validateDraftServer(d.server, d.id)
      : state.cache?.snapshot.groups.some(
            (g) => g.id === d.id && g.ownerId === userId,
          )
        ? { groupId: d.id, source: "snapshot" as const }
        : undefined;
    return {
      id: d.id,
      fields: validateDraft(d.fields),
      updatedAt: d.updatedAt,
      ...(server ? { server } : {}),
    };
  });
  assert(new Set(state.drafts.map((d) => d.id)).size === state.drafts.length);
  return freeze(state);
}
