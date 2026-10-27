# Handoff: branch 3 Step 6 — final review checkpoint

## Current decision (28 October 2026)

- Owner approved **9d54740**, completing Step 5, and authorized Step 6 only.
  Step 6 independent work is complete; **STOP for final branch review. Do not
  merge. Full acceptance remains incomplete** because the disposable Supabase
  Auth/JWT/PostgREST prerequisite could not start.
- Fixed Shared cards to stack at <=1200px and the detail legend to say Green.
  Fixed Today/Settings incorrectly marking a fresh read stale when it arrived
  between minute-display ticks. Action capture/retry identity is unchanged.
  Extracted the two existing engine context providers for a full-App harness;
  production initialization and account gates retain their behavior.
- Full App: **567 assertions / 284 captures**, four themes × 1440/1280/1100 ×
  920/600, Shared overview/detail/wizard, Today and Settings Progress preview.
  Local approved-component references and all nine contact sheets inspected.
  Avatar/header spacing and taller server-state labels remain explicit visual
  deltas; no pixel-identical or hosted-canvas acceptance claim.
- Integration reruns: **243 mounted / 94 data assertions**, real IndexedDB,
  SDK and disposable SQL. Two independent browser profiles covered offline
  competing revisions, eligibility/pause/archive, leave/account cleanup and
  personal independence; not two separate physical devices.
- SQL/security rerun: **421 checked assertions plus exception assertions**,
  migration apply/rerun/personal coexistence and **22 independent-session
  concurrency cases** passed on PostgreSQL 17.5. SQL roles/claims scaffold
  establishes no Auth/JWT/PostgREST HTTP properties.
- Native isolated desktop/companion observed: confirmed 50%/100% parity;
  Settings Progress creation; actual bounded token-free export/watch; pointer
  Open group; warm/cold test-scheme links; write→normal quit→restart durability;
  account/sign-out/leave cleanup with personal goal/widget config preserved.
  Final native theme/pointer checks used a foreground override in test copies.
  Identity/engine opening was synthetic/manual, so production Auth startup,
  literal tray menus and normal bottom-stacking remain unverified.
- Required checks passed: frozen install; all three TypeScript checks;
  **437 desktop / 194 calendar tests**; both builds (desktop PORT=1420
  BASE_PATH=/); both production Windows cargo checks. Existing desktop chunk
  warning remains. No dependency, migration or SQL source changes.
- Docker Desktop fails renaming `sailor-ingest.sock` to `.stale`; engine pipe
  stays absent. No reset/security workaround. Outstanding: full disposable
  Auth/JWT/PostgREST, installer/production facta:// links, native OS-network
  offline/reconnect, literal tray and physical-device checks. See
  **docs/shared-goals-step6.md** for exact evidence, reproductions and limits.
- All isolated app processes closed; only test scheme unregistered; clock/
  fixture exited and owned PostgreSQL stopped. Ignored test artifacts remain
  under tmp/shared-step6 and tmp/shared-goals-runtime. Installed planner data,
  production handler, live Supabase, .agents/ and skills-lock.json untouched.

## Step 5 review fixes (9d54740; approved, historical)

### Decision at that checkpoint (26 October 2026)

- Owner reviewed **bcb8901** and requested two fixes only. **Step 6 remains
  unapproved**; stop after verification, commit/push for owner review.
- Today captures a fresh click instant independently of the minute-refresh
  display. Shared check-in reprojects the latest authorized cache at that same
  instant for the group-local date, checked state and eligibility. Midnight
  cannot undo the previous day; an unconfirmed new round blocks with a visible
  message. An unseen peer pause is sent with the real click instant for the
  server's `inactive_period` rejection. Durable receipt retries keep the original
  capture, UUID and serialized body.
- High-adherence Shared/Today/Progress bars now use `--event-green`; below 70%
  retains `--text-2`. Personal accents/statistics remain independent.
- Added a mounted real-SDK/IndexedDB/disposable-SQL regression for a frozen
  09:00 display, 09:00:30 peer pause and 09:00:45 action; Riyadh midnight with
  yesterday already checked; lost reply/immutable retry; unconfirmed next-round
  cutoff; and actual SQL 100%/0% rows in Midnight/Ember on Today and Progress.
  Both new theme captures were inspected. See `docs/shared-goals-step5.md`.
- Required checks rerun successfully: frozen install; three TypeScript checks;
  **437 desktop / 194 calendar tests**; both builds (desktop PORT=1420
  BASE_PATH=/); both Windows cargo checks. Existing chunk warning remains.
  **243 full mounted assertions** passed (85 creation/recovery + 74 Step 4 +
  18 Step 4 review + 38 Step 5 + 28 new review); focused 28 and **94 data
  integration assertions** also passed. The invitation keyboard test now waits
  for actual mounted focus before Escape. No application change for that race.
- Auth/JWT/PostgREST, deployed HTTP and packaged native UI/IPC/file-watching
  verification limits remain unchanged. No installed data/live Supabase, SQL,
  dependency or unrelated untracked-file changes. No standalone SQL/security/
  concurrency suite or native helper rerun; original evidence below is historical.
  Stop for owner review after commit/push; **do not begin Step 6**.

## Initial Step 5 checkpoint (bcb8901; historical)

- Owner approved **867128a**, completing Step 4, and authorized **Step 5 only**
  under the approved plan. Step 6 remains unapproved; STOP after checks,
  verification report, commit/push for review.
- Implemented Today shared panel/selector/check-in and Gym/Custom launchers into
  the existing wizard; Open group routes to Shared detail. The Progress widget
  retains a separate personal ring and adds a confirmed, read-only leaderboard,
  stable per-account/widget selection and Open group. Settings selects/previews
  Progress groups. Today's other personal content/now line stay intact.
- `shared_goals` export: version 1, at most **16 groups / 64 KiB / four rows per
  group**, exact server scores/ranks/counts plus group-local dates/status. No
  tokens/raw sync data. Configured groups are prioritized; truncation is explicit.
  Export flushes/rechecks its captured store/account; account/access cleanup
  removes old rows and scoped config choices. Startup keeps known identity while
  clearing data, so same-account selection survives reopening. Unknown initial
  auth is not sign-out. Native file timestamps strictly increase; preference
  storage failure cannot block account cleanup.
- Required checks passed: frozen install; all three tsc checks; **437 desktop /
  194 calendar** tests; both builds (desktop PORT=1420 BASE_PATH=/); both Windows
  cargo checks. Existing main-chunk warning remains. **215 combined UI assertions
  / 94 data assertions**, plus final focused **38 Step 5** assertions passed.
  Three native helper tests passed (export contract/order and group URL rules).
  Coverage includes traveller group dates, SQL parity, independent personal
  stats/completion, pointer navigation/focus, launchers, pending/stale/inactive,
  bounded/token-free stored export, selection and account/leave cleanup.
- See `docs/shared-goals-step5.md` for exact coverage and limits. Four card-theme
  captures generated; default/light inspected. Full Today/Settings/native visual
  comparison remains Step 6. Auth/JWT/PostgREST, deployed HTTP and packaged native
  UI/file watching/warm-cold links remain unverified. No installed data, live
  Supabase, SQL, dependencies or unrelated untracked files changed. No standalone
  SQL/security/concurrency rerun; prior 421/22 evidence remains historical.
  STOP after commit/push for review; **do not begin Step 6**.

## Step 4 review fixes (26 October 2026; historical)

- Owner requested two fixes on **ccece44**; **Step 5 remains unapproved**.
  Cancellation before first eligibility now falls back to the immutable original
  join target when no earlier target version exists. Effective boundaries,
  current/historical targets and command receipt rules stay intact.
- A fresh successful read distinguishes long waiting from old paused history
  using a compact SQL-derived snapshot `lifecycle` summary (first scored round,
  or explicit null for never activated), independent of bounded score pages.
  Invoker RLS scopes it to visible groups. Matching current-slot coverage remains
  required; unrelated reads do not freshen scores. Legacy snapshots decode
  conservatively; summaries persist with the existing record and purge on leave.
- Reproduced the late-cancellation SQL failure and fresh-device Waiting failure
  before fixing them. Added mounted cancellation/fresh-store lifecycle tests,
  strict codec/legacy/coverage tests, SQL summary privacy assertions and a real
  first-target edit versus cancellation race. Generated SQL copies synchronized.
- Required checks passed: frozen install, all three tsc checks, **433 desktop /
  184 calendar** Vitest tests, desktop PORT=1420 BASE_PATH=/ and widgets builds,
  both Windows cargo check --offline. Existing chunk warning remains.
  **177 UI assertions** (85 creation/recovery + 74 Step 4 + 18 review) and
  **94 data assertions** passed on real Edge/native IndexedDB and disposable SQL.
- **421 checked SQL assertions plus exception assertions, 22 independent-session
  races** passed. Migration apply/rerun/generated-copy checks, real-role RLS,
  personal-schema coexistence and history query-plan checks ran. See
  `docs/shared-goals-step4.md` and `docs/shared-goals-data.md` for exact scope.
  Full Auth/JWT/PostgREST, deployed HTTP and packaged native UI/link verification
  remain outstanding. No live Supabase access. Unrelated `.agents/` and
  `skills-lock.json` remain untouched. STOP after commit/push for review;
  **do not begin Step 5**.

## Initial Step 4 checkpoint (26 October 2026; historical)

- Owner approved **c882ad5**, completing Step 3, and authorized **Step 4 only**:
  shared overview/detail, check-in/undo, pending Gym targets, membership/history,
  leave, ownership transfer and archive. Step 5 remains unapproved.
- Implemented overview/cards and detail leaderboard/check-ins/targets/history,
  Gym pending changes/cancellation, explicit offline review, leave/ownership
  transfer/archive. Scores/ranks/rounds stay SQL-confirmed. Rest/future/inactive/
  not-yet-eligible days remain distinct; archived/waiting gaps add no scores.
  Freshness and older pagination use matching group-revision coverage. Unknown
  next boundaries disable check-in until read; no inferred active/paused state.
- Focus regressions found/fixed: disabling a modal submit can move focus to BODY;
  Escape/Tab now remain scoped and focus stays inside. Escape returning from
  invitations is stopped before it can reach the newly mounted detail listener.
  Card/dialog/invitation opener focus is restored after mounting.
- Required checks: frozen install; desktop/widgets/calendar tsc; **431 desktop /
  184 calendar** Vitest tests; desktop PORT=1420 BASE_PATH=/ and widgets builds;
  both Windows cargo check --offline. Existing main-chunk warning remains.
- **94 data assertions** and combined **157 UI assertions** passed (85 existing,
  including all mounted/reload recovery cases, plus 72 initial Step 4 checks).
  Final Step 4 suite: **74 assertions**, adding fresh-device history pagination.
  Real pointer/keyboard, SQL score parity, targets, Custom schedules, offline
  conflict, pause/resume, archive, transfer/leave, account/access changes covered.
  24 captures: overview/detail, four themes, 1440/1280/1100; representative
  captures inspected, no page-width overflow. See `docs/shared-goals-step4.md`.
- Only disposable PostgreSQL 17.5, real SDK/SQL RPCs and Edge 156/native IndexedDB
  with synthetic identity claims. Full Auth/JWT/PostgREST, deployed HTTP/native
  links and native UI smoke remain unverified. No standalone SQL/security/
  concurrency rerun; baseline/browser checks do not prove these properties.
  No live Supabase, migrations, dependencies, native/Today/widgets changes or
  unrelated `.agents/` / `skills-lock.json` changes. STOP for Step 4 review after
  commit/push; **do not begin Step 5**.

## Restart review fix (25 October 2026; historical)

- Owner requested the confirmed-create/read-outage/restart fix on **e87d281**.
  **Step 4 is still unapproved. STOP after this focused commit/push for review.**
  No application scope expansion, migrations, dependencies, native changes or
  live Supabase access. Preserve unrelated untracked `.agents/` / `skills-lock.json`.
