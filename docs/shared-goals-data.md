# Shared goals: Step 1 database contract

## Step 4 review amendment (26 October 2026)

The ccece44 review adds two focused corrections to the re-runnable migration.
`set_target` cancellation uses the latest earlier version or, if absent, the
immutable membership `initial_gym_target`. For a next-round joiner whose initial
row shares the pending boundary, 2 → 4 → cancel therefore restores 2 without
requiring a nonexistent earlier row. Current/historical denominators and the
group lock/receipt protocol remain unchanged.

`facta_shared_snapshot` additionally returns `lifecycle`:
`[{group_id, first_scored_round}]`, exactly one row per RLS-visible group. The
date is `min(shared_goal_rounds.round_start)` across its actual scored history;
null explicitly means it has never activated. It is independent of requested
score/check-in/round bounds, so a cold recent-history read can distinguish waiting
from an old pause. No new tables, grants, definer rights, stored lifecycle state
or stored scores. The RPC still runs as invoker, and its bounded arrays retain
their original contract. Older saved/older-server snapshots without this field
remain readable by the client as unknown, with conservative coverage/history
fallback. New summaries are validated, saved and purged with group access.

Actually rerun on disposable PostgreSQL 17.5: **421 checked SQL assertions plus
exception assertions; 22 independent-session races**, each checking a real lock
wait; migration apply/rerun and preservation; generated-copy synchronization;
personal-schema coexistence and the six-year bounded-history query plan.
New coverage includes late-first-target edit/cancel with no earlier version,
persisted restored target, long waiting/old paused activation summaries outside
history bounds, one summary per visible group, former-member summary denial,
and a first-target edit racing cancellation (result restores 2).
Full Auth/JWT/PostgREST remains unverified. See `shared-goals-step4.md` for client
and mounted UI evidence; Step 5 remains unapproved. The owner applies SQL; no live
Supabase project was accessed.

## Original Step 1 checkpoint (historical)

Approved scope: `docs/shared-goals-plan.md` at **5337807**. This checkpoint
implements the database contract only. No shared client, outbox, routing,
widgets or UI is wired. Personal collections and their sync guard are unchanged.
Stop for owner schema/security review before Step 2. The owner applies migrations;
no live Supabase connection was used.

## Files and prerequisites

- `supabase/migrations/20261024160000_shared_goals.sql`: transactional, re-runnable
  migration. Requires PostgreSQL 15+ and the existing Supabase auth schema/roles.
- `supabase/tests/shared_goals.sql`: standalone SQL-editor test, containing the
  migration, assertions and migration rerun, enclosed in a rollback transaction.
- `supabase/tests/shared_goals.assertions.sql`: assertion source, not a separate
  migration. `scripts/build-shared-goals-sql.py` generates the standalone copy;
  `--check` and the desktop copy tests detect drift.
- `scripts/run-shared-goals-tests.py`: loopback-only disposable PostgreSQL runner
  and independent-session race suite; never reads application environment files.
- `apps/desktop/src/lib/database.types.ts`: public table/view/RPC declarations.
  Shared columns, nullability, defaults and public foreign keys were compared
  with the disposable PostgreSQL catalog. Private tables/helpers are excluded.

The migration installs `pgcrypto` in `extensions` if absent. If already installed
elsewhere it raises a clear prerequisite error instead of moving an extension.
New CHECK constraints use `if not exists` against `pg_constraint`. Trigger,
policy and function definitions are replaced on rerun; rows are retained.

## Stored facts and constraints

All entity IDs are UUIDs. Timestamps are `timestamptz`; dates are group-local
calendar dates. Metadata uses server revisions, created/updated timestamps and,
where present, sticky administrative tombstones. Public clients cannot set those
facts directly. There is no shared permanent-delete RPC.

