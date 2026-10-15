alter table public.gzjump_scores add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create index if not exists gzjump_scores_auth_user on public.gzjump_scores(auth_user_id, mode, day, score desc) where status = 'approved';
create or replace view public.gzjump_leaderboard with (security_invoker = true) as
select player_name, score, jumps, fruit, mode, day, created_at
from (
  select s.*, row_number() over (
    partition by coalesce(auth_user_id::text, player_key), mode, day order by score desc, created_at asc
  ) as user_rank
  from public.gzjump_scores s
  where s.status = 'approved' and s.assist = false
) ranked
where user_rank = 1;
grant select on public.gzjump_leaderboard to anon, authenticated;

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
