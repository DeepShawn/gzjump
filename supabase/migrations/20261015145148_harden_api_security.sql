-- Explicit deny policies keep private tables inaccessible to API roles.
drop policy if exists upload_limits_api_deny on gzjump_private.upload_limits;
create policy upload_limits_api_deny on gzjump_private.upload_limits for all to anon, authenticated using (false) with check (false);
drop policy if exists admin_emails_api_deny on gzjump_private.admin_emails;
create policy admin_emails_api_deny on gzjump_private.admin_emails for all to anon, authenticated using (false) with check (false);

-- Existing application security-definer helpers are not browser APIs.
revoke execute on function public.get_leaderboard(integer) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon, authenticated;

-- Compatibility wrapper for clients that still have the old PostgREST signature cached.
create or replace function public.gzjump_submit(p_fingerprint text, p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_player_key text := p_payload->>'_player_key';
  v_clean jsonb := p_payload - '_player_key';
begin
  if v_player_key is null then raise exception 'INVALID_FINGERPRINT'; end if;
  return public.gzjump_submit(p_fingerprint, v_player_key, v_clean);
end;
$$;
revoke all on function public.gzjump_submit(text,jsonb) from public, anon, authenticated;
grant execute on function public.gzjump_submit(text,jsonb) to service_role;
notify pgrst, 'reload schema';
