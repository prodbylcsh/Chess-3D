-- Puzzles, October 2026 (docs/PLATFORM.md §4.2):
--  * review: stars of a puzzle improve only when it was last tried at least
--    REVIEW_AFTER_HOURS ago (functions/_shared/puzzles.ts), so a replay right after a
--    weak solve is practice, not a new score
--  * showing the solution: the puzzle is "seen" (0 stars), the next one opens, no coins;
--    solving it later in a review pays its coins then
--  * the daily puzzle and the streak of days in a row, with milestone rewards

alter table public.puzzle_solves drop constraint puzzle_solves_stars_check;
alter table public.puzzle_solves add constraint puzzle_solves_stars_check check (stars between 0 and 3);
-- when the player last finished the puzzle (a solve, or showing the solution)
alter table public.puzzle_solves add column tried_at timestamptz not null default now();
update public.puzzle_solves set tried_at = solved_at;

create table public.puzzle_daily (
  player_id uuid not null references auth.users (id) on delete cascade,
  day       date not null,
  module    text not null,
  idx       smallint not null,
  stars     smallint not null check (stars between 1 and 3),
  coins     integer not null,
  solved_at timestamptz not null default now(),
  primary key (player_id, day)
);

create table public.puzzle_streaks (
  player_id uuid primary key references auth.users (id) on delete cascade,
  current   integer not null default 0,
  best      integer not null default 0,
  last_day  date
);

alter table public.puzzle_daily enable row level security;
alter table public.puzzle_streaks enable row level security;
create policy "players see their own daily puzzles" on public.puzzle_daily for select to authenticated
  using ((select auth.uid()) = player_id);
create policy "players see their own streak" on public.puzzle_streaks for select to authenticated
  using ((select auth.uid()) = player_id);
grant select, insert, update, delete on table public.puzzle_daily, public.puzzle_streaks to service_role;
revoke all on table public.puzzle_daily, public.puzzle_streaks from anon, authenticated;
grant select on table public.puzzle_daily, public.puzzle_streaks to authenticated;

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('game', 'wager_stake', 'wager_payout', 'purchase', 'season', 'performance', 'coins_bought',
                    'coins_refunded', 'puzzle', 'puzzle_bonus', 'puzzle_unlock', 'puzzle_reward',
                    'puzzle_daily', 'puzzle_streak'));
alter table public.player_items drop constraint player_items_source_check;
alter table public.player_items add constraint player_items_source_check
  check (source in ('purchase', 'season', 'grant', 'puzzle', 'streak'));

drop function public.solve_puzzle(uuid, text, integer, integer, integer, integer, integer);

/**
 * Record a solve. Stars improve only when the puzzle was last tried `p_review` seconds ago
 * or more (or never). The first solve with stars (0 → 1–3) pays `p_coins`, and when it
 * brings the module's count of solved puzzles to a multiple of `p_every`, also `p_bonus`.
 * Every solve restarts the review wait. Returns
 * { first, counted, stars (now stored), solved (the module's count), coins, bonus, tried_at }.
 */
create or replace function public.solve_puzzle(
  p_player uuid, p_module text, p_idx integer, p_stars integer, p_coins integer, p_every integer, p_bonus integer, p_review integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  prev record;
  counted boolean;
  new_stars integer;
  first boolean;
  solved integer;
  bonus integer := 0;
begin
  select s.stars, s.tried_at into prev from public.puzzle_solves s
  where s.player_id = p_player and s.module = p_module and s.idx = p_idx for update;
  if not found then
    counted := true;
    new_stars := p_stars;
    insert into public.puzzle_solves (player_id, module, idx, stars, tried_at) values (p_player, p_module, p_idx, p_stars, now());
    first := true;
  else
    counted := prev.stars < 3 and now() >= prev.tried_at + make_interval(secs => p_review);
    new_stars := case when counted then greatest(prev.stars, p_stars) else prev.stars end;
    first := prev.stars = 0 and new_stars > 0;
    update public.puzzle_solves s set stars = new_stars, tried_at = now(), solved_at = case when first then now() else s.solved_at end
    where s.player_id = p_player and s.module = p_module and s.idx = p_idx;
  end if;
  select count(*) into solved from public.puzzle_solves s where s.player_id = p_player and s.module = p_module and s.stars > 0;
  if not first then
    return jsonb_build_object('first', false, 'counted', counted, 'stars', new_stars, 'solved', solved, 'coins', 0, 'bonus', 0, 'tried_at', now());
  end if;
  if solved % p_every = 0 then bonus := p_bonus; end if;
  update public.players pl set coins = pl.coins + p_coins + bonus where pl.id = p_player;
  insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, p_coins, 'puzzle', p_module || ':' || p_idx);
  if bonus > 0 then
    insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, bonus, 'puzzle_bonus', p_module || ':' || solved);
  end if;
  return jsonb_build_object('first', true, 'counted', true, 'stars', new_stars, 'solved', solved, 'coins', p_coins, 'bonus', bonus, 'tried_at', now());