- Reproduced with an actual `page.reload()` using the same native IndexedDB:
  a confirmed create followed by failed snapshots left no cached group; resume
  after restart then created another group when reads recovered. Before the fix,
  `restoring reads and continuing after reload reuses the original server group,
  never a second group` failed. Session-only aliases did not carry provenance.
- The canonical draft now durably carries validated optional `server` metadata:
  `{ groupId, source: "created", commandId }` from the confirmed command/response.
  Reconciliation writes identity, provenance and current edits atomically;
  autosave/close preserve it even without any cached group. The decoder checks
  exact keys, UUIDs, matching draft/group IDs and source; malformed data is
  retained/reported instead of reset. The account record remains version 1.
- Existing three-field drafts remain readable, with edits intact. A cached
  owner row can establish `source: "snapshot"`; legacy resume without that cache
  first performs an authorized lookup by its stored ID. Failed reads never imply
  a new draft. Explicit server-bound drafts remain bound when the row is absent;
  a successful owner read is required before continuing, updating or Review.
- Added two real reload scenarios (modern and legacy): **16 assertions** verify
  snapshot-only failure after confirmed creation, durable original ID/provenance,
  preserved edits, blocked Next during the outage, authorized recovery, exactly
  one create UUID/group, and publication/cleanup of the original ID. The normal
  UI suite also retains all **12 mounted-session recovery assertions**. New pure
  tests cover legacy compatibility, owner-cache upgrade and invalid provenance.
- Required checks passed: frozen install; npx offline tsc in desktop/widgets/
  calendar; **424 desktop / 184 calendar** Vitest tests; desktop PORT=1420
  BASE_PATH=/ build; widgets build; both Windows cargo check --offline. Existing
  desktop chunk warning remains. **94 data integration / 85 UI acceptance
  assertions** passed, retaining all three mounted cases and both actual page
  reloads. Browser external requests: **0**. The owned disposable cluster was
  stopped afterward. No visual restyling or new native smoke claim.
- Verification limits stay explicit: disposable local PostgreSQL 17.5, real SDK
  and SQL roles/RPCs, Edge 156.0.4314.42/native IndexedDB with synthetic identity
  claims. No full Auth/JWT/PostgREST, deployed HTTP or packaged native-link
  verification, installed planner/live backend access, or standalone SQL/security/
  concurrency-suite rerun. See `docs/shared-goals-step3.md` for the checkpoint.

## Mounted-session review fix (25 October 2026; historical)

- Owner requested duplicate-draft recovery fixes on **21b8a2c**. **Step 4 is
  still unapproved. STOP for review after this focused commit/push.** No UI
  scope expansion, schema/native changes, dependencies or live Supabase access.
- Reproduced the exact mounted-wizard failure in the actual React/SDK/native
  IndexedDB/disposable SQL harness before fixing it: lost create reply → retry
  while mounted → Next → publish left the local alias behind. The browser
  assertion `mounted recovery through publication leaves no local alias` failed.
- Recovered outcomes now reapply idempotent identity reconciliation. Creation
  success binds the local alias to its server group for the engine session;
  consuming it cannot allocate a replacement create UUID. The latest local
  fields move to the canonical ID in one serialized durable mutation, rather
  than separate save/remove writes or restoring old command fields.
- Autosave/close resolve aliases inside the mutation queue. Publication fences
  further saves before snapshot refresh, removes canonical/alias drafts, and
  blocks resurrection from stale callbacks. Cached published/archived/deleted
  groups also reject draft saves. Resume preserves newer local fields and
  updates the existing server draft before Review; a browser regression first
  reproduced the previous loss of those fields on resume.
- Added **12 browser assertions** for mounted recovery through publication,
  autosave and close/resume after recovery, and closing after recovered
  publication with the snapshot deliberately held. Real IndexedDB reopen checks
  one server group per wizard and no alias/completed local drafts. The normal
  `--ui` suite includes these regressions; `--ui --draft-recovery` runs only them.
- Required checks passed: frozen install; npx offline tsc in desktop/widgets/
  calendar; **422 desktop / 184 calendar** Vitest tests; desktop PORT=1420
  BASE_PATH=/ build; widgets build; both Windows cargo check --offline. Existing
  desktop main-chunk warning only. **94 data integration / 69 UI acceptance
  assertions** passed, including the 12 new recovery assertions. Browser external
  requests: **0**. No visual restyling; the existing UI/theme/keyboard suite also
  passed. The owned disposable PostgreSQL cluster is stopped after verification.
- Same verification limits: local PostgreSQL 17.5, real SDK/SQL roles/RPCs and
  Edge 156.0.4314.42 IndexedDB with synthetic identity claims. Full Supabase
  Auth/JWT/PostgREST, deployed HTTP and packaged native links remain unverified.
  No live backend/installed planner access or standalone SQL/security/race-suite
  rerun. See `docs/shared-goals-step3.md`. Preserve unrelated untracked `.agents/`
  and `skills-lock.json`.

## Initial Step 3 checkpoint (25 October 2026; historical)

- Owner approved **2e37a49**, resolving both Step 2 findings. Step 3 only is
  authorized: profile setup, four-step creation, invitations/link paste,
  signed-out deferral, explicit join/decline and strict routes. Stop for owner
  review before Step 4. No live Supabase, migrations or new dependencies.
- Implemented profile setup; Gym/Custom four-step creation and durable local
  drafts; real link/direct invitations, rotation/copy/revocation; limited
  authenticated preview and explicit join/decline; pending/expired/revoked/full
  outcomes; strict auth/join/group/existing widget-focus routing. Shared Mine
  stays intact. Minimal group/draft rows enable resume/invitation management;
  overview/detail/scoring/check-in UI remains Step 4.
- Final publication revalidates the displayed date/revision and requires an
  explicit updated-date confirmation with a new UUID. Caller-owned session
  request packets survive form unmount and retry the exact UUID/body. Raw invite
  tokens stay in memory; no unauthenticated group preview or automatic joining.
  The bridge sits above the storage gate and clears old-account route intent.
- Required checks passed: frozen install; npx offline tsc in desktop/widgets/
  calendar; **422 desktop / 184 calendar** Vitest tests; desktop PORT=1420
  BASE_PATH=/ build; widgets build; both Windows cargo check --offline. Existing
  desktop main-chunk warning only. No new dependencies, schema or native code.
- Disposable local PostgreSQL **17.5**, actual SDK/SQL RPCs, native Edge
  **156.0.4314.42** IndexedDB: **94 data integration assertions** and **57 UI
  assertions**. UI covers Gym/all Custom schedules, profile setup/taken handle,
  explicit join/decline, invitation limits/states, keyboard/mount focus, token
  replacement, lost-reply receipt retries and Sunday-draft/Wednesday-publication
  date reconfirmation. Browser external requests: **0**. Captured fit checks in
  four themes at 1440/1280/1100; selected screenshots visually inspected.
- See `docs/shared-goals-step3.md` for implementation, repeatable verification
  and limits. Full Auth/JWT/PostgREST and packaged native OAuth/warm/cold links
  remain unverified: the local bridge uses synthetic identity claims. Whole-app
  board parity remains Step 6. No live Supabase or installed planner accessed;
  the standalone SQL/security/concurrency suite was not rerun in this UI step.
  The owned disposable PostgreSQL cluster was stopped after the passing runs.
  Unrelated untracked `.agents/` and `skills-lock.json` remain untouched.
- Commit/push this checkpoint, then **STOP for review before Step 4**.

## Step 2 review fixes (25 October 2026)

- Addressed both review findings on **dd88028**. Step 3 remains **unapproved**;
  no UI, routing, migrations or new dependencies. Unrelated untracked `.agents/`
  and `skills-lock.json` remain untouched.
- `mapOutcome` accepts optional nullable `eligible_round`, mapped to
  `SharedOutcome.eligibleRound?: string | null`. Added codec coverage for null,
  valid dates and invalid dates. Real `createSharedRemote` regressions cover
  unpublished `not_published`, published `joined` with the eligibility date and
  exact same-UUID receipt replay. A negative receipt stays negative after
  publication; a successful receipt survives invite revocation unchanged.
  The existing next-round join now also uses the adapter, replacing the fixture
  control-endpoint bypass. Nullable-wire coverage does not claim unpublished
  groups permit joining: actual SQL returns `not_published`.
- `projectSharedProgress` uses the newest coverage window matching the selected
  group revision and containing the displayed round start (inclusive), rather
  than global cache confirmation. Missing coverage returns `confirmedAt: null`
  and stays stale. Unrelated history reads retain the old score confirmation;
  rereading the round's interval refreshes it. Tests also cover wrong group,
  wrong revision, excluded round start and unordered overlapping windows.
- Both issues reproduced before the fixes using the TDD skill at the requested
  adapter/projection seams. Final affected browser integration passed **94
  assertions**, real Chromium-based Edge **156.0.4314.42** IndexedDB with two
  reloads, real Supabase SDK requests and real SQL in its own disposable local
  PostgreSQL **17.5** database. Included actual unrelated/reread history RPCs,
  all prior persistence/recovery/account/outage regressions and join replay.
  One preliminary run hit the test adapter's 10-second deadline; subsequent
  complete 91- and 94-assertion runs passed. Added safe checkpoint diagnostics.
- Required checks passed: frozen install; npx offline tsc in desktop/widgets/
  calendar; desktop **403** and calendar **184** Vitest tests; PORT=1420
  BASE_PATH=/ desktop build; widgets build; Windows cargo check --offline in
  both native folders. Existing desktop main-chunk warning only.
- Updated `docs/shared-goals-client.md`; reproducible affected integration report
  is `tmp/shared-goals-runtime/client-result.json` (ignored). No live Supabase
  accessed. The full standalone 409-assertion SQL/security suite and 21 races
  were not rerun in this client-only follow-up; their prior results are below.
  The bridge uses synthetic identity claims/real roles: Supabase Auth, JWT
  signatures/refresh and PostgREST/deployed HTTP remain unverified. Quota/open
  faults are injected at native IndexedDB boundaries; no physical disk-full or
  packaged Tauri UI smoke claim. Stopped the owned disposable cluster afterward.
- Commit/push these review fixes, then **STOP for review before Step 3**.

## Initial Step 2 checkpoint (24 October 2026; historical)

- Owner approved Step 1 at **223a044**, including both review fixes, and
  authorized **Step 2 only** of the approved 5337807 plan. Implemented on
  `feat/shared-goals`; no Step 3 screens, wizard, routing or native/widget work.
  No new migration, schema/type changes or application dependencies.
- Added typed shared contracts and strict snake/camel row/outcome codecs,
  original-date/eligibility/DST helpers, history reconciliation and a bounded
  server-score projection for the later Today/Progress handoff. Numeric field
  `is_at_least_70` survives disk round trips; absent rounds never become zeroes.
- Added independent `SharedSync`, finite Supabase RPC adapter and a versioned
  single-record `planner_shared_<uid>` IndexedDB cache/outbox/draft/receipt store.
  Existing database version, six personal keys and personal full-row queue stay
  compatible. Local changes and atomic receipt/removal publish after flush.
  Attempted UUID/body/date/epoch stay immutable across retries/reloads; only
  unprepared same-key intents coalesce. New edits wait for own acknowledged
  revisions; other-device conflicts require review and an explicit new UUID.
  Negative receipts and rejected intent remain reloadable together.
- Session tokens are pinned per request. Session/SDK resolution and HTTP work
  share a bounded deadline; disposal aborts requests/listeners/timers and drops
  old-account responses. Successful leave purges cached access immediately.
  Online control commands require confirmation and a caller-retained immutable
  packet for uncertain replies; they are not silently queued. Invite secrets
  remain memory-only. Shared status/error recovery is available through the
  auth-scoped hook/provider without blocking personal initialization or sync.
