-- Ranked, casual and coin games on the server (milestone 6): each player's private
-- competitive state, game results, a coin ledger, the matchmaking queue, and clocks on
-- games. Clients read their own state and public results; every change goes through
-- the Edge Functions (`account`, `play`, `game`) and the functions below, which only the
-- service role may call. Rules: functions/_shared/play.ts, rating.ts, economy.ts.

-- ------------------------------------------------------------------ players

-- MMR is private (only ranks are ever shown), so it lives here and not in `profiles`;
-- others see the rank, stats and items through profiles.showcase, written by the server.
create table public.players (
  id              uuid primary key references auth.users (id) on delete cascade,
  mmr             integer not null default 1000 check (mmr >= 0),
  coins           integer not null default 500 check (coins >= 0),
  wins            integer not null default 0,
  losses          integer not null default 0,
  draws           integer not null default 0,
  win_streak      integer not null default 0,
  ranked_streak   integer not null default 0,
  best_streak     integer not null default 0,
  season          integer not null,
  season_peak_mmr integer not null default 1000,
  -- items bought or won (free items are owned by everyone and not listed)
  inventory       text[] not null default '{}',
  loadout         jsonb not null default '{}',
  badges          text[] not null default '{}',
  created_at      timestamptz not null default now()
);

alter table public.players enable row level security;
create policy "players see their own state" on public.players for select to authenticated
  using ((select auth.uid()) = id);

-- ------------------------------------------------------------------ games: kind, clocks, stakes

alter table public.games
  add column kind text not null default 'friend' check (kind in ('friend', 'ranked', 'casual', 'wager')),
  add column control text check (control in ('fast', 'blitz', 'rapid', 'classical')),
  add column clock_w integer,
  add column clock_b integer,
  add column turn_started_at timestamptz,
  add column stake integer,
  add column settled_at timestamptz;

-- ------------------------------------------------------------------ results and ledger

create table public.game_results (
  id            uuid primary key default gen_random_uuid(),
  game_id       text not null references public.games (id) on delete cascade,
  player_id     uuid not null references auth.users (id) on delete cascade,
  kind          text not null,
  color         text not null check (color in ('w', 'b')),
  played_at     timestamptz not null default now(),
  opponent_id   uuid references auth.users (id) on delete set null,
  opponent_name text not null,
  opponent_icon text not null,
  opponent_rank text,
  outcome       text not null check (outcome in ('win', 'loss', 'draw')),
  reason        text not null,
  moves         integer not null,
  accuracy      integer,
  -- private to the player: MMR change, coins and their breakdown
  mmr_delta     integer,
  coins_delta   integer not null default 0,
  breakdown     jsonb,
  constraint game_results_once unique (game_id, player_id)
);
create index game_results_player_idx on public.game_results (player_id, played_at desc);

alter table public.game_results enable row level security;
-- Recent games are public (profiles show them); the private columns are not granted.
create policy "results are readable by signed-in users" on public.game_results for select to authenticated
  using (true);

create table public.coin_ledger (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references auth.users (id) on delete cascade,
  amount     integer not null,
  reason     text not null check (reason in ('game', 'wager_stake', 'wager_payout', 'purchase', 'season')),
  ref        text,
  created_at timestamptz not null default now()
);
create index coin_ledger_player_idx on public.coin_ledger (player_id, created_at desc);

alter table public.coin_ledger enable row level security;
create policy "players see their own coin history" on public.coin_ledger for select to authenticated
  using ((select auth.uid()) = player_id);

-- ------------------------------------------------------------------ matchmaking queue

create table public.mm_queue (
  player_id    uuid primary key references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('ranked', 'casual', 'wager')),
  control      text not null,
  stake        integer,
  mmr          integer not null,
  joined_at    timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  -- set when another player's search matched this one; the next poll picks it up
  game_id      text
);
alter table public.mm_queue enable row level security; -- no policies: server only

-- ------------------------------------------------------------------ grants

grant select, insert, update, delete on table public.players, public.game_results, public.coin_ledger, public.mm_queue to service_role;
revoke all on table public.players, public.game_results, public.coin_ledger, public.mm_queue from anon, authenticated;
grant select on table public.players, public.coin_ledger to authenticated;
grant select (id, game_id, player_id, kind, color, played_at, opponent_name, opponent_icon, opponent_rank, outcome, reason, moves, accuracy)
  on table public.game_results to authenticated;

-- ------------------------------------------------------------------ matchmaking

