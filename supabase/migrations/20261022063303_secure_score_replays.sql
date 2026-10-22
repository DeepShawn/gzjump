-- Only the safe leaderboard projection is public. Source rows remain admin-only.
revoke all on public.gzjump_scores from public,anon;
drop policy if exists scores_public_read on public.gzjump_scores;
create table public.gzjump_public_scores (
  entry_key text primary key,
  player_name text not null,
  score integer not null,
  jumps integer not null,
  fruit text not null,
  mode text not null,
  day date not null,
  created_at timestamptz not null
);
alter table public.gzjump_public_scores enable row level security;
revoke all on public.gzjump_public_scores from public, anon, authenticated;
grant select(player_name, score, jumps, fruit, mode, day, created_at) on public.gzjump_public_scores to anon, authenticated;
grant all on public.gzjump_public_scores to service_role;
create policy public_leaderboard_read on public.gzjump_public_scores for select to anon, authenticated using (true);
create index gzjump_public_scores_ranking on public.gzjump_public_scores(mode, day, score desc, created_at);
create index gzjump_scores_identity_best on public.gzjump_scores((coalesce(auth_user_id::text, player_key)), mode, day, score desc, created_at) where status='approved' and not assist;
create or replace function gzjump_private.refresh_public_score(p_identity text, p_mode text, p_day date)
returns void language plpgsql security invoker set search_path='' as $$
declare v_key text := encode(sha256(convert_to(p_identity || ':' || p_mode || ':' || p_day::text, 'UTF8')), 'hex');
begin
  perform pg_advisory_xact_lock(hashtextextended(v_key, 3));
  delete from public.gzjump_public_scores where entry_key=v_key;
  insert into public.gzjump_public_scores
  select v_key,player_name,score,jumps,fruit,mode,day,created_at
  from public.gzjump_scores
  where coalesce(auth_user_id::text,player_key)=p_identity and mode=p_mode and day=p_day and status='approved' and not assist
  order by score desc,created_at,id limit 1;
end;
$$;
revoke all on function gzjump_private.refresh_public_score(text,text,date) from public,anon,authenticated;
-- Trigger-only definer; no browser-callable privileged RPC and no metadata authorization.
create or replace function gzjump_private.sync_public_score()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op <> 'INSERT' then perform gzjump_private.refresh_public_score(coalesce(old.auth_user_id::text,old.player_key),old.mode,old.day); end if;
  if tg_op <> 'DELETE' then perform gzjump_private.refresh_public_score(coalesce(new.auth_user_id::text,new.player_key),new.mode,new.day); end if;
  return null;
end;
$$;
revoke all on function gzjump_private.sync_public_score() from public,anon,authenticated;
create trigger gzjump_public_projection after insert or update or delete on public.gzjump_scores for each row execute function gzjump_private.sync_public_score();
insert into public.gzjump_public_scores
select encode(sha256(convert_to(identity || ':' || mode || ':' || day::text,'UTF8')),'hex'),player_name,score,jumps,fruit,mode,day,created_at
from (
  select distinct on (coalesce(auth_user_id::text,player_key),mode,day)
    coalesce(auth_user_id::text,player_key) as identity,player_name,score,jumps,fruit,mode,day,created_at
  from public.gzjump_scores where status='approved' and not assist
  order by coalesce(auth_user_id::text,player_key),mode,day,score desc,created_at,id
) ranked;
create or replace view public.gzjump_leaderboard with (security_invoker=true) as
select player_name,score,jumps,fruit,mode,day,created_at from public.gzjump_public_scores;
revoke all on public.gzjump_leaderboard from public,anon,authenticated;
grant select on public.gzjump_leaderboard to anon,authenticated;

