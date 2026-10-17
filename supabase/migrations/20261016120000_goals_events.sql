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

begin;

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

commit;
