# Shared goals: Step 5 checkpoint

The owner approved **867128a**, completing Step 4, and authorized Step 5 only
of `shared-goals-plan.md` (5337807). Stop for review before Step 6. No schema,
dependencies, live Supabase or unrelated untracked files changed.

## Implemented

- Today's approved right-hand shared panel now has a group picker, top-three
  leaderboard plus self, server counts/ranks/adherence, group-local date/round,
  pending/stale/lifecycle labels, explicit shared check-in/undo and Open group.
  Empty Gym/Custom launchers open the existing wizard with that template selected
  and title input focused. They preserve profile setup, final-date reconfirmation
  and all draft/retry rules. Group navigation reuses the typed existing route.
  TodayPanel's personal content, layout and now line are otherwise preserved.
- The existing Progress widget has the Widget board's personal ring and separate
  shared leaderboard. Its personal calculation reads existing camelCase goal
  records and the device's local day, including repeating completion dates.
  Shared rows use server values and group-local dates. Rows are read-only; their
  only action is Open group. The group selector changes presentation only.
- Today and Progress use the same shared view/projection and coverage rules.
  Rest, not-yet-eligible, waiting, paused, archived, unknown-boundary, pending and
  stale states remain separate from scoring. Cached scores never become current
  just because a file refreshes. An unchanged file ages stale and its active
  interval stops at the recorded cutoff, without generating a new round.
- Settings supports an optional account-bound Progress group on existing/new
  widgets and shows the actual Progress card in its preview. Existing widget
  types, themes, transparency, enabled states, note styles and saved positions
  remain compatible. New Progress windows default to 300 × 400; existing sizes
  stay intact and the card scrolls in smaller windows.
- Each widget remembers a stable account/group choice locally. Initial fallback
  is deterministic: active groups first, then creation time and ID. Reordering
  does not change a chosen group. Missing groups become unavailable without
  retaining their names/rows or silently choosing another group. Configured
  preference cleanup on leave preserves this unavailable state; account change
  clears/rebinds selection. Config preference fields are scoped by user ID.

## Export and cleanup contract

`widgets.json.shared_goals` is a version-1 whitelisted block:
`{version,userId,defaultGroupId,groups,truncated,unavailable}`. Each group carries
ID/revision, bounded name, time zone/date, phase/reason, confirmed time, pending/
stale/archive flags, one displayed scored round and at most four score rows.
Rows are top three plus self and preserve exact SQL ranks, threshold flags,
adherence and completed/target counts. No score calculation runs in the widget.

The shared block is capped at **16 groups and 65,536 UTF-8 bytes**. Configured
Progress groups get priority within that cap; truncation is explicit. There are
no invitation tokens, raw histories/check-ins, drafts, receipts, outbox bodies,
pending invitation lists or profile directory. The existing personal/journal
parts of the file retain their own contracts. Today's on-screen picker can
still see all authorized groups; the file cap does not limit it.

The export bus flushes its captured IndexedDB store and rechecks both account and
store before invoking native export. Shared-record failure produces an empty
unavailable shared block without blocking personal exports. Exports run after
mutations/config changes and every 30 seconds. Account changes queue immediate
cleanup. While a known account's store opens, file data is empty under that
account ID, preserving a same-account selection; unresolved initial auth is not
treated as confirmed sign-out. Confirmed sign-out exports null identity/empty
data. Old-account in-flight exports are serialized before subsequent cleanup.

Access loss removes the group from the next export and clears only its
account-bound config fields. Other config fields remain. Preference-save failure
is visible but does not prevent native account cleanup. Native export validates
the shared block's account, size, count and field allowlist. File timestamps
increase strictly, even for same-millisecond writes or clock rollback, so the
companion's existing ordering guard accepts cleanup. The native group opener
allows a canonical UUID/Goals route and retains existing Notes/Diary focus routes.

Remote revocation cannot erase an already-offline device. Previously confirmed
data remains until the planner learns of revocation and exports the new state.

## Evidence actually run

- Frozen-lockfile install; TypeScript in desktop/widgets/calendar;
  **437 desktop / 194 calendar Vitest tests**; desktop build with PORT=1420,
  BASE_PATH=/; widgets build; both Windows `cargo check --offline`. Existing
  desktop main-chunk warning remains (about 808 KB uncompressed).
- **215 combined browser assertions passed:** 85 creation/recovery, 74 Step 4,
  18 Step 4 review, and 38 Step 5. A final focused Step 5 run also passed all 38.
  Earlier mounted lost-create/publication and both actual page-reload regressions
  remain passing. Runner uses Edge 156.0.4314.42/native IndexedDB, real Supabase
  SDK requests into an owned disposable PostgreSQL 17.5 SQL bridge, with synthetic
  identity claims and no external browser requests.
- Step 5 mounts the production Today shared content, Progress card and Shared
  detail. It uses a real personal PlannerSync as well as SharedSync. A device in
  Los Angeles sees 20 October while the Riyadh group sees 21 October; switching
  to a New York group consistently changes the shared date on both surfaces.
  Pointer check-in/undo, Open group/title focus, Gym/Custom launchers, selection
  remount, pending/stale/waiting/paused, leave/account cleanup, stored export
  bounds and omission of actual issued invitation tokens are checked.
- The shared completion leaves personal records and `goalStats` byte-for-byte
  unchanged; an independent personal completion changes only the personal ring.
  Displayed adherence/ranks on Today/Progress are compared directly with the SQL
  snapshot, and Shared detail displays the same confirmed value.
- **94 data integration assertions** passed: native IndexedDB reloads, quota and
  acknowledgement failure recovery, account isolation, immutable retry identity,
  snapshot reconciliation and independent personal sync during shared outages.
- Pure tests cover UTF-8 size/Unicode, 30-group truncation with configured-group
  inclusion, top-three-plus-self, strict/cross-account decoder, legacy files and
  configs, stable selection/removal, aging/cutoff and stored-record export.
  The configured-selection cleanup regression was observed failing, then fixed.
- **Three native helper tests passed:** two desktop tests for account/field/size
  rejection and strictly increasing export timestamps; one companion test for
  canonical group URLs, invalid scope/ID rejection and existing note/focus URLs.

Read Main.dc.html's shared/empty sections and state rules, and Widget.dc.html's
Progress markup/state rules separately. Sample personal/shared coupling was
not adopted, per the approved independent-statistics contract. Four theme
captures of the mounted cards at 1280 × 960 are in ignored
`tmp/shared-goals-runtime/step5-shots/`; default and light were inspected after
fixing harness-only theme propagation. The harness also needed the production
desktop React deduplication for shared components. This is not a full Today,
Settings or packaged companion visual/native smoke test; Step 6 comparison and
native acceptance remain pending owner authorization.

## Limits and next checkpoint

Full **Supabase Auth/JWT/PostgREST**, deployed HTTP authorization, packaged
native warm/cold links and OS window interaction remain unverified. The browser
export test flushes real IndexedDB and exercises the actual stored projection/
wire consumer; it does not exercise Tauri IPC or write the installed
%LOCALAPPDATA%/Facta/widgets.json. Native helper tests and cargo checks do not
establish packaged file watching, launching or UI behavior. No installed planner
data was touched. No SQL/security/concurrency suite was rerun because SQL did not
change; the previously approved 421/22 evidence remains historical, not a claim
derived from these baseline/browser tests. The owned test cluster is stopped
after verification.

**Stop for owner review before Step 6.**