- Real browser integration: **77 assertions** in fresh Chromium-based Edge
  **156.0.4314.42**, native IndexedDB and two real page reloads. Actual SQL RPCs
  exercised through the real Supabase SDK and a disposable loopback HTTP bridge.
  Verified six-key migration/open failure, actual transaction rollback with
  injected quota failure, retry saving, queue/draft reopen, lost reply after
  commit, failed acknowledgement/process loss, byte-identical command retries,
  captured-date retention, in-flight sequencing, SQL conflicts/explicit retry,
  token-free durable state, malformed snapshot retention, late account replies,
  pinned identity, immediate leave purge and revoked access. All four personal
  collections wrote/read real PostgreSQL rows during a shared-only outage.
  Pre-pause/gap/resumed captures, next-round joiners, archive receipt exceptions,
  unsent archive failures and historical round keys eight weeks later passed.
- Reran actual disposable PostgreSQL **17.5** regressions: **409 checked SQL
  assertions** plus exception assertions, **21 independent-session concurrency
  cases**, migration reruns, personal coexistence and authenticated historical
  EXPLAIN ANALYZE all passed. No SQL/security property is inferred from Vitest.
- Required checks passed: frozen install; npx offline tsc in desktop, widgets
  and calendar; desktop **396** and calendar **184** Vitest tests; desktop build
  with PORT=1420 BASE_PATH=/; widgets build; Windows cargo check --offline in
  both native folders. Existing desktop main-chunk warning only.
- Evidence/reproduction: `docs/shared-goals-client.md`,
  `scripts/run-shared-client-tests.mjs`, `scripts/shared-client-fixture.py` and
  the test-only `src/test/sharedIntegration.ts`. Ignored reports:
  `tmp/shared-goals-runtime/client-result.json` and `step2-sql-result.json`.
  Browser requests were loopback-only; tests create/drop their own random DBs.
- **Limits:** synthetic auth claims/roles in the disposable bridge are not full
  Supabase Auth, PostgREST, JWT signature/refresh or deployed HTTP verification.
  That end-to-end gate remains outstanding. Quota/open denial were injected at
  real IndexedDB boundaries, not physical disk exhaustion. No packaged Tauri UI
  smoke test claimed for this data-only checkpoint. No live Supabase accessed.
- Commit/push this checkpoint, then **STOP for owner review before Step 3**.
  Unrelated untracked `.agents/` and `skills-lock.json` remain untouched.

## Step 1 review fixes (24 October 2026; historical, approved at 223a044)

- Addressed the two should-fixes from review of **87183cc**. No Step 2 client or
  UI work. The pending migration remains re-runnable; both embedded test copies
  are synchronized. No public database type changed: the new relation is private.
- Added a durable **20 invitation issue/rotation attempts per group per fixed UTC
  hour** budget, in addition to the existing actor limit. Its private helper
  obtains the group lock; direct/link issuance and rotation share the counter.
  Ownership transfer, expiration, acceptance and revocation do not refund it.
  Expired pending rotation spends the new hour's allowance; rerunning the
  migration preserves an exhausted counter. Denial scope is `group_invites`.
- Added **10 profile handle-availability attempts per actor per fixed UTC minute**
  before availability lookup, including `handle_taken` from profile-less actors.
  Normal rejections commit their budget/receipt. A concurrent handle claim's
  unique-constraint loser rolls back only its insert and returns `handle_taken`,
  retaining its consumed attempt. Existing immutable-handle display-name edits
  remain usable. Exact receipt retries spend no extra allowance; denial scope
  is `profile_setup`.
- Used the TDD skill at the already approved real authenticated RPC seam. Both
  focused regressions failed before their respective fixes, then passed. Added
  focused `--only invitation-budget` / `--only profile-budget` runner commands.
  Documented exact policy, charging, expiry/revoke/transfer and retry behavior in
  `docs/shared-goals-data.md`.
- Actual disposable PostgreSQL **17.5** results: **409 checked SQL assertions**
  plus exception assertions, **21 independent-session concurrency cases**, all
  passing. Four new races observe real transaction/advisory waits: last group
  allowance with rotation+ownership transfer, last profile availability slot,
  two accounts claiming one handle, and concurrent taken-handle receipt replay.
  Separate committed calls verify failed setup attempts remain limited. Existing
  lifecycle/RLS/scoring tests, migration reruns, four personal-row preservation
  checks and authenticated historical EXPLAIN ANALYZE also passed.
- Required checks rerun and passed: frozen install; npx offline tsc in desktop,
  widgets and calendar; desktop **378** and calendar **184** Vitest tests;
  PORT=1420 BASE_PATH=/ desktop build; widgets build; Windows cargo check
  --offline in both native folders. Existing main-chunk warning only.
- Same isolated loopback cluster/auth-role scaffold as the initial checkpoint;
  no live Supabase or application credentials used. Full Supabase Auth,
  PostgREST and HTTP/JWT integration remain unverified. No new dependencies.
- This follow-up stopped for schema/security review and was subsequently
  approved at **223a044**, authorizing the Step 2 checkpoint above. Untracked
  `.agents/` and `skills-lock.json` were untouched.

## Approved plan and initial Step 1 checkpoint (87183cc; historical)

- Owner approved the revised plan at **5337807**, including proposed defaults
  and lifecycle contracts. Implemented Step 1 only on `feat/shared-goals`, based
  on `origin/main` aa7f69a. No shared client, UI, routing or widget work begun.
- Added `20261024160000_shared_goals.sql`: six RLS-protected public tables,
  private token digests/receipts/rate budgets, constraints/immutable lifecycle
  guards/deferred capacity and owner invariants, finite authenticated command
  RPC, limited invitation reads, invoker snapshot and invoker scoring views.
  Publication revalidates/finalizes its anchor under lock; scores reconstruct
  eligible historical rosters, inactive gaps, pause/resume and terminal archive.
  Receipts bind successful and rejected outcomes to immutable UUID/body pairs;
  tokens are stripped. No raw shared upsert or personal sync rule changes.
- Added self-contained rollback SQL tests and a loopback-only Python runner
  with independent-session lock assertions; generated migration copies are
  checked for drift. Public database types match disposable catalog metadata.
  `docs/shared-goals-data.md` documents schema, RPC payloads/results, access,
  exact lifecycle/cutoff/replay rules, test reproduction and remaining limits.
- Actual database evidence: fresh disposable **PostgreSQL 17.5** Windows with
  pgcrypto and real anon/authenticated roles (minimal auth.uid/users scaffold).
  Standalone suite: **304 checked assertions**, plus exception assertions;
  migration apply/rerun preserves memberships, check-ins, receipts and archived
  scores. All five lifecycle scenarios and exact boundary/expiry/grace cutoffs
  ran, alongside real RLS/RPC/private-helper/anonymous access denials, scoring,
  target versions, epoch replay, capacity reservations, rate budgets and guards.
- **17 independent-session concurrency cases passed**, each observing an actual
  PostgreSQL lock wait: final seat, receipt same/different body, opposing stale
  states, join/revoke/rotation, archive/check-in and leave/check-in in both orders,
  future targets, ownership/leave, join/transfer, leave/next-round join and a
  lock wait crossing a round boundary. These are SQL evidence, not mocked clients.
- Also applied existing personal migrations in that disposable database, seeded
  all four personal collections and reran shared migration: personal rows and
  personal sync guard preserved. Inspected authenticated EXPLAIN ANALYZE for a
  six-year synthetic group/history window, confirming membership/target
  index use. This small fixture is not a production load test.
- Docker Desktop did not expose its engine pipe; full local Supabase/Auth/
  PostgREST/JWT/HTTP was **not** tested. Temporary native PostgreSQL/psycopg live
  only under ignored `tmp/`; no application dependencies/lockfile changes.
  Tests used no application credentials; no live Supabase connection or schema
  execution occurred. Standalone SQL can still be run by the owner on fresh local
  Supabase. Build/regression checks do not establish SQL security properties.
- Required checks passed: frozen install; npx offline tsc in desktop/widgets/
  calendar; desktop **378** and calendar **184** Vitest tests; desktop build with
  PORT=1420 BASE_PATH=/; widgets build; Windows cargo check --offline in both
  native folders. Existing desktop main-chunk warning only.
- **STOP after commit/push.** Await owner schema/security review before Step 2
  (shared client/storage/logic). No shared feature native/UI acceptance claimed.

## Previous lifecycle-plan revision (24 October 2026; historical)

- Revised docs/shared-goals-plan.md after review of 32e268b; all other proposed
  defaults retained. Still documentation only: no application code, migrations,
  schema execution or new feature acceptance has been performed.
- Draft start dates are provisional. Final publication recomputes under the
  group lock against server group-local time and compares the displayed date/
  draft revision; stale proposals require visible renewed confirmation before
  published_at/first_round_date and initial eligibility/targets are frozen.
- Defined candidate slots versus scored rounds, boundary rosters, earliest pause
  cutoff and terminal archive cutoff. Persist publication/archive timestamps and
  immutable membership join/eligibility/leave epochs to reconstruct history.
  Capacity counts accepted members/reservations; activation/resume counts only
  eligible boundary members. Next-round joiners cannot fill a current eligibility
  gap. No score rows for waiting/paused slots, and none start at/after archive.
- Already-started rounds keep historical rosters/full targets and end early on
  pause/archive. Offline replay may settle a pre-pause active-interval intent
  within existing grace while the original epoch still has access; gap intents
  stay rejected after resume. Archive rejects unseen writes; exact committed
  receipt retries only acknowledge prior results without mutation.
- Added the five requested acceptance scenarios plus exact cutoff cases, and
  aligned the schema/view/client acceptance contracts. These scenarios are
  planned evidence for the first implementation checkpoint, not tests run now.
- Required baseline checks rerun and passed: frozen install; TypeScript in all
  three packages (npx offline); desktop 375 + calendar 184 tests; both production
  builds; both Windows cargo check --offline checks. Existing desktop chunk-size
  warning only. STOP for plan review after the documentation commit/push.

## Initial branch-3 planning checkpoint (24 October 2026; historical)
- Branch 2 is approved and squash-merged into main as aa7f69a. Fetched origin and
  confirmed origin/main and local main at aa7f69afedf9943ba94590e578a0dde5e66ee028.
  Created feat/shared-goals directly from origin/main; no feature re-merge.
- Owner recovered the detailed branch-3 brief: 2–8-person shared Gym/Custom goals,
  shared screens/invitations/link join, individual Gym targets, per-goal rounds,
  server scoring view, member-only RLS, time zones, leaving and offline behavior.
  Read GoalsShared, GoalsDetail and GoalsCreate separately, canvas board inventory,
  and Main/Widget integration details; inspected current Today/Goals Mine,
  sync/IndexedDB, deep links, widgets and schema. Public PostgreSQL/Supabase docs
  checked for view/RPC security; no database connection or schema execution.
- Wrote docs/shared-goals-plan.md. Established requirements/design evidence are
  separated from proposed schema, RPC/RLS/token/scoring contracts, group dates,
  membership lifecycle, offline command/cache behavior and integration choices.
  Ordered implementation has a schema/RLS/scoring checkpoint before client/UI.
- Review needed on waiting single-owner/link-only groups, capacity reservations,
  group time zone/first start, invite preview privacy versus the join board,
  username setup, offline replay grace/conflicts, leave/owner transfer/pause,
  personal-goal completion coupling and literal green versus themed accents.
  Proposed defaults are not approvals. STOP: no application code or migrations
  authorized by this planning task; wait for owner plan review.
- This checkpoint changes only the plan and HANDOFF. Required checks passed:
  frozen install; npx (offline) tsc --noEmit in all three packages; desktop 375
  and calendar 184 tests; both production builds; cargo check --offline in both
  Windows native folders. Existing desktop main-chunk warning only. These are
  baseline checks, not branch-3 SQL/RLS/concurrency or UI/native acceptance.

## Previous branch-2 review decision (24 October 2026; historical)

