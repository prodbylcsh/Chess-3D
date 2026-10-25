-- Spectating (docs/PLATFORM.md §4.1 "Spectating", October 2026).
--  * profiles.watch: who may watch a player's games: everyone with the link, friends, nobody.
--  * game_watch: the spectators' copy of every game, kept by a trigger on `games`. In ranked
--    and coin games it holds the moves two moves (4 half-moves) behind while the game runs,
--    so nobody watching can feed a player moves; once the game is over it holds them all.
--    The numbers match supabase/functions/_shared/spectate.ts (tests/spectate.test.ts).
--  * can_watch: a spectator may read a game only if both players' settings allow it and
--    neither player and the spectator have blocked each other. Players always may.
--  * games: now readable only by its players, and by anyone while it waits for its second
--    player (the invite link). Spectators read game_watch instead.

alter table public.profiles
  add column watch text not null default 'everyone' check (watch in ('everyone', 'friends', 'nobody'));

create table public.game_watch (
  id              text primary key references public.games (id) on delete cascade,
  white_id        uuid,
  black_id        uuid,
  white_name      text,
  black_name      text,
  -- the moves spectators may see (UCI); `delay` half-moves behind the real game
  moves           text[] not null default '{}',
  delay           integer not null default 0,
  status          text not null,
  result          text,
  reason          text,
  rematch_id      text,
  version         integer not null,
  kind            text not null,
  control         text,
  clock_w         integer,
  clock_b         integer,
  turn_started_at timestamptz,
  stake           integer,
  created_at      timestamptz not null,
  updated_at      timestamptz not null
);
create index game_watch_white_idx on public.game_watch (white_id) where status = 'active';
create index game_watch_black_idx on public.game_watch (black_id) where status = 'active';
create index game_watch_live_idx on public.game_watch (updated_at desc) where status = 'active';

/** The spectators' copy of a game row (see the top of this file). */
create or replace function public.game_watch_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  behind integer := case when new.status = 'active' and new.kind in ('ranked', 'wager') then 4 else 0 end;
begin
  insert into public.game_watch as w (
    id, white_id, black_id, white_name, black_name, moves, delay, status, result, reason, rematch_id,
    version, kind, control, clock_w, clock_b, turn_started_at, stake, created_at, updated_at
  ) values (
    new.id, new.white_id, new.black_id, new.white_name, new.black_name,
    new.moves[1:greatest(cardinality(new.moves) - behind, 0)], behind,
    new.status, new.result, new.reason, new.rematch_id,
    new.version, new.kind, new.control, new.clock_w, new.clock_b, new.turn_started_at, new.stake,
    new.created_at, new.updated_at
  )
  on conflict (id) do update set
    white_id = excluded.white_id, black_id = excluded.black_id,
    white_name = excluded.white_name, black_name = excluded.black_name,
    moves = excluded.moves, delay = excluded.delay, status = excluded.status,
    result = excluded.result, reason = excluded.reason, rematch_id = excluded.rematch_id,
    version = excluded.version, kind = excluded.kind, control = excluded.control,
    clock_w = excluded.clock_w, clock_b = excluded.clock_b, turn_started_at = excluded.turn_started_at,
    stake = excluded.stake, updated_at = excluded.updated_at;
  return null;
end;
$$;
revoke all on function public.game_watch_sync() from public, anon, authenticated;

create trigger games_watch_sync
  after insert or update on public.games
  for each row execute function public.game_watch_sync();

-- the games that exist already
insert into public.game_watch (
  id, white_id, black_id, white_name, black_name, moves, delay, status, result, reason, rematch_id,
  version, kind, control, clock_w, clock_b, turn_started_at, stake, created_at, updated_at
)
select
  g.id, g.white_id, g.black_id, g.white_name, g.black_name,
  case when g.status = 'active' and g.kind in ('ranked', 'wager') then g.moves[1:greatest(cardinality(g.moves) - 4, 0)] else g.moves end,
  case when g.status = 'active' and g.kind in ('ranked', 'wager') then 4 else 0 end,
  g.status, g.result, g.reason, g.rematch_id,
  g.version, g.kind, g.control, g.clock_w, g.clock_b, g.turn_started_at, g.stake, g.created_at, g.updated_at
from public.games g
on conflict (id) do nothing;

/**
 * May the signed-in user watch a game between these two players? Players always may.
 * Anyone else needs every registered player's setting to allow it (no profile, e.g. a
 * guest from an invite link: allowed) and no block between them and either player.
 */
create or replace function public.can_watch(p_white uuid, p_black uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    when (select auth.uid()) = p_white or (select auth.uid()) = p_black then true
    else not exists (
      select 1
      from unnest(array[p_white, p_black]) as seat (id)
      left join public.profiles pr on pr.id = seat.id
      where seat.id is not null
        and (
          exists (
            select 1 from public.blocks b
            where (b.blocker = seat.id and b.blocked = (select auth.uid()))
               or (b.blocker = (select auth.uid()) and b.blocked = seat.id)
          )
          or coalesce(pr.watch, 'everyone') = 'nobody'
          or (
            coalesce(pr.watch, 'everyone') = 'friends'
            and not exists (
              select 1 from public.friendships f
              where f.status = 'accepted'
                and f.user_a = least(seat.id, (select auth.uid()))
                and f.user_b = greatest(seat.id, (select auth.uid()))
            )
          )
        )
    )
  end;
$$;
revoke all on function public.can_watch(uuid, uuid) from public, anon;
grant execute on function public.can_watch(uuid, uuid) to authenticated;

alter table public.game_watch enable row level security;
create policy "spectators read games they may watch" on public.game_watch for select to authenticated
  using (public.can_watch(white_id, black_id));
grant select, insert, update, delete on table public.game_watch to service_role;
revoke all on table public.game_watch from anon, authenticated;
grant select on table public.game_watch to authenticated;

alter publication supabase_realtime add table public.game_watch;

-- The real game: its players, and anyone holding the invite link while it waits.
drop policy "games are readable by signed-in users" on public.games;
create policy "players read their games" on public.games for select to authenticated
  using ((select auth.uid()) = white_id or (select auth.uid()) = black_id or status = 'waiting');
