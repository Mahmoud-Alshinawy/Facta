# Shared goals: Step 4 checkpoint

The owner approved **c882ad5**, completing Step 3, and authorized Step 4 only
of the approved 5337807 plan. Stop for review before Step 5. No migrations,
dependencies, native changes, Today/widget integration or live Supabase access.

## Implemented behavior

- Shared overview: active-round summary, per-goal server rank, check-ins left,
  cards with confirmed leaderboards, current check-in/undo, waiting/paused/
  archived states, pending-target notices, prior-round averages and Open.
  Draft recovery, invitation banners and explicit creation/join remain intact.
- Detail: leaderboard, all-member seven-day check-in table, targets/shared
  schedule, actual scored-round selection, group-average history, tied winners,
  bounded older-history loading and server activity cutoffs. Accepted future
  members and invitations have no invented rank. Departed round members remain
  visible in their frozen historical roster. Inactive gaps have no zero rows.
- All scores, ranks, denominators, group averages, threshold flags and round
  intervals come from the validated SQL snapshot. Formatting does not calculate
  scores. Pending desired-state checkmarks never modify confirmed scores.
  Confirmation uses coverage for the displayed round and exact group revision;
  unrelated reads cannot freshen retained scores or suppress older pagination.
  Reaching an unconfirmed next boundary offline disables check-in and labels the
  lifecycle unconfirmed, rather than inventing an active or paused round.
- Gym split changes/cancellation use the existing online RPC. Current/history
  denominators stay fixed; pending versions show their effective boundary.
- Membership dialog confirms leave, transfer or archive. Owner leave requires
  an accepted successor or prior archival. Unresolved check-ins block these
  actions. Commands retain UUID/body via SharedRequests; uncertain results use
  the existing explicit recovery strip. Confirmed archival also completes any
  local draft for that group. Confirmed leave purges access immediately.
- Queued changes expose Sync; rejected/conflicting changes require explicit
  review/retry or discard. Retry uses the engine's new-command conflict policy.
  If another device removes access, group data disappears but the current
  account's own rejected intentions remain discardable, including from home.
- Detail C checks/undoes today; Escape returns to the original card. Text inputs,
  selects, dialogs and the app's blocked-key scope suppress C. Tab reaches panels
  and controls. Dialogs trap Tab, keep Escape scoped when a disabled submit loses
  focus, and restore their opener. Invitation return restores its newly mounted
  detail opener and stops the same Escape from closing two panels.

## Verification actually run

The existing disposable runner uses PostgreSQL **17.5**, the real Supabase SDK
over a loopback SQL bridge, and Edge **156.0.4314.42** with native IndexedDB.
Identity claims are synthetic. No external browser requests were observed;
secondary browser contexts also block all non-loopback requests.

- **94 data integration assertions** passed: actual IndexedDB reload/transaction
  failure recovery, immutable replay UUID/body/date, account isolation, snapshot
  reconciliation, shared outage independent of personal collections, receipt
  replay, conflict review, and pause/resume/archive replay boundaries.
- **85 existing UI assertions** passed in a combined **157-assertion** run with
  the first 72 Step 4 assertions. All three mounted recovery cases and both real
  page-reload cases remain passing. Profile, Gym/Custom creation/join, expired
  publication reconfirmation, invitations, capacity and receipt retries remain
  covered by that existing suite.
- The final focused Step 4 suite has **74 assertions**, adding fresh-device
  history pagination to those 72 cases. It exercises real pointer clicks and
  keyboard events through the production components/adapter into SQL:
  - detail mount and card/dialog/invitation focus restoration; C/Tab/Escape scope;
  - check-in/undo and exact displayed SQL adherence/rank parity;
  - target change, cancellation and next-boundary application;
  - offline pending scores, independent-device opposing conflict and explicit retry;
  - next-round accepted member excluded from current rank/activation;
  - pause after eligible departure, inactive/future days, later resumption;
  - archive, read several weeks later without new rounds, archived-owner leave;
  - Custom specific days/rest, Every day and N-per-week server denominators;
  - pointer transfer, removal of former-owner controls, atomic transfer-and-leave;
  - access loss while pending, own-intent discard and account-isolated group route;
  - waiting through a boundary, late join and later activation without gap scores;
  - bounded recent-history cache on a fresh device, then actual older-page loading.
- Pure view tests cover pending state without score edits, archival with retained
  active cache, rest/future/inactive/ineligible cells, tied ranks/fixed targets,
  group/revision/round coverage, exact cutoff and account/access isolation.
  Seven new tests bring desktop Vitest to **431**; calendar remains **184**.
- Required checks: frozen-lockfile install; TypeScript in desktop, widgets and
  calendar; both Vitest suites; desktop build with PORT=1420 BASE_PATH=/; widgets
  build; both Windows `cargo check --offline`. Existing desktop >500 KB chunk
  warning remains (main bundle about 795 KB uncompressed).

## Design/visual coverage and limits

Read `GoalsShared.dc.html` and `GoalsDetail.dc.html` separately, including their
markup, styles and state rendering. The implementation uses theme tokens and
existing bundled fonts. It follows the summary/card and four-detail-panel
structure, with additional status/confirmation controls required by the approved
data and lifecycle contracts.

The automated harness renders the actual sidebar (wide above 1200px, rail at
1100px) and these production pages. It captured overview/detail in default,
midnight, ember and light at **1440, 1280 and 1100 × 960**: 24 screenshots, with
no document-width overflow assertions. Representative captures were inspected
directly across all four themes, including default 1280 detail/default 1440
overview, light 1100 detail, midnight 1280 overview and ember 1440 detail.
Local captures: `tmp/shared-goals-runtime/step4-shots/`; result files remain
ignored local artifacts. This is not a full hosted-board/pixel-by-pixel audit.
The comprehensive state/short-window/native comparison remains Step 6.

Full **Supabase Auth/JWT/PostgREST**, deployed HTTP authorization, packaged
native links and a native UI smoke test were **not** verified here. Cargo checks
are compilation evidence only. No standalone schema/RLS/security/concurrency
suite was rerun, and these browser/baseline passes do not establish those
properties. Today, Mine and companion behavior were not changed or claimed as
newly verified. No installed planner data or live backend was touched.

## Reproduction

With the existing owned local fixture runtime and its documented environment
variables, `scripts/run-shared-client-tests.mjs <local-port>` runs data tests;
`--ui` runs existing creation/recovery plus Step 4; `--ui --step4` focuses the new
74 assertions. Each invocation creates/drops its own disposable test database.
The owned temporary PostgreSQL cluster is stopped after verification.

**Next checkpoint: owner review of Step 4. Step 5 is not authorized.**
