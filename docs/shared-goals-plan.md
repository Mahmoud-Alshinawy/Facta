# Shared goals implementation plan — branch 3

Status: **proposed; stop for owner review before application code or migrations**.
Prepared 24 October 2026. Base: `origin/main` at `aa7f69a`
(`aa7f69afedf9943ba94590e578a0dde5e66ee028`). Branch: `feat/shared-goals`.
Branch 2 was squash-merged; do not merge `feat/notes-diary` again.

## 1. Established requirements

The owner's recovered branch-3 brief establishes:

- GoalsShared, GoalsDetail and GoalsCreate: template selection, Gym, Custom,
  review, pending/invitation, empty states and Join with a link.
- Groups contain **2–8 people**, including the creator as shown in the design.
- Gym members choose individual weekly targets on joining, minimum two days.
  Everyone sees the targets. Target changes apply next round.
- Custom uses every day, specific weekdays, or N times per week, shared by all.
- Adherence is completed days divided by the member's target, capped at 100%
  per round. Check-ins are one row per person per day **within each goal**.
- Each goal has its own round start, selected on creation and defaulted from
  the creator's week-start preference. Changing that preference later must not
  change an existing goal's round.
- Leaderboard bars are green at adherence >=70%, grey below 70%.
- Authoritative scoring is computed in a Postgres view. RLS limits group data
  to its members. Invite tokens work through `facta://` deep links.
- Cover time zones, round boundaries, leaving and offline operation.

The existing project rules remain: new re-runnable migration files only; RLS
USING/WITH CHECK as appropriate to each operation; immutable identities,
newer-wins/sticky-deletion protections; SQL tests; no live Supabase access or
application of migrations. The owner applies reviewed migrations. Tokens only,
bundled fonts, external scripts/CSP, reachable controls and visible keyboard
focus. Every completed step includes HANDOFF, required checks, the specified
author, commit and push. Never force-push or perform destructive Git operations
without asking. Branches 1 and 2 are complete, not restarted by this work.

## 2. Design evidence and conflicts

Read the three component files separately, including their markup, state props
and sample render logic. `canvas.json` lists GS/GD/GC boards in all four themes,
with 1100 variants for principal layouts and GC-join boards. Samples are invented
data, not backend contracts. Main and Widget were additionally inspected for
integration. No hosted-board visual comparison was performed for this plan.

| Source | Established visual/behavioral evidence | Implementation coverage |
| --- | --- | --- |
| `design/canvas-v97/GoalsShared.dc.html` | default/empty/pending/notice; Mine/Shared tabs; active rounds, per-goal ranks, today's remaining check-ins; ranked cards, pending avatars, invitation Accept/Decline, target-change notice; Join with a link | Real groups and server scores; pending members have no score/rank; loading/offline/error/full/expired states accompany the approved states |
| `GoalsDetail.dc.html` | default/checked/notice/pending; own target edit, check-in toggle, all-member leaderboard and targets, seven-day check-in table, six-week sample history; C check-in, Esc back, Tab panels | Gym and Custom detail variants; effective target, rest/upcoming/pending/left states; server-derived history and ties |
| `GoalsCreate.dc.html` | template/gym/custom/empty/pending/review/join; Template → Details → People → Review; name/icon, schedule, round weekday, Copy link, username invitation; join target; validation; Enter next, Esc cancel, arrows choose options | Real validation and transactional create/join/decline; no fake invite success; duplicate submission protection; preserve Back drafts, reset on a new wizard |
| `Main.dc.html` | populated shared leaderboard in Today's right panel, empty Gym/Custom launchers; personal row sample says “counts toward …” | Populate that panel and wire template launchers without restyling Today; decide explicit personal-goal linking separately below |
| `Widget.dc.html`, Progress section | Personal daily progress plus a small shared weekly leaderboard | Add a bounded shared summary to existing Progress widgets; no new widget type is required |

Design-derived details to preserve: Gym target bounds 2–7, Custom N bounds 1–7;
at least one selected weekday; at most eight including the owner; target notices
name the actual next round, not a hard-coded Monday. People joining after the
first round has begun start the next round (`GoalsCreate` renderVals). The design
has no implemented leave flow; propose an accessible detail action/confirmation.

