-- Online games. Clients may only READ this table; every write goes through the
-- `game` Edge Function, which validates moves with chess.js and writes with the
-- service role. `version` is bumped on every write, and writes are conditional
-- on it, so two concurrent requests can never both apply (optimistic locking).

create table public.games (
  id          text primary key,
  white_id    uuid references auth.users (id) on delete set null,
  black_id    uuid references auth.users (id) on delete set null,
  white_name  text,
  black_name  text,
  -- moves in UCI notation ("e2e4", "e7e8q"), replayed from the start position
  moves       text[] not null default '{}',
  fen         text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  status      text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  result      text check (result in ('1-0', '0-1', '1/2-1/2')),
  reason      text,
  -- side with a pending draw offer ('w' or 'b')
  draw_offer  text check (draw_offer in ('w', 'b')),
  -- follow-up game created when a player asked for a rematch
  rematch_id  text references public.games (id) on delete set null,
  version     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index games_white_idx on public.games (white_id);
create index games_black_idx on public.games (black_id);

alter table public.games enable row level security;

-- Anyone signed in (anonymous sessions included) can read a game: the invite
-- link carries the id, and spectators are welcome. No insert/update/delete
-- policies exist, so only the service role can write.
create policy "games are readable by signed-in users"
  on public.games for select
  to authenticated
  using (true);

revoke insert, update, delete on public.games from anon, authenticated;

-- Broadcast row changes to subscribed players.
alter publication supabase_realtime add table public.games;