create table gzjump_private.run_sessions (
  id uuid primary key,
  token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
  seed bigint not null check(seed between 0 and 4294967295),
  auth_user_id uuid references auth.users(id) on delete cascade,
  player_key text not null check(player_key ~ '^[a-f0-9]{64}$'),
  account_key text,
  address_key text not null,
  mode text not null,
  variant text not null,
  fruit text not null,
  day date not null,
  rules_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
  consumed_at timestamptz,
  invalid boolean not null default false
);
alter table gzjump_private.run_sessions enable row level security;
revoke all on gzjump_private.run_sessions from public,anon,authenticated;
grant all on gzjump_private.run_sessions to service_role;
create index gzjump_run_expiration on gzjump_private.run_sessions(expires_at);
alter table public.gzjump_scores add column verification_version text not null default 'legacy';
alter table public.gzjump_scores add column run_id uuid unique references gzjump_private.run_sessions(id);
create table gzjump_private.request_limits (
  subject_key text not null,
  kind text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key(subject_key,kind,window_start)
);
alter table gzjump_private.request_limits enable row level security;
revoke all on gzjump_private.request_limits from public,anon,authenticated;
grant all on gzjump_private.request_limits to service_role;
create index gzjump_request_limits_retention on gzjump_private.request_limits(window_start);

create or replace function public.gzjump_gate(p_subjects jsonb,p_kind text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_item jsonb; v_window timestamptz; v_hits integer; v_minute integer; v_day integer; v_period text; v_limited boolean:=false;
begin
  if p_kind not in ('start','submit') or jsonb_array_length(p_subjects) not between 1 and 3 then raise exception 'INVALID_GATE'; end if;
  for v_item in select value from jsonb_array_elements(p_subjects) order by value->>'key' loop
    if v_item->>'key' !~ '^[a-f0-9]{64}$' or v_item->>'scope' not in ('address','device','account') then raise exception 'INVALID_SUBJECT'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_item->>'key',4));
    if exists(select 1 from public.gzjump_blocks where subject_key=v_item->>'key' and blocked_until>v_now) then return jsonb_build_object('allowed',false,'blocked',true); end if;
    v_minute:=case when v_item->>'scope'='address' then case when p_kind='start' then 120 else 60 end else case when p_kind='start' then 20 else 12 end end;
    v_day:=case when v_item->>'scope'='address' then 5000 else 1000 end;
    foreach v_period in array array['minute','day'] loop
      v_window:=date_trunc(v_period,v_now);
      insert into gzjump_private.request_limits values(v_item->>'key',p_kind||':'||v_period,v_window,1)
      on conflict(subject_key,kind,window_start) do update set hits=request_limits.hits+1 returning hits into v_hits;
      if v_hits>(case when v_period='minute' then v_minute else v_day end) then v_limited:=true; end if;
    end loop;
  end loop;
  delete from gzjump_private.request_limits where window_start<v_now-interval '2 days';
  return jsonb_build_object('allowed',not v_limited,'blocked',false);
end;
$$;
revoke all on function public.gzjump_gate(jsonb,text) from public,anon,authenticated;
grant execute on function public.gzjump_gate(jsonb,text) to service_role;

