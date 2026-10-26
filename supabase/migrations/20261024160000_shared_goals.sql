-- Shared goals: approved plan at 5337807. Owner applies after local review.
-- Re-runnable; no historical migrations or personal collection rules changed.
begin;
do $$ begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Shared goals require PostgreSQL 15+ security-invoker views';
  end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception 'Install pgcrypto in extensions before applying shared goals';
  end if;
end $$;
create schema if not exists facta_private;
revoke all on schema facta_private from public, anon;
grant usage on schema facta_private to authenticated;

-- No configurable clock/GUC override: tests replace this function inside a
-- disposable transaction as the database owner, never as an API caller.
create or replace function facta_private.sg_now() returns timestamptz
language sql volatile set search_path='' as $$ select clock_timestamp() $$;
create or replace function facta_private.sg_read_now() returns timestamptz
language sql volatile set search_path='' as $$ select clock_timestamp() $$;

create table if not exists public.shared_profiles (
  user_id uuid primary key references auth.users(id),
  handle text not null unique,
  display_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1,
  deleted_at timestamptz
);
create table if not exists public.shared_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  icon text not null default 'goals',
  template text not null,
  schedule_kind text not null,
  weekdays smallint[] not null default '{}',
  times_per_week smallint,
  time_zone text not null,
  round_weekday smallint not null,
  first_round_date date,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1,
  deleted_at timestamptz
);
create table if not exists public.shared_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups(id),
  user_id uuid not null references auth.users(id),
  joined_at timestamptz not null,
  eligible_round date,
  left_at timestamptz,
  initial_gym_target smallint,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1,
  deleted_at timestamptz,
  unique(id, group_id, user_id)
);
create index if not exists shared_groups_owner_idx on public.shared_groups(owner_id);
create unique index if not exists shared_memberships_open_user_idx
  on public.shared_memberships(group_id,user_id) where left_at is null and deleted_at is null;
create index if not exists shared_memberships_user_idx on public.shared_memberships(user_id,group_id);
-- Include closed epochs: the open-user partial index cannot serve historical
-- boundary rosters or their departure cutoffs.
create index if not exists shared_memberships_group_idx on public.shared_memberships(group_id,eligible_round,joined_at);
create table if not exists public.shared_targets (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.shared_memberships(id),
  effective_round date not null,
  target smallint not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1,
  deleted_at timestamptz,
  unique(membership_id,effective_round)
);
create table if not exists public.shared_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups(id),
  inviter_id uuid not null references auth.users(id),
  recipient_id uuid references auth.users(id),
  kind text not null,
  state text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1,
  deleted_at timestamptz
);
create unique index if not exists shared_invites_pending_user_idx
  on public.shared_invites(group_id,recipient_id) where kind='direct' and state='pending' and deleted_at is null;
create index if not exists shared_invites_group_idx on public.shared_invites(group_id,state,expires_at);
create index if not exists shared_invites_recipient_idx on public.shared_invites(recipient_id);
create index if not exists shared_invites_inviter_idx on public.shared_invites(inviter_id);
create table if not exists public.shared_checkins (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups(id),
  user_id uuid not null references auth.users(id),
  membership_id uuid not null,
  checkin_date date not null,
  completed boolean not null,
  captured_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1,
  foreign key(membership_id,group_id,user_id) references public.shared_memberships(id,group_id,user_id),
  unique(group_id,user_id,checkin_date)
);
create index if not exists shared_checkins_member_date_idx on public.shared_checkins(membership_id,checkin_date);
create index if not exists shared_checkins_user_idx on public.shared_checkins(user_id);
create table if not exists facta_private.shared_invite_tokens (
  invite_id uuid primary key references public.shared_invites(id),
  token_digest bytea not null unique,
  version bigint not null default 1
);
create table if not exists facta_private.shared_command_receipts (
  actor_id uuid not null references auth.users(id),
  command_id uuid not null,
  operation text not null,
  request_digest bytea not null,
  outcome jsonb not null,
  committed_at timestamptz not null,
  primary key(actor_id,command_id)
);
create table if not exists facta_private.shared_rate_limits (
  actor_id uuid not null references auth.users(id),
  operation text not null,
  window_start timestamptz not null,
  attempts integer not null,
  primary key(actor_id,operation,window_start)
);
create table if not exists facta_private.shared_group_invite_budgets (
  group_id uuid not null references public.shared_groups(id),
  window_start timestamptz not null,
  attempts integer not null,
  primary key(group_id,window_start)
);

-- Additional constraints follow the existing re-runnable pg_constraint pattern.
do $constraints$ declare c record; begin
  for c in select * from (values
    ('shared_profiles','shared_profiles_handle_check', $$handle ~ '^[a-z0-9_]{3,24}$'$$),
    ('shared_profiles','shared_profiles_name_check', 'char_length(btrim(display_name)) between 1 and 80'),
    ('shared_groups','shared_groups_name_check', 'char_length(btrim(name)) between 1 and 120'),
    ('shared_groups','shared_groups_icon_check', $$icon in ('dumbbell','book','run','bulb','drop','moon','goals','flame')$$),
    ('shared_groups','shared_groups_weekday_check', 'round_weekday between 0 and 6'),
    ('shared_groups','shared_groups_zone_check', 'char_length(time_zone) between 1 and 100'),
    ('shared_groups','shared_groups_schedule_check', $$
      (template='gym' and schedule_kind='n' and times_per_week is null and cardinality(weekdays)=0)
      or (template='custom' and (
        (schedule_kind='every' and times_per_week is null and cardinality(weekdays)=0)
        or (schedule_kind='n' and times_per_week is not null and times_per_week between 1 and 7 and cardinality(weekdays)=0)
        or (schedule_kind='days' and times_per_week is null and cardinality(weekdays) between 1 and 7
          and weekdays <@ array[0,1,2,3,4,5,6]::smallint[] and array_position(weekdays,null) is null)))$$),
    ('shared_groups','shared_groups_publication_check', '(published_at is null) = (first_round_date is null) and (archived_at is null or archived_at >= coalesce(published_at,created_at))'),
    ('shared_memberships','shared_memberships_target_check', 'initial_gym_target is null or initial_gym_target between 2 and 7'),
    ('shared_memberships','shared_memberships_leave_check', 'left_at is null or left_at >= joined_at'),
    ('shared_targets','shared_targets_value_check', 'target between 2 and 7'),
    ('shared_invites','shared_invites_kind_check', $$(kind='direct' and recipient_id is not null) or (kind='link' and recipient_id is null)$$),
    ('shared_invites','shared_invites_state_check', $$state in ('pending','accepted','declined','revoked') and (kind='direct' or state in ('pending','revoked'))$$),
    ('shared_invites','shared_invites_expiry_check', 'expires_at > created_at')
  ) as constraints(table_name,constraint_name,expression)
  loop
    if not exists(select 1 from pg_constraint where conname=c.constraint_name and conrelid=('public.'||c.table_name)::regclass) then
      execute format('alter table public.%I add constraint %I check (%s)',c.table_name,c.constraint_name,c.expression);
    end if;
  end loop;