- Reviewer approved step 6 at `7b2f69c`; the Notes listbox Enter finding is
  resolved. No outstanding blocker, should-fix or nit in this focused follow-up.
- Independently reran frozen install, TypeScript in desktop/widgets/calendar,
  desktop 375 + calendar 184 tests, both Vite builds and both Windows
  `cargo check --offline` checks. All passed; existing main-chunk warning only.
- Independently verified 24 real-browser grid/list keyboard opens across four
  themes and 1440/1280/1100 at height 720. Tab reached the listbox, J changed
  selection, and Enter opened the selected note with the panel collapsed and
  title focused. Explicit List expansion, card opening and switcher opening
  passed; browser warning/error log empty. Used invented local data with blank
  Supabase configuration. No application source was edited by this review.
- At the owner's request, squash-merged `feat/notes-diary` at `7b2f69c` onto
  local `main`, including this review handoff. The squash commit is authored as
  Mahmoud Alshinawy <2270009032@iau.edu.sa>. Application sources match the
  reviewed feature tip; only this handoff adds merge-status documentation.
- Next action: owner pushes local `main`. No push or migration application was
  performed as part of the local merge.
- Builder continuation: once branch 2 is on main, prepare the branch-3 plan from
  the original approved brief, with scope, implementation steps and acceptance
  checks, for owner review before coding. No branch-3 scope is recorded in this
  repository; do not infer it from the historical "Next steps" sections below.
- Earlier native-runtime, packaged-launch, production auth/backend, multi-device
  sync and SQL verification limits remain as documented. The entries below are
  historical checkpoints; their STOP-for-review language is superseded by this
  current decision for step 6.

## Step 6 Notes listbox Enter fix (24 October 2026)
- Reproduced the review finding from a fresh grid: Tab from Fast capture focused
  the Notes listbox; J selected another note; Enter left the panel expanded and
  focus on BODY. The earlier verification pressed Enter on an option/button,
  activating its click handler, and incorrectly claimed listbox Enter coverage.
- Enter now calls shared openNote(selected.id). Shared opening requests title
  focus in a post-commit effect, after the grid/list unmounts and editor mounts.
  Explicit List still expands the panel and keeps focus on that button.
- Real browser checks: four themes × 1440/1280/1100 at height 720. Tab reached the
  listbox; grid J/K/J changed selection with listbox focus; Enter opened that
  selected title, collapsed the panel and focused the input. Explicit List then
  expanded; Tab/J/Enter from the expanded list did the same (24 opens total).
  Card and switcher opening also collapsed/focused correctly. Console empty.
  Evidence: visualization directory / facta-notes-keyboard-fix/ (focus/selection
  JSON and screenshots). No native runtime, backend or SQL testing in this fix.
- Temporary fixture/context exports, server and tab removed. No dependency,
  schema, styling or unrelated behavior change. Visual-review document corrected.
  Required Windows checks: frozen install, TypeScript ×3, desktop 375/calendar
  184 tests, both builds and cargo check --offline ×2 passed. Existing main
  chunk-size warning remains. STOP for review after commit/push.

## Step 6 verification follow-up (23–24 October 2026)
- Verified d762229 separately: required checks passed again (frozen install,
  all three TypeScript checks, desktop 375 and calendar 184 tests, both production
  builds, both Windows cargo check --offline). Existing main-chunk warning only.
- Used real IndexedDB with an invented account in a separate database on the
  localhost:1422 fixture origin, with backend configuration explicitly blank.
  Notes title/Unicode body/Inbox and Diary line/mood survived browser reload.
  Diary timeline and text/mood filters returned the expected entries/counts.
- Exercised Notes movement and card activation, collapsed editor, explicit
  List expansion, narrow tag/Trash selection, fast capture/autofocus, switcher,
  bold/font selection, focus mode, Trash Undo, and keyboard checklist insertion.
  Long content (32 KB unbroken paragraph, long title and ten tags) fit all four
  themes at 1440/1280/1100 × 720 in grid/list/editor: 36 cases, no horizontal
  overflow. Capture and slash-menu checks passed in all 12 combinations each.
  Capture Escape returned focus; Tab/Shift Tab trapped correctly in the sampled
  dialog. Browser warning/error log empty. Listbox Enter coverage was inaccurate:
  button activation masked the regression subsequently fixed above.
- Markdown download contents verified (bold/checklist); TXT action clicked but
  no saved file was verified. Both serializers pass logic tests. Browser download
  waiting stalled well beyond its requested timeout, so it was not repeated.
  Native export dialogs, production auth/backend and packaged smoke remain owner
  checks; no new native runtime or SQL testing was performed in this pass.
- Temporary entry/context exports and server/tab removed; production builds
  contain no fixture. Evidence: visualization directory / facta-step6-verification/.
  The synthetic IndexedDB stays isolated to the fixture origin; an invented
  Verification notebook.md download remains in Downloads. Full detail appended
  to docs/notes-diary-visual-review.md. Documentation-only follow-up; STOP.

## Step 6 final visual comparison (23 October 2026)
- Completed a four-theme × 1440/1280/1100 comparison pass using local design
  components and hosted spot references. Captured 18 core surfaces in all 12
  combinations (216): Notes grid/editor/list; Diary Today/Timeline/Calendar/
  Search; four Calendar views; EventDialog; Goals List/Board; Today; all three
  Settings tabs. Visually inspected contact sheets/full-size samples and measured
  page/header bounds. No page/header overflow; sidebar 240px wide / 64px rail.
- Fixed Notes grid fast capture, count subtitle, four-block bounded Unicode
  previews with list/checklist markers, metadata badges, default collapsed-list
  editor, narrow controls in the list panel, widget label, slash-menu width/icons,
  status/shortcut footers and singular word counts. Added two pure preview tests.
  Today styling remains unchanged. No dependency, CDN, schema or native change.
- Additional checks: 72 picker previews (Sticky/Stack/Diary, solid/transparent,
  all themes/widths); 12 capture overlays with Ctrl Shift N/Escape; 24 empty
  Notes/Diary views at 1100; sampled selection/fonts/slash/focus/export/switcher/
  cheat/Trash Undo; fast-capture creation; 1210x720 header and 15:00–17:00 quick-add
  popover clear of the footer; short-window dialogs. Final browser console empty.
- Full coverage, intentional adaptations and remaining owner checks are recorded
  in docs/notes-diary-visual-review.md. Not a claim of exhaustive 431-board QA.
  Native/backend limits from step 5 remain; no new native runtime smoke or SQL.
  Fixture backend access was disabled. Temporary entries/context exports, tab and
  server removed. Local evidence: task visualization directory / facta-step6/.
- Required Windows checks passed: frozen install; npx tsc --noEmit in all three
  packages; desktop Vitest 375/375; calendar 184/184; both builds; cargo check
  --offline in both native folders. Existing main chunk warning. Bundle kB/gzip:
  main 689.68/202.26, lazy Notes 364.52/112.23 (was 362.54/111.71), Notes CSS
  18.57/3.93, lazy Diary 28.05/8.42, widgets 229.15/72.60 + window API 15.21/3.85.
- All six branch-2 steps are implemented. STOP for owner review. Do not start
  branch 3 or any new scope without the owner's instruction.

## Step 5 review + Windows native smoke (23 October 2026)
- Reproduced/fixed two native issues: covered WebView2 windows stalled receipt
  settlement on requestAnimationFrame; recovered Sticky drafts assigned a new
  action ID and falsely conflicted after the desktop had applied the original.
  Acknowledgements now settle directly. Recovery persists the original attempt
  identity/fields before delivery, replays its durable receipt, and keeps newer
  typing for a separate save. Rotation waits for newer drafts; pinned selection
  remains stable when export order changes. Recovery-storage failures block
  delivery visibly, rather than enqueueing an edit with no recoverable identity.
- Added real-engine recovery/replay tests, including text deletion, continued
  typing and invalid/old recovery records. No dependencies or SQL changes.
- Native Tauri/WebView2 tests used invented fixtures, separate profiles/files and
  blank Supabase configuration. Verified Sticky/Stack/Diary edits, rich-note tail
  preservation, hidden desktop delivery, running-app note deep links, desktop and
  companion restarts, account/signed-out export isolation, window movement and
  resize persistence. The recovered edit reached Saved with one original receipt
  and an empty native pending file. Detailed evidence, launcher incident and test
  limitations: docs/notes-diary-native-smoke.md.
- Temporary source overlays, test processes and the test-only URL handler were
  removed; normal development executables restored. Production stacking, packaged
  launch, cold-start/production URL handling, literal tray menu and multi-device
  sync still need owner verification. Step 6 remains pending; no branch 3 work.
- Final production-source checks all pass on Windows: frozen install; npx tsc
  --noEmit in desktop/widgets/calendar; desktop Vitest 373/373 and calendar
  184/184; both Vite builds; cargo check --offline in both native folders.
  Existing main chunk warning remains. Bundle kB / gzip: main 689.68 / 202.26,
  lazy Notes 362.54 / 111.71, lazy Diary 28.05 / 8.42, widgets main 229.15 /
  72.60 plus lazy window API 15.21 / 3.85. No new dependency or CDN load.

## Step 5 Notes/Diary widgets + picker + sidebar (23 October 2026)
- Implemented the NotesWidget Sticky and Stack cards and DiaryWidget one-line
  card, using NotesDesk/Settings as layout references. Shared presentational
  JournalCards render the same cards in the companion and Settings previews.
  All four theme tokens, solid/transparent plates, bundled Geist/Geist Mono,
  labelled controls and visible keyboard focus; no dependency or CDN added.
- Sticky rotates pinned-to-widget notes and edits title, text and colour.
  It autosaves after 800 ms idle, supports Save/Ctrl Enter, and saves before
  rotation. Text remains editable while waiting for Facta. Small recovery
  drafts in companion localStorage are scoped by account/window/note; these
  are bounded editing drafts, not collection caches. Recovery write failures
  are visible. A stale edit keeps its draft and asks the user to review Notes.
- Stack exports/displays the four most recently edited live notes and captures
  a new title-only note with Enter. Rows open their note in Facta. Sticky/Open
  and Diary/Open also use validated facta://focus section/note links; the main
  app handles running/cold-start links and consumes note-open requests once.
- Diary exports only today's line and three same-day-number recalls from prior
  months, not full bodies, tags or moods. Enter creates/edits one line; new mood
  is 3, while an existing entry keeps its id, mood, body, tags and creation time.
  Queued lines retain their intended date after midnight. Stale/future dates and
  invalid/oversized input fail visibly. A stale-day widget waits for fresh data.
- widgetJournal projects only pinned-to-widget + four recent notes, title and
  an 800-character Unicode-safe plain-text preview, colour and small metadata.
  No full note body/tags/links. The complete journal projection is capped at
  128 KiB; Stack slots are reserved first, and unusually large pinned sets get
  a visible 'More pinned notes' notice. Counts and word counts use real data.
- Preview edits replace only the changed prefix range of the canonical body,
  preserving unseen text, unaffected marks, note links, heading/checklist state
  and blocks. Subsequent autosaves may use the prior acknowledged prefix;
  tests cover continued typing beyond the exported preview without duplication.
- New actions are account-scoped and apply through the existing notes/diary
  sync collections. Existing goal toggles now use the same consumer; Tasks/Day
  attach the snapshot owner. Native pending actions remain under the existing
  file lock until cache + queue + a bounded receipt ledger commit in one IDB
  transaction. Explicit acknowledgements remove only committed action ids.
  Restart replay does not toggle twice or duplicate quick notes. Failed storage
  never acknowledges. Corrupt pending JSON is retained rather than overwritten.
- Added the per-user receipt key to IndexedDbStore hydration; old cache/queue
  migration remains compatible. Receipt metadata is local only (not synced).
  Export includes bounded receipts for widget acknowledgement/status, is
  serialized, and replaces widgets.json through a temporary snapshot. Signed-out
  snapshots are empty; another account's actions remain queued for their owner.