/**
 * One search step for a player (the app calls it every couple of seconds through the
 * `play` function): keep the player in the queue, and pair them with the best waiting
 * player if one fits. Ranked windows start at ±100 MMR and widen by 50 every 5 s of
 * waiting, up to ±400 (the wider of the two players' windows counts). Coin games take
 * both stakes when the game is created. Returns the game id once matched.
 */
create or replace function public.mm_poll(
  p_player uuid, p_kind text, p_control text, p_stake integer, p_mmr integer, p_base_ms integer
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me public.mm_queue;
  opponent public.mm_queue;
  new_game text;
  white uuid;
  black uuid;
begin
  delete from public.mm_queue q where q.heartbeat_at < now() - interval '15 seconds' and q.game_id is null;

  select * into me from public.mm_queue q where q.player_id = p_player for update;
  if found and me.game_id is not null then
    delete from public.mm_queue q where q.player_id = p_player;
    return me.game_id;
  end if;
  if not found or me.kind <> p_kind or me.control <> p_control or coalesce(me.stake, 0) <> coalesce(p_stake, 0) then
    insert into public.mm_queue (player_id, kind, control, stake, mmr)
    values (p_player, p_kind, p_control, p_stake, p_mmr)
    on conflict (player_id) do update
      set kind = excluded.kind, control = excluded.control, stake = excluded.stake, mmr = excluded.mmr,
          joined_at = now(), heartbeat_at = now(), game_id = null;
    select * into me from public.mm_queue q where q.player_id = p_player for update;
  else
    update public.mm_queue q set heartbeat_at = now(), mmr = p_mmr where q.player_id = p_player;
  end if;

  select * into opponent from public.mm_queue q
  where q.player_id <> p_player
    and q.game_id is null
    and q.kind = p_kind and q.control = p_control and coalesce(q.stake, 0) = coalesce(p_stake, 0)
    and q.heartbeat_at > now() - interval '15 seconds'
    and (p_kind <> 'ranked' or abs(q.mmr - p_mmr) <= greatest(
      least(400, 100 + 50 * floor(extract(epoch from now() - me.joined_at) / 5)),
      least(400, 100 + 50 * floor(extract(epoch from now() - q.joined_at) / 5))))
  order by abs(q.mmr - p_mmr), q.joined_at
  limit 1
  for update skip locked;
  if not found then
    return null;
  end if;

  if p_kind = 'wager' then
    -- both need the stake; whoever cannot pay any more leaves the queue
    perform 1 from public.players p where p.id in (p_player, opponent.player_id) for update;
    if (select coins from public.players where id = opponent.player_id) < p_stake then
      delete from public.mm_queue q where q.player_id = opponent.player_id;
      return null;
    end if;
    if (select coins from public.players where id = p_player) < p_stake then
      delete from public.mm_queue q where q.player_id = p_player;
      raise exception 'insufficient_coins';
    end if;
    update public.players p set coins = p.coins - p_stake where p.id in (p_player, opponent.player_id);
  end if;

  if random() < 0.5 then white := p_player; black := opponent.player_id;
  else white := opponent.player_id; black := p_player; end if;

  loop
    new_game := (select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 10));
    exit when not exists (select 1 from public.games g where g.id = new_game);
  end loop;

  insert into public.games (id, white_id, black_id, white_name, black_name, status, kind, control, clock_w, clock_b, turn_started_at, stake)
  values (
    new_game, white, black,
    (select username from public.profiles where id = white),
    (select username from public.profiles where id = black),
    'active', p_kind, p_control, p_base_ms, p_base_ms,
    -- the players see a versus card and a 3-second countdown first
    now() + interval '4 seconds',
    case when p_kind = 'wager' then p_stake end
  );
  if p_kind = 'wager' then
    insert into public.coin_ledger (player_id, amount, reason, ref)
    values (p_player, -p_stake, 'wager_stake', new_game), (opponent.player_id, -p_stake, 'wager_stake', new_game);
  end if;

  update public.mm_queue q set game_id = new_game where q.player_id = opponent.player_id;
  delete from public.mm_queue q where q.player_id = p_player;
  return new_game;
end;
$$;

-- ------------------------------------------------------------------ settlement

/**
 * Apply a finished game to both players once (the `game` function computes the numbers
 * with _shared/play.ts). Rows: [{ player_id, credit, state{...}, showcase, result{...}|null }].
 */
