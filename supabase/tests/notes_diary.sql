-- Run this ENTIRE file in the Supabase SQL editor on a FRESH SCRATCH project.
-- Self-contained: prerequisites + proposed migration + assertions + rerun.
-- It refuses projects with ANY existing planner tables. No psql commands,
-- external includes, role creation, project credentials or live data access.
-- All DDL and fixture users/rows roll back at the end. On an assertion error
-- the transaction aborts; issue ROLLBACK before retrying in that editor tab.
begin;
do $$ begin
  if to_regclass('public.goals') is not null or to_regclass('public.events') is not null
    or to_regclass('public.notes') is not null or to_regclass('public.diary_entries') is not null then
    raise exception 'Refusing to test: use a fresh scratch project with no planner tables';
  end if;
  if to_regprocedure('auth.uid()') is null or to_regclass('auth.users') is null then
    raise exception 'This test requires a scratch Supabase project';
  end if;
end $$;

-- BEGIN embedded base migration (outer transaction removed)
-- Facta: goals and events, owned per user.
--
-- Idempotent: safe to run more than once. Review before applying; see
-- docs/supabase.md.
--
-- Sync rules enforced here (the client relies on them):
--   * updated_at is the client's edit time, clamped so it is never in the future.
--   * An update that is not newer than the stored row is skipped (newer wins).
--   * A delete is an update that sets deleted_at. It always applies, and once
--     deleted_at is set the row never changes again (sticky deletes).
-- A skipped write returns no row, which the client uses to detect a conflict.
--
-- Runs in one transaction: it applies completely or not at all.


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.goals (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title                 text not null,
  category              text not null,
  date                  date not null,
  time                  time,
  completed             boolean not null default false,
  completed_dates       date[] not null default '{}',
  repeat                text not null default 'none',
  repeat_days           smallint[] not null default '{}',
  notifications_enabled boolean not null default false,
  notification_message  text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint goals_category_check
    check (category in ('must-do', 'should-do', 'nice-to-have')),
  constraint goals_repeat_check
    check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'custom')),
  constraint goals_repeat_days_check
    check (repeat_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint goals_title_check
    check (char_length(title) between 1 and 500)
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  color       text not null default 'blue',
  description text,
  all_day     boolean not null default false,
  repeat      text not null default 'none',
  repeat_days smallint[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint events_color_check
    check (color in ('blue', 'red', 'green', 'orange', 'purple', 'pink')),
  constraint events_repeat_check
    check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'custom')),
  constraint events_repeat_days_check
    check (repeat_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint events_title_check
    check (char_length(title) between 1 and 500)
);

-- "if not exists" keeps any table already there. Refuse to go on if that is
-- an old Task Battles table (text dates, no updated_at/deleted_at) rather than
-- quietly building on it.
do $$
declare
  missing text;
begin
  select string_agg(format('%s.%s', t, c), ', ') into missing
  from (values
    ('goals', 'updated_at'), ('goals', 'deleted_at'),
    ('events', 'updated_at'), ('events', 'deleted_at')
  ) as want(t, c)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = want.t and column_name = want.c
  );
  if missing is not null then
    raise exception 'Old goals/events table found (missing %). Run 20261016110000_drop_task_battles.sql first.', missing;
  end if;
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'goals' and column_name = 'date') <> 'date' then
    raise exception 'public.goals.date is not a date column. Run 20261016110000_drop_task_battles.sql first.';
  end if;
end;
$$;

create index if not exists goals_user_id_idx  on public.goals  (user_id);
create index if not exists events_user_id_idx on public.events (user_id);

-- ---------------------------------------------------------------------------
-- Sync guard trigger (shared by both tables)
-- ---------------------------------------------------------------------------

create or replace function public.facta_sync_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Edit time comes from the client; never let it be in the future, or a
  -- device with a fast clock would win every conflict.
  if new.updated_at is null or new.updated_at > now() then
    new.updated_at := now();
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;

  -- Sticky deletes: a tombstone never changes again.
  if old.deleted_at is not null then
    return null;
  end if;

  new.created_at := old.created_at;
  new.user_id := old.user_id;

  -- A delete always applies, even against a newer edit.
  if new.deleted_at is not null then
    new.updated_at := greatest(new.updated_at, old.updated_at);
    return new;
  end if;

  -- Newer wins: skip writes that are not newer than the stored row.
  if new.updated_at <= old.updated_at then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists goals_sync_guard on public.goals;
