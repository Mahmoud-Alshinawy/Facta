-- Checks for the migrations in supabase/migrations/:
--   * 20261016110000_drop_task_battles.sql removes the old Task Battles
--     tables and leaves keep_alive alone;
--   * 20261016120000_goals_events.sql refuses to build on old tables, and
--     sets up ownership (RLS and grants) and the facta_sync_guard rules the
--     app depends on;
--   * a second run of both is a no-op that keeps the new tables and rows.
--
-- Run it against a FRESH, THROWAWAY Postgres database, never your Supabase
-- project, from the repository root:
--
--   createdb facta_test
--   psql -v ON_ERROR_STOP=1 -d facta_test -f supabase/tests/sync_guard.sql
--
-- It prints "sync_guard: all checks passed" at the end, and stops at the
-- first failed check.

\set ON_ERROR_STOP 1
\set QUIET 1

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    raise exception 'refusing to run: schema "auth" exists, so this looks like a real Supabase database. Use a fresh scratch database.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Stand-ins for Supabase
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase grants new public tables to anon and authenticated by default;
-- the migration has to take that away from anon.
alter default privileges in schema public grant all on tables to anon, authenticated;
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

insert into auth.users values
  ('aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Helpers (pg_temp: they vanish with the session)
-- ---------------------------------------------------------------------------

-- Act as a signed-in user, or as anon when uid is null.
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  if uid is null then
    set role anon;
  else
    set role authenticated;
  end if;
end $$;

-- A PostgREST-style upsert of a goal. Returns the number of rows written.
create function pg_temp.upsert_goal(gid uuid, owner uuid, t text, ts timestamptz, del timestamptz default null)
returns int language plpgsql as $$
declare n int;
begin
  insert into public.goals (id, user_id, title, category, date, updated_at, deleted_at)
  values (gid, owner, t, 'must-do', '2026-10-16', ts, del)
  on conflict (id) do update set
    user_id = excluded.user_id, title = excluded.title,
    updated_at = excluded.updated_at, deleted_at = excluded.deleted_at;
  get diagnostics n = row_count;
  return n;
end $$;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
end $$;

-- Runs a statement, ignoring a permission (RLS) error.
create function pg_temp.try(stmt text) returns void language plpgsql as $$
begin
  execute stmt;
exception
  when insufficient_privilege then null;
end $$;

-- Asserts that a statement fails with the given SQLSTATE.
create function pg_temp.expect_error(stmt text, state text, what text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAILED: % (no error raised)', what;
exception
  when others then
    if sqlstate = 'P0001' and sqlerrm like 'FAILED:%' then raise; end if;
    if sqlstate <> state then
      raise exception 'FAILED: % (got % "%", expected %)', what, sqlstate, sqlerrm, state;
    end if;
end $$;

-- Only failures and the final line are printed.
\o /dev/null

-- ---------------------------------------------------------------------------
-- An old Task Battles database
-- ---------------------------------------------------------------------------

-- Roughly the old shapes: text dates, no updated_at/deleted_at, open policies,
-- foreign keys between the tables.
create table public.profiles (
  user_id uuid primary key, invite_code text unique, display_name text, created_at timestamptz default now()
);
create table public.goals (
  id uuid primary key, user_id uuid references public.profiles (user_id), title text, category text,
  date text, completed boolean default false
);
create table public.events (
  id uuid primary key, user_id uuid, title text, date text, start_time text, end_time text,
  goal_id uuid references public.goals (id)
);
create table public.notes (id uuid primary key, user_id uuid references public.profiles (user_id), body text);
alter table public.goals enable row level security;
create policy "anyone" on public.goals for all using (true);
-- Not part of Task Battles: the drop migration must leave it alone.
create table public.keep_alive (id int primary key, pinged_at timestamptz not null default now());

insert into public.profiles (user_id, invite_code, display_name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'ABC123', 'old');
insert into public.goals (id, user_id, title, category, date) values
  ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'old goal', 'must-do', '2025-01-01'),
  ('dddddddd-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'old goal 2', 'should-do', '2025-01-02');
insert into public.events (id, title, date, goal_id) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'old event', '2025-01-01', 'dddddddd-0000-4000-8000-000000000001');
insert into public.notes (id, user_id, body) values ('ffffffff-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'note');
insert into public.keep_alive (id) values (1);
select pinged_at as keep_alive_pinged_at from public.keep_alive where id = 1 \gset

-- ---------------------------------------------------------------------------
-- Skipping the drop step: goals_events must refuse, and change nothing.
-- ---------------------------------------------------------------------------

-- \ir would stop this script at the guard's error (or, without ON_ERROR_STOP,
-- print an error for every statement left in the aborted transaction). So
-- read the file and run its body in a block that catches the exception; the
-- block's subtransaction rolls back just as the file's own transaction would.
-- \lo_import reads paths relative to the current directory: the repo root.
\lo_import supabase/migrations/20261016120000_goals_events.sql
\set goals_events_oid :LASTOID

-- Runs the migration body with `setup` first, inside a block that rolls
-- everything back, and checks it raised an error matching `expected`.
create function pg_temp.expect_migration_error(oid oid, setup text, expected text, what text)
returns void language plpgsql as $$
declare
  body text := convert_from(lo_get(oid), 'UTF8');
  msg text;
begin
  -- The file wraps itself in begin/commit, which PL/pgSQL can't run.
  body := regexp_replace(body, '^(begin|commit);$', '', 'gn');
  begin
    if setup <> '' then execute setup; end if;
    execute body;
    raise exception 'FAILED: % (no error raised)', what;
  exception
    when others then
      get stacked diagnostics msg = message_text;
      if msg like 'FAILED:%' then raise; end if;
      if msg not like expected then
        raise exception 'FAILED: % (got "%")', what, msg;
      end if;
  end;
end $$;

set client_min_messages = warning;
select pg_temp.expect_migration_error(:goals_events_oid, '',
  'Old goals/events table found (missing %goals.updated_at%goals.deleted_at%). Run 20261016110000_drop_task_battles.sql first.',
  'goals_events refuses old Task Battles tables');
select pg_temp.expect_migration_error(:goals_events_oid,
  'alter table public.goals add column updated_at timestamptz, add column deleted_at timestamptz;
   alter table public.events add column updated_at timestamptz, add column deleted_at timestamptz;',
  'public.goals.date is not a date column. Run 20261016110000_drop_task_battles.sql first.',
  'goals_events refuses an old goals table with a text date');
reset client_min_messages;
\lo_unlink :goals_events_oid

select pg_temp.check(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'goals' and column_name = 'deleted_at')
  and (select count(*) = 2 from public.goals)
  and (select count(*) = 1 from public.events),
  'refused run left the old goals/events tables and rows as they were');
