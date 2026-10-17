// Pure merge of a full pull into the local cache.
//
// Rules, per record id:
//   * Remote tombstone (deleted_at set): remove locally and forget any pending
//     write. Deletes are sticky on the server, so a pending edit would be
//     skipped anyway.
//   * Local write pending (or rejected and parked): keep the local version
//     (or keep it absent, for a pending delete). The server decides on flush.
//   * Otherwise the newer updated_at wins; a tie goes to the server.
// Local-only fields (e.g. lastNotifiedDate) are carried over onto remote
// versions, so a pull never wipes them.

import { compareTimestamps } from "@/lib/sync/time";

export interface SyncRecord {
  id: string;
  updatedAt?: string;
}

export interface RowMeta {
  id: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MergeOptions<T extends SyncRecord, R extends RowMeta> {
  isHeld(id: string): boolean;
  fromRow(row: R): T;
  localOnly: readonly (keyof T)[];
}

export interface MergeResult<T> {
  records: T[];
  /** Ids the server reports deleted; their queue entries should be dropped. */
  tombstoned: string[];
  /** Live local records the server has never seen and nothing is queued for. */
  unknownToServer: string[];
  changed: boolean;
}

/** Copies local-only fields from the local record onto an incoming one. */
export function withLocalFields<T extends SyncRecord>(incoming: T, local: T | undefined, localOnly: readonly (keyof T)[]): T {
  if (!local) return incoming;
  const out: T = { ...incoming };
  for (const key of localOnly) {
    if (local[key] !== undefined) out[key] = local[key];
  }
  return out;
}

export function mergePulled<T extends SyncRecord, R extends RowMeta>(
  local: readonly T[],
  remote: readonly R[],
  opts: MergeOptions<T, R>,
): MergeResult<T> {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const tombstoned: string[] = [];
  const unknownToServer: string[] = [];
  const records: T[] = [];
  let changed = false;

  for (const rec of local) {
    const row = remoteById.get(rec.id);
    if (!row) {
      records.push(rec);
      if (!opts.isHeld(rec.id)) unknownToServer.push(rec.id);
      continue;
    }
    if (row.deleted_at !== null) {
      tombstoned.push(rec.id);
      changed = true;
      continue;
    }
    if (opts.isHeld(rec.id) || compareTimestamps(row.updated_at, rec.updatedAt) < 0) {
      records.push(rec);
      continue;
    }
    const incoming = withLocalFields(opts.fromRow(row), rec, opts.localOnly);
    if (!sameRecord(incoming, rec)) changed = true;
    records.push(incoming);
  }

  const localIds = new Set(local.map((r) => r.id));
  for (const row of remote) {
    if (localIds.has(row.id)) continue;
    if (row.deleted_at !== null) {
      tombstoned.push(row.id);
      continue;
    }
    // Absent locally with a write held means a pending local delete: keep it absent.
    if (opts.isHeld(row.id)) continue;
    records.push(opts.fromRow(row));
    changed = true;
  }

  return { records, tombstoned, unknownToServer, changed };
}

function sameRecord(a: object, b: object): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
