-- Add the high difficulty myth bridge route to the secure score gateway.
alter table public.gzjump_scores drop constraint if exists gzjump_scores_mode_check;
alter table public.gzjump_scores add constraint gzjump_scores_mode_check
  check (mode in ('classic', 'daily', 'myth', 'bridge_daily', 'bridge_endless', 'bridge_myth'));