select pg_temp.check(
  to_regprocedure('public.facta_sync_guard()') is null
  and not exists (select 1 from pg_indexes where indexname = 'goals_user_id_idx'),
  'refused run left nothing of the new schema behind');

-- ---------------------------------------------------------------------------
-- Drop, then create.
-- ---------------------------------------------------------------------------

set client_min_messages = warning;
\ir ../migrations/20261016110000_drop_task_battles.sql
\ir ../migrations/20261016120000_goals_events.sql
reset client_min_messages;

select pg_temp.check(
  to_regclass('public.notes') is null and to_regclass('public.profiles') is null,
  'old notes and profiles tables are gone');
select pg_temp.check(
  not exists (select 1 from public.goals) and not exists (select 1 from public.events),
  'old goals/events rows are gone with their tables');
select pg_temp.check(
  not exists (select 1 from pg_policies where tablename = 'goals' and policyname = 'anyone'),
  'the old open policy is gone');
select pg_temp.check(to_regclass('public.keep_alive') is not null, 'keep_alive still exists');
select pg_temp.check(
  (select pinged_at = :'keep_alive_pinged_at' from public.keep_alive where id = 1),
  'keep_alive and its row are untouched');
select pg_temp.check(
  (select data_type = 'date' from information_schema.columns where table_schema = 'public' and table_name = 'goals' and column_name = 'date')
  and (select data_type = 'time without time zone' from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'start_time')
  and (select count(*) = 4 from information_schema.columns
       where table_schema = 'public' and table_name in ('goals', 'events') and column_name in ('updated_at', 'deleted_at')),
  'goals and events have the new shape');
