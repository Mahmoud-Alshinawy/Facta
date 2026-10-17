-- Facta: remove the tables left over from Task Battles.
--
-- THIS DELETES DATA. Export anything you want to keep (Table Editor ->
-- Export -> CSV) before running it.
--
-- Runs before 20261016120000_goals_events.sql. Idempotent: safe to run more
-- than once, and it never drops the new goals/events tables (those have a
-- deleted_at column; the old ones don't).
--
-- CASCADE also removes the tables' policies, triggers and foreign keys.
-- keep_alive is left alone.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['goals', 'events'] loop
    if to_regclass(format('public.%I', t)) is not null and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'deleted_at'
    ) then
      execute format('drop table public.%I cascade', t);
    end if;
  end loop;
end;
$$;

drop table if exists
  public.notes,
  public.diary,
  public.reactions,
  public.daily_stats,
  public.monthly_stats,
  public.profiles
  cascade;

commit;
