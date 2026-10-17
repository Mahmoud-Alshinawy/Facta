// The server side of a collection, behind an interface so tests can use a
// fake. The Supabase implementation lives in supabaseRemote.ts.

export interface SyncError {
  message: string;
  /**
   * "row": this row's data was refused (bad value, constraint, RLS on the
   * row). Only these park a write as failed.
   * "offline": the server couldn't be reached.
   * "server": anything else (missing table or column, stale schema cache,
   * missing grants, 5xx, expired session). Sync-wide: the queue is left
   * untouched and the whole sync retries later.
   */
  kind: "row" | "offline" | "server";
}

export type RemoteResult<T> = { ok: true; data: T } | { ok: false; error: SyncError };

export interface TableRemote<W, R> {
  /** Upserts full rows; returns only the rows the server actually wrote. */
  upsert(rows: W[]): Promise<RemoteResult<R[]>>;
  fetchByIds(ids: string[]): Promise<RemoteResult<R[]>>;
  /** Every row the user owns, tombstones included. */
  fetchAll(): Promise<RemoteResult<R[]>>;
}

/** The parts of a PostgrestError we classify on. */
export interface PostgrestErrorLike {
  message?: string;
  code?: string;
}

const NETWORK_RE = /failed to fetch|networkerror|fetch failed|load failed|network request failed/i;

/**
 * Sorts a PostgREST error into row / offline / server. Defaults to "server",
 * so an unknown failure never parks (and so never risks discarding) data.
 *
 * Row-level means SQLSTATE class 22 (data exception) or 23 (integrity
 * constraint), or 42501 when it is a row-level security violation.
 * A plain "permission denied for table" is also 42501, but it means a grant
 * is missing, which is sync-wide.
 */
export function classifyError(error: PostgrestErrorLike | null, status: number): SyncError {
  const raw = error?.message || `Request failed (HTTP ${status})`;
  const code = error?.code ?? "";
  if (NETWORK_RE.test(raw) || (status === 0 && !code)) {
    return { kind: "offline", message: "Can't reach the server" };
  }
  const rowLevel =
    /^2[23][0-9A-Z]{3}$/.test(code) ||
    (code === "42501" && /row-level security/i.test(raw));
  if (rowLevel) return { kind: "row", message: raw };
  return { kind: "server", message: code ? `${raw} (${code})` : raw };
}