end $constraints$;

create or replace function facta_private.sg_guard() returns trigger
language plpgsql set search_path='' as $guard$
declare g public.shared_groups; m public.shared_memberships;
begin
  if tg_op='DELETE' then raise exception 'Permanent shared deletion is not supported' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if (to_jsonb(old)->>'deleted_at') is not null then return null; end if;
    if new.created_at<>old.created_at then raise exception 'created_at is immutable' using errcode='23514'; end if;
    if new.revision<=old.revision then return null; end if;
    if new.updated_at<=old.updated_at then new.updated_at:=old.updated_at+interval '1 microsecond'; end if;
    case tg_table_name
      when 'shared_profiles' then
        if (new.user_id,new.handle) is distinct from (old.user_id,old.handle) then raise exception 'Profile identity is immutable' using errcode='23514'; end if;
      when 'shared_groups' then
        if new.id<>old.id or (old.archived_at is not null and to_jsonb(new)-'revision'-'updated_at' is distinct from to_jsonb(old)-'revision'-'updated_at') then
          raise exception 'Archived group is immutable' using errcode='23514'; end if;
        if old.published_at is not null and
          (new.template,new.schedule_kind,new.weekdays,new.times_per_week,new.time_zone,new.round_weekday,new.first_round_date,new.published_at)
          is distinct from (old.template,old.schedule_kind,old.weekdays,old.times_per_week,old.time_zone,old.round_weekday,old.first_round_date,old.published_at) then
          raise exception 'Published rules are immutable' using errcode='23514'; end if;
      when 'shared_memberships' then
        if (new.id,new.group_id,new.user_id,new.joined_at) is distinct from
          (old.id,old.group_id,old.user_id,old.joined_at)
          or (new.initial_gym_target is distinct from old.initial_gym_target and
            (old.eligible_round is not null or exists(select 1 from public.shared_groups where id=old.group_id and published_at is not null)))
          or (old.eligible_round is not null and new.eligible_round is distinct from old.eligible_round)
          or (old.left_at is not null and new.left_at is distinct from old.left_at) then
          raise exception 'Membership facts are immutable' using errcode='23514'; end if;
      when 'shared_targets' then
        if (new.id,new.membership_id,new.effective_round) is distinct from (old.id,old.membership_id,old.effective_round) then raise exception 'Target identity is immutable' using errcode='23514'; end if;
      when 'shared_invites' then
        if (new.id,new.group_id,new.inviter_id,new.recipient_id,new.kind) is distinct from (old.id,old.group_id,old.inviter_id,old.recipient_id,old.kind)
          or (old.state<>'pending' and new.state<>old.state) then raise exception 'Invite identity/state is immutable' using errcode='23514'; end if;
      when 'shared_checkins' then
        if (new.id,new.group_id,new.user_id,new.membership_id,new.checkin_date) is distinct from
          (old.id,old.group_id,old.user_id,old.membership_id,old.checkin_date) then raise exception 'Check-in identity is immutable' using errcode='23514'; end if;
    end case;
  end if;
  if new.revision<1 then raise exception 'Invalid revision' using errcode='23514'; end if;
  if tg_table_name='shared_groups' then
    if not exists(select 1 from pg_timezone_names where name=new.time_zone) then raise exception 'Invalid time zone' using errcode='23514'; end if;
    if cardinality(new.weekdays)<>(select count(distinct d) from unnest(new.weekdays) d) then raise exception 'Duplicate weekdays' using errcode='23514'; end if;
    if new.first_round_date is not null and (extract(dow from new.first_round_date)::int<>new.round_weekday
      or new.first_round_date<=(new.published_at at time zone new.time_zone)::date) then raise exception 'Invalid first round' using errcode='23514'; end if;
  elsif tg_table_name='shared_memberships' then
    select * into strict g from public.shared_groups where id=new.group_id;
    if (g.template='gym') is distinct from (new.initial_gym_target is not null) then raise exception 'Wrong membership target shape' using errcode='23514'; end if;
    if new.eligible_round is null then
      if g.published_at is not null or new.user_id<>g.owner_id then raise exception 'Eligibility required' using errcode='23514'; end if;
    elsif g.first_round_date is null or new.eligible_round<g.first_round_date or (new.eligible_round-g.first_round_date)%7<>0
      or (new.eligible_round::timestamp at time zone g.time_zone)<=new.joined_at then raise exception 'Invalid eligibility boundary' using errcode='23514'; end if;
  elsif tg_table_name='shared_targets' then
    select * into strict m from public.shared_memberships where id=new.membership_id;
    select * into strict g from public.shared_groups where id=m.group_id;
    if g.template<>'gym' or m.eligible_round is null or new.effective_round<m.eligible_round or (new.effective_round-g.first_round_date)%7<>0 then raise exception 'Invalid target boundary' using errcode='23514'; end if;
  elsif tg_table_name='shared_checkins' then
    select * into strict g from public.shared_groups where id=new.group_id;
    if (new.captured_at at time zone g.time_zone)::date<>new.checkin_date then raise exception 'Captured day mismatch' using errcode='23514'; end if;
  end if;
  return new;
end $guard$;