- Added Notes (Sticky/Stack) and Diary to config, native window sizing, Settings
  type picker/style choices, live previews and per-widget style metadata.
  Existing tasklist companion-status check and window placement policy remain.
  Sidebar now exposes Notes and Diary; both pages remain lazy-loaded. Previews
  use non-form containers so the New widget form has no nested forms.
- Vitest exercises projection/privacy/size bounds, Unicode, safe rich-body edits,
  validation, conflicts, Diary mood preservation, restart replay and real IDB
  durability/failure. Frozen install, npx tsc --noEmit in desktop/widgets/calendar,
  desktop Vitest 371/371, calendar 184/184, both Vite builds and cargo check
  --offline in both native folders pass on Windows. Main chunk warning remains.
- Bundle sizes (kB / gzip): main 688.75 / 201.88; lazy Notes 362.54 / 111.71
  (before step 5: 363.08 / 111.91); lazy Diary 28.05 / 8.42; widgets main
  228.20 / 72.32 plus lazy window API 15.21 / 3.85.
- Browser QA used an isolated memory engine, invented fixtures and blank
  Supabase configuration. Verified Sticky save/autosave/colour/rotation, Stack
  capture, Diary creation/editing, picker style persistence, both sidebar pages,
  and Settings geometry at 1440/1280/1100 (rail at 1100). All four themes passed
  solid/transparent card overflow checks. Fresh final page had no console errors
  or warnings; a nested preview-form issue found during QA was fixed.
- Also browser-smoked the prior 24-hour fix: Week/Day bands, full-range tooltip
  and detail, middle-day continuation and short overnight split segments.
  Temporary preview files/context exports, tab and server were removed. Proof:
  task visualization directory, notes-diary-widgets-step5.png.
- Native coverage has since been extended by the review above. Packaged launch,
  production stacking, cold-start/production URL handling and multi-device sync
  remain unverified. No SQL changed/run; fixture backend access was disabled.
- STOP after step 5 for review. Step 6's full rendered-board comparison across
  all pages/themes/1440/1280/1100 is still pending; no branch 3 work started.

## Step 4 review: 24-hour spanning bars (23 October 2026)
- Week/Day/Month put timed events lasting >=24 hours in the spanning band;
  they retain allDay=false and their original dates/times for editing, native
  tooltips and the existing detail popover. Shorter overnight events stay split
  in the timed grid. Today/Agenda and the Day widget retain timed semantics.
- Shared eventInAllDayBand has exact 23h59m/24h/24h01m and repeating threshold
  tests. Desktop tests verify canonical records, joined bars and short overnight
  portions. All-day events remain in the band regardless of their clock fields.
- Required Windows checks passed: frozen install; npx tsc --noEmit in all three
  packages; desktop Vitest 352 and calendar 184; desktop and widgets builds;
  cargo check --offline in both native folders. Existing main chunk warning.
  This fix was unit/type/build checked; no new browser/native smoke run yet.
- Step 5 is now authorized: Notes Sticky/Stack, Diary, compact export/pending
  actions, Settings picker and sidebar unhide. No schema changes or live backend.

## Step 4 event end dates + Diary nits (23 October 2026)
- EventDialog New/Edit now expose start/end dates for both timed and all-day
  events. The month grid edits the focused endpoint; native date input changes
  also move the grid to that month. Equal dates save a null end_date through
  the mapper. Invalid/reversed dates block submission, including all-day forms;
  an overnight end time is valid only with a later end date. Empty native date
  fields retain a valid calendar fallback. Reopening resets the complete form.
- Native date/time input events update the controlled draft immediately, so
  saving uses the displayed values. Existing initialEndTime, draft title/colour/
  all-day state, title autofocus, focus trap, Escape and fixed footer remain.
  The recurrence hint explains that the dates set EACH occurrence's length.
- New packages/calendar/eventSchedule.ts supplies DST-independent date maths,
  inclusive occurrence lookup, clipped day portions and overlap union. Repeats
  apply to occurrence START dates and retain the original span length; weekday
  spans can continue into weekends. A daily overnight rule can produce separate
  morning/evening portions. Long spans inspect at most two starts per weekday;
  exhaustive-start comparisons cover that bound. No per-day record is saved.
  A timed midnight end has no zero-length block on its final date.
- useEvents, Week/Day/Month/Agenda, MiniCalendar (through the getter), Today and
  Diary context use range-aware lookup. All-day spans join across week/month/
  year edges through existing spanLanes. Timed spans clip to each day (00:00
  through 24:00 for an interior day). Layout keys distinguish separate portions;
  all editing/deleting still uses the canonical event id and original dates.
  TodayPanel changed only the row key and displayed clipped times; no restyle.
- Details show the occurrence's full date range and respect clock preferences.
  The selected day/time chooses the morning versus evening occurrence for
  repeating overnight events (unit-tested). Detail popovers reuse the existing
  visible-grid clamping used by quick add, including off-screen start times.
- Multi-day timed moves/resizes use the full dialog, with a visible hint; a
  pointer press opens details instead of shortening a clipped portion. Existing
  single-day drag behavior remains, including moving a legacy explicit same-day
  endDate along with date. Pointer drag/native WebView regression smoke remains
  owner-run. No new now line in Week, Day or the Day widget; Today retains its.
- Existing Day widget and its Settings preview share range-aware day selection/
  clipping. No new widget type, pending action, picker option or sidebar unhide
  was started. Notes/Diary widgets are step 5. Actual companion runtime was not
  exercised; real widget selection logic is tested and both apps compile.
- Folded the approved Diary nits into this commit: singular day labels (including
  calendar/best/paused run), a distinct Try placeholder, and neutral week tiles
  with 'Before your diary began' accessible labels before the first-ever entry.
  Days after the diary began remain 'not written'; empty history is neutral.
- The step-1 migration/database types already contain events.end_date. Mapper
  round-trip/clear checks remain and invalid end dates now fail before local
  mutation. No schema/migration change, SQL execution or live Supabase contact.
- Browser QA used the actual App shell/engine with an isolated IndexedDB fixture
  and blank Supabase configuration. Verified new/edit timed/all-day ranges,
  reversed/empty date blocking, endpoint grid/native keyboard input, canonical
  continuation editing, clearing/restoring ranges, persisted end dates after
  reload, timed day portions, all four views and the three Diary nits. No
  console errors/warnings. Final morning/evening selection fix is unit/type/
  build verified; native runtime and live multi-device behavior are unverified.
- Week + Month geometry passed all 4 themes at 1440/1280/1100 (24 combinations),
  without page/header/grid horizontal overflow. EventDialog passed the same
  12 theme/width combinations; at 1280x720 its body scrolls while the footer is
  visible. Full rendered-board comparison remains step 6; local EventDialog
  design read as reference, with the new date fields required by branch 2.
- Preview files/private context exports, isolated database, tab and server were
  removed. Screenshot outside the repo: task visualization directory,
  events-step4.png. No new runtime dependency.
- Final required Windows checks passed: pnpm install --frozen-lockfile; npx tsc
  --noEmit in desktop/widgets/calendar; Vitest 350/350 desktop and 176/176
  calendar (Riyadh/New York projects); PORT=1420 BASE_PATH=/ desktop build;
  widgets build; cargo check --offline in both src-tauri folders. Existing main
  chunk warning remains. Main JS 666.09 kB / 194.28 kB gzip; lazy Notes remains
  363.08 / 111.91; lazy Diary 30.58 / 9.48; widgets JS 214.57 / 67.96.
- STOP after step 4. Steps 5 (widgets/picker/sidebar) and 6 (final comparison)
  have not started.

## Step 3 Diary page (23 October 2026)
- Implemented DiaryApp/DA-cheat in components/diary: Today with a one-line
  composer, five moods, user-derived/custom tags, optional plain-text body,
  yesterday backfill, paused/current/best streak information, a seven-day mood
  strip, read-only goals/events context and On this day. No diary lock.
- Timeline is bounded to the selected month, with gap rows, inline Today
  capture, expandable bodies and historical edit dialogs. Calendar uses the
  saved week-start preference, mood bars, previews, selected-day detail,
  written/average statistics and an accessible mood trend. Search covers lines,
  longer entries and tags; selected moods are OR, selected tags are AND.
- New entries save the line and details together; default mood is 3. Editing
  never removes the existing entry. Existing mood/tag changes save immediately;
  longer text saves on blur. Line drafts remain explicit Enter/Save and survive
  Diary view changes during this visit. All writes use useDiary/the existing
  IndexedDB sync collection and date-based identity; no new persistence path.
  At midnight, yesterday's unsaved backfill is cleared rather than relabeled
  as a different day; Today/Search header dates follow the actual current day.
- Streaks count unique days, retain yesterday's run until today ends and derive
  best/last run from history. Future rows cannot inflate aggregates. Written
  denominator is elapsed days this month, all days in a past month, zero in a
  future month. On this day follows the board's same-day-number recalls from
  earlier MONTHS, newest first (not only previous years). Future calendar days
  are browsable; new entries are for today or earlier days.
- W/T/L/C, /, ?, P, 1–5, Enter, Escape, Tab and [/] follow DA-cheat, scoped away
  from typing and unrelated dialogs. Radio groups and the single-tab-stop
  calendar support arrows; calendar also supports Home/End/PageUp/PageDown.
  Dialogs trap/restore focus. Escape leaves the line for its visible Save
  control; a subsequent Escape closes a historical editor. Empty saves announce
  errors. Today goals/events remain read-only and Open Today navigates back.
- App lazily mounts Diary. Sidebar Notes/Diary stay hidden until step 5; use
  Ctrl+K, type Diary (or Notes), Enter to open the page for review now. The
  shared search now has a focus trap and does not double-activate results when
  Enter is pressed on an actual result button. TodayPanel is unchanged.
- 15 pure logic tests cover unique/newer-wins history, timestamp ties/offsets,
  current/paused/best runs, year/leap/DST day boundaries, written denominators,
  invalid dates, monthly recalls, bounded gaps, search and week-start grids.
  The same 15 tests also passed with TZ=America/New_York for the DST boundary.
- Browser verification used the actual App shell and engine with two isolated
  IndexedDB fixtures, blank Supabase configuration and locally bundled fonts.
  Verified blocked empty saves, mood/tags/body, backfill, history editing with
  mood preserved, search/highlighting/filters, shortcut focus trapping/restoring,
  radio and calendar arrows, Escape focus, draft retention, reload durability,
  empty state and timeline capture (default mood 3). No browser console errors.
- Calendar geometry passed all four themes at 1440/1280/1100 with no horizontal
  or header overflow; inspected Calendar and Today screenshots. Today also
  checked at 1280 and 1100. Full rendered-board comparison remains step 6; the
  hosted board URL could not be fetched with the web tool, so the local design
  component was the reference. Native WebView keyboard/IME behavior, native
  opener runtime and live multi-device sync have not been runtime-tested here.
- Preview files/private context exports, test databases, tabs and server were
  removed after QA. Screenshot: this task's visualization directory,
  diary-step3.png (outside the repository). No new runtime dependency.
- Required Windows checks passed: pnpm install --frozen-lockfile; npx tsc
  --noEmit in desktop/widgets/calendar; Vitest 342/342 desktop and 152/152
  calendar; PORT=1420 BASE_PATH=/ desktop build; widgets build; cargo check
  --offline in both src-tauri folders. Existing main-chunk warning remains.
- Lazy Diary JS 30.27 kB / 9.35 kB gzip; CSS 11.44 / 2.68. Notes remains lazy:
  JS 363.08 / 111.91; CSS 18.04 / 3.81. Main 662.05 / 192.84.
- STOP after this commit. Step 4 events end-date UI/calendar, step 5 widgets/
  sidebar unhide and step 6 final board comparison have not started.

