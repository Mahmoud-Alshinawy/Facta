# Shared goals: Step 6 verification checkpoint

Owner approved **9d54740** and authorized Step 6. Work ran on Windows on
27–28 October 2026, on `feat/shared-goals`. **This is partial acceptance, not
full backend/native acceptance.** Stop for final branch review; do not merge.

## Changes

- Shared cards now stack at <=1200px, matching GoalsShared. A mounted two-group
  regression reproduced the previous two-column layout at 1100px before the fix.
- Detail's obsolete “Accent” legend now says “Green”; >=70% remains literal
  `--event-green`, with lower bars using `--text-2`.
- Today and Settings Progress preview evaluate freshness at render time. A fresh
  read arriving between the parent's minute ticks must not look like a clock
  rollback and incorrectly show “Last confirmed.” Observed natively, reproduced
  with the mounted full App before fixing it. Click-time capture/retry identity
  remains separate and unchanged.
- Extracted `SyncEngines`, the existing two context providers, so the acceptance
  app binds real account engines to production hooks. Production initialization,
  filtering, gates and error toasts retain their behavior. The test harness
  replaces identity only; it does not replace engine/store/SDK/SQL behavior.

## Visual and keyboard evidence

`scripts/run-shared-client-tests.mjs 55439 --ui --step6` mounts the production
App, Sidebar, Goals pages, Today and Settings. No installed storage or `.env`
is read. It uses native Edge IndexedDB, real Supabase SDK requests and a new
disposable PostgreSQL database behind the synthetic-identity loopback bridge.

- Captured overview, detail, template, Gym details, People with pending invite,
  Review, Custom specific-day details, populated Today, and Settings Progress
  preview in **default/Midnight/Ember/Light × 1440/1280/1100 × 920/600**.
  Actual invitation tokens are masked in captures. Settings separately selects
  each widget theme rather than merely changing the surrounding app theme.
- Checked page overflow and actual Tab focus within the viewport in every
  frame. Swept Tab stops with visible focus indicators at 1100×600 in Light
  for each surface. Earlier creation/detail keyboard, modal/text scope, Back/
  Escape/title restoration and pointer regressions were rerun separately.
- Read the approved components individually. Rendered their own `renderVals`
  sample states locally for GS/GD/GC, Main, Settings and Widget, with bundled
  font faces and no remote font/support-script loads. Reference captures cover
  four themes and three app widths (Widget is its native 300px card width).
  This is a local static reference rendering, not the hosted Claude canvas.
- Inspected all nine matrix contact sheets, plus full-size representative
  overview/detail and reference captures, and the native theme captures.
  Short windows scroll within content; later rows/form controls remain reachable
  by keyboard. No full-page horizontal overflow was found in the matrix.

Captures and result manifests remain in ignored
`tmp/shared-goals-runtime/step6-shots/` and `step6-result.json`; contact sheets
are in `tmp/shared-step6/qa-*.jpg`. Generating a capture is not pixel-diff proof.
Sample names/counts are invented and do not match real test fixtures.

Design adaptations retained from the approved plan: independent personal
completion, literal green bars, per-group date/round labels, extra confirmed/
stale/pending/eligibility/history controls, and reduced pre-join information.
The historical Main navigation is replaced by the approved current sidebar.
The implementation is not a pixel-identical copy: member avatar styling and
some header/summary spacing differ from the static samples; fuller server-state
labels also make cards taller. These remain explicit final visual-review deltas,
not an assertion that every board is pixel-matched.

## Integration evidence

- Full-App two-device simulation uses **two independent browser contexts and
  IndexedDB stores on one physical Windows host**. Device A queues an offline
  undo; device B undoes/rechecks through real RPCs; A reconnects and retains a
  conflict rather than overwriting the newer server revision. Confirmed scores
  stay authoritative; explicit discard resolves its rejected local intent.
- Full App also covers next-round join eligibility, two accepted but only one
  eligible member pausing the group, archived read-only history, successful
  leave purging access, and rebinding to a second account. Personal records
  remain unchanged by the competing shared commands.
- The final full-App acceptance run passed **567 assertions**, with **284
  captures** (216 application frames, 64 local references and four paused Today
  frames). It includes fresh confirmations between minute ticks on both Today
  and Settings, and independently selected Settings widget themes.
- The existing **243 mounted assertions** passed again: all creation/recovery
  and real reload cases, Step 4 lifecycle/target/history/security-state cases,
  and Step 5 cross-surface/date/personal-independence/export/clock regressions.
- **94 data assertions** passed again, using native IndexedDB reloads and real
  SDK/SQL: failed open/quota/ack recovery, immutable UUID/body/captured date,
  account isolation, coverage reconciliation, interruption/reconnect, lifecycle
  replay and four personal collections syncing during shared infrastructure loss.
- Reran `scripts/run-shared-goals-tests.py --port 55439`: PostgreSQL 17.5
  passed **421 checked SQL assertions plus exception assertions**, migration
  apply/rerun and personal-schema coexistence (four personal rows preserved),
  and **22 independent-session concurrency cases**. These include last-seat
  joins, receipt/body identity, competing check-ins, revoke/rotate, archive/leave
  ordering, target changes/cancellation, ownership, boundary lock waits, group
  invitation budget and durable profile-attempt limits. A six-year bounded
  history query returned 16 rows; this was a query-plan check, not a load test.