create or replace function facta_private.sg_invariants() returns trigger
language plpgsql security definer set search_path='' as $$
declare gid uuid; g public.shared_groups; used integer;
begin
  if tg_table_name='shared_groups' then gid:=new.id; else gid:=new.group_id; end if;
  select * into strict g from public.shared_groups where id=gid for update;
  select (select count(*) from public.shared_memberships where group_id=gid and left_at is null and deleted_at is null)
    +(select count(*) from public.shared_invites where group_id=gid and kind='direct' and state='pending' and deleted_at is null and expires_at>facta_private.sg_now()) into used;
  if used>8 then raise exception 'Group capacity exceeded' using errcode='23514'; end if;
  if g.archived_at is null and not exists(select 1 from public.shared_memberships where group_id=gid and user_id=g.owner_id and left_at is null and deleted_at is null) then
    raise exception 'Owner must remain joined' using errcode='23514'; end if;
  if exists(select 1 from public.shared_memberships a join public.shared_memberships b
    on a.group_id=b.group_id and a.user_id=b.user_id and a.id<b.id
    where a.group_id=gid and a.joined_at<coalesce(b.left_at,'infinity') and b.joined_at<coalesce(a.left_at,'infinity')) then
    raise exception 'Membership epochs overlap' using errcode='23514'; end if;
  if g.template='gym' and g.published_at is not null and exists(select 1 from public.shared_memberships m
    where m.group_id=gid and m.eligible_round is not null and not exists(select 1 from public.shared_targets t
      where t.membership_id=m.id and t.effective_round=m.eligible_round and t.deleted_at is null)) then
    raise exception 'Initial target required' using errcode='23514'; end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['shared_profiles','shared_groups','shared_memberships','shared_targets','shared_invites','shared_checkins'] loop
    execute format('drop trigger if exists shared_guard on public.%I',t);
    execute format('create trigger shared_guard before insert or update or delete on public.%I for each row execute function facta_private.sg_guard()',t);
  end loop;
  foreach t in array array['shared_groups','shared_memberships','shared_invites'] loop
    execute format('drop trigger if exists shared_invariants on public.%I',t);
    execute format('create constraint trigger shared_invariants after insert or update on public.%I deferrable initially deferred for each row execute function facta_private.sg_invariants()',t);
  end loop;
end $$;

create or replace function facta_private.sg_can_read_group(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.shared_groups g where g.id=gid and g.deleted_at is null
    and (g.published_at is not null or g.owner_id=(select auth.uid()))
    and exists(select 1 from public.shared_memberships m
      where m.group_id=g.id and m.user_id=(select auth.uid()) and m.left_at is null and m.deleted_at is null))