| Public relation      | Contract                                                                                                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared_profiles`    | Auth user PK; unique lowercase ASCII handle `[a-z0-9_]{3,24}`, immutable; trimmed display name 1–80. No email or auth metadata.                                                                                                                                               |
| `shared_groups`      | Owner, trimmed name 1–120, allowlisted icon, Gym/Custom schedule, valid PostgreSQL IANA zone name, weekday 0–6, paired nullable publication timestamp/first date, terminal archive timestamp. Published zone/schedule/anchor are immutable.                                   |
| `shared_memberships` | Immutable group/user/join epoch, initial Gym target 2–7 (null for Custom), eligibility set once, leave set once. One open epoch per group/user; historical epochs cannot overlap. Only an unpublished draft owner may lack eligibility.                                       |
| `shared_targets`     | Unique membership/effective-round; Gym only; target 2–7; aligned to a group boundary at/after eligibility. RPC edits only the next boundary's version. Initial target is inserted atomically with publication/join.                                                           |
| `shared_invites`     | Direct recipient or generic link; pending/accepted/declined/revoked. Terminal states cannot revert. One pending direct record per group/recipient; expired records are revoked before replacement. Expiry checked transactionally, not in a volatile partial-index predicate. |
| `shared_checkins`    | Unique group/user/date, including unchecked rows. Compound membership/group/user FK; immutable identity/date; completed boolean and validated captured instant. Uncheck updates false, never a tombstone.                                                                     |

Deferred invariant triggers lock the group and enforce at most eight open
members plus unexpired direct reservations, a joined owner unless archived,
nonoverlapping epochs and initial published Gym targets. A draft/waiting group
may have one owner; a scored round needs at least two eligible people. A generic
link consumes no seat. Accepting one's own direct reservation replaces it with
membership, including when using a generic token.

`shared_guard` preserves created/identity fields, skips stale server revisions,
advances updated_at monotonically, and refuses resurrection or hard deletion.
The guard is separate from personal `facta_sync_guard`: it does not rewrite
collaborative ownership or accept client full-row timestamps. RLS/grants/RPCs,
not administrator bypass of RLS, are the API authorization boundary.

Private relations in **`facta_private`**, outside the API schema:

- `shared_invite_tokens`: invite ID, unique SHA-256 token digest, version.
- `shared_command_receipts`: actor/command PK, operation, request digest, minimal
  outcome, committed time. Raw token/payload is never stored. Retained without
  automatic cleanup in this checkpoint; cleanup must not permit reapplication.
- `shared_rate_limits`: actor/operation/time bucket/attempt count. Old buckets
  for that actor are pruned during a later budget check.
- `shared_group_invite_budgets`: group/UTC-hour PK and attempt count. A private
  helper holds the group row lock while debiting the shared invitation allowance.
  It is independent of owner identity and survives ownership changes and reruns.

## Lifecycle and authoritative scores

Draft creation stores no scoring anchor. Publication obtains the group lock,
then samples server time and computes the next chosen weekday **strictly after
that group-local date**. It compares `expected_revision` and displayed
`first_round_date`. A stale proposal returns `confirmation_required` with the
new date/revision/zone, without publication or target initialization. A newly
confirmed command publishes and freezes the anchor, and initializes the owner.

Let F be that frozen date. Candidate round n has local dates F+7n through
F+7n+7, converted separately through the frozen zone to instants B and E.
They are not calculated by adding 168 hours (DST tests cover 167/169 hours).
An epoch belongs to the boundary roster if joined_at < B, eligible_round <=
the start date, and left_at is absent or > B. Midnight acceptance is eligible
next round, not the boundary it just reached.

`shared_goal_rounds` includes exactly candidate rounds whose B is no later than
read time, B is strictly before archive, and boundary roster size >=2. Waiting
and paused slots contribute no score rows. First activation/resumption therefore
requires eligible members, not merely two accepted members.

For a boundary roster of size k, pause P is its (k−1)th departure instant (or
infinity). Activity is **[B, min(E,P,archive))**. A started round retains its full
original roster/targets even when interrupted; no denominator proration. A
newly accepted member cannot undo its pause. Resume is possible only at another
qualifying boundary. Archive is terminal: no boundary at/after it is scored,
even when read years later. Archive wins a pause/archive tie; a natural E is
reported as scheduled. Leaving an archived group revokes access without erasing
the history visible to remaining members. An owner must transfer before leaving
an unarchived group; an archived sole owner can leave.

`shared_goal_round_scores` returns those round fields plus membership/user/display
identity, effective target, completed_days, left_at, adherence_pct,
is_at_least_70, competition rank and group_average_pct. Counts include only true
rows from that epoch, date interval, schedule and captured activity interval.
Gym uses the latest target effective no later than that round; Custom derives
7 / weekday count / N. Real eligible zeros remain present. Adherence is numeric
`least(100,100*completed_days/target)`; the threshold is the unrounded >=70.
Ranks tie on capped adherence; average is of capped personal ratios, not pooled
totals. Exactly 70% cannot arise from valid integer denominators 1–7; tests
exercise 2/3 below and 5/7 above, and 1/2, 2/2 and 3/2.

Mutation time is sampled **after** the group lock. Each round-view query samples
an execution clock once in a materialized CTE, including after an RPC lock wait;
request-start time would be stale across a boundary. No production time-setting
GUC or API exists. Fixtures replace clocks only as the disposable database owner.

## Authorization and reads

All six public tables enable RLS. `authenticated` gets SELECT only; anonymous
gets no table/view/RPC privileges. UPDATE policies include USING and WITH CHECK
for intended actor/scope as defense in depth; they do not grant DML. There are
no client INSERT/DELETE policies. Both views use `security_invoker=true` and
`security_barrier=true` throughout their nested reads.

Group data is visible to currently joined members, including next-round members;
draft data only to its owner. A leaver immediately loses remote group/history
access, while current members retain former-member history. Profiles are visible
only to self, co-members/history identities, or pending recipients needed by an
authorized group owner/member. There is no profile directory.

The definer membership predicates have an empty search_path, fully qualified
relations and auth.uid-bound viewer identity; they return booleans, not rosters.
API roles cannot execute mutation helpers, access private tables or choose an
actor. Each elevated command independently validates fields, roles and current
lifecycle. SQL owner/service-role privileges are not claimed to be constrained
by member RLS.

| RPC                                                 | Read contract                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `facta_shared_preview(token)`                       | Signed-in valid bearer token or bound direct recipient only; name, inviter label, schedule/zone/start, publication flag, expiry, accepted count. No roster, targets, scores, check-ins or token.                                                                                                                                                                                                  |
| `facta_shared_pending_invites()`                    | Same limited preview for the caller's unexpired direct invitations, including draft-pending invitations. No automatic acceptance.                                                                                                                                                                                                                                                                 |
| `facta_shared_snapshot(history_from,history_until)` | Security-invoker, one database snapshot. Inclusive history bounds, maximum date difference 366. JSON arrays: groups, memberships, profiles, targets, invites, checkins, rounds, scores. Raw identity/roster arrays are complete for accessible groups; check-ins filter by date and rounds/scores by round start. Rounds and scores derive from one materialized score query to share keys/clock. |

History arrays are a window, not deletion instructions for older cached history.
Clients must use the complete group membership visibility list to reconcile
access. Snapshot pagination and shared cache integration belong to Step 2.

## Commands, receipts and offline check-ins

`facta_shared_command(command_id uuid, operation text, payload jsonb)` is the only
public mutation entry. It returns JSON `{ok,code,...minimal result}`. Payload is
an object <=8192 bytes; each operation allowlists fields and types. Malformed
input raises SQL errors (22023/type cast/23514/FK); product rejections return
`ok:false` with a code. Unknown actor fields are rejected.

| Operation                          | Payload fields (optional in parentheses)                                                          | Main successful code    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| `set_profile`                      | handle, display_name                                                                              | profile_saved           |
| `create_draft`                     | name, template, schedule_kind, time_zone, round_weekday, (icon, weekdays, times_per_week, target) | draft_created           |
| `update_draft`                     | group_id, expected_revision, same complete draft fields                                           | draft_updated           |
| `publish`                          | group_id, expected_revision, first_round_date                                                     | published               |
| `invite`                           | group_id, exact handle                                                                            | invite_issued           |
| `issue_link`                       | group_id                                                                                          | invite_issued           |
| `rotate_invite`                    | invite_id                                                                                         | invite_rotated          |
| `revoke_invite` / `decline_invite` | invite_id                                                                                         | revoked / declined      |
| `join`                             | token OR direct invite_id, (target)                                                               | joined / already_joined |
| `set_target`                       | group_id, target (number or null to cancel pending change)                                        | target_scheduled        |
| `set_checkin`                      | group_id, membership_id, date, captured_at, completed, base_revision                              | checked                 |
| `transfer_owner`                   | group_id, user_id of joined successor                                                             | owner_transferred       |
| `leave`                            | group_id, (transfer_to for unarchived owner)                                                      | left                    |
| `archive`                          | group_id                                                                                          | archived                |

Gym draft/join target is required 2–7; Custom has no personal target. `every`
uses no weekdays/N, `days` needs distinct nonempty weekdays 0–6, `n` needs N1–7
for Custom (Gym N is personal). Published rules cannot be edited. Owner-only
operations are draft edit/publish/invite issue/rotate/revoke/transfer/archive;
only a direct recipient may decline, only self may change target/check-in/leave.
Revoke/decline acknowledge an already terminal invitation without changing its
state or removing any accepted member; refresh the authoritative invitation row.

Commands lock actor/UUID, then group, then affected row. The UUID binds the
operation/body digest. **Every normally returned outcome**, including a product
rejection, is receipted atomically; a SQL exception rolls back everything. An
exact retry returns that outcome without new work; a different body returns
`command_mismatch`. A changed proposal or explicit new attempt after a rejection
needs a new UUID. Rejected future/gap commands never later turn into writes.
Transport timeout retries preserve UUID/body. A successful receipt may be
acknowledged after leave/archive without disclosing newly inaccessible data.

Issue/rotate produce 32 random bytes as 43 base64url characters, usable by the
future `facta://join/<token>` parser. Only a digest is stored; receipts strip the
token. A lost issue reply cannot recover its token through receipt replay: issue
another link, or rotate a known invite with a **new** command. Expiry is seven
days (168 hours, independent of session DST); rotation/revocation is rechecked after the join lock. Rate limits per actor:
20 issue/rotate attempts per hour, 10 exact handle lookups per minute and 10
failed preview/redemptions per minute. In addition, each **group** has 20
invitation issue/rotation attempts per fixed UTC hour, shared by all owners.
After authorization and the actor budget check, `invite`, `issue_link` and a
pending invite's `rotate_invite` debit this allowance under the group lock.
Direct and generic invitations share it. A group rejection returns
`{ok:false,code:"rate_limited",scope:"group_invites"}` before any token or invite
change. Invalid/terminal rotations do not reach this budget; normal rejected
attempts that reach it consume a slot. This limits invitation churn; accepted
members plus live direct reservations still have the separate eight-seat limit.

