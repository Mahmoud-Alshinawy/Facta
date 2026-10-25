# Shared goals: Step 3 checkpoint

The owner approved Step 2 at **2e37a49** and authorized Step 3 only of the
5337807 plan. This checkpoint adds profile setup, creation, invitations and
explicit joining. Stop for review before Step 4. No migrations, native changes,
application dependencies or live Supabase changes are included.

## Implemented contract

- `SharedGoalsPage` replaces the Shared placeholder while preserving Mine.
  Profile setup requires a 3–24 character lowercase username and 1–80 character
  display name; handles remain immutable. Exact username invitations use the
  existing RPC, including `handle_taken`/rate-limit outcomes. There is no public
  directory or prefix search.
- `SharedGoalCreate` follows GoalsCreate's Template → Details → People → Review.
  Gym targets are 2–7. Custom supports every day, nonempty specific weekdays or
  1–7 times per week, shared by everyone. Round weekday defaults to the calendar
  preference; the group IANA zone is explicit. Back retains fields, fresh
  creation resets them, and local drafts use the existing account IndexedDB
  record. Server drafts are created before issuing real invitations.
- Review captures the displayed proposed first date and group revision.
  Publication sends that exact pair. A `confirmation_required` receipt updates
  the displayed date/details and requires another explicit confirmation with a
  new command UUID. It never silently publishes the new date. One-owner
  publication explains the waiting state and eligible-member boundary rule.
- `SharedPeople` issues, copies, rotates and revokes actual `facta://join/…`
  links, sends/revokes direct username invitations, and shows accepted members
  separately from pending/expired invitations and reserved capacity. The
  invitation list refreshes on mount, focus, reconnect and a one-minute timer.
- `SharedGoalJoin` shows only the authenticated limited preview: inviter, name,
  template/schedule, group zone/start and accepted count. Roster/other people's
  targets are unavailable before joining. Gym lets the caller choose a personal
  target; Custom has no override. Joining and direct-invite decline are explicit
  commands. Generic-link dismissal is local. Expired/revoked/full/unpublished
  outcomes explain why joining is unavailable; the server rechecks on redeem.
- Successful creation/join shows the real name and server-confirmed boundary.
  The minimal group/draft list permits resuming drafts and managing invitations.
  Scores, ranked overview/detail, check-in UI, history, target changes and leave
  controls remain Step 4; Today/widget integration remains later work.

## Routing, tokens and retry identity

`deepLinks.ts` strictly separates `facta://auth/callback`, `join/<token>`,
`group/<uuid>` and the existing allowlisted Notes/Diary/Goals `focus` routes.
Reject unknown/duplicate/incompatible query fields, foreign authorities, extra
paths/fragments, malformed IDs/tokens, whitespace/control characters and oversized
input. Auth accepts the existing access/refresh pair or a code on its exact route.
It does not treat a join URL containing auth-looking text as a callback.

`DeepLinkBridge` lives above the IndexedDB loading gate. Session-memory deferral
survives sign-in and storage opening; rendering a signed-out invitation shows no
group information and makes no preview/join request. Auth/store readiness opens
the preview, never joins. Changing accounts clears the previously bound route;
responses from disposed/changed shared engines cannot populate the new account.
Replacing an open invitation remounts its preview/target state and title focus.

Raw invitation tokens live only in session memory and transient link inputs.
They never enter drafts, the shared offline outbox, localStorage, URLs used for
browser testing, logs or widget exports. Clipboard copying is an explicit user
action. Native OS warm/cold delivery remains a separate unverified boundary.

`SharedRequests` is the caller-owned per-engine registry outside mounted forms.
It retains the checked UUID/body for online control operations until a definitive
response; uncertainty locks replacement edits and exposes **Retry same request**.
Retry after closing a form uses the original packet. A successful recovered
result can be consumed by the original form without sending another command.
Different fields cannot reuse an unresolved identity. Server product rejections
are definitive receipts; correcting fields/date uses a fresh UUID. Server
transaction rejection permits correction rather than pinning an invalid body.

