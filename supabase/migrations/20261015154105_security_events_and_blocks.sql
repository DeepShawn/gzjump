create table if not exists public.gzjump_security_events (
  id uuid primary key default gen_random_uuid(),
  subject_key text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  flags text[] not null,
  created_at timestamptz not null default now()
);
create index if not exists gzjump_security_events_subject on public.gzjump_security_events(subject_key, created_at desc);
alter table public.gzjump_security_events enable row level security;
revoke all on public.gzjump_security_events from anon, authenticated;
grant all on public.gzjump_security_events to service_role;
create table if not exists public.gzjump_blocks (
  subject_key text primary key,
  violation_count integer not null default 0 check (violation_count >= 0),
  blocked_until timestamptz,
  reason text not null,
  updated_at timestamptz not null default now()
);
alter table public.gzjump_blocks enable row level security;
revoke all on public.gzjump_blocks from anon, authenticated;
grant all on public.gzjump_blocks to service_role;
alter table public.gzjump_scores add column if not exists risk_flags text[] not null default '{}';
alter table public.gzjump_scores add column if not exists risk_score integer not null default 0 check (risk_score between 0 and 100);
grant select, insert, update, delete on public.gzjump_blocks, public.gzjump_security_events to authenticated;
create policy blocks_admin_access on public.gzjump_blocks for all to authenticated using (exists (select 1 from public.gzjump_admins where user_id=(select auth.uid()))) with check (exists (select 1 from public.gzjump_admins where user_id=(select auth.uid())));
create policy events_admin_read on public.gzjump_security_events for select to authenticated using (exists (select 1 from public.gzjump_admins where user_id=(select auth.uid())));