These tests do not verify Supabase Auth/JWT/PostgREST. They exercise actual SQL
roles/RPCs with synthetic identity claims, not signature verification or an
authenticated deployed HTTP stack.

## Native evidence actually observed

Separate compiled Tauri/WebView2 apps used `app.facta.step6.*`, workspace WebView
profiles and shared files under `tmp/shared-step6`, and **facta-step6:// only**.
Production sources were never overlaid. Test copies disable autostart writes
and installed-companion launching; the installed Facta app remained untouched.
Identity is synthetic and account engines are manually opened by test controls.
The normal production AuthProvider/SyncProvider sign-in startup path is therefore
outside this native evidence.

| Action               | Observed result                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings picker      | Created a solid Progress widget through the actual native picker; confirmed preview and saved config in actual Rust-written `widgets.json`.                                                                                                                                                                                                        |
| Native check-ins     | Today reached SQL-confirmed 50%; the next completed group day reached 100%. Detail and actual export agreed; the separate personal ring stayed 0/1. Pending checkmarks retained old confirmed scores until reply.                                                                                                                                  |
| Quit durability      | Staged a real personal collection write and immediately invoked the production quit request/barrier through a test command. Cold restart retained “Quit durability saved,” including the unsent local queue/IndexedDB write. No claim of forced power-loss durability.                                                                             |
| Warm link            | OS-dispatched test-scheme group link opened the correct mounted detail.                                                                                                                                                                                                                                                                            |
| Cold link            | Same test-scheme link after process exit reopened IndexedDB, restored the intended group and visibly focused its heading.                                                                                                                                                                                                                          |
| Companion Open group | Real pointer click invoked the companion command/opener and restored the correct native group detail. Rows remained read-only.                                                                                                                                                                                                                     |
| Export/watching      | Real Rust export/file notifications plus companion polling consumed the actual account, group date, scores and persisted Progress config. Initial actual file was 1,443 bytes; personal-row case 1,714; empty signed-out export 606; after leave 944. Shared summary remained bounded/token-free.                                                  |
| Theme comparison     | Compared actual 300×400 companion cards in default/Midnight/Ember/Light. Midnight/Ember/Light variants were fed atomically through the isolated file using the real exported snapshot, changing only widget theme and increasing export version. 100% stayed green; 0% grey. These are file-fixture theme changes, not four Settings-create flows. |
| Account cleanup      | Switching A→B exported B with zero A personal goals; companion changed to B's own group/self rows and 0/0. Sign-out exported null identity and empty rows; companion displayed sign-in guidance. Restoring A retained its personal goal.                                                                                                           |
| Leave cleanup        | Real disposable RPC transferred ownership and removed A. Native Sync reconciled access; actual export had zero shared groups, one personal goal and one preserved widget. Companion showed Group unavailable without retained leaderboard rows.                                                                                                    |

Normal bottom-stacked widgets can be covered by unrelated host windows. Native
pointer/visual completion used a **test-copy foreground override** after initial
normal-policy observations; production stacking was not changed. UI Automation
text could lag a paint, so final cleanup/theme observations use the visible
captures. Companion restarts/cleanup were forced only for verified workspace
processes with no pending edits; its literal tray Quit was not tested. Desktop
quit uses the production flush path, but not a literal tray-menu click.

Native captures are `tmp/shared-step6/native-*.jpg`. No real credentials were
used by the fixture. Confirmed no isolated app processes remain and the test
scheme is unregistered. The clock helper and native fixture exited; the owned
PostgreSQL cluster was stopped normally after the final suites. Test artifacts/
profiles remain for review. Installed Facta and its handler were left alone.

## Required checks and remaining acceptance gaps

Passed: frozen install; desktop/widgets/calendar TypeScript; **437 desktop /
194 calendar Vitest tests**; desktop PORT=1420 BASE_PATH=/ build; widgets build;
both production Windows `cargo check --offline`. Existing desktop main-chunk
warning remains (~808 KB uncompressed). No dependency, migration or SQL changes.

**Full Auth/JWT/PostgREST remains unverified.** Docker client is installed, but
the engine pipe is absent. Starting Docker Desktop failed with its backend
unable to rename `sailor-ingest.sock` to `.stale` (“file cannot be accessed”).
No Docker reset, OS security change, live Supabase connection or installed
planner-data access was used as a workaround.

Still required before full acceptance: a working disposable Supabase stack for
real sign-up/sign-in/token refresh/sign-out, signature/audience/expiry checks,
anon/cross-account HTTP authorization and PostgREST schema/grants/serialization;
production `facta://` installer registration and packaged warm/cold/auth links;
literal tray menus, production bottom-stacking under occlusion, native OS-network
offline/reconnect and two separate hardware devices. Browser offline and
disposable SQL tests do not establish those native/Auth properties. No installer
was built/applied and no live backend was touched.

**Stop for final branch review. Do not merge or claim full acceptance.**
