-- Source assertions embedded in shared_goals.sql, not a standalone migration.
create temporary table sg_fixture(k text primary key,v jsonb not null);
create temporary table sg_assertions(n integer not null);
insert into sg_assertions values(0);
create or replace function pg_temp.check_true(ok boolean,message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAILED: %',message; end if;
  update sg_assertions set n=n+1;
end $$;
-- Owner-only replacement, transaction-local and rolled back. API roles cannot
-- configure either production clock; there is no custom-GUC time backdoor.
create or replace function pg_temp.set_clock(t timestamptz) returns void language plpgsql as $$ begin
  execute format('create or replace function facta_private.sg_now() returns timestamptz language sql volatile set search_path='''' as %L','select '||quote_literal(t)||'::timestamptz');
  execute format('create or replace function facta_private.sg_read_now() returns timestamptz language sql volatile set search_path='''' as %L','select '||quote_literal(t)||'::timestamptz');
end $$;
-- Switch to the actual restricted database role for the command, then restore
-- the fixture owner. This exercises the real RPC, not an imitation server.
create or replace function pg_temp.command(who integer,op text,p jsonb,cid uuid default gen_random_uuid()) returns jsonb
language plpgsql as $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub',format('aaaaaaaa-0000-4000-8000-%s',lpad(who::text,12,'0')),true);
  set local role authenticated;
  r:=public.facta_shared_command(cid,op,p);
  reset role;
  return r;
exception when others then reset role; raise; end $$;
create or replace function pg_temp.as_user(who integer,query text) returns jsonb
language plpgsql as $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub',format('aaaaaaaa-0000-4000-8000-%s',lpad(who::text,12,'0')),true);
  set local role authenticated;
  execute query into r;
  reset role; return r;
exception when others then reset role; raise; end $$;
create or replace function pg_temp.denied(who integer,query text,expected text default '42501') returns boolean
language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub',format('aaaaaaaa-0000-4000-8000-%s',lpad(who::text,12,'0')),true);
  set local role authenticated;
  begin execute query; exception when others then
    reset role; return sqlstate=expected;
  end;
  reset role; return false;
end $$;
create or replace function pg_temp.gid(key text) returns uuid language sql as $$ select (v->>'group_id')::uuid from sg_fixture where k=key $$;
create or replace function pg_temp.draft(who integer,key text,kind text default 'gym',schedule text default 'n',days jsonb default '[]',n integer default null,zone text default 'Asia/Riyadh',weekday integer default 1) returns void
language plpgsql as $$ declare r jsonb; begin
  r:=pg_temp.command(who,'create_draft',jsonb_build_object('name',key,'template',kind,'schedule_kind',schedule,'weekdays',days,'times_per_week',n,'time_zone',zone,'round_weekday',weekday,'target',case when kind='gym' then 2 else null end));
  perform pg_temp.check_true((r->>'ok')::boolean,'create draft '||key);
  insert into sg_fixture values(key,r);
end $$;
create or replace function pg_temp.publish(who integer,key text,first_date date) returns jsonb
language plpgsql as $$ declare r jsonb; begin
  r:=pg_temp.command(who,'publish',jsonb_build_object('group_id',pg_temp.gid(key),'expected_revision',(select revision from public.shared_groups where id=pg_temp.gid(key)),'first_round_date',first_date));
  return r;
end $$;
create or replace function pg_temp.join_user(owner_number integer,who integer,key text,target_value integer default 2) returns jsonb
language plpgsql as $$ declare invite jsonb; r jsonb; begin
  invite:=pg_temp.command(owner_number,'issue_link',jsonb_build_object('group_id',pg_temp.gid(key)));
  perform pg_temp.check_true((invite->>'ok')::boolean,'issue link');
  r:=pg_temp.command(who,'join',jsonb_build_object('token',invite->>'token','target',target_value));
  perform pg_temp.check_true((r->>'ok')::boolean,'join '||who||' to '||key);
  insert into sg_fixture values(key||':member:'||who,r) on conflict(k) do update set v=excluded.v;
  return r;
end $$;
create or replace function pg_temp.checkin(who integer,key text,day date,captured timestamptz,desired boolean default true,base bigint default 0,cid uuid default gen_random_uuid()) returns jsonb
language sql as $$ select pg_temp.command(who,'set_checkin',jsonb_build_object('group_id',pg_temp.gid(key),
  'membership_id',(select id from public.shared_memberships where group_id=pg_temp.gid(key) and user_id=format('aaaaaaaa-0000-4000-8000-%s',lpad(who::text,12,'0'))::uuid and left_at is null),
  'date',day,'captured_at',captured,'completed',desired,'base_revision',base),cid) $$;

insert into auth.users(id) select format('aaaaaaaa-0000-4000-8000-%s',lpad(n::text,12,'0'))::uuid from generate_series(1,12) n;
select pg_temp.set_clock('2026-10-14 09:00+03');
select pg_temp.check_true((pg_temp.command(n,'set_profile',jsonb_build_object('handle','tester_'||n,'display_name','Person '||n))->>'ok')::boolean,'profile '||n) from generate_series(1,12) n;
select pg_temp.check_true(pg_temp.command(1,'set_profile','{"handle":"renamed","display_name":"No"}')->>'code'='handle_immutable','immutable handle');
select pg_temp.check_true(pg_temp.command(2,'set_profile','{"handle":"tester_1","display_name":"No"}')->>'code'='handle_immutable','cannot acquire another handle');

-- 1. Sunday draft / Wednesday publication: stale date and revision must not
-- initialize any lifecycle facts. Same committed command returns frozen date.
select pg_temp.set_clock('2026-10-18 09:00+03');
select pg_temp.draft(1,'stale');
select pg_temp.set_clock('2026-10-21 09:00+03');
select pg_temp.check_true(pg_temp.publish(1,'stale','2026-10-19')->>'code'='confirmation_required','stale Sunday proposal');
select pg_temp.check_true((select first_round_date is null and published_at is null from public.shared_groups where id=pg_temp.gid('stale')),'no premature publication');
select pg_temp.check_true(not exists(select 1 from public.shared_targets t join public.shared_memberships m on m.id=t.membership_id where m.group_id=pg_temp.gid('stale')),'no premature targets');
insert into sg_fixture values('publish_command',jsonb_build_object('id',gen_random_uuid()));
insert into sg_fixture values('publish_body',jsonb_build_object('group_id',pg_temp.gid('stale'),'expected_revision',1,'first_round_date','2026-10-26'));
select pg_temp.check_true(pg_temp.command(1,'publish',(select v from sg_fixture where k='publish_body'),(select (v->>'id')::uuid from sg_fixture where k='publish_command'))->>'code'='published','confirmed publication');
select pg_temp.set_clock('2026-11-16 09:00+03');
select pg_temp.check_true(pg_temp.command(1,'publish',(select v from sg_fixture where k='publish_body'),(select (v->>'id')::uuid from sg_fixture where k='publish_command'))->>'first_round_date'='2026-10-26','publication replay frozen');
select pg_temp.check_true(pg_temp.command(1,'publish',(select v||'{"first_round_date":"2026-11-23"}'::jsonb from sg_fixture where k='publish_body'),(select (v->>'id')::uuid from sg_fixture where k='publish_command'))->>'code'='command_mismatch','command body immutable');

-- 2. Multiple inactive boundaries before actual eligibility/activation.
select pg_temp.set_clock('2026-10-14 10:00+03');
select pg_temp.draft(1,'waiting');
select pg_temp.check_true(pg_temp.publish(1,'waiting','2026-10-19')->>'code'='published','waiting published');
select pg_temp.set_clock('2026-11-04 10:00+03');
select pg_temp.check_true(not exists(select 1 from public.shared_goal_rounds where group_id=pg_temp.gid('waiting')),'no inactive zero rounds');
select pg_temp.join_user(1,2,'waiting');
select pg_temp.check_true(not exists(select 1 from public.shared_goal_rounds where group_id=pg_temp.gid('waiting')),'accepted is not eligible');
select pg_temp.set_clock('2026-11-09 00:00+03');
select pg_temp.check_true((select array_agg(round_start) from public.shared_goal_rounds where group_id=pg_temp.gid('waiting'))=array['2026-11-09'::date],'first activation only');
select pg_temp.check_true((select count(*) from public.shared_goal_round_scores where group_id=pg_temp.gid('waiting') and completed_days=0 and adherence_pct=0)=2,'real eligible zeros');

-- 3/4/5. Lifecycle roster, pause gap, resume, replay and terminal archive.
select pg_temp.set_clock('2026-10-14 11:00+03');
select pg_temp.draft(3,'lifecycle');
select pg_temp.check_true(pg_temp.publish(3,'lifecycle','2026-10-19')->>'code'='published','lifecycle published');
select pg_temp.join_user(3,4,'lifecycle');
select pg_temp.set_clock('2026-10-20 10:00+03');
select pg_temp.join_user(3,5,'lifecycle');
select pg_temp.check_true((select roster_size from public.shared_goal_rounds where group_id=pg_temp.gid('lifecycle'))=2,'next-round person not in roster');
select pg_temp.check_true(pg_temp.checkin(5,'lifecycle','2026-10-20','2026-10-20 09:00+03')->>'code'='inactive_period','next-round cannot check in');
select pg_temp.check_true((pg_temp.checkin(3,'lifecycle','2026-10-20','2026-10-20 09:00+03')->>'ok')::boolean,'first completion');
select pg_temp.check_true(pg_temp.checkin(3,'lifecycle','2026-10-20','2026-10-20 09:01+03',false,0)->>'code'='conflict','opposite stale intent');
select pg_temp.check_true((pg_temp.checkin(3,'lifecycle','2026-10-20','2026-10-20 09:01+03',true,0)->>'ok')::boolean,'same desired state idempotent');
select pg_temp.check_true((pg_temp.checkin(3,'lifecycle','2026-10-20','2026-10-20 09:01+03',false,1)->>'ok')::boolean,'uncheck without tombstone');
select pg_temp.check_true((pg_temp.checkin(3,'lifecycle','2026-10-20','2026-10-20 09:02+03',true,2)->>'ok')::boolean,'recheck same row');
select pg_temp.check_true((select count(*) from public.shared_checkins where group_id=pg_temp.gid('lifecycle'))=1,'one natural-key row');
select pg_temp.set_clock('2026-10-21 12:00+03');
select pg_temp.check_true(pg_temp.command(4,'leave',jsonb_build_object('group_id',pg_temp.gid('lifecycle')))->>'code'='left','eligible member left');
select pg_temp.check_true((select count(*) from public.shared_memberships where group_id=pg_temp.gid('lifecycle') and left_at is null)=2,'accepted count remains two');
select pg_temp.check_true((select activity_end from public.shared_goal_rounds where group_id=pg_temp.gid('lifecycle'))='2026-10-21 12:00+03'::timestamptz,'eligibility pause exact cutoff');
select pg_temp.check_true((select roster_size=2 and not is_active from public.shared_goal_rounds where group_id=pg_temp.gid('lifecycle')),'historical roster frozen');
select pg_temp.check_true(pg_temp.checkin(3,'lifecycle','2026-10-21','2026-10-21 12:00+03')->>'code'='inactive_period','pause end exclusive');
select pg_temp.set_clock('2026-10-22 10:00+03');
select pg_temp.check_true((pg_temp.checkin(3,'lifecycle','2026-10-21','2026-10-21 11:59:59.999999+03')->>'ok')::boolean,'pre-pause replay allowed');
select pg_temp.check_true(pg_temp.checkin(3,'lifecycle','2026-10-22','2026-10-22 09:00+03')->>'code'='inactive_period','gap capture rejected');
select pg_temp.check_true((select adherence_pct=100 from public.shared_goal_round_scores where group_id=pg_temp.gid('lifecycle') and user_id='aaaaaaaa-0000-4000-8000-000000000003'),'cap at target');
select pg_temp.set_clock('2026-10-26 00:00+03');
select pg_temp.check_true((select roster_size=2 and is_active from public.shared_goal_rounds where group_id=pg_temp.gid('lifecycle') and round_start='2026-10-26'),'boundary resume');
select pg_temp.check_true(pg_temp.checkin(3,'lifecycle','2026-10-22','2026-10-22 09:00+03')->>'code'='inactive_period','resume cannot legalize gap');
insert into sg_fixture values('checked_command',jsonb_build_object('id',gen_random_uuid()));
select pg_temp.check_true((pg_temp.checkin(3,'lifecycle','2026-10-26','2026-10-26 00:00+03',true,0,(select (v->>'id')::uuid from sg_fixture where k='checked_command'))->>'ok')::boolean,'new round start inclusive');
select pg_temp.check_true(pg_temp.command(5,'set_target',jsonb_build_object('group_id',pg_temp.gid('lifecycle'),'target',5))->>'effective_round'='2026-11-02','target changes next round');
select pg_temp.check_true((select target from public.shared_goal_round_scores where group_id=pg_temp.gid('lifecycle') and round_start='2026-10-26' and user_id='aaaaaaaa-0000-4000-8000-000000000005')=2,'target not retroactive');
select pg_temp.set_clock('2026-10-27 12:00+03');
select pg_temp.check_true(pg_temp.command(3,'archive',jsonb_build_object('group_id',pg_temp.gid('lifecycle')))->>'code'='archived','archive succeeds');
select pg_temp.check_true(pg_temp.checkin(3,'lifecycle','2026-10-27','2026-10-27 11:00+03')->>'code'='archived','unseen pre-archive queued write rejected');
select pg_temp.check_true((pg_temp.checkin(3,'lifecycle','2026-10-26','2026-10-26 00:00+03',true,0,(select (v->>'id')::uuid from sg_fixture where k='checked_command'))->>'ok')::boolean,'committed receipt retry after archive');
select pg_temp.set_clock('2026-11-16 10:00+03');
select pg_temp.check_true((select array_agg(round_start order by round_start) from public.shared_goal_rounds where group_id=pg_temp.gid('lifecycle'))=array['2026-10-19'::date,'2026-10-26'::date],'no post-archive phantom rounds');
select pg_temp.check_true((select count(*) from public.shared_goal_round_scores where group_id=pg_temp.gid('lifecycle'))=4,'historical rosters retained');
select pg_temp.check_true((select activity_end from public.shared_goal_rounds where group_id=pg_temp.gid('lifecycle') and round_start='2026-10-26')='2026-10-27 12:00+03'::timestamptz,'archival activity cutoff');

-- Archive exactly on a boundary; late acceptance exactly on a boundary.
select pg_temp.set_clock('2026-10-14 12:00+03');
select pg_temp.draft(6,'cutoff'); select pg_temp.publish(6,'cutoff','2026-10-19'); select pg_temp.join_user(6,7,'cutoff');
select pg_temp.set_clock('2026-10-19 00:00+03');
select pg_temp.join_user(6,8,'cutoff');
select pg_temp.check_true((select eligible_round from public.shared_memberships where group_id=pg_temp.gid('cutoff') and user_id='aaaaaaaa-0000-4000-8000-000000000008')='2026-10-26','midnight join cannot self-qualify');
select pg_temp.set_clock('2026-10-26 00:00+03'); select pg_temp.command(6,'archive',jsonb_build_object('group_id',pg_temp.gid('cutoff')));
select pg_temp.set_clock('2026-11-16 10:00+03');
select pg_temp.check_true((select array_agg(round_start) from public.shared_goal_rounds where group_id=pg_temp.gid('cutoff'))=array['2026-10-19'::date],'archive boundary excludes new start');

-- RLS: real roles see only their groups, not token/private/other users' data.
select pg_temp.check_true(pg_temp.as_user(12,'select to_jsonb(count(*)) from public.shared_groups')='0','stranger groups hidden');
select pg_temp.check_true(pg_temp.as_user(12,'select to_jsonb(count(*)) from public.shared_goal_round_scores')='0','stranger scores hidden');
select pg_temp.check_true(pg_temp.as_user(12,format('select to_jsonb(count(*)) from public.%I',t))='0','stranger rows hidden on '||t)
  from unnest(array['shared_memberships','shared_targets','shared_invites','shared_checkins']) t;
select pg_temp.check_true(pg_temp.as_user(12,'select to_jsonb(count(*)) from public.shared_profiles')='1','stranger cannot enumerate profiles beyond self');
select pg_temp.check_true(pg_temp.command(2,'issue_link',jsonb_build_object('group_id',pg_temp.gid('waiting')))->>'code'='forbidden','joined non-owner cannot issue invitation');
select pg_temp.check_true(pg_temp.command(2,'archive',jsonb_build_object('group_id',pg_temp.gid('waiting')))->>'code'='forbidden','joined non-owner cannot archive');
select pg_temp.check_true(pg_temp.command(2,'set_checkin',jsonb_build_object('group_id',pg_temp.gid('waiting'),'membership_id',(select id from public.shared_memberships where group_id=pg_temp.gid('waiting') and user_id='aaaaaaaa-0000-4000-8000-000000000001'),'date','2026-11-16','captured_at','2026-11-16 09:00+03','completed',true,'base_revision',0))->>'code'='membership_changed','member cannot check in for another epoch');
select pg_temp.check_true(pg_temp.denied(2,format('select public.facta_shared_command(gen_random_uuid(),''set_target'',jsonb_build_object(''group_id'',%L,''target'',3,''user_id'',''aaaaaaaa-0000-4000-8000-000000000001''))',pg_temp.gid('waiting')),'22023'),'member cannot choose another target owner');
select pg_temp.check_true(pg_temp.as_user(4,format('select to_jsonb(count(*)) from public.shared_groups where id=%L',pg_temp.gid('lifecycle')))='0','former member loses group');
select pg_temp.check_true(pg_temp.as_user(4,format('select to_jsonb(count(*)) from public.shared_goal_round_scores where group_id=%L',pg_temp.gid('lifecycle')))='0','former member loses history');
select pg_temp.check_true(pg_temp.as_user(3,format('select to_jsonb(count(*)) from public.shared_goal_round_scores where group_id=%L',pg_temp.gid('lifecycle')))='4','current member retains former member history');
select pg_temp.check_true(pg_temp.denied(12,'select * from facta_private.shared_invite_tokens'),'token table denied');
select pg_temp.check_true(pg_temp.denied(12,'select * from facta_private.shared_command_receipts'),'receipt table denied');
select pg_temp.check_true(pg_temp.denied(12,'select facta_private.sg_now()'),'mutation clock helper denied');
select pg_temp.check_true(pg_temp.denied(12,$q$select facta_private.sg_execute_command('set_profile','{}')$q$),'private mutation evaluator denied');
select pg_temp.check_true(pg_temp.denied(12,$q$update public.shared_profiles set display_name='forged',revision=revision+1$q$),'direct profile DML denied');
select pg_temp.check_true(pg_temp.denied(3,$q$update public.shared_groups set name='forged',revision=revision+1$q$),'even owner direct DML denied');
select pg_temp.check_true(pg_temp.denied(12,$q$select public.facta_shared_command(gen_random_uuid(),'set_profile','{"user_id":"aaaaaaaa-0000-4000-8000-000000000001"}')$q$,'22023'),'actor injection rejected');
select pg_temp.check_true(pg_temp.command(12,'archive',jsonb_build_object('group_id',pg_temp.gid('waiting')))->>'code'='forbidden','stranger RPC cannot mutate group');
create view public.shared_test_nested with(security_invoker=true) as select * from public.shared_goal_round_scores;
grant select on public.shared_test_nested to authenticated;
select pg_temp.check_true(pg_temp.as_user(12,'select to_jsonb(count(*)) from public.shared_test_nested')='0','nested invoker view RLS');
set local role anon;
do $$ begin
  begin perform * from public.shared_groups; raise exception 'anon unexpectedly read'; exception when insufficient_privilege then null; end;
  begin perform public.facta_shared_command(gen_random_uuid(),'set_profile','{}'); raise exception 'anon unexpectedly executed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Separate archive scenario: a mid-first-round archive stays one round weeks
-- later. A waiting group archived before activation never acquires a round.
select pg_temp.set_clock('2026-10-14 13:00+03');
select pg_temp.draft(9,'early-archive'); select pg_temp.publish(9,'early-archive','2026-10-19'); select pg_temp.join_user(9,10,'early-archive');
select pg_temp.draft(9,'never-active'); select pg_temp.publish(9,'never-active','2026-10-19');
select pg_temp.set_clock('2026-10-21 12:00+03');
select pg_temp.command(9,'archive',jsonb_build_object('group_id',pg_temp.gid('early-archive')));
select pg_temp.command(9,'archive',jsonb_build_object('group_id',pg_temp.gid('never-active')));
select pg_temp.check_true(pg_temp.checkin(9,'early-archive','2026-10-21','2026-10-21 12:00+03')->>'code'='archived','archive cutoff itself rejected');
select pg_temp.set_clock('2026-11-16 10:00+03');
select pg_temp.check_true((select array_agg(round_start) from public.shared_goal_rounds where group_id=pg_temp.gid('early-archive'))=array['2026-10-19'::date],'first-round archive has exactly one historical round');
select pg_temp.check_true((select bool_and(activity_end='2026-10-21 12:00+03'::timestamptz and target=2 and end_reason='archived') from public.shared_goal_round_scores where group_id=pg_temp.gid('early-archive')),'first-round archive preserves targets and cutoff');
select pg_temp.check_true(not exists(select 1 from public.shared_goal_rounds where group_id=pg_temp.gid('never-active')),'archive before activation has no scores');
select pg_temp.draft(9,'discarded-draft');
select pg_temp.command(9,'archive',jsonb_build_object('group_id',pg_temp.gid('discarded-draft')));
select pg_temp.command(9,'leave',jsonb_build_object('group_id',pg_temp.gid('discarded-draft')));
select pg_temp.check_true(pg_temp.as_user(9,format('select to_jsonb(count(*)) from public.shared_groups where id=%L',pg_temp.gid('discarded-draft')))='0','discarded draft owner loses access after leaving');

-- Gym ratios, capped ties, personal average and effective target versions.
select pg_temp.set_clock('2026-10-14 13:30+03');
select pg_temp.draft(9,'instant-joins'); select pg_temp.publish(9,'instant-joins','2026-10-19');
select pg_temp.draft(9,'revision-stale');
select pg_temp.command(9,'issue_link',jsonb_build_object('group_id',pg_temp.gid('revision-stale')));
select pg_temp.check_true(pg_temp.command(9,'publish',jsonb_build_object('group_id',pg_temp.gid('revision-stale'),'expected_revision',1,'first_round_date','2026-10-19'))->>'code'='confirmation_required','correct date with stale revision requires confirmation');
select pg_temp.set_clock('2026-10-18 23:59:59.999999+03');
select pg_temp.join_user(9,10,'instant-joins');
select pg_temp.draft(9,'midnight-publication');
select pg_temp.set_clock('2026-10-19 00:00+03');
select pg_temp.check_true(pg_temp.publish(9,'midnight-publication','2026-10-19')->>'code'='confirmation_required','publication crossing midnight proposes following week');
select pg_temp.join_user(9,11,'instant-joins');
select pg_temp.set_clock('2026-10-19 00:00:00.000001+03');
select pg_temp.join_user(9,12,'instant-joins');
select pg_temp.check_true((select eligible_round='2026-10-19' from public.shared_memberships where group_id=pg_temp.gid('instant-joins') and user_id='aaaaaaaa-0000-4000-8000-000000000010'),'join one microsecond before boundary eligible now');
select pg_temp.check_true((select bool_and(eligible_round='2026-10-26') from public.shared_memberships where group_id=pg_temp.gid('instant-joins') and user_id in ('aaaaaaaa-0000-4000-8000-000000000011','aaaaaaaa-0000-4000-8000-000000000012')),'join at/after boundary eligible next');
select pg_temp.check_true((select roster_size=2 from public.shared_goal_rounds where group_id=pg_temp.gid('instant-joins')),'boundary roster excludes both late acceptances');
select pg_temp.set_clock('2026-10-14 13:40+03');
select pg_temp.draft(7,'cutoff-tie'); select pg_temp.publish(7,'cutoff-tie','2026-10-19'); select pg_temp.join_user(7,8,'cutoff-tie');
select pg_temp.set_clock('2026-10-21 12:00+03');
select pg_temp.command(8,'leave',jsonb_build_object('group_id',pg_temp.gid('cutoff-tie')));
select pg_temp.command(7,'archive',jsonb_build_object('group_id',pg_temp.gid('cutoff-tie')));
select pg_temp.check_true((select end_reason='archived' and activity_end='2026-10-21 12:00+03'::timestamptz from public.shared_goal_rounds where group_id=pg_temp.gid('cutoff-tie')),'archive wins exact pause cutoff tie');

select pg_temp.set_clock('2026-10-14 14:00+03');
select pg_temp.draft(9,'ratios'); select pg_temp.publish(9,'ratios','2026-10-19');
select pg_temp.join_user(9,10,'ratios',2); select pg_temp.join_user(9,11,'ratios',3); select pg_temp.join_user(9,12,'ratios',7);
select pg_temp.set_clock('2026-10-25 20:00+03');
select pg_temp.check_true((select count(*) from public.shared_goal_round_scores where group_id=pg_temp.gid('ratios') and adherence_pct=0 and rank=1)=4,'all zero members tie');
select pg_temp.check_true((pg_temp.checkin(9,'ratios','2026-10-19','2026-10-19 12:00+03')->>'ok')::boolean,'ratio first day');
select pg_temp.check_true((select adherence_pct=50 and not is_at_least_70 from public.shared_goal_round_scores where group_id=pg_temp.gid('ratios') and handle='tester_9'),'one of two is 50');
select pg_temp.check_true((pg_temp.checkin(who,'ratios',date '2026-10-19'+d,(date '2026-10-19'+d)::timestamp at time zone 'Asia/Riyadh')->>'ok')::boolean,'ratio day '||who||':'||d)
  from (values(9,1),(9,2),(10,0),(10,1),(11,0),(11,1),(12,0),(12,1),(12,2),(12,3),(12,4)) v(who,d);
select pg_temp.check_true((select count(*) from public.shared_goal_round_scores where group_id=pg_temp.gid('ratios') and adherence_pct=100 and rank=1)=2,'over-target gives no extra rank');
select pg_temp.check_true((select completed_days=3 and target=2 and adherence_pct=100 from public.shared_goal_round_scores where group_id=pg_temp.gid('ratios') and handle='tester_9'),'three of two capped');
select pg_temp.check_true((select abs(adherence_pct-200::numeric/3)<0.000001 and not is_at_least_70 and rank=4 from public.shared_goal_round_scores where group_id=pg_temp.gid('ratios') and handle='tester_11'),'two of three below 70');
select pg_temp.check_true((select abs(adherence_pct-500::numeric/7)<0.000001 and is_at_least_70 and rank=3 from public.shared_goal_round_scores where group_id=pg_temp.gid('ratios') and handle='tester_12'),'five of seven above 70');
select pg_temp.check_true((select bool_and(abs(group_average_pct-(100+100+200::numeric/3+500::numeric/7)/4)<0.000001) from public.shared_goal_round_scores where group_id=pg_temp.gid('ratios')),'average of capped personal ratios');
select pg_temp.check_true(pg_temp.command(9,'set_target',jsonb_build_object('group_id',pg_temp.gid('ratios'),'target',6))->>'effective_round'='2026-10-26','target effective next round');
select pg_temp.check_true(pg_temp.command(9,'set_target',jsonb_build_object('group_id',pg_temp.gid('ratios'),'target',null))->>'target'='2','cancel pending target restores prior value');
select pg_temp.check_true(pg_temp.command(9,'set_target',jsonb_build_object('group_id',pg_temp.gid('ratios'),'target',4))->>'target'='4','replace pending target');
select pg_temp.check_true((select target=2 from public.shared_goal_round_scores where group_id=pg_temp.gid('ratios') and handle='tester_9'),'history target remains two');
select pg_temp.set_clock('2026-10-26 00:00+03');
select pg_temp.check_true((select target=4 from public.shared_goal_round_scores where group_id=pg_temp.gid('ratios') and round_start='2026-10-26' and handle='tester_9'),'new target applies at exact boundary');
select pg_temp.check_true(pg_temp.checkin(9,'ratios','2026-10-18','2026-10-18 12:00+03')->>'code'='invalid_date','eight-day replay rejected');
select pg_temp.check_true((pg_temp.checkin(9,'ratios','2026-10-19','2026-10-19 12:00+03')->>'ok')::boolean,'seven-day replay allowed');
select pg_temp.check_true(pg_temp.checkin(9,'ratios','2026-10-26','2026-10-26 00:00:00.000001+03')->>'code'='invalid_date','future capture even one microsecond rejected');
select pg_temp.check_true(pg_temp.checkin(9,'ratios','2026-10-25','2026-10-26 00:00+03')->>'code'='invalid_date','capture cannot move to another date');
insert into sg_fixture values('rejected_id',jsonb_build_object('id',gen_random_uuid()));
insert into sg_fixture values('rejected_body',jsonb_build_object('group_id',pg_temp.gid('ratios'),'membership_id',(select id from public.shared_memberships where group_id=pg_temp.gid('ratios') and user_id='aaaaaaaa-0000-4000-8000-000000000009'),'date','2026-10-27','captured_at','2026-10-27 10:00+03','completed',true,'base_revision',0));
select pg_temp.check_true(pg_temp.command(9,'set_checkin',(select v from sg_fixture where k='rejected_body'),(select (v->>'id')::uuid from sg_fixture where k='rejected_id'))->>'code'='invalid_date','future intent rejection recorded');
select pg_temp.set_clock('2026-10-27 12:00+03');
select pg_temp.check_true(pg_temp.command(9,'set_checkin',(select v from sg_fixture where k='rejected_body'),(select (v->>'id')::uuid from sg_fixture where k='rejected_id'))->>'code'='invalid_date','rejected receipt does not become a later write');
select pg_temp.check_true(pg_temp.command(9,'set_checkin',(select v||'{"completed":false}'::jsonb from sg_fixture where k='rejected_body'),(select (v->>'id')::uuid from sg_fixture where k='rejected_id'))->>'code'='command_mismatch','rejected command UUID also binds immutable body');

-- Custom's common denominator; specific weekdays reject rest-day captures.
select pg_temp.set_clock('2026-10-14 15:00+03');
select pg_temp.draft(10,'every','custom','every'); select pg_temp.publish(10,'every','2026-10-19'); select pg_temp.join_user(10,11,'every',null);
select pg_temp.draft(10,'specific','custom','days','[1,3,5]'); select pg_temp.publish(10,'specific','2026-10-19'); select pg_temp.join_user(10,11,'specific',null);
select pg_temp.draft(10,'frequency','custom','n','[]',4); select pg_temp.publish(10,'frequency','2026-10-19'); select pg_temp.join_user(10,11,'frequency',null);
select pg_temp.set_clock('2026-10-20 12:00+03');
select pg_temp.check_true((select bool_and(target=7) from public.shared_goal_round_scores where group_id=pg_temp.gid('every')),'every-day common target seven');
select pg_temp.check_true((select bool_and(target=3) from public.shared_goal_round_scores where group_id=pg_temp.gid('specific')),'weekday common target three');
select pg_temp.check_true((select bool_and(target=4) from public.shared_goal_round_scores where group_id=pg_temp.gid('frequency')),'frequency common target four');
select pg_temp.check_true(pg_temp.checkin(10,'specific','2026-10-20','2026-10-20 11:00+03')->>'code'='rest_day','specific rest day rejected');
select pg_temp.check_true((pg_temp.checkin(10,'specific','2026-10-19','2026-10-19 11:00+03')->>'ok')::boolean,'scheduled weekday accepted');
select pg_temp.check_true(pg_temp.command(11,'set_target',jsonb_build_object('group_id',pg_temp.gid('specific'),'target',3))->>'code'='not_applicable','custom personal target unavailable');

-- Invite privacy, direct reservations, one-time token delivery and exact TTL.
select pg_temp.set_clock('2026-10-14 16:00+03');
select pg_temp.draft(8,'invitations');
insert into sg_fixture values('direct',pg_temp.command(8,'invite',jsonb_build_object('group_id',pg_temp.gid('invitations'),'handle','tester_7')));
select pg_temp.check_true((select v->>'code' from sg_fixture where k='direct')='invite_issued','direct invite reserves seat');
select pg_temp.check_true(pg_temp.as_user(7,'select to_jsonb(count(*)) from public.shared_groups where name=''invitations''')='0','draft invitee cannot read group');
select pg_temp.check_true((pg_temp.as_user(7,format('select public.facta_shared_preview(%L)',(select v->>'token' from sg_fixture where k='direct')))->>'published')='false','draft invitee sees limited pending preview');
select pg_temp.check_true(pg_temp.as_user(6,format('select public.facta_shared_preview(%L)',(select v->>'token' from sg_fixture where k='direct')))->>'code'='invalid_invite','wrong recipient token rejected');
select pg_temp.check_true(not (pg_temp.as_user(7,format('select public.facta_shared_preview(%L)',(select v->>'token' from sg_fixture where k='direct'))) ?| array['memberships','profiles','targets','scores','token']),'preview has no roster or secrets');
select pg_temp.check_true(pg_temp.as_user(7,'select to_jsonb(jsonb_array_length(public.facta_shared_pending_invites()))')='1','recipient sees pending invitation');
select pg_temp.check_true(pg_temp.command(7,'join',jsonb_build_object('invite_id',(select v->>'invite_id' from sg_fixture where k='direct'),'target',2))->>'code'='not_published','draft cannot be joined');
select pg_temp.publish(8,'invitations','2026-10-19');
select pg_temp.check_true(pg_temp.command(8,'invite',jsonb_build_object('group_id',pg_temp.gid('invitations'),'handle','tester_7'))->>'code'='already_invited','no duplicate reservation');
select pg_temp.check_true(pg_temp.command(6,'join',jsonb_build_object('invite_id',(select v->>'invite_id' from sg_fixture where k='direct'),'target',2))->>'code'='invalid_invite','invite-id guessing cannot join');
select pg_temp.check_true(pg_temp.command(7,'join',jsonb_build_object('invite_id',(select v->>'invite_id' from sg_fixture where k='direct'),'target',3))->>'code'='joined','intended recipient joins by id');
select pg_temp.check_true((select state='accepted' from public.shared_invites where id=(select (v->>'invite_id')::uuid from sg_fixture where k='direct')),'reservation consumed atomically');
insert into sg_fixture values('secret_command',jsonb_build_object('id',gen_random_uuid()));
insert into sg_fixture values('generic',pg_temp.command(8,'issue_link',jsonb_build_object('group_id',pg_temp.gid('invitations')),(select (v->>'id')::uuid from sg_fixture where k='secret_command')));
select pg_temp.check_true(not (pg_temp.command(8,'issue_link',jsonb_build_object('group_id',pg_temp.gid('invitations')),(select (v->>'id')::uuid from sg_fixture where k='secret_command')) ? 'token'),'receipt retry never returns raw token');
select pg_temp.check_true((select token_digest=sha256(convert_to((select v->>'token' from sg_fixture where k='generic'),'UTF8')) and octet_length(token_digest)=32 from facta_private.shared_invite_tokens where invite_id=(select (v->>'invite_id')::uuid from sg_fixture where k='generic')),'only digest persisted');
insert into sg_fixture values('rotated',pg_temp.command(8,'rotate_invite',jsonb_build_object('invite_id',(select v->>'invite_id' from sg_fixture where k='generic'))));
select pg_temp.check_true(pg_temp.as_user(6,format('select public.facta_shared_preview(%L)',(select v->>'token' from sg_fixture where k='generic')))->>'code'='invalid_invite','old token invalid after rotation');
select pg_temp.check_true((pg_temp.as_user(6,format('select public.facta_shared_preview(%L)',(select v->>'token' from sg_fixture where k='rotated')))->>'ok')::boolean,'rotated token previews');
select pg_temp.command(8,'revoke_invite',jsonb_build_object('invite_id',(select v->>'invite_id' from sg_fixture where k='generic')));
select pg_temp.check_true(pg_temp.command(6,'join',jsonb_build_object('token',(select v->>'token' from sg_fixture where k='rotated'),'target',2))->>'code'='invalid_invite','revoked token rejected');
insert into sg_fixture values('expires',pg_temp.command(8,'issue_link',jsonb_build_object('group_id',pg_temp.gid('invitations'))));
select pg_temp.set_clock('2026-10-21 15:59:59.999999+03');
select pg_temp.check_true((pg_temp.as_user(6,format('select public.facta_shared_preview(%L)',(select v->>'token' from sg_fixture where k='expires')))->>'ok')::boolean,'one microsecond before TTL valid');
select pg_temp.set_clock('2026-10-21 16:00+03');
select pg_temp.check_true(pg_temp.command(6,'join',jsonb_build_object('token',(select v->>'token' from sg_fixture where k='expires'),'target',2))->>'code'='expired','TTL exact end excluded');

-- All seven anchor weekdays, leap/year boundaries and group-local midnight.
select pg_temp.set_clock('2026-10-14 17:00+03');
select pg_temp.draft(5,'reserved'); select pg_temp.publish(5,'reserved','2026-10-19');
select pg_temp.check_true(pg_temp.command(5,'invite',jsonb_build_object('group_id',pg_temp.gid('reserved'),'handle','tester_'||n))->>'code'='invite_issued','reserved seat '||n) from generate_series(6,12) n;
select pg_temp.check_true(facta_private.sg_used(pg_temp.gid('reserved'),'2026-10-14 17:00+03')=8,'owner plus seven reservations fills capacity');
select pg_temp.check_true(pg_temp.command(5,'invite',jsonb_build_object('group_id',pg_temp.gid('reserved'),'handle','tester_4'))->>'code'='full','ninth reserved person rejected');
insert into sg_fixture values('reserved_link',pg_temp.command(5,'issue_link',jsonb_build_object('group_id',pg_temp.gid('reserved'))));
select pg_temp.check_true(pg_temp.command(4,'join',jsonb_build_object('token',(select v->>'token' from sg_fixture where k='reserved_link'),'target',2))->>'code'='full','generic link reserves no seat');
select pg_temp.check_true(pg_temp.command(6,'join',jsonb_build_object('token',(select v->>'token' from sg_fixture where k='reserved_link'),'target',2))->>'code'='joined','own reservation consumed when joining via generic link');
select pg_temp.check_true(facta_private.sg_used(pg_temp.gid('reserved'),'2026-10-14 17:00+03')=8,'membership replaces reservation');
select pg_temp.check_true(pg_temp.command(7,'decline_invite',jsonb_build_object('invite_id',(select id from public.shared_invites where group_id=pg_temp.gid('reserved') and recipient_id='aaaaaaaa-0000-4000-8000-000000000007')))->>'code'='declined','recipient can decline');
select pg_temp.check_true(pg_temp.command(4,'join',jsonb_build_object('token',(select v->>'token' from sg_fixture where k='reserved_link'),'target',2))->>'code'='joined','decline frees reserved seat');
select pg_temp.check_true(pg_temp.command(5,'leave',jsonb_build_object('group_id',pg_temp.gid('reserved')))->>'code'='owner_transfer_required','owner cannot silently disappear');

-- Old epoch intents cannot be replayed through a later membership; an exact
-- committed receipt remains acknowledgement-only after leaving and rejoining.
select pg_temp.draft(5,'epochs'); select pg_temp.publish(5,'epochs','2026-10-19'); select pg_temp.join_user(5,4,'epochs');
insert into sg_fixture values('epoch_member',jsonb_build_object('id',(select id from public.shared_memberships where group_id=pg_temp.gid('epochs') and user_id='aaaaaaaa-0000-4000-8000-000000000004')));
insert into sg_fixture values('epoch_command',jsonb_build_object('id',gen_random_uuid()));
insert into sg_fixture values('epoch_body',jsonb_build_object('group_id',pg_temp.gid('epochs'),'membership_id',(select v->>'id' from sg_fixture where k='epoch_member'),'date','2026-10-19','captured_at','2026-10-19 10:00+03','completed',true,'base_revision',0));
select pg_temp.set_clock('2026-10-19 12:00+03');
select pg_temp.check_true(pg_temp.command(4,'set_checkin',(select v from sg_fixture where k='epoch_body'),(select (v->>'id')::uuid from sg_fixture where k='epoch_command'))->>'code'='checked','old epoch committed');
select pg_temp.set_clock('2026-10-20 12:00+03'); select pg_temp.command(4,'leave',jsonb_build_object('group_id',pg_temp.gid('epochs')));
select pg_temp.set_clock('2026-10-21 12:00+03'); select pg_temp.join_user(5,4,'epochs');
select pg_temp.check_true(pg_temp.command(4,'set_checkin',(select v from sg_fixture where k='epoch_body'))->>'code'='membership_changed','old epoch new command rejected');
select pg_temp.check_true(pg_temp.command(4,'set_checkin',(select v from sg_fixture where k='epoch_body'),(select (v->>'id')::uuid from sg_fixture where k='epoch_command'))->>'code'='checked','old committed receipt can only acknowledge');
select pg_temp.check_true(pg_temp.checkin(4,'epochs','2026-10-19','2026-10-19 10:00+03')->>'code'='inactive_period','new epoch cannot adopt old capture');
select pg_temp.set_clock('2026-10-26 00:00+03');
select pg_temp.command(4,'leave',jsonb_build_object('group_id',pg_temp.gid('epochs')));
select pg_temp.check_true(not exists(select 1 from public.shared_goal_rounds where group_id=pg_temp.gid('epochs') and round_start='2026-10-26'),'leave exactly at boundary excludes epoch and prevents resume');

select pg_temp.check_true(extract(dow from facta_private.sg_next_start('2026-12-31 23:30+00','Pacific/Kiritimati',d))=d
  and facta_private.sg_next_start('2026-12-31 23:30+00','Pacific/Kiritimati',d)>date '2027-01-01','anchor weekday '||d) from generate_series(0,6) d;
select pg_temp.check_true(facta_private.sg_next_start('2024-02-28 23:30+00','Asia/Riyadh',4)='2024-03-07','leap-day same-weekday uses following boundary');
select pg_temp.check_true(facta_private.sg_next_start('2026-10-18 23:30+00','Asia/Riyadh',1)='2026-10-26','publication uses group date beyond UTC midnight');
select pg_temp.set_clock('2026-10-28 10:00-04');
select pg_temp.draft(6,'fall-dst','custom','every','[]',null,'America/New_York',0);
select pg_temp.publish(6,'fall-dst','2026-11-01'); select pg_temp.join_user(6,7,'fall-dst',null);
select pg_temp.set_clock('2026-11-02 10:00-05');
select pg_temp.check_true((select scheduled_end-activity_start=interval '169 hours' from public.shared_goal_rounds where group_id=pg_temp.gid('fall-dst')),'fall fold round has 169 hours');
select pg_temp.check_true((pg_temp.checkin(6,'fall-dst','2026-11-01','2026-11-01 01:30-04')->>'ok')::boolean,'first fold instant');
select pg_temp.check_true((pg_temp.checkin(6,'fall-dst','2026-11-01','2026-11-01 01:30-05')->>'ok')::boolean,'second fold instant same state');
select pg_temp.check_true((select count(*) from public.shared_checkins where group_id=pg_temp.gid('fall-dst'))=1,'fold does not duplicate a day');
select pg_temp.set_clock('2026-03-04 10:00-05');
select pg_temp.draft(6,'spring-dst','custom','every','[]',null,'America/New_York',0);
select pg_temp.publish(6,'spring-dst','2026-03-08'); select pg_temp.join_user(6,7,'spring-dst',null);
select pg_temp.set_clock('2026-03-09 10:00-04');
select pg_temp.check_true((select scheduled_end-activity_start=interval '167 hours' from public.shared_goal_rounds where group_id=pg_temp.gid('spring-dst')),'spring gap round has 167 hours');

-- Read RPC uses invoker RLS; no shared data leaks through a definer snapshot.
select pg_temp.check_true(pg_temp.as_user(4,format('select to_jsonb(count(*)) from jsonb_array_elements(public.facta_shared_snapshot(''2026-10-01'',''2026-11-30'')->''groups'') g where g->>''id''=%L',pg_temp.gid('lifecycle')))='0','snapshot removes departed group');
select pg_temp.check_true(pg_temp.denied(3,$q$select public.facta_shared_snapshot('2020-01-01','2026-11-30')$q$,'22023'),'snapshot rejects unbounded history');

-- Rate budget is persisted even on rejected application-level requests.
select pg_temp.set_clock('2026-12-01 10:00+03');
select pg_temp.check_true(pg_temp.as_user(4,$q$select public.facta_shared_preview('invalid')$q$)->>'code'='invalid_invite','bad token budget '||n) from generate_series(1,10) n;
select pg_temp.check_true(pg_temp.as_user(4,$q$select public.facta_shared_preview('invalid')$q$)->>'code'='rate_limited','eleventh failed redeem limited');
select pg_temp.set_clock('2026-12-01 10:01+03');
select pg_temp.check_true(pg_temp.as_user(4,$q$select public.facta_shared_preview('invalid')$q$)->>'code'='invalid_invite','next rate bucket opens');
select pg_temp.set_clock('2026-12-02 10:00+03');
select pg_temp.check_true(pg_temp.command(8,'invite',jsonb_build_object('group_id',pg_temp.gid('invitations'),'handle','no_such_user'))->>'code'='not_found','handle lookup budget '||n) from generate_series(1,10) n;
select pg_temp.check_true(pg_temp.command(8,'invite',jsonb_build_object('group_id',pg_temp.gid('invitations'),'handle','no_such_user'))->>'code'='rate_limited','eleventh handle lookup limited');
select pg_temp.set_clock('2026-12-03 10:00+03');
select pg_temp.check_true(pg_temp.command(8,'issue_link',jsonb_build_object('group_id',pg_temp.gid('invitations')))->>'code'='invite_issued','issue budget '||n) from generate_series(1,20) n;
select pg_temp.check_true(pg_temp.command(8,'issue_link',jsonb_build_object('group_id',pg_temp.gid('invitations')))->>'code'='rate_limited','twenty-first issued link limited');

select pg_temp.check_true(not has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE') and not has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE'),'API DML privileges absent on '||t)
  from unnest(array['shared_profiles','shared_groups','shared_memberships','shared_targets','shared_invites','shared_checkins']) t;
