-- Allow the Fruit Bridge game to use the same secure score gateway.
alter table public.gzjump_scores drop constraint if exists gzjump_scores_mode_check;
alter table public.gzjump_scores add constraint gzjump_scores_mode_check
  check (mode in ('classic', 'daily', 'bridge_daily', 'bridge_endless'));

alter table public.gzjump_scores drop constraint if exists gzjump_scores_check2;
alter table public.gzjump_scores add constraint gzjump_scores_check2
  check (score >= jumps and score <= jumps * 23);