Conflicts/decisions needing approval:

1. The empty-state copy says “invite 2 to 8 friends,” but People says “including
   you.” Follow the owner's 2–8 **total** and correct that copy.
2. “Green” bars use `--accent` in the designs, which is blue in Midnight and
   orange in Ember. Proposed: use existing `--event-green` for >=70% and
   `--text-2` for lower scores in all themes. Percentage/text labels remain.
   This follows the written product rule but differs from themed board accents.
3. People displays an HTTPS sample link before Create. No hosting service is in
   scope. Proposed: a real `facta://join/<token>` link, issued only against a
   server-side waiting draft. Copy explains that activation awaits creation.
   Never copy a locally invented/unredeemable token as though it were usable.
4. Link-only creation conflicts with the design's “add at least 1 more person”
   gate. Proposed: permit publishing a one-owner **waiting** group for a link;
   it cannot score or accept check-ins until two members are eligible. This is
   an explicit lifecycle exception for review, not a relaxation of active size.
5. Username invitations require identity/profile support absent from main.
   Proposed minimal handle/display-name setup in the first create/join flow;
   no public user directory, contact import, email sending or social network.
6. The Main sample couples a personal tick to shared adherence. That coupling
   is not specified by the recovered brief. Proposed branch-3 baseline keeps
   personal completion independent, with direct shared check-in controls and
   separate summaries. Do not display a misleading “counts toward” badge.
   If coupling is required, approve an explicit link/action contract and amend
   this plan before schema work; never match titles or silently double-count.

## 3. Proposed product decisions for review

Everything in sections 3–8 is a proposal unless explicitly established above.

### Rounds, eligibility and time

- One shared goal is one group; no separate team/organization hierarchy.
- Store an **IANA group time zone**, defaulting to the creator's device zone and
  visibly confirmed at creation. All members share this calendar. Travel and
  individual calendar preferences only affect presentation, not check-in dates.
- Store weekday 0–6 and a first-round local `date`. A round is seven calendar
  dates starting at midnight in the group zone, with an exclusive next-start.
  Derive UTC boundary instants on the server; never add 168 hours across DST.
- Default the first round to the next chosen weekday, strictly after creation's
  group-local date. The selected weekday repeats every seven calendar dates.
  Display first date, zone and range on Review/Join. Do not infer rounds from
  ISO week numbers. Freeze zone/anchor/schedule after publish in this branch;
  Custom schedule editing is outside the recovered scope.
- Creator and members joined before first start are eligible from first start.
  Later joiners become eligible at the next boundary, even on boundary day after
  midnight. They can see group data once joined, but cannot score/check in early.
  Show “Starts …” rather than 0%/missed days before eligibility.
- A waiting group starts scoring only at a boundary with >=2 eligible members.
  Never score a shortened first round. Pending invitations have no denominator.
- Gym/N-per-week allows a check-in on any eligible day, including after reaching
  target; distinct days beyond target remain visible but adherence caps at 100%.
  Custom specific-day goals reject off-schedule check-ins; every-day target=7,
  specific-day target=number of distinct selected weekdays, N-per-week target=N.
- A member can revise/cancel their pending Gym target; only the latest confirmed
  choice for the next round applies. The current round and history keep their
  effective targets. No per-person override for Custom.

### Membership, invitations and leaving

- Count accepted members plus unexpired **targeted seat reservations** toward
  the eight-person cap. A generic share link reserves no seat. Every capacity
  change locks the same group row and rechecks the limit in one transaction.
  Targeted acceptance exchanges a reservation for membership, not two seats.
- Creator manages invitations. Members manage only their own check-in/target
  and may leave. No member removal, moderation, chat, reactions or notifications
  beyond in-app invitation/status UI is proposed.
- Waiting/private drafts can have one creator, but cannot be presented as an
  active group. Drafts are creator-only; invite previews say not yet published.
  Stale drafts can be explicitly discarded/archived. No automatic deletion.
