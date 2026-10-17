# Supabase

Facta uses Supabase for sign-in and for syncing goals and events. The app
works offline: everything is cached on the device and synced when there is a
connection.

## Setup

1. Copy `.env.example` to `.env` in the repo root and fill in
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
   Without them the app runs in "This device only" mode and nothing syncs.
2. In **Authentication → URL Configuration**, add `facta://auth/callback` to
   **Redirect URLs**. Email confirmation and magic links come back to the
   desktop app through this deep link.

## Applying the migration

Migrations live in `supabase/migrations/`. Each one is idempotent, so running
it twice does no harm. Read it before applying.

**SQL editor (simplest):** open **SQL Editor** in the dashboard, paste the
contents of `supabase/migrations/20261016120000_goals_events.sql`, and run it.

**Supabase CLI:**

```sh
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Afterwards:

- **Table Editor:** `goals` and `events` should show RLS as enabled.
- **Database → Publications:** neither table should be in
  `supabase_realtime`. Realtime isn't used yet.
- Regenerate the client types and compare them with the hand-written ones:

  ```sh
  supabase gen types typescript --project-id <your-project-ref> --schema public \
    > apps/desktop/src/lib/database.types.ts
  ```

  If the generated file differs (for example the `PostgrestVersion`), keep
  the generated one and run `pnpm -r typecheck`.

Apply the migration **before** shipping a build with Supabase configured.
If you don't, sync stays paused rather than losing anything: a missing table
or column (PostgREST `PGRST205`/`PGRST204`), a missing grant, or a server
error leaves every change queued on the device and retries, and the sidebar
shows "Sync error". Only a value the database refuses for a specific row
(SQLSTATE class 22 or 23, or a row-level security violation) parks that row
as failed.

## Testing the migration

`supabase/tests/sync_guard.sql` checks the migration on a throwaway Postgres
database. It stubs Supabase's `auth` schema and roles, applies the migration
twice to check it is idempotent, then asserts:

- the RLS, grant and ownership rules (another user can't read, insert,
  overwrite or delete; `anon` gets nothing; `user_id` and `created_at` are
  fixed)
- the sync-guard rules (newer wins, clamping, deletes always win and stick)

```sh
createdb facta_test
psql -v ON_ERROR_STOP=1 -d facta_test -f supabase/tests/sync_guard.sql
# prints: sync_guard: all checks passed
dropdb facta_test
```

It refuses to run against a database that already has an `auth` schema, so
it can't be pointed at the real project by mistake. The app's unit tests use
an in-memory copy of the same rules (`apps/desktop/src/test/fakeServer.ts`),
which doesn't model ownership; this script is what covers ownership.

## What the schema guarantees

- **Owner-only access.** Every policy is `to authenticated` and checks
  `(select auth.uid()) = user_id`. The `anon` role has no grants at all.
- **Newer wins.** `updated_at` is the time of the edit on the device. The
  `facta_sync_guard` trigger skips any update that isn't newer than the stored
  row. It also caps `updated_at` at the server's `now()`, so a device with a
  fast clock can't win every conflict.
- **Deletes are tombstones.** The app deletes by setting `deleted_at`. A
  delete always applies, even over a newer edit, and once `deleted_at` is set
  the row never changes again. An offline edit therefore can't bring a deleted
  record back.
- `created_at` and `user_id` can't be changed after insert.

## How the app syncs

The code is in `apps/desktop/src/lib/sync/`.

**Local cache and queue**

- The cache is in localStorage, at `planner_goals_<userId>` and
  `planner_events_<userId>`. It holds live records only, because the widgets
  read it directly.
- The write queue is at `facta_sync_queue_<userId>`, one per user and shared
  by both tables. It maps each record id to that record's latest full row.
  Every write is an idempotent upsert, and a delete is an upsert with
  `deleted_at` set.
- After a send, an entry is removed only if it still holds the row that was
  sent. An edit made while a request is in flight is therefore sent next time
  rather than lost.

**When the server keeps its own version**

If the server skips a write (an older edit, or the record is already
deleted), the app fetches that row and the server's version replaces the
local one.

**When it syncs**

- Writes flush shortly after each edit.
- A full pull, preceded by a flush, runs on start, on window focus, on
  reconnect and every 60 seconds.
- Failed network requests retry with backoff.
- Flushes and pulls never overlap.

**Rejected writes**

- A row the database refuses (a failed check constraint, say) is parked and
  reported in a toast.
- **Retry** sends it again.
- **Delete N items from this device** removes those items locally. If an item
  was never uploaded, it is gone for good. If an item exists on the server,
  the server's version comes back.
- Sync-wide failures (offline, migration missing, server down) never park
  anything. Everything stays queued and sync keeps retrying.

**When another device wins**

If a local edit loses to a newer version from another device, a short toast
says the item was changed or deleted elsewhere.

**Sync status**

The sidebar shows the current sync state. It only shows "Syncing…" for runs
that take longer than 300 ms, and never for the quick flush after an edit.

**Device-only fields**

`lastNotifiedDate`, the reminder bookkeeping, is never sent. It survives
pulls, and setting it doesn't count as an edit.

**First sign-in after upgrading**

Cached goals and events from before sync have no `updatedAt`. They're stamped
on load and queued, so they upload on the first sync. This works offline too.

## Known limitations

- **Repeating goals can lose a tick across devices.** `completed_dates` is
  one column, and the whole row follows "newer wins". If two devices tick off
  *different* days of the same repeating goal while both are offline, the
  later sync wins and the other tick is lost. The fix is a per-day
  completions table, which will come with the rivalry work, since scores need
  per-day data anyway.
- **Edit times come from device clocks.** The server caps them at its own
  time, but a device whose clock runs *behind* will lose conflicts it should
  win.
- **Never hard-DELETE rows.** If a row is removed with `DELETE` (in the
  dashboard's table editor, in SQL, or by a future tombstone purge), any
  device that still has the record in its cache sees a record the server
  doesn't know and uploads it again: the item reappears. To delete an item,
  set `deleted_at` instead.
- **Tombstones are kept forever** for now, because of the point above.
  A future purge job may only remove tombstones older than the longest time
  a device can stay offline and still sync. By then every device that will
  ever sync has seen the tombstone and dropped the record.

  A device that was away longer than that must not upload records the server
  doesn't know. That needs a "last synced" cut-off, which doesn't exist yet,
  so build it before any purge.
- **No realtime.** Other devices see changes on their next pull (focus,
  reconnect, or within 60 seconds).