## Step 2 review fixes (23 October 2026)
- External editor links support Ctrl+click and an Open button in the link
  dialog. Both TypeScript and the native open_note_link command revalidate
  http/https/mailto immediately before opening through tauri-plugin-opener.
  Automatic plugin click interception is disabled. This is the same MIT
  opener plugin already used by widgets; no additional JS dependency.
- Replaced the white title/body focus boxes with subtle token-based
  focus-visible rings. Created/Edited both use locale short month + day.
- Browser fixture verified Ctrl+click destination, invalid-scheme rejection,
  Open control, computed focus styles and date labels. No live Supabase.
  Native OS opener was not runtime-tested; its real Rust guard passed 1 test.
- Required checks passed: frozen install, three typechecks, desktop 327/327
  and calendar 152/152 tests, both builds, both cargo check --offline.
  Notes JS 363.08 kB / 111.90 kB gzip; CSS 18.04 / 3.81. Main chunk warning
  remains. Preview harness/private context export removed after verification.
- Owner authorized step 3 Diary after these fixes. Steps 4–6 remain later.

## Step 2 Notes page (23 October 2026)
- Implemented NotesApp/NA-cheat in components/notes: masonry grid, grouped list,
  editor, folder/tag/search filters, pinned/recent views, inline capture and a
  real restorable Trash with Undo and explicit permanent-delete confirmation.
  Week groups use the saved week-start preference; Recent means the last 7 days.
