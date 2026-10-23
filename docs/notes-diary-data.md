# Notes and diary: data and storage (branch 2, step 1)

This step contains no Notes/Diary pages, editor dependency, widget types or
multi-day event UI. Those remain steps 2–5. Notes/Diary stay hidden in the shell.

## Schema and owner review

Apply `20261022140000_notes_diary.sql` only after the goals/events migration.
No tool in this task connects to a Supabase project or applies a migration.
`supabase/tests/notes_diary.sql` is a self-contained Supabase SQL-editor script:
use a **fresh scratch project with no planner tables**, run the entire file,
and expect `notes_diary: all checks passed`. It embeds the prerequisites, the
new migration and a rerun; rolls back its schema, temporary helpers, fixtures
and fixture auth users. It refuses existing planner tables rather than dropping
or modifying them. It needs the SQL editor's normal postgres role.

Notes retain restorable `trashed_at` as an ordinary synced edit. Permanent
deletion alone sets `deleted_at`, using the unchanged sticky-delete guard.
Titles are nullable, at most 500 characters; blank client titles become null.
Tags allow at most 20 strings of 1–50 Unicode characters. Bodies must be arrays,
with both the jsonb storage size and its UTF-8 text representation <=204800
bytes. A conservative client byte check includes JSON formatting overhead.
Colour a/b/c/d and alignment values follow the brief. Font remains nullable
text; the later picker will offer locally bundled Geist, Geist Mono and Source
Serif 4 (Latin subset). No font/editor packages have been added in this step.

The event mapper now carries inclusive `end_date`; null maps to absent
`endDate`. Dialog, recurrence/span selection and calendar rendering follow in
step 4. The server constraint rejects end dates before the starting date.

## Canonical note body

The JSON value is an array of blocks, **not** an editor document wrapper:

```json
[
  {
    "id": "stable-block-id",
    "type": "paragraph",
    "content": [
      { "type": "text", "text": "Read ", "marks": [{ "type": "bold" }] },
      { "type": "noteLink", "noteId": "aaaaaaaa-0000-4000-8000-000000000001", "label": "Reference" }
    ]
  }
]
```

Block types: paragraph, heading (level 1–3), checklist (checked boolean), bullet,
quote, code (optional language, plain-text content) and divider (empty content).
Inline marks: bold, italic, token colour a/b/c/d and safe HTTP/HTTPS/mailto links
(needed for the design's Ctrl+K link command). Note references are typed UUID
nodes; arbitrary `[[text]]` and code are not treated as stored references.
`links` is always recalculated from the body on save; backlinks are computed
from non-trashed notes. Word count uses Unicode word segmentation over the
title and plain body text. Editor adapters and Markdown/TXT exporters follow
in step 2; ZIP/PDF remain deferred. Only MIT core/extensions will be used.

## IndexedDB durability and migration

All four collection caches and their shared pending/failed queue now live in
the `facta-planner` IndexedDB database, `kv` object store, keyed by user ID.
Auth tokens, preferences and widget configuration stay in localStorage.
The engine mounts only after hydration and the first durability barrier.

`KeyValueStore` keeps a synchronous, hydrated read view for existing React
consumers; `flush()` is its asynchronous durability barrier. Cache and queue
mutations made together are coalesced into one transaction with strict
durability. Remote work waits for storage before sending and again before
reporting completion. Edits remain optimistic until that transaction completes.

Desktop Quit emits a webview request before exiting. A listener installed before
React mounts awaits every open store's `flush()`, including stores closing after
an account change, with a two-second limit. Native `ExitRequested` routes other
explicit exits through the same handshake; closing the window still hides it.
A 2.2-second native fallback bounds an unresponsive webview. Storage failure or
timeout is logged before exiting, so this remains a best-effort bounded flush.
The widgets companion has no IndexedDB store; its exits save positions natively.

On first open for each account, old cache/queue bytes and the migration marker
are committed together. Only then are unchanged legacy values removed.
Other accounts, settings and auth keys are untouched. An aborted migration
retains the original legacy keys. Existing IndexedDB data always wins over
stale legacy copies; later launches no longer depend on localStorage access.

Failed write batches are retained in memory for retry; newer edits supersede
failed snapshots without discarding the whole batch. A persistent storage
error toast and sidebar status explain that recent edits may only be in memory
and offer retry. Sync success cannot clear a storage failure without a
successful durability barrier. Corrupt saved JSON blocks initialization and is
retained, rather than silently starting an empty queue. An initialization
failure shows a visible retry screen. Disk persistence/OS eviction guarantees
remain those of the browser/WebView's IndexedDB implementation.

Widget export reads the hydrated store after its durability barrier, with
account checks. It no longer reads moved goals/events from localStorage.
The native action poller waits for a signed-in consumer's readiness lease, so
it does not drain queued toggles while IndexedDB opens. Releasing an old lease
cannot pause a newer consumer. Live native handoff testing is still an owner
check; the native code is compile-checked here.
Notes/Diary widget exports are not enabled until step 5: export only pinned
notes plus the four most recent non-trashed notes, title/plain preview rather
than blocks, and only today's diary line plus On this day lines. Widget edits
must fetch the full note in the desktop; a preview must never replace its body.

## Same-date diary reconciliation

The partial unique index allows one live row per `(user_id,date)`. An entry's
date is immutable through the client/RPC. `facta_write_diary(jsonb)` runs as
the caller with RLS active and takes a transaction advisory lock per owner/day.
An atomic `ON CONFLICT ... WHERE deleted_at IS NULL` upsert keeps the canonical
ID and created_at. The newer server-clamped updated_at wins one_line, mood,
body and tags **together**; ties keep the stored snapshot. It returns the
canonical row even when the sync guard skips a stale/tied update.

Deletes apply to the same occurrence even if submitted under an offline UUID.
Known UUID tombstones never revive. An unacknowledged alias with an edit no
newer than the latest day tombstone returns that tombstone. A newly created
UUID with a strictly newer edit may recreate the day; old UUID/deletion replays
must not overwrite that replacement. Delete timestamps are clamped too.

The client adopts returned UUIDs, rekeys cache and queue together, and retains
newer edits/deletes made while a request is in flight. Pull also reconciles
same-date aliases before the ordinary ID merge. Account changes invalidate
late responses. New diary entries default to mood 3; line-only updates preserve
existing mood, body and tags. No streak/count aggregates are persisted.

## Verification boundaries

Vitest exercises the actual storage/migration, mappers, validation, merge and
collection code. `fake-indexeddb` is test-only and implements the IndexedDB API
in Node; it is absent from production chunks. Closed connections and aborted
transactions test failure handling; they do not claim to simulate actual disk
exhaustion. The quota-specific error message is checked separately.

The SQL file must still be run by the owner on scratch Supabase. Local SQL
execution is not claimed. Browser IndexedDB checks do not establish native
WebView persistence across an OS crash. Notes chunk before TipTap: absent;
record the lazy-loaded Notes chunk and main-bundle delta when step 2 adds it.