select pg_temp.check(
  (select count(*) = 2 from pg_trigger where tgname in ('goals_sync_guard', 'events_sync_guard')),
  'sync guard triggers are installed');


-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select pg_temp.check(
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.goals'::regclass, 'public.events'::regclass)),
  'RLS is enabled on goals and events');
select pg_temp.check(
  not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('goals', 'events')),
  'neither table is in supabase_realtime');
select pg_temp.check(
  (select count(*) = 2 from pg_indexes where indexname in ('goals_user_id_idx', 'events_user_id_idx')),
  'user_id indexes exist');
select pg_temp.check(
  (select count(*) = 8 from pg_policies where tablename in ('goals', 'events') and roles = '{authenticated}'),
  'eight policies, all to authenticated');
select pg_temp.check(
  not has_table_privilege('anon', 'public.goals', 'select')
  and not has_table_privilege('anon', 'public.events', 'insert'),
  'anon has no table privileges');

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------

\set A 'aaaaaaaa-0000-4000-8000-000000000001'
\set B 'bbbbbbbb-0000-4000-8000-000000000002'
\set G 'cccccccc-0000-4000-8000-000000000003'

select pg_temp.act_as(null);
select pg_temp.expect_error('select 1 from public.goals', '42501', 'anon cannot read goals');
select pg_temp.expect_error($$insert into public.events (title, date, start_time, end_time) values ('x', '2026-10-16', '09:00', '10:00')$$, '42501', 'anon cannot insert events');
reset role;

select pg_temp.act_as(:'A');
select pg_temp.check(pg_temp.upsert_goal(:'G', :'A', 'v1', '2026-10-16 09:00:00+00') = 1, 'A creates a goal');
select pg_temp.check((select user_id = :'A' from public.goals where id = :'G'), 'the goal belongs to A');
reset role;

select pg_temp.act_as(:'B');
select pg_temp.check((select count(*) = 0 from public.goals), 'B cannot see A''s goals');
select pg_temp.expect_error(format($$select pg_temp.upsert_goal(gen_random_uuid(), %L, 'x', now())$$, :'A'), '42501', 'B cannot insert a row owned by A');
select pg_temp.expect_error(format($$select pg_temp.upsert_goal(%L, %L, 'hijack', now())$$, :'G', :'B'), '42501', 'B cannot overwrite A''s row by reusing its id');
delete from public.goals where id = :'G';
update public.goals set title = 'hijack', updated_at = now() where id = :'G';
reset role;
select pg_temp.check((select title = 'v1' from public.goals where id = :'G'), 'B''s delete and update touched nothing');

select pg_temp.act_as(:'A');
-- The trigger pins user_id; even without it, the update policy's WITH CHECK
-- would refuse. Either outcome is fine as long as the row stays A's.
select pg_temp.try(format($$update public.goals set user_id = %L, updated_at = '2026-10-16 09:00:01+00' where id = %L$$, :'B', :'G'));
select pg_temp.check((select user_id = :'A' from public.goals where id = :'G'), 'user_id cannot be moved to another user');
update public.goals set created_at = '2000-01-01', updated_at = '2026-10-16 09:00:02+00' where id = :'G';
select pg_temp.check((select created_at > '2001-01-01' from public.goals where id = :'G'), 'created_at cannot be changed');
with e as (
  insert into public.events (title, date, start_time, end_time)
  values ('standup', '2026-10-16', '09:00', '09:15') returning user_id
)
select pg_temp.check((select user_id = :'A' from e), 'user_id defaults to auth.uid()');

-- ---------------------------------------------------------------------------
-- Sync guard
-- ---------------------------------------------------------------------------