Expiry, revoke/decline, acceptance and owner transfer never refund/reset the
group allowance. Rotating an expired pending invite refreshes expiry and spends
a slot, subject to the existing direct-seat capacity checks. The next UTC hour
has a new allowance; archive remains read-only. Counters are private and old
buckets are pruned after two days without changing a current allowance.

`set_profile` now allows **10 availability attempts per actor per fixed UTC
minute**, before looking up another account's handle, including for actors with
no profile. Both `handle_taken` and a successful first setup consume an attempt;
the eleventh returns `{ok:false,code:"rate_limited",scope:"profile_setup"}`.
Malformed input is rejected before lookup. The actor's profile lock serializes
setup attempts. Existing profiles may edit their display name on their immutable
handle without availability charges; changing that handle remains forbidden.
If another account wins a concurrent free-handle claim, only the losing insert
rolls back: its attempt and `handle_taken` receipt commit normally.

All buckets use server time. SQL exceptions roll back budgets;
application-level rejected attempts commit them. Exact command-receipt retries
bypass budget evaluation and never spend another slot or mint another token.
A new attempt after a product rejection or bucket rollover needs a new UUID.

Check-in intent contains desired state, original membership epoch/date/capture,
and base row revision, never toggle. The capture must equal the group-local date,
not be in the future, and be today or one of the previous seven local dates.
Its original round must exist, include that epoch, and contain its capture in
the half-open active interval. Specific-day schedules reject rest days.