select pg_temp.check_true(pg_temp.denied(9,$q$select public.facta_shared_command(gen_random_uuid(),'create_draft','{"name":"bad","template":"gym","schedule_kind":"n","time_zone":"UTC","round_weekday":1,"target":1}')$q$,'23514'),'gym minimum two enforced');
select pg_temp.check_true(pg_temp.denied(9,$q$select public.facta_shared_command(gen_random_uuid(),'create_draft','{"name":"bad","template":"custom","schedule_kind":"n","times_per_week":8,"time_zone":"UTC","round_weekday":1}')$q$,'23514'),'custom frequency cap enforced');
select pg_temp.check_true(pg_temp.denied(9,$q$select public.facta_shared_command(gen_random_uuid(),'create_draft','{"name":"bad","template":"custom","schedule_kind":"days","weekdays":[1,1],"time_zone":"UTC","round_weekday":1}')$q$,'23514'),'duplicate weekdays rejected');
select pg_temp.check_true(pg_temp.denied(9,$q$select public.facta_shared_command(gen_random_uuid(),'create_draft','{"name":"bad","template":"custom","schedule_kind":"days","weekdays":[],"time_zone":"UTC","round_weekday":1}')$q$,'23514'),'empty weekday schedule rejected');
select pg_temp.check_true(pg_temp.denied(9,$q$select public.facta_shared_command(gen_random_uuid(),'create_draft','{"name":"bad","template":"gym","schedule_kind":"n","time_zone":"Bad/Zone","round_weekday":1,"target":2}')$q$,'23514'),'invalid IANA zone rejected on draft');
select pg_temp.check_true(pg_temp.denied(9,$q$select public.facta_shared_command(gen_random_uuid(),'set_profile',jsonb_build_object('handle','tester_9','display_name',repeat('x',8200)))$q$,'22023'),'oversized command envelope rejected');