select pg_temp.check(pg_temp.upsert_goal(:'G', :'A', 'v2', '2026-10-16 09:00:05+00') = 1, 'a newer edit applies');
select pg_temp.check(pg_temp.upsert_goal(:'G', :'A', 'stale', '2026-10-16 09:00:03+00') = 0, 'an older edit is skipped');
select pg_temp.check(pg_temp.upsert_goal(:'G', :'A', 'same', '2026-10-16 09:00:05+00') = 0, 'an equal timestamp is skipped (idempotent retry)');
select pg_temp.check((select title = 'v2' from public.goals where id = :'G'), 'skipped edits left the row alone');

select pg_temp.check(pg_temp.upsert_goal(:'G', :'A', 'future', now() + interval '1 hour') = 1, 'a future-dated edit applies');
select pg_temp.check((select updated_at <= now() from public.goals where id = :'G'), 'its updated_at is clamped to now()');

select pg_temp.check(
  pg_temp.upsert_goal(:'G', :'A', 'future', '2026-10-16 08:00:00+00', '2026-10-16 08:00:00+00') = 1,
  'a delete applies even with an older timestamp');
select pg_temp.check((select deleted_at is not null and updated_at <= now() from public.goals where id = :'G'), 'the row is now a tombstone');
select pg_temp.check(pg_temp.upsert_goal(:'G', :'A', 'resurrect', now(), null) = 0, 'a newer edit cannot clear deleted_at (sticky delete)');
select pg_temp.check(pg_temp.upsert_goal(:'G', :'A', 'again', now(), now()) = 0, 'a second delete is a no-op');
select pg_temp.check((select title = 'future' and deleted_at is not null from public.goals where id = :'G'), 'the tombstone never changed');

select pg_temp.check(
  (select start_time::text = '09:00:00' from public.events where title = 'standup'),
  'time columns come back as HH:mm:ss (the app normalises them)');

-- Row-level errors carry SQLSTATE class 22/23, which the app parks per row.
select pg_temp.expect_error($$insert into public.goals (title, category, date) values ('x', 'urgent', '2026-10-16')$$, '23514', 'category check');
select pg_temp.expect_error($$insert into public.events (title, date, start_time, end_time, repeat_days) values ('x', '2026-10-16', '09:00', '10:00', '{7}')$$, '23514', 'repeat_days check');
select pg_temp.expect_error($$insert into public.goals (title, category, date) values ('', 'must-do', '2026-10-16')$$, '23514', 'empty title');
select pg_temp.expect_error($$insert into public.goals (title, category, date) values ('x', 'must-do', '2026-13-40')$$, '22008', 'invalid date');
reset role;

-- ---------------------------------------------------------------------------
-- Second run of both migrations: a no-op that keeps the new tables and rows.
-- ---------------------------------------------------------------------------

select count(*) as goals_before from public.goals \gset
select count(*) as events_before from public.events \gset
select string_agg(id::text || updated_at::text || coalesce(deleted_at::text, ''), ',' order by id) as goals_digest from public.goals \gset
select pg_temp.check(:goals_before > 0 and :events_before > 0, 'there are rows to keep');
-- Put goals in realtime; the second run must take it out again.
alter publication supabase_realtime add table public.goals;

set client_min_messages = warning;
\ir ../migrations/20261016110000_drop_task_battles.sql
\ir ../migrations/20261016120000_goals_events.sql
reset client_min_messages;

select pg_temp.check(
  (select count(*) = :goals_before from public.goals) and (select count(*) = :events_before from public.events),
  'second run kept every goal and event');
select pg_temp.check(
  (select string_agg(id::text || updated_at::text || coalesce(deleted_at::text, ''), ',' order by id) from public.goals) = :'goals_digest',
  'second run changed no goal');
select pg_temp.check(
  not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('goals', 'events')),
  'second run took goals out of realtime again');
select pg_temp.check(
  (select pinged_at = :'keep_alive_pinged_at' from public.keep_alive where id = 1),
  'keep_alive is still untouched');
select pg_temp.check(
  (select count(*) = 8 from pg_policies where tablename in ('goals', 'events')),
  'still exactly eight policies');

\o
\echo 'sync_guard: all checks passed'
