-- Bear hunt (Andrew, 2026-10-17). Paste into Supabase → SQL Editor → Run. Safe to run more than once.

-- Leaderboard columns: points earned as the bear (total), and bears taken down as a hunter (total).
alter table public.stats add column if not exists hunt_points integer not null default 0;
alter table public.stats add column if not exists hunt_takedowns integer not null default 0;

-- Every finished hunt (written only by the game server).
create table if not exists public.hunt_games (
  id bigint generated always as identity primary key,
  bear uuid references public.profiles (id) on delete set null,
  bear_points integer not null default 0,
  seconds integer not null default 0,
  how text not null,
  taken_by uuid references public.profiles (id) on delete set null,
  players uuid[] not null,
  finished_at timestamptz not null default now()
);
alter table public.hunt_games enable row level security;
drop policy if exists "signed-in players can see hunts" on public.hunt_games;
create policy "signed-in players can see hunts" on public.hunt_games for select to authenticated using (true);

-- The game server records a hunt in one step: the hunt, the bear's points, +1 takedown for the hunter
-- who landed the final hit. Only the server (service role) may call it.
create or replace function public.record_hunt(p_bear uuid, p_points integer, p_seconds integer, p_how text, p_taken_by uuid, p_players uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hunt_games (bear, bear_points, seconds, how, taken_by, players)
    values (p_bear, p_points, p_seconds, p_how, p_taken_by, p_players);
  if p_bear is not null and p_points > 0 then
    insert into public.stats as s (user_id, hunt_points) values (p_bear, p_points)
      on conflict (user_id) do update set hunt_points = s.hunt_points + p_points, updated_at = now();
  end if;
  if p_taken_by is not null then
    insert into public.stats as s (user_id, hunt_takedowns) values (p_taken_by, 1)
      on conflict (user_id) do update set hunt_takedowns = s.hunt_takedowns + 1, updated_at = now();
  end if;
end;
$$;
revoke all on function public.record_hunt(uuid, integer, integer, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.record_hunt(uuid, integer, integer, text, uuid, uuid[]) to service_role;