- Direct invitation banners are visible to their recipient before joining.
  Decline clears that invitation/reservation; repeated decline is harmless.
  A generic link may be dismissed locally; dismissing must not revoke it for
  everyone. A generic link remains redeemable until expiry/revocation/capacity;
  only direct invites move to accepted on redemption. Membership/command
  receipts record individual generic-link redemptions. Members see pending
  names/statuses, never invite secrets.
- Leaving is online and immediate after server confirmation. Confirm what access
  is lost and resolve unsent check-ins first. Former members lose group reads
  and writes; a successful leave purges its local snapshot/widget selection.
  Keep their already-accepted check-ins in peer-visible round history with a
  “Left” label. Future rounds exclude them. Current round roster/targets remain
  fixed; do not rewrite earlier denominators or prorate.
- If accepted membership falls below two, pause new check-ins and show a waiting
  state. Resume at a boundary with two eligible people; keep historical scores.
  If an owner leaves, require an atomic ownership transfer to an accepted member
  or archive the group. A sole remaining owner may archive then leave. Archive
  is read-only for remaining members, not a hard deletion. Rejoining requires a
  fresh invite and membership epoch; old targets/eligibility are not revived.

### Offline behavior and conflict rule

- Cached groups/details/history remain readable offline with last-confirmed time.
  Creation/publish, usernames, invite issue/redeem/decline/revoke, target edits,
  ownership transfer and leave require online confirmation. A wizard draft can
  be saved locally; it is not a created group and has no fake “Invite sent”.
- Check-ins can be queued offline after a previously confirmed eligible join.
  Queue **desired checked state**, not “toggle”. Keep group-local date, actor,
  membership epoch, base row revision, command UUID and captured time. Never
  change an old queued day into today's date on replay.
- Proposed replay grace: today plus the previous seven group-local dates.
  No future dates; membership must have been eligible that date and still permit
  access when replayed. Closed-round history can change within that grace and
  is labelled awaiting late sync. Too-old/revoked/off-schedule commands become
  visible failures with review/discard, not silent success or endless retries.
  Offline dates are self-reported within this window; it is not anti-cheat proof.
- Server serializes the natural-key row. Same desired state is idempotent;
  opposing states with a stale base revision return a conflict/current state.
  Keep the unsent intent visible; offer an explicit new attempt, never auto-
  overwrite another device. Only unsent commands for the same key may coalesce;
  an in-flight command keeps its UUID/body and a newer edit waits separately.
- Command receipts make a timeout-after-commit retry return its original result,
  including when the caller has since left; such receipts return only that
  caller's minimal outcome, no newly inaccessible group data. Reusing a UUID
  with a different body is rejected. Server revision/time determines ordering,
  not a client clock. Persist acknowledgement and intent removal atomically.
- A local checkmark can say Pending, but offline code must not invent a new
  authoritative rank/score. Keep the last server leaderboard until confirmed.

## 4. Proposed schema and mutation API

Names below are planned, not files/tables already implemented. Use UUID entity
IDs, UTC timestamps, indexed FKs and explicit limits. Constrain identities in the
database, not just the UI. Do not change personal goals/events/notes/diary rules.

