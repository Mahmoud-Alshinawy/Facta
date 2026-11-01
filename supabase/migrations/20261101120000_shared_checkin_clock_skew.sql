-- Shared check-ins: tolerate a device clock up to 5 minutes ahead of the server.
-- Re-runnable. Replaces sg_execute_command from 20261024160000_shared_goals.sql;
-- only the set_checkin capture check differs. Grants and the receipt wrapper are
-- unchanged. Run this again if that older migration is ever re-applied.
--
-- Known limit: within 5 minutes of group midnight, a device already past midnight
-- sends the new date while the server is still on the old one. That is refused
-- as invalid_date; the app shows it as not saved, and retrying works after midnight.
begin;
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
        -- Device clocks run a little ahead of the database. Up to 5 minutes is
        -- skew: the date rules still apply to the device's stamp, then the
        -- stored time is clamped to the server's, which gives no scoring gain.
        if captured is null or day_value is null or captured>at_time+interval '5 minutes' or (captured at time zone g.time_zone)::date<>day_value
          or day_value<(at_time at time zone g.time_zone)::date-7 or day_value>(at_time at time zone g.time_zone)::date then
          return jsonb_build_object('ok',false,'code','invalid_date'); end if;
        captured:=least(captured,at_time);
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
commit;
