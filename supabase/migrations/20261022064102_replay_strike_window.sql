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
    on conflict(subject_key) do update set violation_count=case when gzjump_blocks.reason='replay_score_mismatch' and gzjump_blocks.updated_at>=clock_timestamp()-interval '24 hours' then gzjump_blocks.violation_count+1 else 1 end,
      blocked_until=case when gzjump_blocks.reason='replay_score_mismatch' and gzjump_blocks.updated_at>=clock_timestamp()-interval '24 hours' and gzjump_blocks.violation_count+1>=3 then clock_timestamp()+interval '24 hours' else gzjump_blocks.blocked_until end,
      updated_at=clock_timestamp(),reason='replay_score_mismatch';
  end loop;
end;
$$;
revoke all on function public.gzjump_replay_violation(uuid) from public,anon,authenticated;
grant execute on function public.gzjump_replay_violation(uuid) to service_role;