create trigger goals_sync_guard
  before insert or update on public.goals
  for each row execute function public.facta_sync_guard();

drop trigger if exists events_sync_guard on public.events;
create trigger events_sync_guard
  before insert or update on public.events
  for each row execute function public.facta_sync_guard();

-- ---------------------------------------------------------------------------
-- Access: authenticated owners only, nothing for anon
-- ---------------------------------------------------------------------------

alter table public.goals  enable row level security;
alter table public.events enable row level security;

revoke all on table public.goals  from anon;
revoke all on table public.events from anon;
grant select, insert, update, delete on table public.goals  to authenticated;
grant select, insert, update, delete on table public.events to authenticated;

revoke all on function public.facta_sync_guard() from public, anon, authenticated;

drop policy if exists goals_select_own on public.goals;
drop policy if exists goals_insert_own on public.goals;
drop policy if exists goals_update_own on public.goals;
drop policy if exists goals_delete_own on public.goals;

create policy goals_select_own on public.goals
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy goals_insert_own on public.goals
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy goals_update_own on public.goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy goals_delete_own on public.goals
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists events_select_own on public.events;
drop policy if exists events_insert_own on public.events;
drop policy if exists events_update_own on public.events;
drop policy if exists events_delete_own on public.events;

create policy events_select_own on public.events
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy events_insert_own on public.events
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy events_update_own on public.events
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy events_delete_own on public.events
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- No realtime yet: make sure neither table is published.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'goals'
  ) then
    alter publication supabase_realtime drop table public.goals;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime drop table public.events;
  end if;
end;
$$;


-- END embedded base migration
-- BEGIN embedded branch migration
-- Facta branch 2. Re-runnable; apply AFTER 20261016120000_goals_events.sql.
-- Owner applies this migration. Never run it against production from tooling.

do $$ begin
  if to_regprocedure('public.facta_sync_guard()') is null or to_regclass('public.events') is null then
    raise exception 'Apply the goals_events migration before notes_diary';
  end if;
end $$;

create or replace function public.facta_tags_valid(value text[])
returns boolean language sql immutable set search_path = '' as $$
  select value is not null and cardinality(value) <= 20
    and not exists (select 1 from unnest(value) tag where tag is null or char_length(tag) not between 1 and 50);
$$;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  body jsonb not null default '[]',
  color text,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  pinned_to_widget boolean not null default false,
  font text,
  align text,
  links uuid[] not null default '{}',
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint notes_title_check check (title is null or char_length(title) <= 500),
  constraint notes_body_check check (jsonb_typeof(body) = 'array' and pg_column_size(body) <= 204800 and octet_length(body::text) <= 204800),
  constraint notes_color_check check (color in ('a','b','c','d')),
  constraint notes_align_check check (align in ('left','center','right','justify')),
  constraint notes_tags_check check (public.facta_tags_valid(tags))
);

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  one_line text not null,
  mood smallint not null,
  body text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint diary_line_check check (char_length(one_line) between 1 and 120),
  constraint diary_mood_check check (mood between 1 and 5),
  constraint diary_tags_check check (public.facta_tags_valid(tags))
);

alter table public.events add column if not exists end_date date;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_end_date_check') then
    alter table public.events add constraint events_end_date_check check (end_date >= date);
  end if;
end $$;

create index if not exists notes_user_id_idx on public.notes(user_id);
create index if not exists notes_user_updated_idx on public.notes(user_id, updated_at desc) where deleted_at is null;
create index if not exists diary_entries_user_id_idx on public.diary_entries(user_id);
create unique index if not exists diary_entries_live_date_idx on public.diary_entries(user_id, date) where deleted_at is null;
create index if not exists diary_entries_user_date_idx on public.diary_entries(user_id, date desc);