- Lazy NotesPage uses MIT TipTap 3.32.0 core/react/pm/extensions (UndoRedo only).
  Custom flat nodes preserve the exact seven-block storage schema and stable
  IDs; no editor document wrapper is persisted. Slash menu and [[ UUID note
  references work with keyboard suggestions. Backlinks are computed locally.
  Selection-only toolbar supports bold/italic, token text colours, links,
  note-level font and alignment. No permanent formatting toolbar or Pro code.
- App-only Ctrl+Shift+N opens capture from any app page; Ctrl+N creates a note,
  Ctrl+P switches, Ctrl+K in the editor opens a link dialog, Ctrl+. focuses,
  Ctrl+Shift+E exports, and NA-cheat lists the exact scoped shortcuts.
  Dialogs trap focus, restore it and close with Escape. Oversized body/link
  edits are blocked before changing the stored note, with an error message.
- Added local Source Serif 4 5.3.1 (OFL), Latin regular/italic/bold only, alongside
  bundled Geist/Geist Mono. No CDN loads. Added the four note colour tokens to
  the shared theme blocks. Markdown/TXT exports are per note; ZIP/PDF deferred.
- Notes/Diary sidebar entries remain hidden until step 5 as ordered. To open
  Notes now, use Ctrl+Shift+N inside Facta, then save or close capture. Widget
  pinning saves pinned_to_widget and labels it as a pin for the future Notes
  widget; actual widget export/rendering/actions remain step 5.
- Logic tests cover all seven blocks through the real ProseMirror schema,
  stable IDs/splits, marks/references, body limits, filters/order/capture/week
  boundaries, and Markdown/TXT escaping/code fences/references/safe filenames.
- Browser verification used an isolated IndexedDB account/database with no
  Supabase configuration. Passed slash keyboard insertion, selection toolbar,
  local fonts, Ctrl+K, [[ links, tags, focus mode, capture/focus trap, switcher,
  title reset, Trash/Undo, reload persistence and an actual Markdown download.
  Verified in the real App shell that Ctrl+Shift+N loads Notes lazily and that
  Ctrl+K in capture cannot open the global search underneath it.
- Inspected list/editor/grid/empty/no-results/cheat states; checked all four
  themes at 1440/1280/1100 with no horizontal or action-toolbar overflow. Full
  branch-wide rendered-board comparison remains step 6. Screenshot is outside
  the repository in this task's visualization directory (notes-step2.png).
- Temporary preview code, private-context exports, test databases, downloaded
  fixture, tab and preview server were removed. TodayPanel is unchanged.
  Native WebView export/keyboard behavior and live multi-device Notes sync
  were not runtime-tested; native code remains compile-checked.
- Step 3 Diary, step 4 event end-date UI and step 5 widgets have NOT started.
- Final checks passed on Windows: pnpm install --frozen-lockfile; npx tsc
  --noEmit in desktop/widgets/calendar; Vitest 312/312 desktop and 152/152
  calendar; PORT=1420 BASE_PATH=/ desktop build; widgets build; cargo check
  --offline in both src-tauri folders. Existing main-chunk warning remains.
- Bundle before editor: no Notes chunk (0 KB), main 659.58 kB / 191.91 kB gzip.
  After: lazy Notes JS 362.24 kB / 111.58 kB gzip; lazy Notes CSS 17.87 kB /
  3.79 kB gzip; main 660.74 kB / 192.45 kB gzip. Source Serif assets are Latin
  only and load through the lazy Notes stylesheet. No TipTap imports in App.

## Step 1 local SQL review / step 2 authorization (23 October 2026)
- Fixed the polymorphic array_fill tags fixture with an explicit text cast.
  Other array_fill values already have uuid casts; other arrays resolve from
  typed expressions, explicit casts, operators or declared text[] parameters.
- Owner reports all SQL assertions pass with this correction on local Supabase,
  and both migration apply and rerun succeed. This is owner-run verification;
  no SQL was executed or Supabase project contacted by this session.
- Step 2 (Notes page) is authorized after this test-fix commit. Steps 3–6 remain
  later work. Native Quit runtime verification remains outstanding.
- SQL test-fix checks passed: frozen install, three typechecks, 301 desktop /
  152 calendar tests, both builds and both cargo check --offline on Windows.

## Step 1 review-fix history (23 October 2026)
- Fix 1: desktop Quit now emits a webview event and awaits every open store's
  flush (including account-change teardown) for up to two seconds before the
  native exit acknowledgement. Other desktop ExitRequested paths use the same
  handler. Startup listener replay, repeated-request suppression and a 2.2 s
  native fallback handle early/stalled webviews. Close-to-tray stays unchanged.
  Widgets have no IndexedDB cache; their explicit exits save positions natively.
- Fix 1 checks: frozen install, all three typechecks, desktop 296/296 and calendar
  152/152 tests, both builds, both cargo check --offline passed on Windows.
  Existing desktop bundle warning remains. Barrier tests cover real IndexedDB
  persistence before acknowledgement, multiple stores/failure and the deadline.
  Native tray handshake was compile-checked, not runtime-tested here.
- Fix 2: added a re-runnable BEFORE UPDATE diary date trigger, ordered before
  the sync guard. Direct date changes raise 23514, including stale writes and
  tombstones; same-date edits remain allowed. SQL assertions cover those paths.
  Full required checks passed again (296 desktop / 152 calendar tests).
  SQL is written/read only; embedded migration refresh is recorded in fix 4.
- Fix 3: re-runnable notes_font_check (nullable, <=50 characters) and
  notes_links_check (<=500 array elements) use the pg_constraint existence
  pattern. Matching client validation rejects >500 derived unique note IDs or
  long fonts before mutating the cache/queue. Vitest covers Unicode boundaries,
  null fonts, deduplicated references and rejection before local writes. SQL
  assertions cover valid boundaries and INSERT/UPDATE violations.
  Full required checks passed (298 desktop / 152 calendar tests); SQL has not
  been executed; embedded migration synchronization is recorded in fix 4.
- Fix 4: synchronized BOTH embedded branch migration copies (initial apply and
  rerun) in supabase/tests/notes_diary.sql. An automated source-comparison test
  now checks the base migration and both branch copies, excluding only their
  outer BEGIN/COMMIT. The standalone scratch script retains its guard and final
  rollback. This is copy verification, not SQL execution.
- Final fix-4 checks: frozen install, npx tsc --noEmit in desktop/widgets/calendar,
  Vitest desktop 301/301 and calendar 152/152, desktop build with PORT=1420
  BASE_PATH=/, widgets build and cargo check --offline in both src-tauri folders
  all passed on Windows. Main JS: 659.58 kB / 191.91 kB gzip; existing >500 kB
  warning remains. No new dependencies or step-2 UI work in these fixes.
- All four review fixes are implemented. STOP before step 2. SQL will be tested
  against local Supabase by the owner before migration application; no Supabase
  project was contacted. The native Quit handshake still needs a runtime check.

## Step 1 implementation history (22 October 2026)
- Branch created from origin/main at 48d1fc9. Step 1 only is implemented:
  data, storage and sync. STOP after this commit/push for owner review.
  Notes/Diary pages, editor, fonts, widget types and multi-day event UI have
  not started. Sidebar entries remain hidden; TodayPanel is unchanged.
- New re-runnable migration: 20261022140000_notes_diary.sql. Adds notes and
  diary_entries with ownership RLS (UPDATE USING + WITH CHECK), indexes,
  size/title/tag/enum constraints and the existing sticky-delete/newer-wins
  guard. Adds inclusive events.end_date with its constraint.
- Notes Trash is trashed_at (restorable edit); deleted_at is exclusively the
  permanent sync tombstone. Body is an editor-independent typed block array.
  Links are derived from UUID reference nodes; backlinks and Unicode word
  count are client calculations. Full schema/body rules and sync protocol:
  docs/notes-diary-data.md.
- Diary writes use the security-invoker facta_write_diary RPC, serialized per
  user/date with the partial live-date unique index as final guard. Newer
  clamped updated_at wins one_line/mood/body/tags together; ties keep stored
  fields and canonical ID/created_at. Covers offline duplicate UUIDs, sticky
  deletes, lost-response replays and explicit newer re-creation. Client rekeys
  queued identities without dropping newer in-flight edits. Entry dates are
  immutable through the client/RPC and database trigger; new entries default mood 3.
- All four collection caches AND the pending/failed write queue now use an
  IndexedDB-backed KeyValueStore: async hydration, synchronous read view,
  atomic coalesced cache/queue writes and async durability barriers. First-run
  per-user migration commits legacy bytes and its marker before removing
  unchanged localStorage values. Other accounts/prefs/auth are untouched.
  Later opens use IndexedDB without needing localStorage reads. Corrupt JSON
  is retained and surfaced rather than silently clearing saved data.
- Storage failures retain pending snapshots in memory, stay visible in the
  toast/sidebar, and offer retry; storage-open failures show an explicit retry
  screen. Remote work waits for persistence and cannot report success over a
  failed durability barrier. Actual disk exhaustion was not induced.
- Existing widget export reads the hydrated store. Native toggle polling now
  waits for a signed-in frontend readiness lease, preserving queued actions
  while IndexedDB hydrates; old lease release cannot pause a newer consumer.
  Native runtime delivery across hydration/account changes needs owner testing.
- Added test-only fake-indexeddb 6.2.4 for real storage/migration code in Node;
  no production dependency, TipTap or font package was added. Notes chunk is
  absent (0 KB before editor integration); current main JS is 658.41 kB,
  191.48 kB gzip. Record the lazy Notes chunk before/after TipTap in step 2.

## Step 1 verification (Windows, 22 October 2026)
- Passed frozen install; npx tsc --noEmit in desktop/widgets/calendar; Vitest
  desktop 292/292 and calendar 152/152; desktop build with PORT=1420 BASE_PATH=/;
  widgets build; cargo check --offline in both src-tauri folders. Native system
  prerequisites exist. Existing >500 kB desktop bundle warning remains.
- Tests cover mapping/end_date, typed bodies and limits, UUID link extraction,
  Unicode word count/backlinks, Trash versus tombstones, canonical diary ID
  adoption/in-flight edits/restart, migration isolation/restart/abort, >10 MiB
  persistence, storage failure retention/status/toast and corruption handling.
- Real-browser isolated IndexedDB harness passed: migrated legacy goals/events
  and queue; saved all four collections; closed/reopened >10 MiB of valid note
  bodies; cache and pending queue survived together; a closed database retained
  an edit in memory with a persistent error status. Test database/tab/server
  and temporary files were removed before final builds. No live Supabase calls.
- supabase/tests/notes_diary.sql is self-contained for the Supabase SQL editor:
  prerequisites + proposed migration + rerun + assertions, all in one rollback
  transaction. Refuses projects with existing planner tables; use a FRESH SCRATCH
  project. Embedded migrations were compared with their source files; no psql
  directives. SQL was written/read, NOT executed here. The owner runs the
  scratch tests before applying the migration to his project.
- Native WebView persistence after OS crash, live Supabase/RPC concurrency and
  native widget readiness delivery are not runtime-verified in this step.

## Approved branch-2 sequence (step 2 complete; steps 3–6 pending)
2. COMPLETE — NotesApp/NA-cheat: lazy MIT-only TipTap core/extensions, list/grid/editor,
   slash menu, selection-only toolbar, tags/pin/Trash+Undo/backlinks/switcher/
   app-only Ctrl+Shift+N capture/focus mode. Ctrl+K in editor means link.
   Bundle Geist/Geist Mono plus Source Serif 4 Latin only. Export Markdown and
   plain TXT with logic tests; ZIP/PDF deferred. Measure Notes chunk size.
3. DiaryApp/DA-cheat: Today/timeline/On this day/calendar/search/streak/missed/
   empty; test streak and written counts; no lock or stored aggregates.
4. Event end-date UI and calendar selectors/spans, including multi-day tests.
5. Notes Sticky/Stack + Diary widgets, Settings picker and sidebar unhide.
   Export only pinned notes plus four most recent non-trashed notes, title and
   plain preview (never bodies); diary only today's line and On this day lines.
   Pending actions must edit the full desktop record, never overwrite from a
   truncated preview; preserve existing diary mood, default new mood to 3.
6. Compare all four themes at 1440/1280/1100, fix, record gaps and stop for review.
Every finished step: all required checks including BOTH builds and cargo
checks, HANDOFF in the same commit, required human author, commit and push.

## Branch 1 history (merged into main at 48d1fc9)

## Review fixes (22 October 2026)
- All seven requested review fixes are implemented as separate commits.
- Fix 7: removed the generated android/ and ios/ subfolders under both native
  icon directories (70 files). Root desktop icon assets are retained.
- Fix 7 checks passed: frozen install; npx tsc x3; desktop Vitest 269/269,
  calendar 152/152; required desktop build; both cargo check --offline.
  Verified all four mobile folders and preview build artifacts are absent.
  Existing Vite chunk-size warning only. TodayPanel remains unchanged.
- Fix 6: overdue unfinished one-offs carry an Overdue sub-label in Goals Mine
  List and Board. Their original date and Today section membership remain;
  Done today still counts today's scheduled occurrences only. Added a mapper
  test excluding current/future goals, completed history and recurring rows.
- Browser verified List at 1280 and Board at 1100 with one due-today and one
  overdue goal; Today 2, Done today 0 of 1, and only the overdue row labelled.
  Light theme uses the warning token. Final Calendar audit: 16 view/width
  combinations (1440/1280/1210/1100), no wrapping/overflow. Preview closed,
  viewport reset, server stopped and fixtures removed before build.
- Fix 6 checks passed: frozen install; npx tsc x3; desktop Vitest 269/269,
  calendar 152/152; required desktop build; both cargo check --offline.
  Existing Vite chunk-size warning only.
- Fix 5: Week quick-add measures the popover and visible grid below its sticky
  header, flips above the selected range when needed, and clamps on scroll or
  resize. Its footer buttons wrap instead of compressing out of view. Added
  four pure placement tests (including 15:00–17:00 and changed viewport bounds).
- Browser pointer drag at 1280x720 selected 15:00–17:00: popover flipped above,
  all three action buttons stayed inside it and above the page footer. Resize
  to 1210x600 also stayed within the grid; Escape restored grid focus; no console
  errors. Disposable local fixture only, Supabase disabled.
- Fix 5 checks passed: frozen install; npx tsc x3; desktop Vitest 268/268,
  calendar 152/152; required desktop build; both cargo check --offline.
  Fixtures removed before build. Existing Vite chunk-size warning only.
- Fix 4: Calendar's 1201–1440px toolbar stays on one row with a flexible
  quick-add field. New event is icon-only at 1201–1320px, retaining its name,
  tooltip and shortcut. Browser checked all four views at 1440/1280/1210/1100;
  visually inspected Week at every width (720px height). Header stayed 79px
  high with no document overflow. Today styling is unchanged.
- Fix 4 checks passed: frozen install; npx tsc x3; desktop Vitest 264/264,
  calendar 152/152; required desktop build; both cargo check --offline.
  Temporary isolated fixtures removed before build; existing chunk warning.
- Fix 3: enabled untimed reminders are due at local midnight. Overdue one-offs
  remain due; repeats still respect schedules, completion and sent-day state.
  Added midnight/overdue/repeating tests in both Riyadh and New York projects.
- Fix 3 checks passed: frozen install; npx tsc x3; desktop Vitest 264/264,
  calendar 152/152; required desktop build; both cargo check --offline.
  Existing Vite chunk-size warning only.
- Fix 2: both native apps read HKCU SystemUsesLightTheme through RegGetValueW
  at tray startup and on ThemeChanged: dark taskbar uses white, light uses
  black. Window/app theme fallback is compiled only outside Windows. No new
  dependencies. This host's registry value is 0; live theme switching was not
  exercised in this revision.
- Fix 2 checks passed: frozen install; npx tsc x3; desktop Vitest 260/260,
  calendar 152/152; desktop build with required env; cargo check --offline
  in both apps on Windows. Existing Vite chunk-size warning only.
- Owner reports checks and native Windows testing passed for 0ad41a8.
- Fix 1: sign-out falls back to local scope after remote failure; the hook
  clears its user after either successful path. Only local failure propagates.
  Three mocked-client tests cover fallback, double failure and remote success.
- Fix 1 checks passed: frozen install; all three npx tsc checks; desktop
  Vitest 260/260, calendar 152/152; desktop build (PORT=1420 BASE_PATH=/);
  both cargo check --offline. Existing Vite chunk-size warning only.

Design source: Claude Design canvas v97 (artifact 76b58a8f-…). Boards render
locally: copy `artifact-type/dc-runtime.js` to `project/support.js`, serve
`project/` and open `<Board>.dc.html` (or a wrapper with
`<dc-import name="CalWeek" theme="bg" state="drag">`).

State: steps 1, 2a, 2b, 3, 4, 5 and 6 are implemented and checked. App uses the new Sidebar; Today is its
own page with no calendar view switcher. CalendarPage mounts the four new
views; legacy calendar views/CSS are deleted. TodayPanel.tsx is unchanged.
GoalDialog and EventDialog now use the v2 layout and shared dialog behaviour.
Goals Mine is mounted with live statistics, List/Board and quick add. Core browser visual QA is recorded below.
Settings mounts Widgets / Appearance / Account. MiniCalendar, icons and tray are implemented.
Core four-theme / two-width browser inspection is complete; native smoke checks remain.
See docs/ui-redesign-review.md for exact coverage, corrections and remaining owner checks.

## Current owner instructions (approved 21 October 2026)
- Rail breakpoint is <=1200px; 1100px is a comparison width.
- Keep TodayPanel's approved visual styling; change only navigation/container needs.
- Branch 1 only: no Notes/Diary widget types, schema changes or shared-goal implementation.
- Reuse the native tasklist companion check for Settings status.
- Weekly completion counts completed / scheduled occurrences for the current
  preference-defined week. Streak counts consecutive days with at least one
  completion; an unfinished today does not break yesterday's run. Best is the
  longest historical run. One-offs count on their own date when completed;
  repeats use completedDates. Test both and week-start/boundary variants.
- Each finished step: all required checks, HANDOFF update in the same commit,
  commit as Mahmoud Alshinawy <2270009032@iau.edu.sa>, push, then hash + three-line report.

## Step 1 verification (Windows, 21 October 2026)
- Passed: pnpm install --frozen-lockfile; npx tsc --noEmit in desktop, widgets
  and calendar; Vitest desktop 191/191 and calendar 152/152; desktop Vite build
  with PORT=1420 and BASE_PATH=/; cargo check --offline in both src-tauri folders.
- Native prerequisites exist. Cargo only warned about incremental-cache hard
  links (used copies); Vite warned about the existing >500 kB JavaScript chunk.
- Added fx-app.css hand rules, control/resize styles, empty-card drag
  passthrough and scrolling dialog shell. Imported both fx stylesheets.
  Replaced literal black shadows in the port with shared --shadow-ink.
- No browser/board or real-window verification yet; the shell is not mounted.

## Step 2a verification (Windows, 21 October 2026)
- Rewrote App shell/navigation while retaining auth callbacks, widget-action
  processing/export, search and dialogs. New sidebar on all sections; Today
  is independent, Calendar offers Day/Week/Month/Agenda. Notes/Diary stay hidden.
- Extracted sidebar navigation logic into shell/navigation.ts and added five
  tests for the 1200px boundary, manual overrides, resizing and hidden pages.
- Passed frozen install; npx tsc --noEmit in desktop/widgets/calendar; desktop
  Vitest 196/196, calendar 152/152; desktop build (PORT=1420 BASE_PATH=/);
  cargo check --offline in both apps. Same non-fatal build/cache warnings.
- Visually checked Today and Calendar navigation in Brave with local-only
  fixture auth, Supabase config explicitly disabled in the preview process;
  observed automatic narrow rail and full wide sidebar. TodayPanel unchanged.
- In-app browser cannot reach localhost; native Windows browser works.
  Formal board comparison and exact 1440/1100 captures remain for 2b/final QA.
- Calendar's legacy toolbar/now line remain temporarily and are removed in 2b.

## Step 2b verification (Windows, 21 October 2026)
- CalendarPage connects the header, four views, hidden-by-default mini calendar,
  footer and scoped 1-4/N/G/Q/T/PgUp/PgDn/[ shortcuts; App handles ? and search.
  Q reveals quick add at narrow widths. The mini calendar overlays at <=1200px.
- Header quick add saves complete lines and forwards incomplete EventDrafts;
  the current dialog accepts title/allDay/colour plus initialEndTime. The v2
  dialog rewrite is still next. Six new tests cover period navigation,
  week-start headings and quick-add mapping/end-of-day bounds.
- Deleted the four top-level legacy calendar views and their CSS. Removed
  unused now-line/dot CSS from fx.css; Week/Day render gutter pills only.
- Fixed a mounted Week flex minimum-height bug found in Brave: the grid now
  scrolls within the window, the footer remains visible and initial scroll works.
- Passed frozen install; npx tsc --noEmit x3; Vitest desktop 202/202 and calendar
  152/152; desktop Vite build (PORT=1420 BASE_PATH=/); cargo check --offline x2.
  Same non-fatal Vite chunk-size and Cargo cache hard-link warnings.
- Local fixture browser smoke: Today/Calendar switching, Day/Week keys, overlap
  layout, all-day spanning, gutter-only time pill, visible focus and footer.
  Formal hosted-board comparison at exact 1440/1100 and native-window QA remain.

## Done (tested)
- Final comparison (22 October 2026): Calendar's four views, Goals Mine list and
  Settings Appearance inspected in all four themes at 1440x920 and 1100x920.
  Hosted Week/Day/Month/Agenda/Goals/Settings references compared in Fit mode.
  Dialogs, Board and widget previews had additional sampled checks; coverage
  is listed in docs/ui-redesign-review.md, not a claim of testing all 431 boards.
- Fixed Agenda rows inheriting Week absolute positioning, rail width (now 64px),
  Board metadata size, clipped native AM/PM time fields, preview Shapes wallpaper
  and widget presentation. Wallpaper colours are shared tokens. Sidebar swatches
  now use theme tokens too. No new dependencies or native changes in this step.
- Empty-data checks found Week/Day empty cards scrolled above the viewport;
  cards now sit outside scrollers, hide during slot creation/details and keep
  pointer passthrough. Browser hit testing reached the underlying Week column;
  text is non-selectable and buttons retain pointer events.
- Fixed focus loss on keyed date/view remounts; consecutive day arrows, switching
  to Month and PgDn retain grid focus. Also exercised mini-calendar's one tab
  stop/arrows/Enter, Week Enter/Shift+Down/Enter range creation, narrow Q and
  quick-add draft forwarding, Ctrl+K while typing, inline goal parsing/X completion,
  prefs propagation, dialog blocked submits/reset/save/edit/Escape/focus return,
  widget create/hide and confirmation cancellation. Final console error log empty.
- Browser verification used disposable fixture sessions with Supabase config
  blanked. Fixtures removed and preview stopped before final builds. No live
  Supabase access, schema edits or TodayPanel changes. Native runtime, pointer
  drag/resize and exhaustive board-state checks remain explicitly unverified.
- Final step checks passed: pnpm install --frozen-lockfile; npx tsc --noEmit in
  desktop/widgets/calendar; Vitest desktop 257/257 and calendar 152/152; desktop
  build PORT=1420 BASE_PATH=/ and widgets build; cargo check --offline in both
  src-tauri folders. Windows prerequisites were available. Only the existing
  >500 kB desktop bundle warning remains. Temporary fixtures are absent from dist.
- Step 6 (22 October 2026): MiniCalendar reuses the dialog date grid. One
  tabbable date; arrows, Home/End and PgUp/PgDn move, Enter/Space select.
  Previous/next month controls have the equivalent PgUp/PgDn keys. Date
  navigation has six pure tests for year/month/leap boundaries and all three
  week starts. Recurring-event dots reuse the existing event-date selector.
  Opening [ focuses the grid; closing restores focus. Mini panel scrolls.
- Keyboard audit: Week day headers, all-day spans, untimed/timed goal checkboxes,
  more controls and each overlapping event are reachable. Day events and timed
  checkboxes are reachable too. Ctrl/Cmd+K now works while typing. Month/Agenda
  retain their grid/list keyboard paths. Empty-card drag passthrough CSS reviewed;
  pointer/keyboard smoke remains unverified in a running app.
- Regenerated both src-tauri/icons sets with the local Tauri CLI from
  apps/desktop/public/icon.png, including default platform outputs. Both trays
  embed public/tray-white.png / tray-black.png via Tauri's existing include_image
  macro, select by native system theme and update on ThemeChanged. No new
  dependencies/features. Native tray appearance/theme switching is not verified.
- Step 6 passed frozen install; npx tsc --noEmit x3; desktop Vitest 257/257,
  calendar 152/152; desktop build PORT=1420 BASE_PATH=/; widgets Vite build;
  cargo check --offline in both native folders. Existing Vite size warning only.
  TodayPanel.tsx remains identical to b449d97. No live Supabase access.
- Step 5 (22 October 2026): Settings tabs with arrow/Home/End navigation;
  Widgets companion status + Launch, saved widget list, enable/remove, new-widget
  type/theme/transparency/live-data preview, inline Reset all confirmation;
  Appearance theme cards, week start/time format/weekend; Account email and
  inline sign-out confirmation. Failed sign-out preserves the signed-in state.
- Companion status and Launch share the existing native tasklist/pgrep check,
  extracted as widget_app_running. Existing config JSON/native dayview name and
  legacy defaults retained; no Notes/Diary types. Four pure compatibility tests.
- Step 5 passed: frozen install, npx tsc --noEmit in all three packages,
  desktop Vitest 251/251, calendar 152/152, desktop Vite build (PORT=1420,
  BASE_PATH=/), cargo check --offline in both apps. After the laptop restart,
  sandbox access prevented initial checks from starting; retries with access to
  installed toolchains passed. Existing Vite chunk/cache-link warnings remain.
- Settings source reviewed against Settings.dc.html. Visual comparison and
  native companion launch/status smoke were NOT performed; computer control
  remains stopped. No new dependencies, schema edits or live Supabase access.
- Step 4: GoalsPage + GoalOverview replace GoalsPanel. Mine/Shared (coming soon),
  weekly ring/day badges, current/best streak, done today, next up, priority filter,
  Time/Priority/A-Z sort, List/Board, recurring rules, collapsed Done, inline
  parseQuickGoal, edit dialog and keyboard arrows/J/K/Home/End/X/E/Enter/N.
- goalStats follows the owner's occurrence/week-start/history definitions.
  New pure stats/mapping/reminder tests run in Riyadh and (stats) New York,
  including year/week boundaries, all week starts, one-off history, duplicates,
  recurring schedules, unfinished-today grace, best history, future dates and DST.
- Upcoming includes all future one-off goals, with a "Scheduled" note rather
  than the sample's "Next 2 weeks", so distant newly created goals stay reachable.
- Reminders use the same tested pending-state predicate for bells and delivery;
  completed historical rows never show today's unsent bell. Notification loop
  moved to App so it survives page changes. Permission is requested only from
  the user's explicit reminder-switch click; failed notifications remain unsent.
- Step 4 checks: frozen install, tsc x3, desktop Vitest 247/247, calendar 152/152,
  desktop Vite build PORT=1420 BASE_PATH=/, cargo check --offline x2 passed.
  No dependencies added; TodayPanel untouched; no live Supabase access.
- Step 4 visual check was stopped by physical Escape before inspection.
  Do not claim Goals visual QA passed. Computer Use must remain stopped for
  that turn; final board/theme/width and native smoke checks are still outstanding.
- Step 3: GoalDialog-v2 and two-pane EventDialog New/Edit. Fresh form state on
  every opening; title autofocus; Enter saves (Shift+Enter allows a description
  newline); Escape backs out of delete confirmation before closing; Tab trap
  and focus restoration; blocked-submit live message; scrolling body/fixed footer.
  Reminder is unavailable without a time; custom repeats require a day.
  initialEndTime and title/allDay/colour drafts are preserved. Event deletion
  keeps the existing delayed Undo flow after inline confirmation.
- Shared dialogs/DatePickerGrid supports arrows, Home/End, PgUp/PgDn and Enter
  with one tabbable day; uses week-start preferences. Reuse for MiniCalendar next.
- Added theme tokens for dialog scrim/shadow, danger text and swatch checks from
  EventDialog's four themes; no literal colours in the new dialog components.
- Step 3 checks: frozen install, tsc x3, Vitest desktop 209/209 and calendar
  152/152, desktop build PORT=1420 BASE_PATH=/, cargo check --offline x2 passed.
  Seven new pure form-state/validation tests. Existing non-fatal warnings only.
- Step 3 local browser checks: Goal/Event layouts, title autofocus, blocked
  submit, disabled reminder explanation, Escape close, backward Tab wrapping,
  Edit event and its inline delete confirmation. Live Supabase remained disabled.
  Exact board/theme/width comparison still remains for final QA.
- `packages/calendar/src/theme-tokens.css`: `--event-red/green/orange/pink` as
  real tokens in all four themes (values from the boards). `apps/desktop/src/lib/eventColors.ts`
  and the Day widget now use `var(--event-*)` (Tailwind fallbacks gone).
- Day widget: now line and dot removed; only the gutter pill remains
  (`apps/widgets/src/components/DayViewWidget.tsx`, `apps/widgets/src/index.css`).
- `packages/calendar/src/quickParse.ts` (+ test): `parseQuickEvent`
  ("Lunch with Alex Fri 1pm": day words, next weekday, in N days, 24 Oct /
  Oct 24 / 24/10 (day first) / ISO, am/pm, 24h, noon, "at 7", ranges,
  "for 90 min", all day) and `parseQuickGoal` ("Gym daily 18:00 !must":
  !must/!should/!nice or !1-3, daily/weekdays/weekly/"every mon, wed").
  `complete: false` = open the full dialog pre-filled.
- `packages/calendar/src/spans.ts` (+ test): all-day lanes (`spanLanes`),
  15-minute `moveBlock`/`resizeBlock`/`snap`, `conflicts`, `monthChips`.
- `apps/desktop/src/lib/calendarData.ts` (+ test): goals/events per day,
  per-day ticks, `allDaySpans` (joins consecutive days, detects carry-over).
- `apps/desktop/src/lib/focusTrap.ts` (+ test) and `hooks/useDialogFocus.ts`
  (autofocus `[data-autofocus]`, trap Tab, restore focus to opener).
- `lib/theme.ts` broadcasts `facta-theme`; `hooks/useTheme.ts`.

## Mounted redesign components
- `apps/desktop/src/styles/fx.css`: board CSS ported and scoped under `.fx`
  (dialogs under `.fx .dlg`), in `@layer components`. Generated by a script
  (scratchpad `portcss.py`, not in repo); `--muted`→`--subtle`,
  `--text-rgb` etc. → `color-mix()`. Imported with `fx-app.css` hand rules
  (step 1 complete); still needs visual verification once mounted.
- `components/shell/`: `Icons.tsx`, `Sidebar.tsx` (Today/Calendar/Goals/Settings,
  Notes and Diary hidden via `HIDDEN_SECTIONS`; rail ≤1200px via `sb-c`/`sb-o`),
  `Shortcuts.tsx` (cheat sheet rows from CW-cheat board, footer hint bars).
- `components/calendar/`: `CalendarHeader.tsx` (toolbar, quick add input,
  Day/Week/Month/Agenda seg, New event), `WeekView.tsx` (band, goals row,
  overlap columns, conflict marker, drag create → quick-add popover, drag
  move/resize 15 min, Esc cancels, keyboard grid), `DayView.tsx`,
  `MonthView.tsx` (bars, chips, arc, day popover), `AgendaView.tsx`,
  `Popovers.tsx` (quick add, event detail with E / Del + Undo), `common.tsx`,
  `types.ts`.

## Remaining verification
- Native Tauri/companion/tray/OS notification smoke, actual pointer drag/resize,
  and optional exhaustive board-state comparison. See docs/ui-redesign-review.md.
- Branch 2 and branch 3 are not started. Stop here for owner review.

## Decisions that differ from the brief
- **Multi-day events need a schema change.** Events have no end date, so a
  single event can't span days. The spanning layout is built and works for
  repeating all-day events (consecutive occurrences join into one bar).
  True multi-day events need an `end_date` column: suggest adding it in
  branch 2's migration.
- Repeating events dragged in Week move/resize in time only (all repeats);
  their day can't change by drag. Event delete uses an Undo toast (delayed
  delete, like "Let it go") because server deletes are sticky.
- No board draws the mini calendar; plan is a side panel toggled by `[`,
  hidden by default to match the boards.
- Initial Week/Day scroll: 08:00 as drawn, unless now is below the fold,
  then now − 2 h.
- "Focus" state on GoalsMine is the keyboard-focused list (that's what the
  board shows); "reminder" = bell when a reminder time passed unsent.
- Quick add numeric dates are day first (24/10). "fri" includes today; "next fri" skips today.
- Native date/time inputs in dialogs follow the OS locale, not the 12h/24h pref.
- Today page keeps its now line (the rule named Week, Day and the widget).

## Next steps, in order
1. DONE: import `styles/fx.css` and new `fx-app.css` in `src/index.css`.
2a. DONE: rewrite App onto Sidebar + sections; Today is independent. Keep legacy
    calendar views temporarily so this is a separate working commit.
2b. DONE: CalendarPage and legacy deletion. Formal board comparison still due.
3. DONE: dialogs v2, Goals Mine (+ goalStats tests), Settings tabs.
4. DONE: MiniCalendar side panel, empty-state passthrough, icons/tray.
5. Every commit: frozen install, tsc in all three packages, Vitest in desktop
   and calendar, desktop build with PORT=1420 BASE_PATH=/, cargo check in both
   native folders. Use Windows host settings. Build widgets when relevant.
   Final: 4-theme x 2-width comparison, native smoke test, report differences;
   stop for owner review.