$$;
create or replace function facta_private.sg_can_read_profile(uid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select uid=(select auth.uid()) or exists(select 1 from public.shared_memberships m
    where m.user_id=uid and facta_private.sg_can_read_group(m.group_id))
    or exists(select 1 from public.shared_invites i where i.recipient_id=uid and i.state='pending'
      and i.expires_at>facta_private.sg_read_now() and facta_private.sg_can_read_group(i.group_id))
$$;
do $$ declare t text; begin
  foreach t in array array['shared_profiles','shared_groups','shared_memberships','shared_targets','shared_invites','shared_checkins'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('drop policy if exists shared_read on public.%I',t);
    execute format('drop policy if exists shared_write on public.%I',t);
    if t='shared_profiles' then
      execute format('create policy shared_read on public.%I for select to authenticated using (facta_private.sg_can_read_profile(user_id))',t);
      execute format('create policy shared_write on public.%I for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()))',t);
    elsif t='shared_targets' then
      execute format('create policy shared_read on public.%I for select to authenticated using (exists(select 1 from public.shared_memberships m where m.id=membership_id and facta_private.sg_can_read_group(m.group_id)))',t);
      execute format('create policy shared_write on public.%I for update to authenticated using (exists(select 1 from public.shared_memberships m where m.id=membership_id and m.user_id=(select auth.uid()) and m.left_at is null)) with check (exists(select 1 from public.shared_memberships m where m.id=membership_id and m.user_id=(select auth.uid()) and m.left_at is null))',t);
    else
      execute format('create policy shared_read on public.%I for select to authenticated using (facta_private.sg_can_read_group(%s))',t,case when t='shared_groups' then 'id' else 'group_id' end);
      -- Direct DML is not granted. These scope predicates are defense in depth;
      -- elevated mutation RPCs separately authorize every operation/field.
      execute format('create policy shared_write on public.%I for update to authenticated using (%s) with check (%s)',t,
        case when t='shared_groups' then 'owner_id=(select auth.uid()) and facta_private.sg_can_read_group(id)'
          when t='shared_invites' then 'exists(select 1 from public.shared_groups g where g.id=group_id and g.owner_id=(select auth.uid()))'
          else 'user_id=(select auth.uid()) and facta_private.sg_can_read_group(group_id)' end,
        case when t='shared_groups' then 'owner_id=(select auth.uid()) and facta_private.sg_can_read_group(id)'
          when t='shared_invites' then 'exists(select 1 from public.shared_groups g where g.id=group_id and g.owner_id=(select auth.uid()))'
          else 'user_id=(select auth.uid()) and facta_private.sg_can_read_group(group_id)' end);
    end if;
  end loop;
end $$;

-- The roster is historical; do not filter it down to today's open memberships.
create or replace view public.shared_goal_rounds with (security_invoker=true,security_barrier=true) as
-- Sample once when this query executes. statement_timestamp() is too early
-- inside an RPC that waited for a group lock across a round boundary.
with clock as materialized (select facta_private.sg_read_now() as at), slots as (
  select g.id group_id,g.first_round_date+7*n.i round_start,g.time_zone,g.archived_at,c.at,
    ((g.first_round_date+7*n.i)::timestamp at time zone g.time_zone) activity_start,
    ((g.first_round_date+7*n.i+7)::timestamp at time zone g.time_zone) scheduled_end
  from public.shared_groups g cross join clock c
  cross join lateral generate_series(0, (least((c.at at time zone g.time_zone)::date,
    coalesce((g.archived_at at time zone g.time_zone)::date,(c.at at time zone g.time_zone)::date))-g.first_round_date)/7) n(i)
  where g.published_at is not null and g.deleted_at is null
), roster as (
  select s.*,count(m.id)::integer roster_size,
    (array_agg(m.left_at order by m.left_at nulls last))[count(m.id)::integer-1] pause_at
  from slots s join public.shared_memberships m on m.group_id=s.group_id
    and m.joined_at<s.activity_start and m.eligible_round<=s.round_start
    and (m.left_at is null or m.left_at>s.activity_start) and m.deleted_at is null
  where s.activity_start<=s.at and (s.archived_at is null or s.activity_start<s.archived_at)
  group by s.group_id,s.round_start,s.time_zone,s.archived_at,s.at,s.activity_start,s.scheduled_end
  having count(m.id)>=2
), cut as (
  select r.*,least(scheduled_end,coalesce(pause_at,'infinity'),coalesce(archived_at,'infinity')) activity_end from roster r
)
select group_id,round_start,round_start+7 round_end,activity_start,scheduled_end,activity_end,roster_size,
  case when activity_end=scheduled_end then 'scheduled' when activity_end=archived_at then 'archived' else 'paused' end end_reason,
  at<activity_end is_active
from cut;

create or replace view public.shared_goal_round_scores with (security_invoker=true,security_barrier=true) as
with totals as (
  select r.*,m.id membership_id,m.user_id,p.display_name,p.handle,
    case when g.template='gym' then target.target when g.schedule_kind='every' then 7
      when g.schedule_kind='days' then cardinality(g.weekdays) else g.times_per_week end::integer target,
    (select count(*)::integer from public.shared_checkins ci where ci.membership_id=m.id and ci.completed
      and ci.checkin_date>=r.round_start and ci.checkin_date<r.round_end
      and ci.captured_at>=r.activity_start and ci.captured_at<r.activity_end
      and (g.schedule_kind<>'days' or extract(dow from ci.checkin_date)::smallint=any(g.weekdays))) completed_days,
    m.left_at
  from public.shared_goal_rounds r join public.shared_groups g on g.id=r.group_id
  join public.shared_memberships m on m.group_id=r.group_id and m.joined_at<r.activity_start
    and m.eligible_round<=r.round_start and (m.left_at is null or m.left_at>r.activity_start) and m.deleted_at is null
  join public.shared_profiles p on p.user_id=m.user_id
  left join lateral (select t.target from public.shared_targets t where t.membership_id=m.id
    and t.effective_round<=r.round_start and t.deleted_at is null order by t.effective_round desc limit 1) target on true
), percentages as (
  select t.*,least(100::numeric,100::numeric*completed_days/nullif(target,0)) adherence_pct from totals t
)
select p.*,adherence_pct>=70 is_at_least_70,
  rank() over(partition by group_id,round_start order by adherence_pct desc) rank,
  avg(adherence_pct) over(partition by group_id,round_start) group_average_pct
from percentages p;
revoke all on public.shared_goal_rounds,public.shared_goal_round_scores from public,anon,authenticated;
grant select on public.shared_goal_rounds,public.shared_goal_round_scores to authenticated;

create or replace function facta_private.sg_next_start(at_time timestamptz,zone text,weekday integer)
returns date language sql immutable set search_path='' as $$
  select (at_time at time zone zone)::date + ((weekday-extract(dow from at_time at time zone zone)::integer+6)%7)+1
$$;
create or replace function facta_private.sg_round_start(g public.shared_groups,at_time timestamptz)
returns date language sql immutable set search_path='' as $$
  select g.first_round_date + 7*floor(((at_time at time zone g.time_zone)::date-g.first_round_date)::numeric/7)::integer
$$;
create or replace function facta_private.sg_used(gid uuid,at_time timestamptz) returns integer
language sql stable set search_path='' as $$
  select ((select count(*) from public.shared_memberships where group_id=gid and left_at is null and deleted_at is null)
    +(select count(*) from public.shared_invites where group_id=gid and kind='direct' and state='pending'
      and expires_at>at_time and deleted_at is null))::integer
$$;
create or replace function facta_private.sg_budget(op text,limit_count integer,seconds integer) returns boolean
language plpgsql set search_path='' as $$
declare n integer; at_time timestamptz:=facta_private.sg_now(); bucket timestamptz;
begin
  bucket:=to_timestamp(floor(extract(epoch from at_time)/seconds)*seconds);
  insert into facta_private.shared_rate_limits(actor_id,operation,window_start,attempts)
    values(auth.uid(),op,bucket,1) on conflict(actor_id,operation,window_start)
    do update set attempts=shared_rate_limits.attempts+1 returning attempts into n;
  delete from facta_private.shared_rate_limits where actor_id=auth.uid() and window_start<at_time-interval '2 days';
  return n<=limit_count;
end $$;
create or replace function facta_private.sg_bad_invite(code text) returns jsonb
language plpgsql set search_path='' as $$ begin
  if not facta_private.sg_budget('failed_redeem',10,60) then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
  return jsonb_build_object('ok',false,'code',code);
end $$;
-- One durable UTC-hour budget across all owners, shared by issue and rotate.
-- The group lock serializes this check with transfer, revocation and issuance.
create or replace function facta_private.sg_invite_budget(gid uuid) returns boolean
language plpgsql set search_path='' as $$
declare n integer; at_time timestamptz; bucket timestamptz;
begin
  perform 1 from public.shared_groups where id=gid for update;
  at_time:=facta_private.sg_now();
  bucket:=to_timestamp(floor(extract(epoch from at_time)/3600)*3600);
  insert into facta_private.shared_group_invite_budgets(group_id,window_start,attempts)
    values(gid,bucket,1) on conflict(group_id,window_start)
    do update set attempts=shared_group_invite_budgets.attempts+1 returning attempts into n;
  delete from facta_private.shared_group_invite_budgets where group_id=gid and window_start<at_time-interval '2 days';
  return n<=20;
end $$;
create or replace function facta_private.sg_preview(i public.shared_invites,g public.shared_groups)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('ok',true,'invite_id',i.id,'group_id',g.id,'name',g.name,
    'inviter',(select display_name from public.shared_profiles where user_id=i.inviter_id),
    'template',g.template,'schedule_kind',g.schedule_kind,'weekdays',g.weekdays,'times_per_week',g.times_per_week,
    'time_zone',g.time_zone,'round_weekday',g.round_weekday,'first_round_date',g.first_round_date,
    'published',g.published_at is not null,'expires_at',i.expires_at,
    'accepted_count',(select count(*) from public.shared_memberships where group_id=g.id and left_at is null and deleted_at is null))
$$;

-- Finite command contract; payload fields are allowlisted per operation. The
-- command UUID names an immutable intent, NOT the entity/natural check-in key.
create or replace function facta_private.sg_execute_command(operation text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $rpc$
declare
  actor uuid:=auth.uid();
  allowed text[]; gid uuid; g public.shared_groups; m public.shared_memberships;
  invite public.shared_invites; ci public.shared_checkins; recipient uuid;
  at_time timestamptz; start_date date; effective date; value integer;
  token text; outcome jsonb; member_id uuid; handle_value text;
  reserve_mine boolean; captured timestamptz; day_value date; desired boolean;
  rr public.shared_goal_rounds; profile public.shared_profiles; profile_constraint text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>8192 then
    raise exception 'Invalid command envelope' using errcode='22023'; end if;
  allowed:=case operation
    when 'set_profile' then array['handle','display_name']
    when 'create_draft' then array['name','icon','template','schedule_kind','weekdays','times_per_week','time_zone','round_weekday','target']
    when 'update_draft' then array['group_id','expected_revision','name','icon','template','schedule_kind','weekdays','times_per_week','time_zone','round_weekday','target']
    when 'publish' then array['group_id','expected_revision','first_round_date']
    when 'invite' then array['group_id','handle']
    when 'issue_link' then array['group_id']
    when 'rotate_invite' then array['invite_id']
    when 'revoke_invite' then array['invite_id']
    when 'decline_invite' then array['invite_id']
    when 'join' then array['invite_id','token','target']
    when 'set_target' then array['group_id','target']
    when 'set_checkin' then array['group_id','membership_id','date','captured_at','completed','base_revision']
    when 'transfer_owner' then array['group_id','user_id']
    when 'leave' then array['group_id','transfer_to']
    when 'archive' then array['group_id'] else null end;
  if allowed is null or exists(select 1 from jsonb_object_keys(payload) k where not k=any(allowed)) then
    raise exception 'Unknown operation or payload field' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(payload) e where
    (e.key=any(array['name','icon','template','schedule_kind','time_zone','handle','display_name','first_round_date','date','captured_at','token','group_id','invite_id','membership_id','user_id']) and jsonb_typeof(e.value)<>'string')
    or (e.key='transfer_to' and jsonb_typeof(e.value) not in ('string','null'))
    or (e.key=any(array['target','times_per_week']) and jsonb_typeof(e.value) not in ('number','null'))
    or (e.key=any(array['expected_revision','base_revision','round_weekday']) and jsonb_typeof(e.value)<>'number')
    or (e.key='weekdays' and jsonb_typeof(e.value)<>'array')
    or (e.key='completed' and jsonb_typeof(e.value)<>'boolean')) then
    raise exception 'Invalid payload field type' using errcode='22023'; end if;
  at_time:=facta_private.sg_now();
  if operation='set_profile' then
    perform pg_advisory_xact_lock(hashtextextended(actor::text||':profile',0));
    handle_value:=lower(payload->>'handle');
    if handle_value is null or handle_value !~ '^[a-z0-9_]{3,24}$' or jsonb_typeof(payload->'display_name')<>'string'
      or char_length(btrim(payload->>'display_name')) not between 1 and 80 then raise exception 'Invalid profile' using errcode='22023'; end if;
    select * into profile from public.shared_profiles where user_id=actor for update;
    if found and profile.handle<>handle_value then return jsonb_build_object('ok',false,'code','handle_immutable'); end if;
    -- Probe budget applies before availability lookup, even without a profile.
    -- Existing immutable-handle display-name edits are not availability probes.
    if profile.user_id is null and not facta_private.sg_budget('profile_setup',10,60) then
      return jsonb_build_object('ok',false,'code','rate_limited','scope','profile_setup'); end if;
    if exists(select 1 from public.shared_profiles where handle=handle_value and user_id<>actor) then return jsonb_build_object('ok',false,'code','handle_taken'); end if;
    begin
      insert into public.shared_profiles(user_id,handle,display_name,created_at,updated_at)
        values(actor,handle_value,btrim(payload->>'display_name'),at_time,at_time)
        on conflict(user_id) do update set display_name=excluded.display_name,updated_at=excluded.updated_at,revision=shared_profiles.revision+1;
    exception when unique_violation then
      get stacked diagnostics profile_constraint=constraint_name;
      if profile_constraint<>'shared_profiles_handle_key' then raise; end if;
      -- Another account can claim the handle after the lookup. Keep the budget
      -- and receipt durable by rolling back only this insert, not the command.
      return jsonb_build_object('ok',false,'code','handle_taken');
    end;
    outcome:=jsonb_build_object('ok',true,'code','profile_saved');
  elsif operation='create_draft' then
    if not exists(select 1 from public.shared_profiles where user_id=actor and deleted_at is null) then return jsonb_build_object('ok',false,'code','profile_required'); end if;
    gid:=gen_random_uuid();
    insert into public.shared_groups(id,owner_id,name,icon,template,schedule_kind,weekdays,times_per_week,time_zone,round_weekday,created_at,updated_at)
      values(gid,actor,btrim(payload->>'name'),coalesce(payload->>'icon','goals'),payload->>'template',payload->>'schedule_kind',
        coalesce((select array_agg(d::smallint) from jsonb_array_elements_text(payload->'weekdays') d),'{}'),
        (payload->>'times_per_week')::smallint,payload->>'time_zone',(payload->>'round_weekday')::smallint,at_time,at_time);
    insert into public.shared_memberships(group_id,user_id,joined_at,initial_gym_target,created_at,updated_at)
      values(gid,actor,at_time,(payload->>'target')::smallint,at_time,at_time) returning id into member_id;
    outcome:=jsonb_build_object('ok',true,'code','draft_created','group_id',gid,'membership_id',member_id,'revision',1);
  else
    if operation in ('join','rotate_invite','revoke_invite','decline_invite') then
      if operation='join' and payload ? 'token' then
        if payload ? 'invite_id' or jsonb_typeof(payload->'token')<>'string' or (payload->>'token') !~ '^[A-Za-z0-9_-]{43}$' then
          return facta_private.sg_bad_invite('invalid_invite'); end if;
        select i.* into invite from public.shared_invites i join facta_private.shared_invite_tokens s on s.invite_id=i.id
          where s.token_digest=sha256(convert_to(payload->>'token','UTF8'));
      else
        select * into invite from public.shared_invites where id=(payload->>'invite_id')::uuid;
      end if;
      if invite.id is null then return facta_private.sg_bad_invite('invalid_invite'); end if;
      gid:=invite.group_id;
    else gid:=(payload->>'group_id')::uuid; end if;
    select * into g from public.shared_groups where id=gid and deleted_at is null for update;
    if not found then return jsonb_build_object('ok',false,'code','forbidden'); end if;
    at_time:=facta_private.sg_now(); -- assign lifecycle time AFTER acquiring group lock
    if invite.id is not null then
      select * into invite from public.shared_invites where id=invite.id for update;
    end if;
    select * into m from public.shared_memberships where group_id=gid and user_id=actor and left_at is null and deleted_at is null for update;
    if operation='join' then
      if (invite.kind='direct' and invite.recipient_id<>actor) or (not (payload ? 'token') and invite.kind<>'direct') then return facta_private.sg_bad_invite('invalid_invite'); end if;
      -- Recheck digest after the lock: rotate/revoke cannot race acceptance.
      if payload ? 'token' and not exists(select 1 from facta_private.shared_invite_tokens s where s.invite_id=invite.id and s.token_digest=sha256(convert_to(payload->>'token','UTF8'))) then
        return facta_private.sg_bad_invite('invalid_invite'); end if;
      if g.archived_at is not null then return facta_private.sg_bad_invite('archived'); end if;
      if invite.state<>'pending' or invite.deleted_at is not null then return facta_private.sg_bad_invite('invalid_invite'); end if;
      if invite.expires_at<=at_time then return facta_private.sg_bad_invite('expired'); end if;
      if g.published_at is null then return jsonb_build_object('ok',false,'code','not_published'); end if;
      if m.id is not null then return jsonb_build_object('ok',true,'code','already_joined','group_id',gid,'membership_id',m.id); end if;
      if not exists(select 1 from public.shared_profiles where user_id=actor and deleted_at is null) then return jsonb_build_object('ok',false,'code','profile_required'); end if;
      value:=(payload->>'target')::integer;
      if (g.template='gym' and (value is null or value not between 2 and 7)) or (g.template='custom' and value is not null) then raise exception 'Invalid personal target' using errcode='22023'; end if;
      select exists(select 1 from public.shared_invites where group_id=gid and recipient_id=actor and kind='direct' and state='pending' and expires_at>at_time and deleted_at is null) into reserve_mine;
      if facta_private.sg_used(gid,at_time)-(case when reserve_mine then 1 else 0 end)>=8 then return jsonb_build_object('ok',false,'code','full'); end if;
      start_date:=greatest(g.first_round_date,facta_private.sg_round_start(g,at_time)+7);
      insert into public.shared_memberships(group_id,user_id,joined_at,eligible_round,initial_gym_target,created_at,updated_at)
        values(gid,actor,at_time,start_date,value,at_time,at_time) returning id into member_id;
      if g.template='gym' then insert into public.shared_targets(membership_id,effective_round,target,created_at,updated_at)
        values(member_id,start_date,value,at_time,at_time); end if;
      update public.shared_invites set state='accepted',revision=revision+1,updated_at=at_time
        where group_id=gid and recipient_id=actor and kind='direct' and state='pending' and deleted_at is null;
      outcome:=jsonb_build_object('ok',true,'code','joined','group_id',gid,'membership_id',member_id,'eligible_round',start_date);
    else
      if operation='decline_invite' then
        if invite.recipient_id is distinct from actor or invite.kind<>'direct' then return jsonb_build_object('ok',false,'code','forbidden'); end if;
      elsif m.id is null or (g.published_at is null and g.owner_id<>actor) then return jsonb_build_object('ok',false,'code','forbidden'); end if;
      if g.archived_at is not null and operation<>'leave' then return jsonb_build_object('ok',false,'code','archived'); end if;
      if operation in ('update_draft','publish','invite','issue_link','rotate_invite','revoke_invite','transfer_owner','archive') and g.owner_id<>actor then
        return jsonb_build_object('ok',false,'code','forbidden'); end if;
      case operation
      when 'update_draft' then
        if g.published_at is not null then return jsonb_build_object('ok',false,'code','already_published'); end if;
        if (payload->>'expected_revision')::bigint is distinct from g.revision then return jsonb_build_object('ok',false,'code','conflict','revision',g.revision); end if;
        update public.shared_groups set name=btrim(payload->>'name'),icon=coalesce(payload->>'icon','goals'),template=payload->>'template',schedule_kind=payload->>'schedule_kind',
          weekdays=coalesce((select array_agg(d::smallint) from jsonb_array_elements_text(payload->'weekdays') d),'{}'),times_per_week=(payload->>'times_per_week')::smallint,
          time_zone=payload->>'time_zone',round_weekday=(payload->>'round_weekday')::smallint,revision=revision+1,updated_at=at_time where id=gid returning * into g;
        update public.shared_memberships set initial_gym_target=(payload->>'target')::smallint,revision=revision+1,updated_at=at_time where id=m.id;
        outcome:=jsonb_build_object('ok',true,'code','draft_updated','group_id',gid);
      when 'publish' then
        if g.published_at is not null then return jsonb_build_object('ok',false,'code','already_published','first_round_date',g.first_round_date); end if;
        start_date:=facta_private.sg_next_start(at_time,g.time_zone,g.round_weekday);
        if (payload->>'first_round_date')::date is distinct from start_date or (payload->>'expected_revision')::bigint is distinct from g.revision then
          return jsonb_build_object('ok',false,'code','confirmation_required','first_round_date',start_date,'revision',g.revision,'time_zone',g.time_zone); end if;
        update public.shared_groups set published_at=at_time,first_round_date=start_date,revision=revision+1,updated_at=at_time where id=gid returning * into g;
        update public.shared_memberships set eligible_round=start_date,revision=revision+1,updated_at=at_time where id=m.id;
        if g.template='gym' then insert into public.shared_targets(membership_id,effective_round,target,created_at,updated_at)
          values(m.id,start_date,m.initial_gym_target,at_time,at_time); end if;
        outcome:=jsonb_build_object('ok',true,'code','published','group_id',gid,'first_round_date',start_date);
      when 'invite','issue_link' then
        if not facta_private.sg_budget('invite_issue',20,3600) then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
        if not facta_private.sg_invite_budget(gid) then return jsonb_build_object('ok',false,'code','rate_limited','scope','group_invites'); end if;
        recipient:=null;
        if operation='invite' then
          if not facta_private.sg_budget('handle_lookup',10,60) then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
          handle_value:=lower(payload->>'handle');
          if handle_value is null or handle_value !~ '^[a-z0-9_]{3,24}$' then return jsonb_build_object('ok',false,'code','not_found'); end if;
          select user_id into recipient from public.shared_profiles where handle=handle_value and deleted_at is null;
          if recipient is null then return jsonb_build_object('ok',false,'code','not_found'); end if;
          if exists(select 1 from public.shared_memberships where group_id=gid and user_id=recipient and left_at is null and deleted_at is null) then return jsonb_build_object('ok',false,'code','already_joined'); end if;
          if exists(select 1 from public.shared_invites where group_id=gid and recipient_id=recipient and state='pending' and expires_at>at_time and deleted_at is null) then return jsonb_build_object('ok',false,'code','already_invited'); end if;
          update public.shared_invites set state='revoked',revision=revision+1,updated_at=at_time where group_id=gid and recipient_id=recipient and state='pending' and expires_at<=at_time;
          if facta_private.sg_used(gid,at_time)>=8 then return jsonb_build_object('ok',false,'code','full'); end if;
        end if;
        token:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
        insert into public.shared_invites(group_id,inviter_id,recipient_id,kind,expires_at,created_at,updated_at)
          values(gid,actor,recipient,case when operation='invite' then 'direct' else 'link' end,at_time+interval '168 hours',at_time,at_time) returning * into invite;
        insert into facta_private.shared_invite_tokens(invite_id,token_digest) values(invite.id,sha256(convert_to(token,'UTF8')));
        outcome:=jsonb_build_object('ok',true,'code','invite_issued','group_id',gid,'invite_id',invite.id,'token',token);
      when 'rotate_invite' then
        if invite.state<>'pending' then return jsonb_build_object('ok',false,'code','invalid_invite'); end if;
        if not facta_private.sg_budget('invite_issue',20,3600) then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
        if not facta_private.sg_invite_budget(gid) then return jsonb_build_object('ok',false,'code','rate_limited','scope','group_invites'); end if;
        if invite.kind='direct' and invite.expires_at<=at_time and facta_private.sg_used(gid,at_time)>=8 then return jsonb_build_object('ok',false,'code','full'); end if;
        if exists(select 1 from public.shared_memberships where group_id=gid and user_id=invite.recipient_id and left_at is null and deleted_at is null) then return jsonb_build_object('ok',false,'code','already_joined'); end if;
        token:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
        update facta_private.shared_invite_tokens set token_digest=sha256(convert_to(token,'UTF8')),version=version+1 where invite_id=invite.id;
        update public.shared_invites set expires_at=at_time+interval '168 hours',updated_at=at_time,revision=revision+1 where id=invite.id;
        outcome:=jsonb_build_object('ok',true,'code','invite_rotated','invite_id',invite.id,'token',token);
      when 'revoke_invite','decline_invite' then
        if invite.state='pending' then update public.shared_invites set state=case when operation='decline_invite' then 'declined' else 'revoked' end,updated_at=at_time,revision=revision+1 where id=invite.id; end if;
        outcome:=jsonb_build_object('ok',true,'code',case when operation='decline_invite' then 'declined' else 'revoked' end,'invite_id',invite.id);
      when 'set_target' then
        if g.template<>'gym' or g.published_at is null then return jsonb_build_object('ok',false,'code','not_applicable'); end if;
        effective:=greatest(m.eligible_round,facta_private.sg_round_start(g,at_time)+7);
        value:=(payload->>'target')::integer;
        if value is null then
          select target into value from public.shared_targets where membership_id=m.id and effective_round<effective and deleted_at is null order by effective_round desc limit 1;
          -- Before first eligibility the original row and the pending change
          -- share a boundary. The immutable join target is the baseline then.
          value:=coalesce(value,m.initial_gym_target);
          if value is null then return jsonb_build_object('ok',false,'code','initial_target_required'); end if;
        end if;
        if value not between 2 and 7 then raise exception 'Invalid target' using errcode='22023'; end if;
        insert into public.shared_targets(membership_id,effective_round,target,created_at,updated_at) values(m.id,effective,value,at_time,at_time)
          on conflict(membership_id,effective_round) do update set target=excluded.target,updated_at=excluded.updated_at,revision=shared_targets.revision+1;
        outcome:=jsonb_build_object('ok',true,'code','target_scheduled','effective_round',effective,'target',value);
      when 'set_checkin' then
        if g.published_at is null or m.eligible_round is null then return jsonb_build_object('ok',false,'code','ineligible'); end if;
        if (payload->>'membership_id')::uuid is distinct from m.id then return jsonb_build_object('ok',false,'code','membership_changed'); end if;
        captured:=(payload->>'captured_at')::timestamptz; day_value:=(payload->>'date')::date;
        if captured is null or day_value is null or captured>at_time or (captured at time zone g.time_zone)::date<>day_value
          or day_value<(at_time at time zone g.time_zone)::date-7 or day_value>(at_time at time zone g.time_zone)::date then
          return jsonb_build_object('ok',false,'code','invalid_date'); end if;
        if jsonb_typeof(payload->'completed') is distinct from 'boolean' or (payload->>'base_revision')::bigint is null then raise exception 'Invalid check-in state' using errcode='22023'; end if;
        desired:=(payload->>'completed')::boolean;
        start_date:=facta_private.sg_round_start(g,captured);
        select * into rr from public.shared_goal_rounds where group_id=gid and round_start=start_date;
        if not found or captured<rr.activity_start or captured>=rr.activity_end or m.joined_at>=rr.activity_start or m.eligible_round>start_date then
          return jsonb_build_object('ok',false,'code','inactive_period'); end if;
        if g.schedule_kind='days' and not extract(dow from day_value)::smallint=any(g.weekdays) then return jsonb_build_object('ok',false,'code','rest_day'); end if;
        select * into ci from public.shared_checkins where group_id=gid and user_id=actor and checkin_date=day_value for update;
        if found and ci.membership_id<>m.id then return jsonb_build_object('ok',false,'code','membership_changed'); end if;
        if (ci.id is not null and ci.completed=desired) then
          outcome:=jsonb_build_object('ok',true,'code','checked','id',ci.id,'revision',ci.revision,'completed',ci.completed);
        elsif (payload->>'base_revision')::bigint is distinct from coalesce(ci.revision,0) then
          return jsonb_build_object('ok',false,'code','conflict','revision',coalesce(ci.revision,0),'completed',coalesce(ci.completed,false));
        else
          insert into public.shared_checkins(group_id,user_id,membership_id,checkin_date,completed,captured_at,created_at,updated_at)
            values(gid,actor,m.id,day_value,desired,captured,at_time,at_time)
            on conflict(group_id,user_id,checkin_date) do update set completed=excluded.completed,captured_at=excluded.captured_at,
              revision=shared_checkins.revision+1,updated_at=excluded.updated_at returning * into ci;
          outcome:=jsonb_build_object('ok',true,'code','checked','id',ci.id,'revision',ci.revision,'completed',ci.completed);
        end if;
      when 'transfer_owner','leave' then
        recipient:=case when operation='transfer_owner' then (payload->>'user_id')::uuid else (payload->>'transfer_to')::uuid end;
        if operation='transfer_owner' or (operation='leave' and g.owner_id=actor and g.archived_at is null) then
          if recipient is null or recipient=actor or not exists(select 1 from public.shared_memberships where group_id=gid and user_id=recipient and left_at is null and deleted_at is null) then
            return jsonb_build_object('ok',false,'code','owner_transfer_required'); end if;
          update public.shared_groups set owner_id=recipient,revision=revision+1,updated_at=at_time where id=gid returning * into g;
        end if;
        if operation='leave' then update public.shared_memberships set left_at=at_time,revision=revision+1,updated_at=at_time where id=m.id; end if;
        outcome:=jsonb_build_object('ok',true,'code',case when operation='leave' then 'left' else 'owner_transferred' end,'group_id',gid);
      when 'archive' then
        update public.shared_groups set archived_at=at_time,revision=revision+1,updated_at=at_time where id=gid returning * into g;
        update public.shared_invites set state='revoked',revision=revision+1,updated_at=at_time where group_id=gid and state='pending' and deleted_at is null;
        outcome:=jsonb_build_object('ok',true,'code','archived','group_id',gid);
      else raise exception 'Unsupported command' using errcode='22023';
      end case;
    end if;
    -- All group commands serialize on its row; revision is an invalidation
    -- marker only. Historical membership/targets determine score eligibility.
    update public.shared_groups set revision=revision+1,updated_at=at_time where id=gid;
  end if;
  return outcome;
end $rpc$;

-- Bind every normally-returned outcome (including a rejected intent) to its
-- immutable command body. A changed proposal/retry after a product rejection
-- needs a new UUID. SQL exceptions roll back the entire transaction instead.
create or replace function public.facta_shared_command(command_id uuid,operation text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); digest bytea; prior facta_private.shared_command_receipts; outcome jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if command_id is null or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>8192 then
    raise exception 'Invalid command envelope' using errcode='22023'; end if;
  digest:=sha256(convert_to(jsonb_build_object('operation',operation,'payload',payload)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||command_id::text,0));
  select * into prior from facta_private.shared_command_receipts r where r.actor_id=actor and r.command_id=facta_shared_command.command_id;
  if found then
    if prior.request_digest<>digest then return jsonb_build_object('ok',false,'code','command_mismatch'); end if;
    return prior.outcome;
  end if;
  outcome:=facta_private.sg_execute_command(operation,payload);
  insert into facta_private.shared_command_receipts(actor_id,command_id,operation,request_digest,outcome,committed_at)
    values(actor,command_id,operation,digest,outcome-'token',facta_private.sg_now());
  return outcome;
end $$;

create or replace function public.facta_shared_preview(token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.shared_invites; g public.shared_groups; at_time timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if token is null or token !~ '^[A-Za-z0-9_-]{43}$' then return facta_private.sg_bad_invite('invalid_invite'); end if;
  select v.* into i from public.shared_invites v join facta_private.shared_invite_tokens s on s.invite_id=v.id where s.token_digest=sha256(convert_to(token,'UTF8'));
  if i.id is null or i.state<>'pending' or i.deleted_at is not null or (i.kind='direct' and i.recipient_id<>auth.uid()) then return facta_private.sg_bad_invite('invalid_invite'); end if;
  select * into g from public.shared_groups where id=i.group_id;
  at_time:=facta_private.sg_now();
  if g.archived_at is not null or g.deleted_at is not null then return facta_private.sg_bad_invite('invalid_invite'); end if;
  if i.expires_at<=at_time then return facta_private.sg_bad_invite('expired'); end if;
  return facta_private.sg_preview(i,g);
end $$;
create or replace function public.facta_shared_pending_invites() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(facta_private.sg_preview(i,g)),'[]'::jsonb) from public.shared_invites i
    join public.shared_groups g on g.id=i.group_id where i.recipient_id=(select auth.uid()) and i.kind='direct'
    and i.state='pending' and i.deleted_at is null and i.expires_at>facta_private.sg_read_now() and g.archived_at is null and g.deleted_at is null
$$;
create or replace function public.facta_shared_snapshot(history_from date,history_until date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if history_from is null or history_until is null or history_until<history_from or history_until-history_from>366 then
    raise exception 'Request at most 366 history days' using errcode='22023'; end if;
  -- Derive the round list and scores from one materialized scoring query, so
  -- a clock boundary between JSON fields cannot produce mismatched round keys.
  return (with scores as materialized (
    select s.* from public.shared_goal_round_scores s where s.round_start between history_from and history_until
  ), rounds as (
    select distinct group_id,round_start,round_end,activity_start,scheduled_end,activity_end,roster_size,end_reason,is_active from scores
  ) select jsonb_build_object(
    'groups',coalesce((select jsonb_agg(to_jsonb(g)) from public.shared_groups g),'[]'::jsonb),
    -- One compact authoritative activation fact per visible group, independent
    -- of the requested score window. RLS still scopes both tables and view.
    'lifecycle',coalesce((select jsonb_agg(jsonb_build_object('group_id',g.id,'first_scored_round',
      (select min(r.round_start) from public.shared_goal_rounds r where r.group_id=g.id)))
      from public.shared_groups g),'[]'::jsonb),
    'memberships',coalesce((select jsonb_agg(to_jsonb(m)) from public.shared_memberships m),'[]'::jsonb),
    'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.shared_profiles p),'[]'::jsonb),
    'targets',coalesce((select jsonb_agg(to_jsonb(t)) from public.shared_targets t),'[]'::jsonb),
    'invites',coalesce((select jsonb_agg(to_jsonb(i)) from public.shared_invites i),'[]'::jsonb),
    'checkins',coalesce((select jsonb_agg(to_jsonb(ci)) from public.shared_checkins ci where ci.checkin_date between history_from and history_until),'[]'::jsonb),
    'rounds',coalesce((select jsonb_agg(to_jsonb(r)) from rounds r),'[]'::jsonb),
    'scores',coalesce((select jsonb_agg(to_jsonb(s)) from scores s),'[]'::jsonb)));
end $$;

-- Dedicated private namespace; helpers execute only through reviewed entry
-- points, except the small predicates/clock required by invoker RLS/views.
revoke all on all tables in schema facta_private from public,anon,authenticated;
revoke all on all functions in schema facta_private from public,anon,authenticated;
grant execute on function facta_private.sg_can_read_group(uuid),facta_private.sg_can_read_profile(uuid),facta_private.sg_read_now() to authenticated;
revoke all on function public.facta_shared_command(uuid,text,jsonb),public.facta_shared_preview(text),public.facta_shared_pending_invites(),public.facta_shared_snapshot(date,date) from public,anon,authenticated;
grant execute on function public.facta_shared_command(uuid,text,jsonb),public.facta_shared_preview(text),public.facta_shared_pending_invites(),public.facta_shared_snapshot(date,date) to authenticated;
commit;