-- Monotone server revisions and sticky administrative tombstones, independent
-- of the personal full-row sync guard. Public clients have no deletion RPC.
insert into auth.users(id) values('aaaaaaaa-0000-4000-8000-000000000013');
select pg_temp.check_true(pg_temp.command(13,'set_profile','{"handle":"tester_13","display_name":"Original"}')->>'code'='profile_saved','guard fixture profile');
update public.shared_profiles set display_name='stale',revision=0 where handle='tester_13';
select pg_temp.check_true((select display_name='Original' and revision=1 from public.shared_profiles where handle='tester_13'),'stale revision ignored');
insert into sg_fixture values('profile_updated',jsonb_build_object('at',(select updated_at from public.shared_profiles where handle='tester_13')));
update public.shared_profiles set display_name='New',revision=2 where handle='tester_13';
select pg_temp.check_true((select updated_at>(select (v->>'at')::timestamptz from sg_fixture where k='profile_updated') from public.shared_profiles where handle='tester_13'),'updated_at advances even with unchanged clock');
update public.shared_profiles set deleted_at='2026-12-03 10:00+03',revision=3 where handle='tester_13';
update public.shared_profiles set deleted_at=null,display_name='resurrected',revision=4 where handle='tester_13';
select pg_temp.check_true((select deleted_at is not null and display_name='New' and revision=3 from public.shared_profiles where handle='tester_13'),'tombstone cannot resurrect');