drop trigger if exists notes_sync_guard on public.notes;
create trigger notes_sync_guard before insert or update on public.notes
  for each row execute function public.facta_sync_guard();
drop trigger if exists diary_entries_sync_guard on public.diary_entries;
create trigger diary_entries_sync_guard before insert or update on public.diary_entries
  for each row execute function public.facta_sync_guard();

alter table public.notes enable row level security;
alter table public.diary_entries enable row level security;
revoke all on table public.notes, public.diary_entries from anon;
grant select, insert, update, delete on table public.notes, public.diary_entries to authenticated;
revoke all on function public.facta_tags_valid(text[]) from public, anon;
grant execute on function public.facta_tags_valid(text[]) to authenticated;

drop policy if exists notes_select_own on public.notes;
create policy notes_select_own on public.notes for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own on public.notes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists notes_update_own on public.notes;
create policy notes_update_own on public.notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists notes_delete_own on public.notes;
create policy notes_delete_own on public.notes for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists diary_entries_select_own on public.diary_entries;
create policy diary_entries_select_own on public.diary_entries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists diary_entries_insert_own on public.diary_entries;
create policy diary_entries_insert_own on public.diary_entries for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists diary_entries_update_own on public.diary_entries;
create policy diary_entries_update_own on public.diary_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists diary_entries_delete_own on public.diary_entries;
create policy diary_entries_delete_own on public.diary_entries for delete to authenticated using ((select auth.uid()) = user_id);

-- UUID upserts alone cannot reconcile two devices creating the same day.
-- This invoker function keeps RLS active and serializes operations per owner
-- and date (including deletes). The partial unique index is the final guard.
-- Returns a canonical row even when the sync guard skips an older/tied write.
create or replace function public.facta_write_diary(entry jsonb)
returns setof public.diary_entries
language plpgsql security invoker set search_path = '' as $$
declare
  incoming public.diary_entries;
  existing public.diary_entries;
  canonical public.diary_entries;
  last_delete public.diary_entries;
begin
  incoming := jsonb_populate_record(null::public.diary_entries, entry);
  if auth.uid() is null or incoming.user_id is distinct from auth.uid() then
    raise exception 'Diary entry must belong to the signed-in user' using errcode = '42501';
  end if;
  if incoming.id is null or incoming.date is null then
    raise exception 'Diary id and date are required' using errcode = '23502';
  end if;
  incoming.updated_at := least(coalesce(incoming.updated_at, now()), now());
  incoming.deleted_at := least(incoming.deleted_at, now());
  -- PostgreSQL LEAST ignores NULL; preserve the absence of a delete.
  if entry->>'deleted_at' is null then incoming.deleted_at := null; end if;
  incoming.tags := coalesce(incoming.tags, '{}');
  perform pg_advisory_xact_lock(hashtextextended(incoming.user_id::text || ':' || incoming.date::text, 0));

  select * into existing from public.diary_entries where id = incoming.id;
  if found then
    -- The calendar day is the identity of an entry, not an editable field.
    if existing.date <> incoming.date then
      raise exception 'Diary date cannot change' using errcode = '23514';
    end if;
    if existing.deleted_at is not null then
      return next existing; return;
    end if;
  end if;

  select * into canonical from public.diary_entries
    where user_id = incoming.user_id and date = incoming.date and deleted_at is null;
  select * into last_delete from public.diary_entries
    where user_id = incoming.user_id and date = incoming.date and deleted_at is not null
    order by greatest(updated_at, deleted_at) desc, id limit 1;

  if incoming.deleted_at is not null then
    -- A queued delete from a duplicate offline UUID also deletes the canonical
    -- occurrence, but never a replacement created after this delete action.
    if canonical.id is not null and (canonical.id = incoming.id or last_delete.id is null
      or incoming.updated_at > greatest(last_delete.updated_at, last_delete.deleted_at)) then
      update public.diary_entries set deleted_at = incoming.deleted_at, updated_at = incoming.updated_at
        where id = canonical.id returning * into canonical;
      return next canonical; return;
    end if;
    incoming.created_at := now();
    insert into public.diary_entries select (incoming).* returning * into existing;
    return next existing; return;
  end if;

  if canonical.id is null then
    -- A lost response must not let an old, unacknowledged duplicate UUID
    -- resurrect the day after a delete. An explicitly newer entry may recreate it.
    if last_delete.id is not null and incoming.updated_at <= greatest(last_delete.updated_at, last_delete.deleted_at) then
      return next last_delete; return;
    end if;
  end if;

  incoming.created_at := now();
  insert into public.diary_entries select (incoming).*
  on conflict (user_id, date) where deleted_at is null do update set
    one_line = excluded.one_line, mood = excluded.mood, body = excluded.body,
    tags = excluded.tags, updated_at = excluded.updated_at;
  -- A tied/stale update can be skipped by facta_sync_guard; always return
  -- the stored winner so clients can settle and remap their submitted UUID.
  return query select * from public.diary_entries
    where user_id = incoming.user_id and date = incoming.date and deleted_at is null;
