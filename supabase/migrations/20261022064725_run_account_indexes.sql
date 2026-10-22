create index if not exists gzjump_run_account on gzjump_private.run_sessions(auth_user_id);
create index if not exists gzjump_events_account on public.gzjump_security_events(auth_user_id);
