import type {
  SharedCommand,
  SharedOperation,
  SharedCommandPayloads,
  SharedOutcome,
} from "@/types/sharedGoals";
import { makeCommand } from "./contracts";
import { SharedRemoteError } from "@/lib/sync/shared/remote";
import type { SharedSync } from "@/lib/sync/shared/engine";
export interface UnresolvedRequest {
  key: string;
  command: SharedCommand;
  busy: boolean;
  error: string | null;
}
/** Caller-owned session memory, deliberately outside mounted forms. No token or
 * online-control body is written to the offline outbox or local drafts. */
export class SharedRequests {
  private pending: UnresolvedRequest[] = [];
  private recovered = new Map<
    string,
    { command: SharedCommand; outcome: SharedOutcome }
  >();
  readonly tokens = new Map<string, string>();
  private listeners = new Set<() => void>();
  constructor(private engine: SharedSync) {}
  getSnapshot = () => this.pending;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  async perform<K extends SharedOperation>(
    key: string,
    operation: K,
    payload: SharedCommandPayloads[K],
  ): Promise<SharedOutcome> {
    const recovered = this.recovered.get(key);
    if (
      recovered &&
      recovered.command.operation === operation &&
      (JSON.stringify(recovered.command.payload) === JSON.stringify(payload) ||
        (operation === "create_draft" && recovered.outcome.ok))
    ) {
      await this.reconcileOutcome(key, recovered.command, recovered.outcome);
      // A creation alias stays bound for this session. Later field edits are
      // update_draft commands, never a second create with a replacement UUID.
      if (operation !== "create_draft" || !recovered.outcome.ok)
        this.recovered.delete(key);
      return recovered.outcome;
    }
    const prior = this.pending.find((r) => r.key === key);
    if (prior) {
      if (prior.busy) throw new Error("This request is already being sent.");
      if (
        prior.command.operation !== operation ||
        JSON.stringify(prior.command.payload) !== JSON.stringify(payload)
      )
        throw new Error(
          "Retry the unresolved request before changing its fields.",
        );
      return this.send(key);
    }
    this.pending = [
      ...this.pending,
      {
        key,
        command: makeCommand(operation, payload) as SharedCommand,
        busy: false,
        error: null,
      },
    ];
    return this.send(key);
  }
  async retry(key: string): Promise<SharedOutcome> {
    const entry = this.pending.find((r) => r.key === key);
    const outcome = await this.send(key);
    if (entry) this.recovered.set(key, { command: entry.command, outcome });
    return outcome;
  }
  private async reconcileOutcome(
    key: string,
    command: SharedCommand,
    outcome: SharedOutcome,
  ) {
    if (
      outcome.ok &&
      command.operation === "create_draft" &&
      outcome.groupId &&
      key.startsWith("draft:")
    )
      await this.engine.reconcileDraft(
        key.slice(6),
        outcome.groupId,
        command.command_id,
      );
    if (
      command.operation === "publish" &&
      (outcome.ok || outcome.code === "already_published")
    )
      await this.engine.completeDraft(command.payload.group_id);
  }
  private async send(key: string): Promise<SharedOutcome> {
    const entry = this.pending.find((r) => r.key === key);
    if (!entry || entry.busy)
      throw new Error("This request is unavailable or still sending.");
    this.pending = this.pending.map((r) =>
      r.key === key ? { ...r, busy: true, error: null } : r,
    );
    this.emit();
    try {
      const outcome = await this.engine.executeOnline(entry.command);
      await this.reconcileOutcome(key, entry.command, outcome);
      if (
        outcome.ok &&
        entry.command.operation === "create_draft" &&
        outcome.groupId &&
        key.startsWith("draft:")
      ) {
        this.recovered.set(key, { command: entry.command, outcome });
      }
      if (outcome.token && outcome.inviteId)
        this.tokens.set(outcome.inviteId, outcome.token);
      if (entry.command.operation === "revoke_invite" && outcome.ok)
        this.tokens.delete(entry.command.payload.invite_id);
      this.pending = this.pending.filter((r) => r.key !== key);
      this.emit();
      return outcome;
    } catch (error) {
      this.pending =
        error instanceof SharedRemoteError && error.kind === "rejected"
          ? this.pending.filter((r) => r.key !== key)
          : this.pending.map((r) =>
              r.key === key
                ? {
                    ...r,
                    busy: false,
                    error:
                      "The result is uncertain. Retry this same request before starting a replacement.",
                  }
                : r,
            );
      this.emit();
      throw error;
    }
  }
}
const sessions = new WeakMap<SharedSync, SharedRequests>();
export function sharedRequests(engine: SharedSync) {
  let value = sessions.get(engine);
  if (!value) {
    value = new SharedRequests(engine);
    sessions.set(engine, value);
  }
  return value;
}