create or replace function public.gzjump_open_run(p_run jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_run gzjump_private.run_sessions%rowtype;
begin
  insert into gzjump_private.run_sessions(id,token_hash,seed,auth_user_id,player_key,account_key,address_key,mode,variant,fruit,day,rules_version)
  values((p_run->>'id')::uuid,p_run->>'token_hash',(p_run->>'seed')::bigint,(p_run->>'auth_user_id')::uuid,p_run->>'player_key',p_run->>'account_key',p_run->>'address_key',p_run->>'mode',p_run->>'variant',p_run->>'fruit',(p_run->>'day')::date,p_run->>'rules_version') returning * into v_run;
  return jsonb_build_object('created_at',v_run.created_at,'expires_at',v_run.expires_at);
end;
$$;
revoke all on function public.gzjump_open_run(jsonb) from public,anon,authenticated;
grant execute on function public.gzjump_open_run(jsonb) to service_role;
create or replace function public.gzjump_read_run(p_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select to_jsonb(r) from gzjump_private.run_sessions r where id=p_id; $$;
revoke all on function public.gzjump_read_run(uuid) from public,anon,authenticated;
grant execute on function public.gzjump_read_run(uuid) to service_role;

create or replace function public.gzjump_commit_run(p_id uuid,p_hash text,p_player text,p_user uuid,p_result jsonb,p_approved boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r gzjump_private.run_sessions%rowtype; v_status text; v_duration integer;
begin
  select * into r from gzjump_private.run_sessions where id=p_id for update;
  if not found or r.token_hash<>p_hash or r.player_key<>p_player or (r.auth_user_id is not null and r.auth_user_id is distinct from p_user) then raise exception 'INVALID_RUN'; end if;
  if r.invalid then raise exception 'INVALID_RUN'; end if;
  if r.consumed_at is not null then
    select status into v_status from public.gzjump_scores where run_id=p_id;
    if v_status is null then raise exception 'INVALID_RUN'; end if;
    return jsonb_build_object('id',p_id,'status',v_status,'duplicate',true);
  end if;
  if r.expires_at<clock_timestamp() then raise exception 'RUN_EXPIRED'; end if;
  if exists(select 1 from public.gzjump_blocks where subject_key in (r.player_key,r.account_key,r.address_key) and blocked_until>clock_timestamp()) then raise exception 'BLOCKED'; end if;
  v_duration:=floor(extract(epoch from clock_timestamp()-r.created_at)*1000)::integer;
  if v_duration+250<(p_result->>'minimum_ms')::numeric then raise exception 'RUN_TOO_FAST'; end if;
  v_status:=case when p_approved and r.auth_user_id is not null then 'approved' else 'pending' end;
  insert into public.gzjump_scores(id,player_key,auth_user_id,player_name,score,jumps,perfect,combo,mode,day,fruit,duration_ms,assist,status,risk_flags,risk_score,verification_version,run_id)
  values(p_id,r.player_key,r.auth_user_id,p_result->>'player_name',(p_result->>'score')::integer,(p_result->>'jumps')::integer,(p_result->>'perfect')::integer,(p_result->>'combo')::integer,r.mode,r.day,r.fruit,greatest(v_duration,600),false,v_status,case when v_status='approved' then '{}'::text[] else array['guest_review'] end,0,r.rules_version,p_id);
  update gzjump_private.run_sessions set consumed_at=clock_timestamp() where id=p_id;
  return jsonb_build_object('id',p_id,'status',v_status);
end;
$$;
revoke all on function public.gzjump_commit_run(uuid,text,text,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.gzjump_commit_run(uuid,text,text,uuid,jsonb,boolean) to service_role;

create or replace function public.gzjump_replay_violation(p_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare r gzjump_private.run_sessions%rowtype; v_key text;
begin
  select * into r from gzjump_private.run_sessions where id=p_id for update;
  if not found or r.invalid or r.consumed_at is not null then return; end if;
  update gzjump_private.run_sessions set invalid=true where id=p_id;
  insert into public.gzjump_security_events(subject_key,auth_user_id,flags) values(r.player_key,r.auth_user_id,array['replay_score_mismatch']);
  -- No IP-wide punishment: shared Wi-Fi users must not inherit another user's strikes.
  for v_key in select distinct k from unnest(array[r.player_key,r.account_key]) k where k is not null order by k loop
    insert into public.gzjump_blocks(subject_key,violation_count,blocked_until,reason)
    values(v_key,1,null,'replay_score_mismatch')
    on conflict(subject_key) do update set violation_count=gzjump_blocks.violation_count+1,
      blocked_until=case when gzjump_blocks.violation_count+1>=3 then clock_timestamp()+interval '24 hours' else gzjump_blocks.blocked_until end,
      updated_at=clock_timestamp(),reason='replay_score_mismatch';
  end loop;
end;
$$;
revoke all on function public.gzjump_replay_violation(uuid) from public,anon,authenticated;
grant execute on function public.gzjump_replay_violation(uuid) to service_role;
notify pgrst,'reload schema';