end;
$$;

/** Show a puzzle's solution: it becomes "seen" (0 stars) unless solved, and the review wait restarts. */
create or replace function public.reveal_puzzle(p_player uuid, p_module text, p_idx integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.puzzle_solves (player_id, module, idx, stars, tried_at) values (p_player, p_module, p_idx, 0, now())
  on conflict (player_id, module, idx) do update set tried_at = now();
end;
$$;

/**
 * Record the daily puzzle of `p_day` once and move the streak on. `p_milestones`:
 * [{ days, coins, item }]; a milestone the new streak reaches pays its coins, and `p_item`
 * when it has `item` (a shop item the player lacks, chosen by the function; null: coins
 * only). Returns { already, coins, streak: { current, best, last_day }, milestone } where
 * milestone is { days, coins, item } or null.
 */
create or replace function public.solve_daily(
  p_player uuid, p_day date, p_module text, p_idx integer, p_stars integer, p_coins integer, p_milestones jsonb, p_item text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st record;
  cur integer;
  bst integer;
  ms jsonb;
  ms_coins integer := 0;
  ms_item text := null;
begin
  insert into public.puzzle_daily (player_id, day, module, idx, stars, coins) values (p_player, p_day, p_module, p_idx, p_stars, p_coins)
  on conflict (player_id, day) do nothing;
  if not found then
    select * into st from public.puzzle_streaks s where s.player_id = p_player;
    return jsonb_build_object('already', true, 'coins', 0, 'milestone', null,
      'streak', jsonb_build_object('current', coalesce(st.current, 0), 'best', coalesce(st.best, 0), 'last_day', st.last_day));
  end if;
  insert into public.puzzle_streaks (player_id) values (p_player) on conflict do nothing;
  select * into st from public.puzzle_streaks s where s.player_id = p_player for update;
  cur := case when st.last_day = p_day - 1 then st.current + 1 when st.last_day = p_day then st.current else 1 end;
  bst := greatest(st.best, cur);
  update public.puzzle_streaks s set current = cur, best = bst, last_day = p_day where s.player_id = p_player;

  select e.value into ms from jsonb_array_elements(p_milestones) e where (e.value ->> 'days')::integer = cur limit 1;
  if ms is not null then
    ms_coins := (ms ->> 'coins')::integer;
    if coalesce((ms ->> 'item')::boolean, false) and p_item is not null then
      ms_item := p_item;
      insert into public.player_items (player_id, item_id, source) values (p_player, p_item, 'streak') on conflict do nothing;
    end if;
  end if;

  update public.players pl set coins = pl.coins + p_coins + ms_coins where pl.id = p_player;
  if p_coins > 0 then
    insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, p_coins, 'puzzle_daily', p_day::text);
  end if;
  if ms_coins > 0 then
    insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, ms_coins, 'puzzle_streak', cur::text);
  end if;
  return jsonb_build_object('already', false, 'coins', p_coins,
    'streak', jsonb_build_object('current', cur, 'best', bst, 'last_day', p_day),
    'milestone', case when ms is null then null else jsonb_build_object('days', cur, 'coins', ms_coins, 'item', ms_item) end);
end;
$$;

revoke all on function public.solve_puzzle(uuid, text, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.reveal_puzzle(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.solve_daily(uuid, date, text, integer, integer, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.solve_puzzle(uuid, text, integer, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.reveal_puzzle(uuid, text, integer) to service_role;
grant execute on function public.solve_daily(uuid, date, text, integer, integer, integer, jsonb, text) to service_role;
