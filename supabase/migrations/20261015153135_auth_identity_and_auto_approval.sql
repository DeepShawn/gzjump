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
