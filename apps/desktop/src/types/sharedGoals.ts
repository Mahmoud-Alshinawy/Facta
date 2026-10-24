import type { Database, Tables } from "@/lib/database.types";
type Camel<S extends string> = S extends `${infer A}_${infer B}`
  ? `${A}${Capitalize<Camel<B>>}`
  : S;
type Mapped<T> = { [K in keyof T as K extends string ? Camel<K> : K]: T[K] };
export type SharedGroup = Mapped<Tables<"shared_groups">>;
export type SharedProfile = Mapped<Tables<"shared_profiles">>;
export type SharedMembership = Mapped<Tables<"shared_memberships">>;
export type SharedTarget = Mapped<Tables<"shared_targets">>;
export type SharedInvite = Mapped<Tables<"shared_invites">>;
export type SharedCheckin = Mapped<Tables<"shared_checkins">>;
type RequiredView<N extends keyof Database["public"]["Views"]> = {
  [K in keyof Database["public"]["Views"][N]["Row"]]: NonNullable<
    Database["public"]["Views"][N]["Row"][K]
  >;
};
export type SharedRound = Mapped<RequiredView<"shared_goal_rounds">>;
export type SharedScore = Omit<
  Mapped<RequiredView<"shared_goal_round_scores">>,
  "leftAt"
> & { leftAt: string | null };
export interface HistoryRange {
  from: string;
  until: string;
}
export interface SharedSnapshot {
  groups: SharedGroup[];
  profiles: SharedProfile[];
  memberships: SharedMembership[];
  targets: SharedTarget[];
  invites: SharedInvite[];
  checkins: SharedCheckin[];
  rounds: SharedRound[];
  scores: SharedScore[];
}
export interface SharedDraftFields {
  name: string;
  icon?: string;
  template: "gym" | "custom";
  schedule_kind: "every" | "days" | "n";
  weekdays?: number[];
  times_per_week?: number | null;
  time_zone: string;
  round_weekday: number;
  target?: number | null;
}
export interface SharedCheckinPayload {
  group_id: string;
  membership_id: string;
  date: string;
  captured_at: string;
  completed: boolean;
  base_revision: number;
}
export interface SharedCommandPayloads {
  set_profile: { handle: string; display_name: string };
  create_draft: SharedDraftFields;
  update_draft: SharedDraftFields & {
    group_id: string;
    expected_revision: number;
  };
  publish: {
    group_id: string;
    expected_revision: number;
    first_round_date: string;
  };
  invite: { group_id: string; handle: string };
  issue_link: { group_id: string };
  rotate_invite: { invite_id: string };
  revoke_invite: { invite_id: string };
  decline_invite: { invite_id: string };
  join: (
    { token: string; invite_id?: never } | { invite_id: string; token?: never }
  ) & { target?: number | null };
  set_target: { group_id: string; target: number | null };
  set_checkin: SharedCheckinPayload;
  transfer_owner: { group_id: string; user_id: string };
  leave: { group_id: string; transfer_to?: string | null };
  archive: { group_id: string };
}
export type SharedOperation = keyof SharedCommandPayloads;
export type SharedCommand<K extends SharedOperation = SharedOperation> = {
  [P in K]: {
    readonly command_id: string;
    readonly operation: P;
    readonly payload: Readonly<SharedCommandPayloads[P]>;
  };
}[K];
export interface SharedOutcome {
  ok: boolean;
  code: string;
  groupId?: string;
  membershipId?: string;
  revision?: number;
  firstRoundDate?: string;
  timeZone?: string;
  id?: string;
  completed?: boolean;
  inviteId?: string;
  token?: string;
  effectiveRound?: string;
  target?: number;
  scope?: string;
}
export interface SharedInvitePreview {
  ok: true;
  inviteId: string;
  groupId: string;
  name: string;
  inviter: string;
  template: string;
  scheduleKind: string;
  weekdays: number[];
  timesPerWeek: number | null;
  timeZone: string;
  roundWeekday: number;
  firstRoundDate: string | null;
  published: boolean;
  expiresAt: string;
  acceptedCount: number;
}
