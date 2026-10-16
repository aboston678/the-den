-- Round 2 (Andrew, 2026-10-16). Paste into Supabase → SQL Editor → Run. Safe to run more than once.

-- 1. The Jenna Catfish weighs 200–400 lb: catches up to 1,000 lb can be saved (was under 20).
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.catches'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%weight_lb%'
  loop
    execute format('alter table public.catches drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.catches add constraint catches_weight_lb_check check (weight_lb > 0 and weight_lb < 1000);

-- 2. Connect Four wins on the leaderboard, and every finished game (written only by the game server).
alter table public.stats add column if not exists c4_wins integer not null default 0;

create table if not exists public.c4_games (
  id bigint generated always as identity primary key,
  winner uuid references public.profiles (id) on delete set null,
  players uuid[] not null,
  finished_at timestamptz not null default now()
);
alter table public.c4_games enable row level security;
drop policy if exists "signed-in players can see connect four games" on public.c4_games;
create policy "signed-in players can see connect four games" on public.c4_games for select to authenticated using (true);
