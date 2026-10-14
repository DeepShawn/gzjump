-- Only approved submissions are public. Admin membership is DB-controlled.
create table public.gzjump_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.gzjump_admins enable row level security;
revoke all on public.gzjump_admins from anon, authenticated;
grant select(user_id) on public.gzjump_admins to authenticated;
create policy admins_read_self on public.gzjump_admins for select to authenticated
  using (user_id = (select auth.uid()));

create table public.gzjump_scores (
  id uuid primary key,
  player_name text not null check (char_length(player_name) between 1 and 20 and player_name !~ '[[:cntrl:]<>]'),
  score integer not null check (score between 0 and 100000),
  jumps integer not null check (jumps between 0 and 10000),
  perfect integer not null check (perfect between 0 and jumps),
  combo integer not null check (combo between 0 and perfect),
  mode text not null check (mode in ('classic', 'daily')),
  day date not null,
  fruit text not null check (fruit in ('orange','lime','peach','lemon','blueberry','melon')),
  duration_ms integer not null check (duration_ms between 0 and 86400000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  check (score >= jumps and score <= jumps * 13),
  check (duration_ms >= jumps * 200),
  check ((perfect = 0 and combo = 0) or (perfect > 0 and combo > 0))
);
create index gzjump_scores_leaderboard on public.gzjump_scores(mode, day, score desc, created_at) where status = 'approved';
create index gzjump_scores_moderation on public.gzjump_scores(status, created_at desc);
alter table public.gzjump_scores enable row level security;
revoke all on public.gzjump_scores from anon, authenticated;
grant select on public.gzjump_scores to anon, authenticated;
grant update(status), delete on public.gzjump_scores to authenticated;
grant all on public.gzjump_scores, public.gzjump_admins to service_role;
create policy scores_read on public.gzjump_scores for select to anon, authenticated
  using (status = 'approved' or exists (select 1 from public.gzjump_admins where user_id = (select auth.uid())));
create policy scores_admin_update on public.gzjump_scores for update to authenticated
  using (exists (select 1 from public.gzjump_admins where user_id = (select auth.uid())))
  with check (exists (select 1 from public.gzjump_admins where user_id = (select auth.uid())));
create policy scores_admin_delete on public.gzjump_scores for delete to authenticated
  using (exists (select 1 from public.gzjump_admins where user_id = (select auth.uid())));

-- Non-exposed quota records contain only a keyed IP digest, never raw IPs.
create schema if not exists gzjump_private;
revoke all on schema gzjump_private from public, anon, authenticated;
grant usage on schema gzjump_private to service_role;
create table gzjump_private.upload_limits (
  fingerprint text not null,
  day date not null,
  minute_start timestamptz not null,
  minute_count integer not null,
  day_count integer not null,
  last_at timestamptz not null,
  primary key (fingerprint, day)
);
alter table gzjump_private.upload_limits enable row level security;
grant all on gzjump_private.upload_limits to service_role;

-- Invoker function: executable exclusively by the backend service role.
create function public.gzjump_submit(p_fingerprint text, p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_minute timestamptz := date_trunc('minute', v_now);
  v_day date := (v_now at time zone 'UTC')::date;
  v_id uuid := (p_payload->>'id')::uuid;
  v_quota gzjump_private.upload_limits%rowtype;
begin
  if p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_FINGERPRINT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));
  select * into v_quota from gzjump_private.upload_limits where fingerprint = p_fingerprint and day = v_day;
  if found and (v_quota.day_count >= 100 or (v_quota.minute_start = v_minute and v_quota.minute_count >= 10)
      or v_now - v_quota.last_at < interval '3 seconds') then
    raise exception 'RATE_LIMITED';
  end if;
  insert into public.gzjump_scores(id, player_name, score, jumps, perfect, combo, mode, day, fruit, duration_ms)
    values(v_id, p_payload->>'player_name', (p_payload->>'score')::integer, (p_payload->>'jumps')::integer,
      (p_payload->>'perfect')::integer, (p_payload->>'combo')::integer, p_payload->>'mode',
      (p_payload->>'day')::date, p_payload->>'fruit', (p_payload->>'duration_ms')::integer)
    on conflict (id) do nothing;
  insert into gzjump_private.upload_limits values (p_fingerprint, v_day, v_minute, 1, 1, v_now)
    on conflict (fingerprint, day) do update set
      minute_count = case when upload_limits.minute_start = v_minute then upload_limits.minute_count + 1 else 1 end,
      minute_start = v_minute, day_count = upload_limits.day_count + 1, last_at = v_now;
  delete from gzjump_private.upload_limits where day < v_day - 2;
  return v_id;
end;
$$;
revoke all on function public.gzjump_submit(text,jsonb) from public, anon, authenticated;
grant execute on function public.gzjump_submit(text,jsonb) to service_role;

-- Bootstrap administrators only after Auth verifies an allowlisted email.
-- The allowlist is private and maintained exclusively by the service/database owner.
create table gzjump_private.admin_emails (
  email text primary key check (email = lower(email))
);
alter table gzjump_private.admin_emails enable row level security;
grant all on gzjump_private.admin_emails to service_role;
create function gzjump_private.sync_admin_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Trigger context, not a browser-callable RPC: NEW is an Auth-owned user record.
  if new.id is null then raise exception 'Missing Auth user'; end if;
  if tg_op = 'UPDATE' and (new.email is distinct from old.email or new.email_confirmed_at is null) then
    delete from public.gzjump_admins where user_id = new.id;
  end if;
  if new.email_confirmed_at is not null and exists (
    select 1 from gzjump_private.admin_emails where email = lower(new.email)
  ) then
    insert into public.gzjump_admins(user_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function gzjump_private.sync_admin_membership() from public, anon, authenticated;
create trigger gzjump_sync_admin after insert or update of email, email_confirmed_at
on auth.users for each row execute function gzjump_private.sync_admin_membership();