-- Constraints and guard protections are tested on actual tables, not source text.
do $$ begin
  begin update public.shared_groups set time_zone='No/Such_Zone',revision=revision+1 where id=pg_temp.gid('stale'); raise exception 'invalid zone accepted'; exception when check_violation then null; end;
  begin update public.shared_groups set first_round_date='2026-11-02',revision=revision+1 where id=pg_temp.gid('stale'); raise exception 'anchor edited'; exception when check_violation then null; end;
  begin update public.shared_memberships set eligible_round=eligible_round+7,revision=revision+1 where group_id=pg_temp.gid('lifecycle'); raise exception 'eligibility edited'; exception when check_violation then null; end;
  begin update public.shared_checkins set checkin_date=checkin_date+1,revision=revision+1; raise exception 'day edited'; exception when check_violation then null; end;
  begin update public.shared_profiles set handle='other_handle',revision=revision+1 where handle='tester_1'; raise exception 'handle edited'; exception when check_violation then null; end;
  begin delete from public.shared_checkins; raise exception 'permanent delete accepted'; exception when check_violation then null; end;
end $$;
set constraints all immediate;
set constraints all deferred;
select set_config('shared_test.checkins',(select count(*)::text from public.shared_checkins),true);
select set_config('shared_test.memberships',(select count(*)::text from public.shared_memberships),true);
select set_config('shared_test.receipts',(select count(*)::text from facta_private.shared_command_receipts),true);
