-- Run once in the Supabase SQL Editor before enabling the Vercel cron.
-- One operational status row; no travel workspace or account data is modified.
begin;
create table if not exists public.database_heartbeat (
  id smallint primary key check (id = 1),
  checked_at timestamptz not null
);
alter table public.database_heartbeat enable row level security;
revoke all on public.database_heartbeat from public, anon, authenticated;
grant select, insert, update on public.database_heartbeat to service_role;
commit;