Natural-key state is serialized: same desired state acknowledges the current
row; stale opposing state returns `conflict` with current revision/state.
Uncheck/recheck advances the same row. `membership_changed` rejects old epochs;
`inactive_period` rejects waiting/pause-gap intents before or after resumption.
Still-joined members can settle pre-pause captures within grace. Archive rejects
unseen check-ins even for pre-archive captures; committed receipts only acknowledge.
Other notable rejections: forbidden, archived, owner_transfer_required,
confirmation_required, full, expired, invalid_invite, profile_required,
not_published, invalid_date, rest_day, rate_limited. Offline capture time remains
self-reported within grace; this is not an anti-cheat guarantee.

## Executed verification and limits (24 October 2026)

Docker Desktop did not expose its engine pipe. Tests instead used a newly
initialized, loopback-only PostgreSQL **17.5** Windows cluster, with pgcrypto,
temporary native binaries and psycopg 3.2.10 under ignored `tmp/`. No project
dependency or lockfile changed. The runner creates a randomly named database,
never reads `.env`/DATABASE_URL/Supabase keys, and drops only its own successful
test database. Failed runs are retained with their generated name for inspection.

This is real SQL, triggers, grants/RLS and RPC execution under actual `anon` and
`authenticated` roles. Its minimal auth.users/auth.uid fixture sets actor claims;
it does **not** run Supabase Auth, PostgREST, HTTP JWT verification, or packaged
clients. It does not prove those integration properties. Local Supabase SQL-editor
execution remains available using the standalone script before owner application.

