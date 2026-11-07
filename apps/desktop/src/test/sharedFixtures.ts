export const SHARED_USER = "11111111-1111-4111-8111-111111111111";
export const SHARED_OTHER = "22222222-2222-4222-8222-222222222222";
export const SHARED_GROUP = "33333333-3333-4333-8333-333333333333";
export const SHARED_MEMBER = "44444444-4444-4444-8444-444444444444";
export const SHARED_MEMBER_OTHER = "55555555-5555-4555-8555-555555555555";
export const SHARED_NOW = Date.parse("2026-10-20T09:00:00Z");
export const SHARED_RANGE = { from: "2026-10-01", until: "2026-10-31" };

/** Literal valid RPC data for pure codec/reconciliation tests, not a server. */
export function sharedRpcFixture() {
  const meta = {
    created_at: "2026-10-14T09:00:00Z",
    updated_at: "2026-10-14T09:00:00Z",
    revision: 1,
    deleted_at: null,
  };
  const round = {
    group_id: SHARED_GROUP,
    round_start: "2026-10-19",
    round_end: "2026-10-26",
    activity_start: "2026-10-18T21:00:00Z",
    scheduled_end: "2026-10-25T21:00:00Z",
    activity_end: "2026-10-25T21:00:00Z",
    roster_size: 2,
    end_reason: "scheduled",
    is_active: true,
  };
  return {
    groups: [
      {
        id: SHARED_GROUP,
        owner_id: SHARED_USER,
        name: "Exercise",
        icon: "dumbbell",
        template: "gym",
        schedule_kind: "n",
        weekdays: [],
        times_per_week: null,
        time_zone: "Asia/Riyadh",
        round_weekday: 1,
        first_round_date: "2026-10-19",
        published_at: "2026-10-14T09:00:00Z",
        archived_at: null,
        ...meta,
      },
    ],
    profiles: [SHARED_USER, SHARED_OTHER].map((id, i) => ({
      user_id: id,
      handle: `person_${i}`,
      display_name: `Person ${i}`,
      ...meta,
    })),
    memberships: [SHARED_USER, SHARED_OTHER].map((id, i) => ({
      id: i ? SHARED_MEMBER_OTHER : SHARED_MEMBER,
      group_id: SHARED_GROUP,
      user_id: id,
      joined_at: "2026-10-14T09:00:00Z",
      eligible_round: "2026-10-19",
      left_at: null,
      initial_gym_target: 2,
      ...meta,
    })),
    targets: [SHARED_MEMBER, SHARED_MEMBER_OTHER].map((id, i) => ({
      id: i
        ? "77777777-7777-4777-8777-777777777777"
        : "66666666-6666-4666-8666-666666666666",
      membership_id: id,
      effective_round: "2026-10-19",
      target: 2,
      ...meta,
    })),
    invites: [],
    checkins: [],
    rounds: [round],
    scores: [SHARED_USER, SHARED_OTHER].map((id, i) => ({
      ...round,
      membership_id: i ? SHARED_MEMBER_OTHER : SHARED_MEMBER,
      user_id: id,
      display_name: `Person ${i}`,
      handle: `person_${i}`,
      target: 2,
      completed_days: 0,
      left_at: null,
      adherence_pct: 0,
      is_at_least_70: false,
      rank: 1,
      group_average_pct: 0,
    })),
  };
}
