-- Run once in Supabase SQL Editor. Only the Next.js server can reserve loads.
-- Leave disabled until existing usage on the Google billing account is checked.
begin;
create table if not exists public.google_map_budget_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into public.google_map_budget_settings (singleton) values (true)
on conflict do nothing;

create table if not exists public.google_map_monthly_usage (
  period date primary key check (extract(day from period) = 1),
  loads integer not null default 0 check (loads >= 0),
  updated_at timestamptz not null default now()
);
alter table public.google_map_budget_settings enable row level security;
alter table public.google_map_monthly_usage enable row level security;
revoke all on public.google_map_budget_settings, public.google_map_monthly_usage from public, anon, authenticated;
grant select, insert, update on public.google_map_budget_settings, public.google_map_monthly_usage to service_role;

create or replace function public.reserve_google_map_load()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_time_utc timestamptz := clock_timestamp();
  month_start date := date_trunc('month', current_time_utc at time zone 'America/Los_Angeles')::date;
  month_end timestamptz := (month_start + interval '1 month') at time zone 'America/Los_Angeles';
  reserved integer;
begin
  if not coalesce((select enabled from public.google_map_budget_settings where singleton), false) then
    return jsonb_build_object('allowed', false, 'reason', 'not_configured');
  end if;
  -- Do not carry a reservation into the following billing month.
  if current_time_utc >= month_end - interval '30 seconds' then
    return jsonb_build_object('allowed', false, 'reason', 'month_rollover');
  end if;
  insert into public.google_map_monthly_usage as usage (period, loads)
  values (month_start, 1)
  on conflict (period) do update
    set loads = usage.loads + 1, updated_at = clock_timestamp()
    where usage.loads < 9899
  returning loads into reserved;

  if reserved is null then
    return jsonb_build_object('allowed', false, 'reason', 'limit_reached');
  end if;
  return jsonb_build_object(
    'allowed', true, 'reason', 'allowed', 'used', reserved, 'limit', 9899,
    'expiresAt', current_time_utc + interval '15 seconds'
  );
end;
$$;
revoke all on function public.reserve_google_map_load() from public, anon, authenticated;
grant execute on function public.reserve_google_map_load() to service_role;
notify pgrst, 'reload schema';
commit;