create or replace function public.settle_game(p_game text, p_rows jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  s jsonb;
  res jsonb;
  player uuid;
  credit integer;
  game_kind text;
begin
  update public.games g set settled_at = now()
  where g.id = p_game and g.status = 'finished' and g.settled_at is null
  returning g.kind into game_kind;
  if not found then
    return false;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    player := (r->>'player_id')::uuid;
    credit := coalesce((r->>'credit')::integer, 0);
    s := r->'state';
    update public.players p set
      mmr = (s->>'mmr')::integer,
      coins = p.coins + credit,
      wins = (s->>'wins')::integer,
      losses = (s->>'losses')::integer,
      draws = (s->>'draws')::integer,
      win_streak = (s->>'win_streak')::integer,
      ranked_streak = (s->>'ranked_streak')::integer,
      best_streak = (s->>'best_streak')::integer,
      season_peak_mmr = greatest(p.season_peak_mmr, (s->>'season_peak_mmr')::integer)
    where p.id = player;

    if credit <> 0 then
      insert into public.coin_ledger (player_id, amount, reason, ref)
      values (player, credit, case when game_kind = 'wager' then 'wager_payout' else 'game' end, p_game);
    end if;

    update public.profiles pr set showcase = r->'showcase' where pr.id = player;

    res := r->'result';
    if res is not null and jsonb_typeof(res) = 'object' then
      insert into public.game_results (game_id, player_id, kind, color, opponent_id, opponent_name, opponent_icon, opponent_rank,
                                       outcome, reason, moves, accuracy, mmr_delta, coins_delta, breakdown)
      values (p_game, player, res->>'kind', res->>'color', (res->>'opponent_id')::uuid, res->>'opponent_name',
              res->>'opponent_icon', res->>'opponent_rank', res->>'outcome', res->>'reason', (res->>'moves')::integer,
              (res->>'accuracy')::integer, (res->>'mmr_delta')::integer, coalesce((res->>'coins_delta')::integer, 0), res->'breakdown')
      on conflict (game_id, player_id) do nothing;
    end if;
  end loop;
  return true;
end;
$$;

-- ------------------------------------------------------------------ shop

/** Buy an item: take the price and add it to the inventory, or raise 'cannot_buy'. */
create or replace function public.buy_item(p_player uuid, p_item text, p_price integer) returns public.players
language plpgsql security definer set search_path = '' as $$
declare
  row public.players;
begin
  update public.players p set coins = p.coins - p_price, inventory = array_append(p.inventory, p_item)
  where p.id = p_player and p.coins >= p_price and not (p_item = any (p.inventory))
  returning * into row;
  if not found then
    raise exception 'cannot_buy';
  end if;
  insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, -p_price, 'purchase', p_item);
  return row;
end;
$$;

-- ------------------------------------------------------------------ seasons

/**
 * Apply season ends computed by _shared/play.ts rollSeasons, once: only when the stored
 * season is still `p_from`. Grants: [{ season, coins, items[], badge }].
 */
create or replace function public.apply_seasons(p_player uuid, p_from integer, p_state jsonb, p_grants jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  g jsonb;
begin
  update public.players p set
    season = (p_state->>'season')::integer,
    mmr = (p_state->>'mmr')::integer,
    season_peak_mmr = (p_state->>'season_peak_mmr')::integer,
    win_streak = 0,
    ranked_streak = 0
  where p.id = p_player and p.season = p_from;
  if not found then
    return false;
  end if;
  for g in select * from jsonb_array_elements(p_grants) loop
    update public.players p set
      coins = p.coins + (g->>'coins')::integer,
      inventory = array(select distinct unnest(p.inventory || array(select jsonb_array_elements_text(g->'items')))),
      badges = array_append(p.badges, g->>'badge')
    where p.id = p_player;
    insert into public.coin_ledger (player_id, amount, reason, ref)
    values (p_player, (g->>'coins')::integer, 'season', 'season-' || (g->>'season'));
  end loop;
  return true;
end;
$$;

revoke all on function public.mm_poll(uuid, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.settle_game(text, jsonb) from public, anon, authenticated;
revoke all on function public.buy_item(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.apply_seasons(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.mm_poll(uuid, text, text, integer, integer, integer) to service_role;
grant execute on function public.settle_game(text, jsonb) to service_role;
grant execute on function public.buy_item(uuid, text, integer) to service_role;
grant execute on function public.apply_seasons(uuid, integer, jsonb, jsonb) to service_role;
