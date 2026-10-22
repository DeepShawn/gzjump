create policy run_sessions_api_deny on gzjump_private.run_sessions for all to anon,authenticated using(false) with check(false);
create policy request_limits_api_deny on gzjump_private.request_limits for all to anon,authenticated using(false) with check(false);
