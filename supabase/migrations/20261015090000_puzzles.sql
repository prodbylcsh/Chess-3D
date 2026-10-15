-- Puzzles (docs/PLATFORM.md §4.2): themed modules of 100 puzzles. The `puzzles` function
-- checks each solution and pays coins for the first solve, a bonus every 10 puzzles and a
-- reward for finishing a module; paid modules are unlocked with coins. Clients read their
-- own progress; every write goes through the function. Rules: functions/_shared/puzzles.ts.

create table public.puzzle_solves (
  player_id uuid not null references auth.users (id) on delete cascade,
  module    text not null,
  idx       smallint not null check (idx between 0 and 99),
  -- the best of the player's solves (1–3)
  stars     smallint not null check (stars between 1 and 3),
  solved_at timestamptz not null default now(),
  primary key (player_id, module, idx)
);

create table public.puzzle_modules (
  player_id    uuid not null references auth.users (id) on delete cascade,
  module       text not null,
  unlocked_at  timestamptz,
  completed_at timestamptz,
  -- what finishing it gave: an item, or coins when the player owned everything
  reward_item  text,
  reward_coins integer,
  primary key (player_id, module)
);

-- the puzzle a player opened last and when (a solve needs a few seconds of thinking)
create table public.puzzle_attempts (
  player_id  uuid primary key references auth.users (id) on delete cascade,
  module     text not null,
  idx        smallint not null,
  started_at timestamptz not null default now()
);

alter table public.puzzle_solves enable row level security;
alter table public.puzzle_modules enable row level security;
alter table public.puzzle_attempts enable row level security; -- no policies: server only
create policy "players see their own solves" on public.puzzle_solves for select to authenticated
  using ((select auth.uid()) = player_id);
create policy "players see their own modules" on public.puzzle_modules for select to authenticated
  using ((select auth.uid()) = player_id);
grant select, insert, update, delete on table public.puzzle_solves, public.puzzle_modules, public.puzzle_attempts to service_role;
revoke all on table public.puzzle_solves, public.puzzle_modules, public.puzzle_attempts from anon, authenticated;
grant select on table public.puzzle_solves, public.puzzle_modules to authenticated;

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('game', 'wager_stake', 'wager_payout', 'purchase', 'season', 'performance', 'coins_bought',
                    'coins_refunded', 'puzzle', 'puzzle_bonus', 'puzzle_unlock', 'puzzle_reward'));
alter table public.player_items drop constraint player_items_source_check;
alter table public.player_items add constraint player_items_source_check
  check (source in ('purchase', 'season', 'grant', 'puzzle'));

/**
 * Record a solve. The first solve of a puzzle pays `p_coins`, and when it brings the
 * module's count to a multiple of `p_every`, also `p_bonus`. Returns
 * { first, solved (the module's count), coins, bonus }.
 */
create or replace function public.solve_puzzle(
  p_player uuid, p_module text, p_idx integer, p_stars integer, p_coins integer, p_every integer, p_bonus integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  first boolean;
  solved integer;
  bonus integer := 0;
begin
  insert into public.puzzle_solves (player_id, module, idx, stars) values (p_player, p_module, p_idx, p_stars)
  on conflict (player_id, module, idx) do update set stars = greatest(public.puzzle_solves.stars, excluded.stars)
  returning (xmax = 0) into first;
  select count(*) into solved from public.puzzle_solves s where s.player_id = p_player and s.module = p_module;
  if not first then
    return jsonb_build_object('first', false, 'solved', solved, 'coins', 0, 'bonus', 0);
  end if;
  if solved % p_every = 0 then bonus := p_bonus; end if;
  update public.players pl set coins = pl.coins + p_coins + bonus where pl.id = p_player;
  insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, p_coins, 'puzzle', p_module || ':' || p_idx);
  if bonus > 0 then
    insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, bonus, 'puzzle_bonus', p_module || ':' || solved);
  end if;
  return jsonb_build_object('first', true, 'solved', solved, 'coins', p_coins, 'bonus', bonus);
end;
$$;

/** Unlock a module for coins, once; raises 'cannot_unlock' without enough coins. */
create or replace function public.unlock_module(p_player uuid, p_module text, p_price integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.puzzle_modules m where m.player_id = p_player and m.module = p_module and m.unlocked_at is not null) then
    return false;
  end if;
  update public.players pl set coins = pl.coins - p_price where pl.id = p_player and pl.coins >= p_price;
  if not found then
    raise exception 'cannot_unlock';
  end if;
  insert into public.puzzle_modules (player_id, module, unlocked_at) values (p_player, p_module, now())
  on conflict (player_id, module) do update set unlocked_at = now();
  insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, -p_price, 'puzzle_unlock', p_module);
  return true;
end;
$$;

/** Give the finishing reward once: an item (`p_item`) or coins. */
create or replace function public.complete_module(p_player uuid, p_module text, p_item text, p_coins integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.puzzle_modules (player_id, module) values (p_player, p_module) on conflict do nothing;
  update public.puzzle_modules m set completed_at = now(), reward_item = p_item, reward_coins = case when p_item is null then p_coins end
  where m.player_id = p_player and m.module = p_module and m.completed_at is null;
  if not found then
    return false;
  end if;
  if p_item is not null then
    insert into public.player_items (player_id, item_id, source) values (p_player, p_item, 'puzzle') on conflict do nothing;
  else
    update public.players pl set coins = pl.coins + p_coins where pl.id = p_player;
    insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, p_coins, 'puzzle_reward', p_module);
  end if;
  return true;
end;
$$;

revoke all on function public.solve_puzzle(uuid, text, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.unlock_module(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.complete_module(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.solve_puzzle(uuid, text, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.unlock_module(uuid, text, integer) to service_role;
grant execute on function public.complete_module(uuid, text, text, integer) to service_role;
