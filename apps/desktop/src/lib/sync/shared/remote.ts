import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type {
  SharedCommand,
  SharedSnapshot,
  SharedOutcome,
  SharedInvitePreview,
  HistoryRange,
} from "@/types/sharedGoals";
import {
  assert,
  isUuid,
  mapSnapshot,
  mapOutcome,
  mapPreview,
  parseCommand,
  validateRange,
} from "@/lib/sharedGoals/contracts";

export type SharedFailureKind =
  "offline" | "unavailable" | "auth" | "invalid" | "rejected" | "server";
const messages: Record<SharedFailureKind, string> = {
  offline:
    "Shared goals could not connect. Check the connection before trying again.",
  unavailable:
    "Shared goals are unavailable on this server. Saved changes have been retained.",
  auth: "Shared goals are waiting for this account to sign in again.",
  invalid:
    "Shared goals returned incomplete or incompatible data. Saved data has been retained.",
  rejected:
    "The server rejected this check-in. Review it before making a new attempt.",
  server: "Shared goals could not sync. Saved changes have been retained.",
};
export class SharedRemoteError extends Error {
  constructor(
    readonly kind: SharedFailureKind,
    readonly code?: string,
  ) {
    super(messages[kind]);
  }
}
export interface SharedRemote {
  readonly userId: string;
  snapshot(range: HistoryRange, signal?: AbortSignal): Promise<SharedSnapshot>;
  command(command: SharedCommand, signal?: AbortSignal): Promise<SharedOutcome>;
  preview(
    token: string,
    signal?: AbortSignal,
  ): Promise<SharedInvitePreview | SharedOutcome>;
  pendingInvites(signal?: AbortSignal): Promise<SharedInvitePreview[]>;
}
interface RpcResponse {
  data: unknown;
  error: { code?: string; message?: string } | null;
  status: number;
}

/** Real SDK adapter. Pin the verified session's bearer token on each builder:
 * SDK auth switching during its async fetch must not send A's command as B. */
export function createSharedRemote(
  userId: string,
  client: SupabaseClient<Database>,
  options: {
    getSession?: () => Promise<{ userId: string; accessToken: string } | null>;
    timeoutMs?: number;
  } = {},
): SharedRemote {
  assert(isUuid(userId));
  const session =
    options.getSession ??
    (async () => {
      const result = await client.auth.getSession();
      if (result.error || !result.data.session) return null;
      return {
        userId: result.data.session.user.id,
        accessToken: result.data.session.access_token,
      };
    });
  async function run<T>(
    request: (token: string, signal: AbortSignal) => PromiseLike<RpcResponse>,
    decode: (data: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, options.timeoutMs ?? 20_000);
    let abortRequest: () => void = () => {};
    try {
      const aborted = new Promise<never>((_, reject) => {
        abortRequest = () => reject(new SharedRemoteError("offline"));
      });
      controller.signal.addEventListener("abort", abortRequest, { once: true });
      if (controller.signal.aborted) abortRequest();
      const identity = await Promise.race([session(), aborted]);
      if (!identity || identity.userId !== userId)
        throw new SharedRemoteError("auth");
      if (controller.signal.aborted) throw new SharedRemoteError("offline");
      const result = await Promise.race([
        request(identity.accessToken, controller.signal),
        aborted,
      ]);
      if (controller.signal.aborted) throw new SharedRemoteError("offline");
      if (result.error) {
        const code = result.error.code ?? "";
        if (
          [
            "PGRST202",
            "PGRST204",
            "PGRST205",
            "42P01",
            "42883",
            "42501",
          ].includes(code)
        )
          throw new SharedRemoteError("unavailable", code);
        if (result.status === 401 || result.status === 403)
          throw new SharedRemoteError("auth", code);
        if (
          result.status === 0 ||
          /fetch|network|abort/i.test(result.error.message ?? "")
        )
          throw new SharedRemoteError("offline", code);
        throw new SharedRemoteError(
          /^2[23]/.test(code) ? "rejected" : "server",
          code,
        );
      }
      try {
        return decode(result.data);
      } catch {
        throw new SharedRemoteError("invalid");
      }
    } catch (error) {
      if (error instanceof SharedRemoteError) throw error;
      throw new SharedRemoteError("offline");
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", abortRequest);
      signal?.removeEventListener("abort", cancel);
    }
  }
  return {
    userId,
    snapshot(range, signal) {
      validateRange(range);
      return run(
        (token, abort) =>
          client
            .rpc("facta_shared_snapshot", {
              history_from: range.from,
              history_until: range.until,
            })
            .setHeader("Authorization", `Bearer ${token}`)
            .abortSignal(abort),
        (data) => mapSnapshot(data, userId, range),
        signal,
      );
    },
    command(value, signal) {
      const command = parseCommand(value);
      return run(
        (token, abort) =>
          client
            .rpc(
              "facta_shared_command",
              command as unknown as Database["public"]["Functions"]["facta_shared_command"]["Args"],
            )
            .setHeader("Authorization", `Bearer ${token}`)
            .abortSignal(abort),
        (data) => {
          const outcome = mapOutcome(data);
          if (command.operation === "set_checkin" && outcome.ok)
            assert(outcome.code === "checked");
          return outcome;
        },
        signal,
      );
    },
    preview(token, signal) {
      assert(/^[A-Za-z0-9_-]{43}$/.test(token));
      return run(
        (jwt, abort) =>
          client
            .rpc("facta_shared_preview", { token })
            .setHeader("Authorization", `Bearer ${jwt}`)
            .abortSignal(abort),
        mapPreview,
        signal,
      );
    },
    pendingInvites(signal) {
      return run(
        (jwt, abort) =>
          client
            .rpc("facta_shared_pending_invites")
            .setHeader("Authorization", `Bearer ${jwt}`)
            .abortSignal(abort),
        (data) => {
          assert(Array.isArray(data));
          return data.map((value) => {
            const preview = mapPreview(value);
            assert(preview.ok && "acceptedCount" in preview);
            return preview as SharedInvitePreview;
          });
        },
        signal,
      );
    },
  };
}
