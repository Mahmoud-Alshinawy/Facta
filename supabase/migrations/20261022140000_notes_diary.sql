-- Facta branch 2. Re-runnable; apply AFTER 20261016120000_goals_events.sql.
-- Owner applies this migration. Never run it against production from tooling.
begin;

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

-- The day is the entry's identity, including for direct table writes. This
-- trigger sorts before the sync guard, so stale edits/tombstones cannot hide
-- an attempted date change by returning NULL from that guard first.
create or replace function public.facta_diary_date_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.date is distinct from old.date then
    raise exception 'Diary date cannot change' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.facta_diary_date_immutable() from public, anon, authenticated;
drop trigger if exists diary_entries_date_immutable on public.diary_entries;
create trigger diary_entries_date_immutable before update on public.diary_entries
  for each row execute function public.facta_diary_date_immutable();

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
commit;