end $$;
revoke all on function public.facta_write_diary(jsonb) from public, anon;
grant execute on function public.facta_write_diary(jsonb) to authenticated;

-- Match the base migration: no realtime publication for these collections.
do $$ declare t text; begin
  foreach t in array array['notes','diary_entries'] loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- END embedded branch migration

-- Test helpers are session-local and disappear with the rollback.
create function pg_temp.check_it(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', message; end if; end $$;
create function pg_temp.expect_error(command text, expected_state text) returns void language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Expected %, received %: %', expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: expected SQLSTATE % for %', expected_state, command;
end $$;
create function pg_temp.diary_payload(entry_id uuid, day date, line text, feeling smallint, edited timestamptz,
  deleted timestamptz default null, detail text default null, labels text[] default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('id', entry_id, 'user_id', auth.uid(), 'date', day, 'one_line', line,
    'mood', feeling, 'body', detail, 'tags', to_jsonb(labels), 'updated_at', edited, 'deleted_at', deleted);
$$;

insert into auth.users(id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'facta-scratch-a@example.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'facta-scratch-b@example.invalid');
insert into public.notes(id,user_id,title,updated_at) values
  ('aaaaaaaa-1111-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Owner A',now()-interval '1 day'),
  ('bbbbbbbb-1111-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','Owner B',now()-interval '1 day');
-- BEGIN embedded migration rerun: must preserve the fixture rows
-- Facta branch 2. Re-runnable; apply AFTER 20261016120000_goals_events.sql.
-- Owner applies this migration. Never run it against production from tooling.

do $$ begin
  if to_regprocedure('public.facta_sync_guard()') is null or to_regclass('public.events') is null then
    raise exception 'Apply the goals_events migration before notes_diary';
  end if;
end $$;

create or replace function public.facta_tags_valid(value text[])
returns boolean language sql immutable set search_path = '' as $$
  select value is not null and cardinality(value) <= 20
    and not exists (select 1 from unnest(value) tag where tag is null or char_length(tag) not between 1 and 50);
$$;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  body jsonb not null default '[]',
  color text,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  pinned_to_widget boolean not null default false,
  font text,
  align text,
  links uuid[] not null default '{}',
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint notes_title_check check (title is null or char_length(title) <= 500),
  constraint notes_body_check check (jsonb_typeof(body) = 'array' and pg_column_size(body) <= 204800 and octet_length(body::text) <= 204800),
  constraint notes_color_check check (color in ('a','b','c','d')),
  constraint notes_align_check check (align in ('left','center','right','justify')),
  constraint notes_tags_check check (public.facta_tags_valid(tags))
);

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  one_line text not null,
  mood smallint not null,
  body text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint diary_line_check check (char_length(one_line) between 1 and 120),
  constraint diary_mood_check check (mood between 1 and 5),
  constraint diary_tags_check check (public.facta_tags_valid(tags))
);

alter table public.events add column if not exists end_date date;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_end_date_check') then
    alter table public.events add constraint events_end_date_check check (end_date >= date);
  end if;
end $$;

create index if not exists notes_user_id_idx on public.notes(user_id);
create index if not exists notes_user_updated_idx on public.notes(user_id, updated_at desc) where deleted_at is null;
create index if not exists diary_entries_user_id_idx on public.diary_entries(user_id);
create unique index if not exists diary_entries_live_date_idx on public.diary_entries(user_id, date) where deleted_at is null;
create index if not exists diary_entries_user_date_idx on public.diary_entries(user_id, date desc);

drop trigger if exists notes_sync_guard on public.notes;
create trigger notes_sync_guard before insert or update on public.notes
  for each row execute function public.facta_sync_guard();
drop trigger if exists diary_entries_sync_guard on public.diary_entries;
create trigger diary_entries_sync_guard before insert or update on public.diary_entries
  for each row execute function public.facta_sync_guard();

alter table public.notes enable row level security;
alter table public.diary_entries enable row level security;
revoke all on table public.notes, public.diary_entries from anon;
grant select, insert, update, delete on table public.notes, public.diary_entries to authenticated;
revoke all on function public.facta_tags_valid(text[]) from public, anon;
grant execute on function public.facta_tags_valid(text[]) to authenticated;

drop policy if exists notes_select_own on public.notes;
create policy notes_select_own on public.notes for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own on public.notes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists notes_update_own on public.notes;
create policy notes_update_own on public.notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists notes_delete_own on public.notes;
create policy notes_delete_own on public.notes for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists diary_entries_select_own on public.diary_entries;
create policy diary_entries_select_own on public.diary_entries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists diary_entries_insert_own on public.diary_entries;
create policy diary_entries_insert_own on public.diary_entries for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists diary_entries_update_own on public.diary_entries;
create policy diary_entries_update_own on public.diary_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists diary_entries_delete_own on public.diary_entries;
create policy diary_entries_delete_own on public.diary_entries for delete to authenticated using ((select auth.uid()) = user_id);

-- UUID upserts alone cannot reconcile two devices creating the same day.
-- This invoker function keeps RLS active and serializes operations per owner
-- and date (including deletes). The partial unique index is the final guard.
-- Returns a canonical row even when the sync guard skips an older/tied write.
create or replace function public.facta_write_diary(entry jsonb)
returns setof public.diary_entries
language plpgsql security invoker set search_path = '' as $$
declare
  incoming public.diary_entries;
  existing public.diary_entries;
  canonical public.diary_entries;
  last_delete public.diary_entries;
begin
  incoming := jsonb_populate_record(null::public.diary_entries, entry);
  if auth.uid() is null or incoming.user_id is distinct from auth.uid() then
    raise exception 'Diary entry must belong to the signed-in user' using errcode = '42501';
  end if;
  if incoming.id is null or incoming.date is null then
    raise exception 'Diary id and date are required' using errcode = '23502';
  end if;
  incoming.updated_at := least(coalesce(incoming.updated_at, now()), now());
  incoming.deleted_at := least(incoming.deleted_at, now());
  -- PostgreSQL LEAST ignores NULL; preserve the absence of a delete.
  if entry->>'deleted_at' is null then incoming.deleted_at := null; end if;
  incoming.tags := coalesce(incoming.tags, '{}');
  perform pg_advisory_xact_lock(hashtextextended(incoming.user_id::text || ':' || incoming.date::text, 0));

  select * into existing from public.diary_entries where id = incoming.id;
  if found then
    -- The calendar day is the identity of an entry, not an editable field.
    if existing.date <> incoming.date then
      raise exception 'Diary date cannot change' using errcode = '23514';
    end if;
    if existing.deleted_at is not null then
      return next existing; return;
    end if;
  end if;

  select * into canonical from public.diary_entries
    where user_id = incoming.user_id and date = incoming.date and deleted_at is null;
  select * into last_delete from public.diary_entries
    where user_id = incoming.user_id and date = incoming.date and deleted_at is not null
    order by greatest(updated_at, deleted_at) desc, id limit 1;

  if incoming.deleted_at is not null then
    -- A queued delete from a duplicate offline UUID also deletes the canonical
    -- occurrence, but never a replacement created after this delete action.
    if canonical.id is not null and (canonical.id = incoming.id or last_delete.id is null
      or incoming.updated_at > greatest(last_delete.updated_at, last_delete.deleted_at)) then
      update public.diary_entries set deleted_at = incoming.deleted_at, updated_at = incoming.updated_at
        where id = canonical.id returning * into canonical;
      return next canonical; return;
    end if;
    incoming.created_at := now();
    insert into public.diary_entries select (incoming).* returning * into existing;
    return next existing; return;
  end if;

  if canonical.id is null then
    -- A lost response must not let an old, unacknowledged duplicate UUID
    -- resurrect the day after a delete. An explicitly newer entry may recreate it.
    if last_delete.id is not null and incoming.updated_at <= greatest(last_delete.updated_at, last_delete.deleted_at) then
      return next last_delete; return;
    end if;
  end if;

  incoming.created_at := now();
  insert into public.diary_entries select (incoming).*
  on conflict (user_id, date) where deleted_at is null do update set
    one_line = excluded.one_line, mood = excluded.mood, body = excluded.body,
    tags = excluded.tags, updated_at = excluded.updated_at;
  -- A tied/stale update can be skipped by facta_sync_guard; always return
  -- the stored winner so clients can settle and remap their submitted UUID.
  return query select * from public.diary_entries
    where user_id = incoming.user_id and date = incoming.date and deleted_at is null;
end $$;
revoke all on function public.facta_write_diary(jsonb) from public, anon;
grant execute on function public.facta_write_diary(jsonb) to authenticated;

-- Match the base migration: no realtime publication for these collections.
do $$ declare t text; begin
  foreach t in array array['notes','diary_entries'] loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- END embedded migration rerun

-- Owner A can see/change only their rows; invoker RPC cannot forge ownership.
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.check_it((select count(*) from public.notes)=1,'notes ownership and rerun preservation');
select pg_temp.check_it(not has_table_privilege('anon','public.notes','SELECT'),'anon notes access revoked');
select pg_temp.check_it(not has_table_privilege('anon','public.diary_entries','INSERT'),'anon diary access revoked');
select pg_temp.check_it(not has_function_privilege('anon','public.facta_write_diary(jsonb)','EXECUTE'),'anon RPC access revoked');
select pg_temp.expect_error($q$insert into public.notes(user_id) values ('bbbbbbbb-0000-4000-8000-000000000002')$q$,'42501');
select pg_temp.expect_error($q$select * from public.facta_write_diary(jsonb_build_object(
  'id',gen_random_uuid(),'user_id','bbbbbbbb-0000-4000-8000-000000000002','date','2026-10-01','one_line','Forged','mood',3))$q$,'42501');
update public.notes set title='Forged' where user_id='bbbbbbbb-0000-4000-8000-000000000002';

-- Data constraints, including UTF-8 body size despite jsonb compression.
select pg_temp.expect_error($q$insert into public.notes(font) values (repeat('x',51))$q$,'23514');
select pg_temp.expect_error($q$insert into public.notes(font) values (repeat('🙂',51))$q$,'23514');
select pg_temp.expect_error($q$insert into public.notes(links) values (array_fill('cccccccc-0000-4000-8000-000000000001'::uuid,array[501]))$q$,'23514');
insert into public.notes(id,font,links,updated_at) values ('cccccccc-1111-4000-8000-000000000001',repeat('🙂',50),
  array_fill('cccccccc-0000-4000-8000-000000000001'::uuid,array[500]),now()-interval '1 day');
select pg_temp.check_it((select char_length(font)=50 and cardinality(links)=500 from public.notes
  where id='cccccccc-1111-4000-8000-000000000001'),'font and links accept boundary values');
select pg_temp.expect_error($q$update public.notes set font=repeat('x',51),updated_at=now()
  where id='cccccccc-1111-4000-8000-000000000001'$q$,'23514');
select pg_temp.expect_error($q$update public.notes set links=array_fill('cccccccc-0000-4000-8000-000000000001'::uuid,array[501]),updated_at=now()
  where id='cccccccc-1111-4000-8000-000000000001'$q$,'23514');
delete from public.notes where id='cccccccc-1111-4000-8000-000000000001';
select pg_temp.expect_error($q$insert into public.notes(title) values (repeat('x',501))$q$,'23514');
select pg_temp.expect_error($q$insert into public.notes(color) values ('red')$q$,'23514');
select pg_temp.expect_error($q$insert into public.notes(align) values ('diagonal')$q$,'23514');
select pg_temp.expect_error($q$insert into public.notes(body) values ('{}')$q$,'23514');
select pg_temp.expect_error($q$insert into public.notes(body) values (jsonb_build_array(jsonb_build_object('text',repeat('x',204801))))$q$,'23514');
select pg_temp.expect_error($q$insert into public.notes(tags) values (array_fill('x',array[21]))$q$,'23514');
select pg_temp.expect_error($q$insert into public.notes(tags) values (array[repeat('x',51)])$q$,'23514');
select pg_temp.expect_error($q$insert into public.notes(tags) values (array[null]::text[])$q$,'23514');
select pg_temp.expect_error($q$insert into public.diary_entries(date,one_line,mood) values ('2026-10-03','',3)$q$,'23514');
select pg_temp.expect_error($q$insert into public.diary_entries(date,one_line,mood) values ('2026-10-03',repeat('x',121),3)$q$,'23514');
select pg_temp.expect_error($q$insert into public.diary_entries(date,one_line,mood) values ('2026-10-03','Line',0)$q$,'23514');
select pg_temp.expect_error($q$insert into public.diary_entries(date,one_line,mood) values ('2026-10-03','Line',6)$q$,'23514');
select pg_temp.expect_error($q$insert into public.events(title,date,end_date,start_time,end_time) values ('Bad end','2026-10-03','2026-10-02','09:00','10:00')$q$,'23514');
insert into public.events(title,date,end_date,start_time,end_time) values ('Trip','2026-10-03','2026-10-05','09:00','10:00');

-- Trash is a normal newer-wins edit; only deleted_at is a sticky tombstone.
update public.notes set trashed_at=now(),updated_at=now()-interval '23 hours' where title='Owner A';
select pg_temp.check_it((select trashed_at is not null and deleted_at is null from public.notes where title='Owner A'),'Trash is not a tombstone');
update public.notes set trashed_at=null,updated_at=now()-interval '22 hours' where title='Owner A';
select pg_temp.check_it((select trashed_at is null from public.notes where title='Owner A'),'Trash restore');
update public.notes set title='Stale',updated_at=now()-interval '23 hours' where title='Owner A';
select pg_temp.check_it((select count(*) from public.notes where title='Owner A')=1,'stale note edit skipped');
update public.notes set deleted_at=now()-interval '21 hours',updated_at=now()-interval '24 hours' where title='Owner A';
update public.notes set deleted_at=null,title='Resurrected',updated_at=now() where title='Owner A';
select pg_temp.check_it((select deleted_at is not null from public.notes where title='Owner A'),'permanent note deletion is sticky');

-- Two devices create the same date using different UUIDs. The newer complete
-- snapshot wins all four editable fields, retaining the canonical first UUID.
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000001','2026-10-01','Device A',3::smallint,now()-interval '1 day',null,'Body A',array['a']));
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000002','2026-10-01','Device B',5::smallint,now()-interval '23 hours',null,'Body B',array['b']));
select pg_temp.check_it((select count(*) from public.diary_entries where date='2026-10-01' and deleted_at is null)=1,'one live entry per owner/date');
select pg_temp.check_it((select id='dddddddd-0000-4000-8000-000000000001' and one_line='Device B' and mood=5 and body='Body B' and tags=array['b'] from public.diary_entries where date='2026-10-01' and deleted_at is null),'canonical identity and atomic winner fields');
select pg_temp.expect_error($q$insert into public.diary_entries(date,one_line,mood) values ('2026-10-01','Duplicate',3)$q$,'23505');
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000003','2026-10-01','Tie loses',1::smallint,now()-interval '23 hours'));
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000004','2026-10-01','Older loses',1::smallint,now()-interval '1 day'));
select pg_temp.check_it((select one_line='Device B' from public.diary_entries where date='2026-10-01'),'stored row wins ties and older edits');
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000005','2026-10-02','Fast clock',4::smallint,now()+interval '1 day'));
select pg_temp.check_it((select updated_at<=now() from public.diary_entries where date='2026-10-02'),'future clock clamped');

-- Offline duplicate delete, lost response replay, then an explicitly newer
-- re-creation. Old UUIDs/deletes must never damage the replacement generation.
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000006','2026-10-01','Offline delete',3::smallint,now()-interval '22 hours',now()-interval '22 hours'));
select pg_temp.check_it((select count(*) from public.diary_entries where date='2026-10-01' and deleted_at is null)=0,'duplicate offline delete reaches canonical row');
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000002','2026-10-01','Lost response replay',5::smallint,now()-interval '23 hours'));
select pg_temp.check_it((select count(*) from public.diary_entries where date='2026-10-01' and deleted_at is null)=0,'unacknowledged alias cannot resurrect deleted day');
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000007','2026-10-01','New entry',4::smallint,now()-interval '21 hours'));
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000001','2026-10-01','Old UUID replay',1::smallint,now()-interval '20 hours'));
select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000008','2026-10-01','Old delete replay',1::smallint,now()-interval '23 hours',now()-interval '23 hours'));
select pg_temp.check_it((select one_line='New entry' and id='dddddddd-0000-4000-8000-000000000007' from public.diary_entries where date='2026-10-01' and deleted_at is null),'replacement survives old UUID and delete replay');
select pg_temp.expect_error($q$select * from public.facta_write_diary(pg_temp.diary_payload('dddddddd-0000-4000-8000-000000000007','2026-10-03','Moved',3::smallint,now()))$q$,'23514');

-- Direct table writes must enforce the same identity rule, before the sync
-- guard can skip stale edits or sticky tombstones. Same-date edits still work.
select pg_temp.expect_error($q$update public.diary_entries set date='2026-10-03',updated_at=now()
  where id='dddddddd-0000-4000-8000-000000000007'$q$,'23514');
select pg_temp.expect_error($q$update public.diary_entries set date='2026-10-03',updated_at=now()-interval '2 days'
  where id='dddddddd-0000-4000-8000-000000000007'$q$,'23514');
select pg_temp.expect_error($q$update public.diary_entries set date='2026-10-03',updated_at=now()
  where id='dddddddd-0000-4000-8000-000000000001'$q$,'23514');
update public.diary_entries set date=date,one_line='Same date edit',updated_at=now()
  where id='dddddddd-0000-4000-8000-000000000007';
select pg_temp.check_it((select date='2026-10-01' and one_line='Same date edit' from public.diary_entries
  where id='dddddddd-0000-4000-8000-000000000007'),'direct same-date edits remain allowed');

-- Another owner may use the same day, but cannot read, update or delete A.
reset role;
select pg_temp.check_it((select title='Owner B' from public.notes where user_id='bbbbbbbb-0000-4000-8000-000000000002'),'cross-owner update was filtered');
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.check_it((select count(*) from public.diary_entries)=0,'diary RLS hides A');
select * from public.facta_write_diary(pg_temp.diary_payload('eeeeeeee-0000-4000-8000-000000000001','2026-10-01','Other owner',3::smallint,now()-interval '1 day'));
delete from public.notes where user_id='aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.check_it((select count(*) from public.diary_entries)=1,'other owner date is independent');
reset role;
select pg_temp.check_it((select count(*) from public.notes)=2,'cross-owner delete was filtered');
select pg_temp.check_it((select count(*) from public.diary_entries where date='2026-10-01' and deleted_at is null)=2,'one live row per owner, not globally per date');
select pg_temp.check_it((select count(*) from pg_policies where schemaname='public' and tablename in ('notes','diary_entries') and cmd='UPDATE' and qual is not null and with_check is not null)=2,'both UPDATE policies enforce USING and WITH CHECK');
select 'notes_diary: all checks passed (rolling back scratch fixtures)' as result;
rollback;
