-- Supabase SQL Editor에서 실행하세요. 사용자별 비공개 저장 공간입니다.
create table if not exists public.travel_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  places jsonb not null default '[]'::jsonb check (jsonb_typeof(places) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.travel_workspaces enable row level security;
revoke all on public.travel_workspaces from anon;
grant select, insert, update, delete on public.travel_workspaces to authenticated;
drop policy if exists "Users manage own travel workspace" on public.travel_workspaces;
create policy "Users manage own travel workspace" on public.travel_workspaces
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
