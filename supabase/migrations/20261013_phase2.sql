-- The Den, Phase 2 (GAME_SPEC §14): accounts, friends, stats and the leaderboard, plus private
-- storage for the TV clips. Run once in the Supabase SQL editor. Row-level security is on for
-- every table: players can read what the game shows them and change only their own rows; stats
-- and catches are written only by the game server (service-role key, which skips these rules).

-- Usernames (the name tag above your bear): 3–16 letters, numbers or underscores, unique ignoring case.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_unique on public.profiles (lower(username));
alter table public.profiles enable row level security;
drop policy if exists "signed-in players can see usernames" on public.profiles;
create policy "signed-in players can see usernames" on public.profiles for select to authenticated using (true);
drop policy if exists "make your own profile" on public.profiles;
create policy "make your own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "change your own username" on public.profiles;
create policy "change your own username" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Friends: a request is pending until the other bear accepts it. Either side can remove it.
create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;
drop policy if exists "see your own friendships" on public.friendships;
create policy "see your own friendships" on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
drop policy if exists "send a friend request" on public.friendships;
create policy "send a friend request" on public.friendships for insert to authenticated with check (requester = auth.uid() and status = 'pending');
drop policy if exists "accept a request sent to you" on public.friendships;
create policy "accept a request sent to you" on public.friendships for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
drop policy if exists "decline, cancel or unfriend" on public.friendships;
create policy "decline, cancel or unfriend" on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));

-- Leaderboard numbers. Everyone signed in can read them; only the game server writes them.
create table if not exists public.stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  fish_caught integer not null default 0,
  bowling_high_score integer not null default 0 check (bowling_high_score between 0 and 300),
  catan_wins integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.stats enable row level security;
drop policy if exists "signed-in players can see stats" on public.stats;
create policy "signed-in players can see stats" on public.stats for select to authenticated using (true);

-- Every fish landed (personal bests come from here).
create table if not exists public.catches (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  species text not null,
  weight_lb real not null check (weight_lb > 0 and weight_lb < 20),
  caught_at timestamptz not null default now()
);
create index if not exists catches_best on public.catches (user_id, species, weight_lb desc);
alter table public.catches enable row level security;
drop policy if exists "signed-in players can see catches" on public.catches;
create policy "signed-in players can see catches" on public.catches for select to authenticated using (true);

-- Bowling (Phase 3) and Catan (Phase 4) results, ready for later.
create table if not exists public.bowling_games (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null check (score between 0 and 300),
  played_at timestamptz not null default now()
);
alter table public.bowling_games enable row level security;
drop policy if exists "signed-in players can see bowling games" on public.bowling_games;
create policy "signed-in players can see bowling games" on public.bowling_games for select to authenticated using (true);

create table if not exists public.catan_games (
  id bigint generated always as identity primary key,
  winner uuid references public.profiles (id) on delete set null,
  players uuid[] not null,
  finished_at timestamptz not null default now()
);
alter table public.catan_games enable row level security;
drop policy if exists "signed-in players can see catan games" on public.catan_games;
create policy "signed-in players can see catan games" on public.catan_games for select to authenticated using (true);

-- The game server records a catch in one step: the catch, +1 fish caught, and whether it's a
-- personal best for that species. Only the server (service role) may call it.
create or replace function public.record_catch(p_user uuid, p_species text, p_weight real)
returns table (best boolean, total integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  prev real;
begin
  select max(c.weight_lb) into prev from public.catches c where c.user_id = p_user and c.species = p_species;
  insert into public.catches (user_id, species, weight_lb) values (p_user, p_species, p_weight);
  insert into public.stats as s (user_id, fish_caught) values (p_user, 1)
    on conflict (user_id) do update set fish_caught = s.fish_caught + 1, updated_at = now()
    returning s.fish_caught into total;
  best := prev is null or p_weight > prev;
  return next;
end;
$$;
revoke all on function public.record_catch(uuid, text, real) from public, anon, authenticated;
grant execute on function public.record_catch(uuid, text, real) to service_role;

-- Private storage for Andrew's home-video clips (the TVs, GAME_SPEC §8.4): only signed-in players
-- can get a (short-lived) link to them.
insert into storage.buckets (id, name, public) values ('private-media', 'private-media', false) on conflict (id) do nothing;
drop policy if exists "signed-in players can watch the TV clips" on storage.objects;
create policy "signed-in players can watch the TV clips" on storage.objects for select to authenticated using (bucket_id = 'private-media');