| Table | Important fields and constraints |
| --- | --- |
| `shared_profiles` | `user_id` FK to auth; case-normalized unique handle (proposed ASCII letters/digits/underscore, 3–24), display_name 1–80; timestamps. No email/password/public auth metadata. Own updates only; handles immutable for this branch. |
| `shared_groups` | id, owner_id, name 1–120, allowlisted icon, template gym/custom, schedule kind, weekday array or N, IANA zone, round weekday, first_round_date, publication draft/published/archived, timestamps/revision/deleted_at. Derive waiting/active/paused from publication, group-local time and current eligible membership; do not require a cron job to flip a flag at midnight. CHECK the mutually exclusive schedule shapes; distinct weekday values 0–6/nonempty; N 1–7. Trigger validates zone, anchor weekday, immutable published rules, owner membership and lifecycle. |
| `shared_memberships` | id (membership epoch), group_id, user_id, joined_at, eligible_round, left_at, timestamps/revision/deleted_at; partial UNIQUE(group_id,user_id) for an open membership. Group/user/epoch immutable; eligible_round on a group boundary. Active owner must be a joined member. Capacity and last-owner invariants require locked RPC/trigger checks, not a cross-row CHECK. |
| `shared_targets` | id, membership_id, effective_round, target smallint 2–7, timestamps/revision/deleted_at; UNIQUE(membership_id,effective_round). Gym only, own target only; initialize on join, changes restricted to next round. Custom target derives from the fixed shared schedule. Old effective records survive subsequent changes. |
| `shared_invites` | id, group_id, inviter_id, recipient_id nullable, kind direct/link, state pending/accepted/declined/revoked, expires_at, timestamps/revision; one live direct invite per group/recipient. “Live” expiry is checked transactionally; do not put volatile now() into an index predicate. Recipient cannot be owner/already joined; targeted reservation release and acceptance are atomic. |
| `private.shared_invite_tokens` | invite_id FK, unique token digest, token version; no API schema exposure, SELECT or raw-token persistence. A direct invite has a recipient; a generic token is capacity-limited and reusable until expiry/revocation. Proposed TTL seven days; issuer can rotate/revoke. |
| `shared_checkins` | id, group_id, user_id, membership_id, checkin_date, completed boolean, created_at/updated_at, revision; UNIQUE(group_id,user_id,checkin_date), including false states. Compound FK/trigger ensures membership belongs to that same group/user. Changing group/user/day forbidden. Uncheck sets completed=false; never use sync tombstone undelete for undo. |
| `private.shared_command_receipts` | actor_id + command_id primary/unique, operation, request digest, minimal outcome, committed time. Bounded payloads; no invite token bodies. Required for replay after lost replies. Retention must exceed the replay window; server date/age validation must reject expired commands before any eventual receipt cleanup can allow reapplication. |
| `private.shared_rate_limits` | actor/scope/operation/window key, count and expiry; transactional bounded counters for invite issue, exact-handle lookup and failed redemption. No client read/write grants; generic invalid tokens are not retained as raw keys. |

Lifecycle states are not permanent deletes. Where deleted_at is present, retain
sticky tombstones; unchecking, leaving and archiving use their explicit state.
New shared guards preserve created_at/identity, enforce newer accepted server
versions and prevent resurrection. Do **not** attach the personal
`facta_sync_guard` unchanged: its user_id ownership rewriting and timestamp-only
row contract do not express group capacity, roles or command conflicts. Document
the shared guard variant and test it alongside unchanged personal guard tests.

All collaboration mutations go through narrow authenticated RPCs: draft/create,
publish, set profile, invite-by-handle/issue-link/rotate/revoke, preview invite,
accept/decline, set-next-target, set-checkin, transfer-owner, leave and archive.
Use a consistent group → membership → target/check-in lock order. The caller's
identity always comes from auth.uid(); never trust an actor/user supplied by the
client. RPCs validate every field and role even when executed with elevated
table privileges. Network failures return retryable outcomes; full/expired,
ineligible, conflict and forbidden are distinct product outcomes.

## 5. RLS, tokens and scoring

### Access boundaries

- Enable RLS on every public shared table. Anonymous users get no table or RPC
  grants. No globally readable profiles/groups, even with guessed UUIDs.
- SELECT groups, memberships, effective targets and check-ins only for currently
  joined members of that group (including not-yet-eligible members); creator
  alone sees drafts. A current member can see the group's former-member history.
  Leave revokes that viewer's group access, not other members' history.
- Avoid membership-policy recursion with a narrowly scoped membership predicate
  in a non-exposed schema: controlled definer owner, fixed empty search_path,
  fully qualified names, caller bound to auth.uid(), boolean result only. Do
  not expose a helper accepting an arbitrary viewer ID or a list of user IDs.
- Client table mutation grants are revoked for collaborative state. Define
  UPDATE policies with both USING and WITH CHECK for the intended actor/scope
  as defense in depth, and INSERT/DELETE policies only where applicable; do not
  grant ordinary DML merely to make a policy exercisable. RPC ownership bypass
  is a separate, explicit trust boundary covered by direct RPC tests.
- Profile read policy allows self/co-members, including a former member's display
  identity needed by a currently authorized group's history, not a directory.
  Exact-handle
  invitation lookup is authenticated, owner-scoped and server rate-limited;
  it returns only the candidate display label/invite result. Do not allow
  wildcard/substring browsing or query auth.users from the frontend.
