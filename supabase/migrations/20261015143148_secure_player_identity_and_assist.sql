alter table public.gzjump_scores add column if not exists player_key text;
update public.gzjump_scores set player_key = 'legacy-' || id::text where player_key is null;
alter table public.gzjump_scores alter column player_key set not null;
alter table public.gzjump_scores add constraint gzjump_scores_player_key_valid check (player_key ~ '^[a-f0-9]{64}$' or player_key like 'legacy-%');
alter table public.gzjump_scores add column if not exists assist boolean not null default false;
alter table public.gzjump_scores add constraint gzjump_scores_no_assist check (assist = false);
create index if not exists gzjump_scores_player_leaderboard on public.gzjump_scores(player_key, mode, day, score desc) where status = 'approved';

drop function if exists public.gzjump_submit(text, jsonb);
create function public.gzjump_submit(p_fingerprint text, p_player_key text, p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_minute timestamptz := date_trunc('minute', v_now);
  v_day date := (v_now at time zone 'UTC')::date;
  v_id uuid := (p_payload->>'id')::uuid;
  v_quota gzjump_private.upload_limits%rowtype;
begin
  if p_fingerprint !~ '^[a-f0-9]{64}$' or p_player_key !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_FINGERPRINT'; end if;
  if coalesce((p_payload->>'assist')::boolean, true) then raise exception 'AIM_ASSIST_NOT_ALLOWED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));
  select * into v_quota from gzjump_private.upload_limits where fingerprint = p_fingerprint and day = v_day;
  if found and (v_quota.day_count >= 100 or (v_quota.minute_start = v_minute and v_quota.minute_count >= 10)
      or v_now - v_quota.last_at < interval '3 seconds') then raise exception 'RATE_LIMITED'; end if;
  insert into public.gzjump_scores(id, player_key, player_name, score, jumps, perfect, combo, mode, day, fruit, duration_ms, assist)
    values(v_id, p_player_key, p_payload->>'player_name', (p_payload->>'score')::integer, (p_payload->>'jumps')::integer,
      (p_payload->>'perfect')::integer, (p_payload->>'combo')::integer, p_payload->>'mode',
      (p_payload->>'day')::date, p_payload->>'fruit', (p_payload->>'duration_ms')::integer, false)
    on conflict (id) do nothing;
  insert into gzjump_private.upload_limits values (p_fingerprint, v_day, v_minute, 1, 1, v_now)
    on conflict (fingerprint, day) do update set
      minute_count = case when upload_limits.minute_start = v_minute then upload_limits.minute_count + 1 else 1 end,
      minute_start = v_minute, day_count = upload_limits.day_count + 1, last_at = v_now;
  delete from gzjump_private.upload_limits where day < v_day - 2;
  return v_id;
end;
$$;
revoke all on function public.gzjump_submit(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.gzjump_submit(text,text,jsonb) to service_role;

drop view if exists public.gzjump_leaderboard;
create view public.gzjump_leaderboard with (security_invoker = true) as
select player_name, score, jumps, fruit, mode, day, created_at
from (
  select s.*, row_number() over (
    partition by player_key, mode, day order by score desc, created_at asc
  ) as user_rank
  from public.gzjump_scores s
  where s.status = 'approved' and s.assist = false
) ranked
where user_rank = 1;
grant select on public.gzjump_leaderboard to anon, authenticated;
