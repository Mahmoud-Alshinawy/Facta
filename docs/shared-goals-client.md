# Shared goals: Step 2 data client

Step 1 at **223a044** is approved. This checkpoint implements the approved
Step 2 contracts, deterministic helpers, durable commands and sync integration.
Shared screens, profile/wizard flows, routing and native/widget changes remain
later steps. The database contract remains [shared-goals-data.md](shared-goals-data.md);
no migration or database type changes are needed here.

## Public boundaries

| Boundary                                               | Contract                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types/sharedGoals.ts`, `lib/sharedGoals/contracts.ts` | Camel-case public rows and strict runtime codecs; finite typed immutable command envelopes. Actor identity is the session, never a payload field. No raw shared-row upserts.                                                                                  |
| `lib/sharedGoals/dates.ts`                             | Group-local dates, strictly future publication proposals, eligibility, date-slot round boundaries, local-midnight DST intervals and original-capture replay grace. These are presentation/preflight helpers; SQL remains the lifecycle and scoring authority. |
| `lib/sharedGoals/cache.ts`                             | Complete identity-list replacement and bounded history-page reconciliation.                                                                                                                                                                                   |
| `lib/sync/shared/{state,outbox}.ts`                    | Versioned account record and desired-state check-in transitions.                                                                                                                                                                                              |
| `lib/sync/shared/remote.ts`                            | Supabase SDK RPC adapter bound to one account; snapshot, command, preview and pending-invitation reads.                                                                                                                                                       |
| `lib/sync/shared/engine.ts`                            | `SharedSync`: load/start/dispose, stable subscriptions, sync, local drafts, durable check-ins and explicit failure review.                                                                                                                                    |
| `hooks/useSharedGoals.ts`, `hooks/useSync.tsx`         | Auth-scoped data/status access and independent lifecycle. No shared page or route.                                                                                                                                                                            |
| `lib/sharedGoals/projection.ts`                        | Bounded server-value handoff for later Today/Progress integration. Actual widgets.json export and native consumption remain Step 5.                                                                                                                           |

## Persistence and immutable retry identity

The existing account-scoped `IndexedDbStore` now allows `planner_shared_<uid>`.
Its database/version/object store and six existing keys stay unchanged. Opening
an already migrated planner hydrates the new key without replacing personal
caches, personal queue or widget receipts. The existing first-run legacy import
and flush/quit barriers still apply. No shared values move into localStorage.

One atomic shared record contains version/user ID, confirmed snapshot and page
coverage, `needsRefresh`, local wizard drafts, check-in intents and bounded
minimal receipts. Combining these in one IndexedDB transaction prevents an
acknowledgement from becoming durable without removal of its matching intent.
Keep the original record if parsing/account validation fails; do not substitute
an empty successful cache. Corruption disables shared edits/sync and exposes a
recoverable shared storage error, while personal collections remain usable.

Only check-ins are queued offline. Each retains the original actor/account,
group, membership epoch, group-local date, captured instant, desired boolean,
base revision and UUID. Never enqueue a toggle or rebind an old day to today.
Only an unprepared intent for the same natural key can coalesce, with a new UUID.
Before the first HTTP request, materialize the complete command body and flush
its attempted state. Once prepared, UUID/body remain identical across timeouts,
focus/online retries, day changes, account reopen and process loss.

A newer edit during a request waits as a separate intent. Its command is not
prepared until its predecessor has a durable successful receipt; only that own
receipt may advance its base revision. Pulling another device's revision never
silently rebases an already queued intent. Conflicts and product rejections
remain failed intents with their original body and a negative receipt. Explicit
retry refreshes first, validates original capture/date/epoch and allocates a new
UUID. Discarding a predecessor parks dependent intents for review. If dependents
exist, resolve them before explicitly retrying the predecessor.

Local changes publish to subscribers only after `store.flush()` succeeds.
Failed IndexedDB batches retain their candidate in memory and expose a persistent
storage error; `retrySaving()` flushes and publishes it. The caller sees a rejected
promise, never a false “saved” result. If acknowledgement persistence fails and
the process dies, disk still contains the attempted command. Replaying its server
receipt safely completes the same atomic acknowledgement. Quitting uses the
existing registered store flush barrier; there is no parallel storage path.

Receipts keep the latest 256 plus any still needed by an intent dependency.
They contain minimal check-in outcomes only, never invite tokens. Failed intents
are retained until explicit review/discard. There is no receipt cleanup on the
server in this checkpoint.

## Remote and lifecycle rules

The adapter verifies the current SDK session belongs to its bound account and
pins that session's bearer token on the RPC builder. An asynchronous SDK account
switch must not send A's packet as B. Requests and session resolution share a
20-second deadline and caller cancellation. Responses are decoded before cache
mutation; errors use static messages and do not expose URLs, tokens or raw
server diagnostics. Missing shared functions/tables/permissions have a separate
unavailable status and retain local work.

Each sync first flushes local work and reads a complete authorized snapshot.
Only then does it prepare/replay pending intents. A malformed or failed read
retains the last valid cache. Matching committed packets can still replay for
minimal receipts after leave/archival, even when the refreshed snapshot contains
no accessible group. Genuinely unprepared revoked/archived work is parked locally.
Other lifecycle/cutoff/schedule/revision decisions remain real SQL outcomes:
pre-pause captures can settle within grace, pause-gap captures cannot become
valid just because a group resumes, and archival never reopens writes.

Successful commands mark `needsRefresh` durably until a valid follow-up snapshot.
The UI must show pending/failed work and last-confirmed time, retaining SQL
scores/ranks until refreshed. No local adherence/rank recomputation. Rest days,
inactive gaps and absent history never become invented zero-score rounds.

Current groups/profiles/membership epochs/targets/invitations are complete lists;
absence on a successful validated snapshot removes inaccessible data. Check-ins,
rounds and scores replace only the requested inclusive date interval. Older
history survives only for accessible groups whose invalidation revision is
unchanged. A changed group invalidates its older pages. Coverage windows retain
their own confirmation times/revisions; they are not all labelled freshly read.
Default range: UTC today minus 56 dates through today plus 7; explicit pages are
limited to 366 date offsets, matching the SQL RPC. Clock changes do not produce
new scores; request a fresh range/snapshot.

A confirmed online leave also purges its group/history/profile-only data before
returning, without waiting for the subsequent snapshot or advancing surviving
data's confirmation times. Attempted packets remain available for receipt replay;
genuinely unsent work is retained for review on the next sync.

Creation/publication, profile setup, invitations, target/owner/leave/archive
operations require online confirmation. `makeCommand` creates an immutable
packet; `executeOnline` serializes it, flushes first and requests a refresh after
success. These control commands are **not** an automatically replayed offline
queue. Their caller must retain/reuse the same packet after an uncertain reply,
and must not silently allocate a replacement UUID. Local wizard drafts contain
allowlisted configuration fields only. Invite tokens and token-bearing join
packets remain in caller memory; no general command-body logging or persistence.
An issuance retry can return its original invite ID without its one-time token;
the later wizard must offer explicit rotation rather than inventing a new issue.

`SyncProvider` creates shared sync after personal sync is available. Shared
initialization, network work, queues, retry backoff and status are independent
from `PlannerSync`. Focus/online events and the existing 60-second cadence wake
shared sync. Disposal aborts requests/listeners/timers; every async continuation
checks the active account before publishing or writing. A new account gets a
separate key/store scope. Saved drafts/intents survive sign-out for their owner,
but old-account snapshots/status become immediately unavailable to consumers.

## Status/export handoff

`useSharedGoals()` exposes only the current account's engine, durable state and
status. Shared storage errors offer Retry saving through the existing toast
pattern. Missing shared deployment does not gate Goals Mine, Notes, Diary or
their synchronization.

`projectSharedProgress` selects an explicit accessible group or a deterministic
active-first/default group. An invalid explicit selection clears instead of
silently switching to another group. It returns at most top three server-ranked
rows plus self, with server threshold/average values, dates, pending/stale and
archive flags. No invitations, tokens, drafts, profile directory or raw history.
Missing rounds yield no leaderboard; account mismatch yields null. Confirmation
older than two minutes, an expired active interval or `needsRefresh` marks the
projection stale. Consumers must flush and recheck account identity before a
later export. Shared durable writes already request the existing export bus;
native payload/schema wiring and persisted group selection remain Step 5.

## Evidence and limits

The reproducible browser harness is `scripts/run-shared-client-tests.mjs` with
`scripts/shared-client-fixture.py` and the test-only `src/test/sharedIntegration.ts`.
It creates/drops a random database on an explicitly supplied **loopback** PG port,
applies the actual migrations and uses real authenticated SQL roles/functions.
It runs the real Supabase JS SDK against a small local HTTP-to-SQL bridge and
native IndexedDB in a fresh Playwright Chromium profile. It never reads app env
files, Supabase keys or a remote DSN. Non-loopback browser requests are blocked.
Production imports do not include the browser test entry; no dependency added.

Configure a Python with psycopg, Playwright and its Chromium installation (or
`FACTA_CHROMIUM_EXECUTABLE` for a disposable installed Edge profile), then run:

```powershell
# Optional absolute executable/module paths for an existing tool runtime:
# FACTA_TEST_PYTHON, FACTA_PLAYWRIGHT_MODULE, FACTA_CHROMIUM_EXECUTABLE
# PYTHONPATH may point to an existing psycopg installation.
node scripts/run-shared-client-tests.mjs 55439
```

The report goes to ignored `tmp/shared-goals-runtime/client-result.json`.
It records assertion counts, browser version and scenario names, not secrets.
Quota/open failures are deliberate faults at the native IndexedDB boundary:
they test actual transaction rollback/recovery, **not physical disk exhaustion**.
Two page reloads include loss of an unflushed acknowledgement candidate. Local
SQL clock fixtures are confined to the disposable database.

**Verification limitation:** the bridge supplies synthetic identity claims;
it does not implement Supabase Auth, validate JWT signatures/refresh sessions or
implement PostgREST. These tests establish browser persistence, the SDK adapter's
loopback request/response behavior and actual SQL/role integration. They do not
establish deployed Supabase Auth/HTTP security. That local Supabase end-to-end
gate remains explicit before UI acceptance. No live Supabase access is permitted.

Checkpoint results and required workspace checks are recorded in HANDOFF.md.
Stop for owner review before Step 3.