- Recipient-facing invite metadata is a deliberately limited exception to
  member-only group browsing: only a matching targeted invite or valid bearer
  token can return inviter display name, group name/template, zone, schedule,
  start and seat count. No check-ins, leaderboard or full roster until joining.
  The join board's everyone-target list is therefore deferred until acceptance,
  or needs an explicit owner-approved preview-access exception.
- Tokens use at least 32 random bytes, opaque base64url; store only a digest.
  Match exact `facta://join/<token>` shape and token length/charset. Do not log
  raw URLs/tokens, put them in widgets.json, analytics, error reports or general
  sync caches. Rate-limit issue/lookup/redeem online. Raw tokens returned once
  by issue/rotate; Copy uses that in-memory result, not a token table read.
- A signed-out deep link can wait in session memory through sign-in. If a flow
  requires process restart, ask the user to reopen/paste the link rather than
  writing it unprotected to persistent planner state. No automatic redemption.
  Show inviter/template/start, collect Gym target, then explicit Join. A direct
  token is bound to its recipient; a generic link joins the signed-in actor.

The scoring view must use `security_invoker=true`, with permissions/RLS on all
underlying public relations. This uses caller rights rather than view-owner
rights ([PostgreSQL CREATE VIEW](https://www.postgresql.org/docs/17/sql-createview.html)).
Verify the actual local database supports that option before implementing;
PostgREST's version in TypeScript is not the database version. An older server
is a review blocker, not a reason to ship an owner-bypassing view. For narrow
definer RPCs, fix search_path and explicitly revoke default execution before
granting approved entry points ([Supabase database functions](https://supabase.com/docs/guides/database/functions)).

### Authoritative view contract

Propose `shared_goal_round_scores`, keyed by group, round_start and membership
epoch, returning user display identity, round start/end, effective target,
completed_days, numeric adherence_pct, is_at_least_70, rank and status. Generate
bounded rounds from first start through current round, not indefinitely into the
future. The app requests current plus a paginated history range; inspect plans
and index use for long-lived groups before accepting the query.

For each eligible member/round, count unique completed check-in dates in the
seven-date interval, respecting schedule and membership eligibility. Start from
the round roster and LEFT JOIN check-ins so zero completions are included.
Find the latest Gym target effective <= that round, never the current target
applied backwards. Custom derives its common denominator from schedule.

Adherence = least(100, 100 × completed_days / target), using numeric division.
Return the >=70 boolean from the unrounded value. No client-computed ranking or
client-writable score column. Pending/not-started members have no score; zero
completed eligible days score 0. Average uses each eligible person's capped
adherence (not pooled completed days/targets). Pending invitees are excluded.
Competition ranks share ties by adherence; stable display ordering may use done
count then user ID, but does not give extra rank credit above 100%. History names
all tied leaders. Do not penalize pre-join days or erase a leaver from past
rosters. Late accepted check-ins recompute the affected round within replay grace.

## 6. Client, persistence and integration

Inspected integration points on `aa7f69a`:

| Existing code | Planned change |
| --- | --- |
| `components/goals/GoalsPage.tsx` | Replace Shared coming-soon branch; retain Mine List/Board/filters/overview. Hoist route intent for tab/detail/wizard; tab-dependent header actions/counts. Personal N and shared Shift N must not compete. |
| `components/TodayPanel.tsx` | Replace SharedGoalsEmpty for joined groups with approved right-panel leaderboard/launcher, group picker/open action and explicit shared check-in. Preserve approved personal layout/now line. Shared totals stay separate from personal goalStats under the proposed baseline. |
| `hooks/useGoals.ts`, `lib/goalStats.ts`, `lib/goalDates.ts` | Existing personal data has no shared relationship; do not duplicate a shared group into personal goals or modify personal stats implicitly. Add only reviewed explicit coupling if decision 6 changes. |
| `App.tsx`, native deep-link/single-instance setup in desktop `src-tauri/src/lib.rs` | Reuse existing Tauri onOpenUrl/getCurrent and focus handling. Add a strict, tested route parser distinguishing auth, join and group focus; do not extend substring URL matching. Preserve OAuth and Notes/Diary widget focus behavior; defer auth-dependent navigation until session/store ready. |
| `lib/sync/{engine,collection,queue,supabaseRemote}.ts`, `hooks/useSync.tsx` | Personal queue has four full-row tables and ownership-based fetchAll. Shared commands require a separate adapter/outbox, not arbitrary row upserts through that queue. Integrate lifecycle/reconnect/focus/backoff/status without blocking personal collections when shared schema/service is unavailable. |
| `lib/sync/indexedDbStore.ts`, `quitBarrier.ts` | Extend allowed per-user keys for shared snapshots, drafts, outbox and receipts. Reuse async flush/visible quota failure/quit durability; no second localStorage body cache or OS watcher. |
| `lib/widgetExportBus.ts`, desktop Rust export command | Export a bounded `shared_goals` projection and revision/confirmed time from the shared snapshot after store.flush; account changes and leave replace/remove it. No invite tokens, raw history, profile directory or pending invite list. |
| `widgets/src/lib/sharedData.ts`, `ProgressWidget.tsx` | Read server-confirmed small leaderboard plus pending/stale label; cap displayed rows to top three plus self. Use stable selected group, not whichever cache row arrived first. No score recomputation in widgets. |
| `lib/widgetConfig.ts`, `WidgetManager.tsx`, settings `WidgetPreview.tsx` | Optional Progress widget group selection, default deterministic active group; preserve existing widget configs/types. Display daily personal ring plus shared weekly rows per Widget design. Selection becomes unavailable on leave and clears on account change. |
| Widgets Task/Day/Calendar and `lib/widgetActions.ts` | Existing toggle_goal targets personal IDs. Keep that behavior unless explicit coupling is approved. Progress is read-only apart from Open group; no new shared toggle or heavy widget application. Shared “Today” is group-local if shown anywhere. |

Proposed new client files: `types/sharedGoals.ts`, `hooks/useSharedGoals.ts`,
`lib/sharedGoals/{contracts,dates,projection,deepLinks}.ts`,
`lib/sync/shared/{engine,outbox,remote}.ts`, and goals components
`SharedGoalsPage.tsx`, `SharedGoalDetail.tsx`, `SharedGoalCreate.tsx`,
`SharedGoalJoin.tsx`, `SharedGoalActions.tsx`, `shared-goals.css`. Names may be
adjusted to avoid duplicating existing primitives; no editor/date/runtime
dependency is proposed. Reuse ChoiceGroup, focus trap, InlineConfirm, button
tokens, icon library and shell patterns.

The shared adapter stores one validated snapshot atomically (groups, memberships,
targets, needed check-ins and server scores), with a separate durable outbox.
Use one consistent server read snapshot for a page/ranking, rather than joining
unrelated partial requests that can disagree about membership/targets. The read
RPC is security-invoker and queries the RLS-filtered scoring view; an elevated
mutation RPC must not return an unfiltered score snapshot. Read
membership visibility before replay; every mutation rechecks it on the server.
Successful full refresh reconciles inaccessible IDs away; a network/parse/partial
failure never means “delete everything.” Refresh on mutation, focus, reconnect
and the existing ~60-second cadence; Realtime is not required for this branch.
Bounded/paged history must not be mistaken for the complete group roster/cache.

Stop listeners/queued work on account change and ignore old-account replies.
Widgets must recheck user_id before applying actions or export results. Persist
check-in intent and local acknowledgement with the existing durability barrier;
quota/open failures stay visible and do not claim success. First startup with
missing shared tables shows the feature unavailable and retains drafts/intent,
while Mine/Notes/Diary continue to work. An offline former member may still have
previously cached data until reconnect; remote revocation cannot erase an
already-offline device. State that limitation rather than promise instant wipe.

## 7. Ordered implementation and acceptance gates

Every implementation step finishes with HANDOFF, the full project check suite,
commit/push and a hash plus three-line report. Do not combine an unreviewed
schema/security change with UI completion. Proposed order after this plan is
approved:

1. **Database contract and tests; first implementation checkpoint.** Add a new
   timestamped shared-goals migration, `supabase/tests/shared_goals.sql`, a local
   multi-session concurrency test runner/instructions, matching manual types in
   `lib/database.types.ts`, and `docs/shared-goals-data.md`. No shared UI yet.
   Include all constraints, RPCs, RLS, scoring view and rate/receipt rules above.
   SQL tests are self-contained for owner-run local/scratch Supabase, with
   isolated fixtures/rollback and no destructive historical cleanup migration.
   Embedded migration copies, if used for SQL-editor portability, get a byte-
   equality test like `migrationCopies.test.ts`. Gate: migration applies/reruns,
   real-role RLS/scoring/identity tests pass, concurrent joins/check-ins pass on
   local Supabase. **Commit/push, then STOP for owner schema/security review
   before step 2.** Never connect to or apply anything on live Supabase.
2. **Shared data client, storage and deterministic logic.** Add contracts,
   row/command mappers, date helpers, outbox/reducer, remote and shared sync
   lifecycle; extend IndexedDB allowed keys and status/export handoff. Gate:
   real-store persistence/migration/failure and pure merge/projection/date tests,
   local Supabase RPC integration; no browser-only fake determines security.
3. **Create, invitations and join.** Add profile setup needed for usernames,
   four-step wizard, Copy/link paste, signed-out deferral, pending/declined/full/
   expired/revoked states and strict routing. Gate: two local test accounts create
   and join Gym/Custom, target bounds/weekday validation, idempotent retry, no
   accidental join, keyboard options/Back/Enter/Escape and title focus after
   route mount. No unauthenticated group-data preview.
4. **Shared overview/detail.** Add Shared summary/cards and all detail panels,
   current check-in and undo, Gym pending split, membership state, history,
   leave/owner-transfer/archive. Gate: server score parity across all surfaces,
   rest/future/not-yet-eligible states, paused group behavior, typed offline
   pending/conflicts, correct scope for Shift N/C/Esc/Tab and focus restoration.
5. **Today and existing widgets integration.** Wire launchers/open routes and
   approved shared panel; Progress leaderboard, selector, small export and local
   account/leave cleanup. Gate: desktop/companion use the same confirmed group
   date/score, no personal-stat double-counting, no secret exports, no stale group
   after account change/leave, bounded file size, old widget configs still load.
   Any approved personal-goal coupling needs its explicit subplan/tests first.
6. **Comparison and native/offline acceptance.** Compare GS/GD/GC states, Today
   shared states and Progress preview in default/Midnight/Ember/Light at
   1440/1280/1100, including short windows. Use disposable accounts/local Supabase
   and isolated native data. Verify running and cold-start links, companion open,
   offline/reconnect, restart/quit flush and two-device conflicts. Record exact
   coverage/limits, fix differences, commit/push, then STOP for branch review.

## 8. Test and acceptance matrix

| Area | Required evidence before acceptance |
| --- | --- |
| Schema/RLS | Apply/re-run without losing new or existing records. Real authenticated roles for member, pending recipient, stranger, former member and anon; cross-group ID guessing, arbitrary actor, direct DML, profile enumeration and view/nested-view access denied. Definer authorization tested directly; direct table policy checks alone do not prove RPC safety. |
| Capacity/transactions | 2 and 8 accepted/reserved people; ninth rejected; duplicate invite/join; owner cannot disappear. Race two joins for final seat and join against revoke/leave/transfer in separate local sessions; exactly one legal outcome, no partial membership/target. |
| Check-ins/conflicts | Same group/person/day stays one row across devices/retries/uncheck/recheck; different group/day/person independent. Immutable identity; stale opposite-state conflict; repeated same-state command idempotent; timeout-after-commit replay, body mismatch, older intent cannot overwrite newer confirmed revision; no tombstone resurrection. |
| Dates/targets | Every weekday anchor, Sunday/Monday/Saturday preference defaults, month/year/leap boundaries, UTC-midnight mismatch, DST gap/fold, traveler in another zone, joins immediately before/at/after a boundary. Next-round Gym change leaves current/history unchanged; late join never counts earlier missed days. |
| Scoring SQL | Gym 0/2=0, 1/2=50, 2/2=100, 3/2 capped; 2/3 grey, 5/7 green; exact 70 predicate; Custom every/specific/N; denominator snapshots; zeros not dropped by joins; pending excluded; all ties and group average of capped personal ratios; no client-injected score. |
| Offline/storage | Real IndexedDB reload and cache upgrade preserve four personal collections and outbox; failed open/quota/flush stays visible; persist-before-success; quit barrier; signed-out/account-switch responses ignored. Replay across midnight/round change, past grace, lost membership, archived group and missing migration. Never move captured check-in date. |
| Links | Strict parse rejects extra hosts/paths, malformed/oversized token, duplicate/unknown query fields and embedded auth-token tricks; valid warm/cold link → auth if needed → preview → explicit join. Existing auth/Notes/Diary links still work. Full/revoked/expired/wrong-recipient links cannot expose roster/check-ins. |
| UI/accessibility | Every approved GS/GD/GC state plus loading/error/queued/paused cases; true keyboard focus on list/radio/control, not click-through substitutes; visible focus, correct name/role/state, focus after mount/back/close, no shortcut under modal/text input, live blocked-submit message. No header/footer/popover clipping at all widths. |
| Integration/native | Today is visually preserved outside its shared content; Mine stats/filters/list/board unchanged; server values match Shared/Today/Progress; small token-free widgets.json, account cleanup, stable selection, restart/quit durability, native deep-link warm/cold handling. Report packaged/local/backend tests separately. |

Logic tests cover mappers, date/eligibility helpers, snapshot reconciliation,
outbox state transitions and widget projections with real values/stores. SQL
and local RPC integration cover server scoring/security/concurrency. Do not
write mock-behavior tests or substitute mocked Supabase for RLS verification.

Required Windows checks before each commit, including this plan commit:

- `pnpm install --frozen-lockfile`.
- `npx tsc --noEmit` in desktop, widgets and calendar.
- `pnpm exec vitest run` in desktop and calendar.
- Desktop build with `PORT=1420 BASE_PATH=/`; widgets build.
- `cargo check --offline` in both src-tauri folders (report actual prerequisites
  or failures rather than silently skip). Keep the existing chunk warning honest.

## 9. Review decisions and checkpoint

**Checkpoint now:** approve/amend this document before any application code or
migration. Please resolve the proposed defaults, especially:

1. Fixed creator-zone rounds and strictly-next first start; join-next-round rule.
2. Waiting one-owner drafts/link-only publish versus the 2–8 minimum; targeted
   reservations counting toward capacity, no reservation for generic links.
3. Seven-day token TTL, membership-only roster/target visibility, and the reduced
   pre-join preview despite the join board showing everyone's targets.
4. Minimal username/display-name setup and exact-lookup rate limits (proposed
   starting limits: 10 lookups/minute/actor, 20 invite issues/hour/actor, 10 failed
   redeems/minute/actor, plus per-group invitation caps; durable server limits).
5. Seven-day offline replay grace, stale opposing-intent conflicts and provisional
   history, instead of silently dropping offline check-ins at midnight.
6. Immediate leave/revoked access, frozen round history, pause below two and owner
   transfer/archive; no member-removal feature in this branch.
7. Personal completion remains independent unless explicit linking is approved;
   read-only shared rows in existing Progress widgets, not a new widget type.
8. Literal green token across themes rather than the design's accent colors.

If a different answer changes schema or interaction scope, amend the plan before
step 1; do not silently fill the gap during implementation. The **first coded
checkpoint** is step 1's local-tested schema/RLS/scoring contract, reviewed before
client/UI work. The current task stops with this plan; no migrations, schema
execution, application changes, native launch or visual acceptance are claimed.

## Planning checkpoint verification

Only this document and HANDOFF were changed. Baseline Windows checks passed:
frozen install; npx in offline mode running tsc --noEmit in desktop/widgets/
calendar; desktop 375 and calendar 184 tests; both production builds; both
cargo check --offline runs. Existing desktop main-chunk warning remains. No
branch-3 logic, SQL/RLS, local Supabase, native runtime or visual test was run:
those are acceptance work proposed above, not evidence already obtained.