The standalone suite applies and reruns the migration, checks preservation of
memberships/check-ins/receipts/archived scores, and rolls back. It executes all
five approved lifecycle scenarios, exact pause/archive/boundary/expiry/grace
cutoffs, valid zeros versus absent rounds, target history/cancellation, Gym and
Custom scores, ties/averages, weekday/leap/UTC/DST cases, epoch replay, recipient
preview privacy, capacity/reservations, token rotation/revocation, rate limits,
real-role cross-group/former/anonymous reads, nested invoker views, denied private
helpers/direct writes, actor injection and actual constraint/guard failures.

Initial checkpoint (`87183cc`): **304 checked assertions plus exception assertions**, followed
by **17 passing independent-session races**. A separate coexistence check applied
both personal migrations, seeded goals/events/notes/diary, and reran the shared
migration: all four rows and the personal sync guard were preserved. An actual
authenticated EXPLAIN ANALYZE over a synthetic group starting in January 2020
returned a bounded 2026 history window and used membership/target indexes. This
small fixture is query-plan evidence, not an account-scale performance claim.

Review follow-up: **409 checked SQL assertions plus exception assertions and
21 independent-session races passed** on the same disposable PostgreSQL 17.5
infrastructure. Both focused regressions were observed failing before the
respective fixes, then passing. Tests cover the shared issue/rotation allowance
across repeated ownership transfers, revoke and expiry without refunds, expired
rotation and exact new-hour rollover, budget preservation on migration rerun,
and denied access to the private budget table/helper. Profile tests cover
profile-less `handle_taken` attempts, exact minute rollover, separate actors,
legitimate setup, display edits, and successful/rejected receipt retries.
Migration coexistence and the historical query plan were rerun successfully.

The concurrency runner uses **two independent connections per case**, switches
both mutation sessions to authenticated, and asserts a PostgreSQL lock wait
before releasing the first transaction. Cases: final seat; same UUID lost-reply
retry; same UUID changed body; opposite stale states; join before revoke; revoke before join; rotation
before old-token join; check-in before archive; archive before check-in; own
check-in before leave; leave before own check-in; two next-target edits; transfer
before new-owner leave; member leave before transfer; leave before next-round
join; join before transfer; and a lock wait spanning a round boundary.
The four review races add: last group slot consumed by rotation followed by
ownership transfer in one transaction versus the new owner's issuance; two setup
calls competing for the last availability slot; two accounts claiming the same
free handle (the loser stays charged); and concurrent replay of a taken-handle
receipt (no duplicate charge). Setup attempts use separate committed connections
to verify durability across RPC calls, not just visibility inside one transaction.

Reproduce with a **disposable loopback cluster** and a temporary test-only Python
environment containing `psycopg[binary]>=3.2`:

```powershell
python scripts/build-shared-goals-sql.py --check
python scripts/run-shared-goals-tests.py --port <local-disposable-port> --output tmp/shared-goals-results.json
python scripts/run-shared-goals-tests.py --port <local-disposable-port> --only invitation-budget
python scripts/run-shared-goals-tests.py --port <local-disposable-port> --only profile-budget
```

The runner requires a local role able to create/drop its randomly named test
database and set test roles; optional password comes only from
FACTA_TEST_PG_PASSWORD. Its auth scaffold is intended for a dedicated cluster,
not a production instance. For full local Supabase, run the standalone SQL file
in a fresh scratch project's SQL editor as database owner; do not use the runner
to impersonate a full Auth/HTTP stack.

Required baseline validation is recorded separately in HANDOFF. TypeScript,
Vitest/source-copy tests, Vite and cargo checks establish build/regression
properties; they are not substitutes for the SQL/security/concurrency evidence.
HTTP/Auth integration, large-account load testing, native links, client storage
and all shared UI/widget acceptance remain outside Step 1.