Online control packets and tokens deliberately do not survive process loss.
Keep the session open to settle uncertain results; after a restart reopen/paste
the invitation and reconcile server drafts/groups. The durable check-in outbox
from Step 2 is unchanged. There is no silent offline creation/join/publication.

## Design and keyboard evidence

Read GoalsCreate.dc.html and the relevant pending/empty/header parts of
GoalsShared.dc.html locally, one file at a time. Used their cards, typography,
step indicator, slanted commit actions and keyboard hints with shared tokens and
bundled Geist fonts. Approved lifecycle/privacy rules supersede invented sample
links, immediate activation and pre-join sample rosters.

Real browser checks exercise Tab/Shift+Tab, visible focus, template arrows,
Enter progression, Escape cancellation, Back preservation, fresh resets, heading
focus after mounting, Details name focus and keyboard activation of both Gym and
Custom join buttons. New routes restore focus to the opener or mounted heading.
Shift+N creates only on the Shared home; Mine's N remains separate.

Captured template screenshots with fit assertions in all four themes at 1440,
1280 and 1100, plus default-theme review/join screenshots (14 total). Inspected
default 1440, the other themes at 1100 and the review/join surfaces visually.
The harness mounts the actual shared workspace without the app sidebar. This is
a Step 3 fit/focus check, not the final whole-app/hosted-board comparison or a
claim of exhaustive screenshot parity; that remains Step 6.

## Verification on Windows, 25 October 2026

Required checks passed: frozen pnpm install; npx offline TypeScript in desktop,
widgets and calendar; **422 desktop / 184 calendar Vitest tests**; desktop build
with `PORT=1420 BASE_PATH=/`; widgets build; `cargo check --offline` in both
native folders. The existing desktop main-chunk warning remains.

Disposable PostgreSQL **17.5**, fresh Chromium-based Edge **156.0.4314.42** and
native IndexedDB were used. The runners create/drop their own random databases
and block non-loopback browser requests; external request count was **zero**.
The owned disposable cluster was stopped after verification.

- Data integration: **94 assertions**, including actual reloads, storage failure
  recovery, immutable receipt retries, account isolation, round coverage,
  reconciliation, personal sync during shared outage and lifecycle replay.
- UI integration: **57 assertions** against actual React components, SDK adapter
  and migrated SQL RPCs: profile validation/taken handle/setup; Gym and all three
  Custom creation modes; invalid target/schedule rejection; real direct/link
  invitation issuance, explicit join/decline, rotation/copy/revocation; expired,
  revoked and eight-seat capacity failures; keyboard/mount focus; replacement
  invitation isolation; and lost create/publication replies. Sunday 18 October's
  proposed Monday 19 October publication attempted Wednesday 21 October remains
  unpublished until explicit confirmation of Monday 26 October; the successful
  publication receipt then replays with the same UUID/body.

The static UI test build avoids development-server reloads erasing intentional
session-memory state. An earlier development-server run was unsuitable for that
assertion and was replaced; final results above use the static build. Test
screenshots mask raw link/paste inputs and failure diagnostics redact tokens.

Reproduce with `node scripts/run-shared-client-tests.mjs <owned-local-pg-port>`
and the same command with `--ui`. Requires Python/psycopg, Playwright/Edge and a
disposable local PostgreSQL installation (runtime paths may be provided through
`FACTA_TEST_PYTHON`, `FACTA_PLAYWRIGHT_MODULE`, `FACTA_CHROMIUM_EXECUTABLE` and
`PYTHONPATH`). Reports/screenshots are under ignored `tmp/shared-goals-runtime/`.

**Limits:** the bridge supplies synthetic actor claims to real SQL roles/RPCs;
its sign-in transitions are not actual Supabase Auth. JWT signatures/refresh,
PostgREST behavior, deployed HTTP and packaged Tauri OAuth/warm/cold links remain
unverified. No installed planner or live Supabase was opened. The standalone
409-assertion SQL/security and 21-race suite was not rerun for this UI-only step;
its approved Step 1 evidence remains historical, not established by these runs.
