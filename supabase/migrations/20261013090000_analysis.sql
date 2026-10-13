-- Engine analysis of ranked and casual games (docs/PLATFORM.md §5.2, §8.2). A game is
-- settled at once with neutral accuracy; each player's browser then analyses it with
-- Stockfish and reports a score per position (the `play` function, action 'analysis').
-- When both reports agree, the performance part of MMR and coins is added. Server only.

create table public.game_analysis (
  game_id    text primary key references public.games (id) on delete cascade,
  -- the settlement's input (both players' state before the game: private MMR, so server only)
  game       jsonb not null,
  -- { w: { engine, scores[] }, b: … } as the players reported them
  reports    jsonb not null default '{}',
  status     text not null default 'waiting' check (status in ('waiting', 'applied', 'mismatch')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.game_analysis enable row level security; -- no policies: server only
grant select, insert, update, delete on table public.game_analysis to service_role;
revoke all on table public.game_analysis from anon, authenticated;

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('game', 'wager_stake', 'wager_payout', 'purchase', 'season', 'performance'));

/**
 * Add a player's report to a game still waiting for analysis (a report is kept once and
 * counts only within a day of the game). Returns the row, or nothing when there is none.
 */
create or replace function public.analysis_report(p_game text, p_color text, p_report jsonb) returns setof public.game_analysis
language plpgsql security definer set search_path = '' as $$
begin
  update public.game_analysis a set reports = a.reports || jsonb_build_object(p_color, p_report)
  where a.game_id = p_game and a.status = 'waiting' and not (a.reports ? p_color)
    and a.created_at > now() - interval '24 hours';
  return query select * from public.game_analysis a where a.game_id = p_game;
end;
$$;

/**
 * Decide a game's analysis once: 'mismatch' changes nothing; 'applied' adds each player's
 * performance part. Rows: [{ player_id, season, accuracy, mmr_delta, coins_delta, result{…} }];
 * `result` holds the game's new mmr_delta, coins_delta and breakdown parts.
 */
create or replace function public.apply_analysis(p_game text, p_status text, p_rows jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  player uuid;
  mmr_delta integer;
  coins_delta integer;
  old_coins integer;
  new_coins integer;
begin
  update public.game_analysis a set status = p_status, decided_at = now()
  where a.game_id = p_game and a.status = 'waiting';
  if not found then
    return false;
  end if;
  if p_status <> 'applied' then
    return true;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    player := (r->>'player_id')::uuid;
    mmr_delta := coalesce((r->>'mmr_delta')::integer, 0);
    coins_delta := coalesce((r->>'coins_delta')::integer, 0);

    -- MMR only within the same season (a season end in between already reset it)
    if mmr_delta <> 0 then
      update public.players p set
        mmr = greatest(0, p.mmr + mmr_delta),
        season_peak_mmr = greatest(p.season_peak_mmr, p.mmr + mmr_delta)
      where p.id = player and p.season = (r->>'season')::integer;
    end if;

    if coins_delta <> 0 then
      select p.coins into old_coins from public.players p where p.id = player for update;
      new_coins := greatest(0, old_coins + coins_delta);
      update public.players p set coins = new_coins where p.id = player;
      if new_coins <> old_coins then
        insert into public.coin_ledger (player_id, amount, reason, ref) values (player, new_coins - old_coins, 'performance', p_game);
      end if;
    end if;

    update public.game_results g set
      accuracy = (r->>'accuracy')::integer,
      mmr_delta = coalesce((r->'result'->>'mmr_delta')::integer, g.mmr_delta),
      coins_delta = coalesce((r->'result'->>'coins_delta')::integer, g.coins_delta),
      breakdown = coalesce(g.breakdown, '{}') || coalesce(r->'result'->'breakdown', '{}')
    where g.game_id = p_game and g.player_id = player;
  end loop;
  return true;
end;
$$;

revoke all on function public.analysis_report(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.apply_analysis(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.analysis_report(text, text, jsonb) to service_role;
grant execute on function public.apply_analysis(text, text, jsonb) to service_role;

-- reports count for a day; the outcome is in game_results, so the rows go after two
select cron.schedule('analysis-cleanup', '37 3 * * *', $$delete from public.game_analysis where created_at < now() - interval '2 days'$$);
