-- Awards kept on the server (docs/PLATFORM.md §4.3): granted when a game is settled or its
-- analysis applied (functions/_shared/awards.ts), each once, with when it was earned and the
-- game that earned it. Profiles are public to signed-in players, and so are awards.

create table public.player_awards (
  player_id uuid not null references auth.users (id) on delete cascade,
  award_id  text not null,
  earned_at timestamptz not null default now(),
  -- the game that earned it (null for awards given from earlier progress)
  game_id   text references public.games (id) on delete set null,
  primary key (player_id, award_id)
);

alter table public.player_awards enable row level security;
create policy "awards are readable by signed-in users" on public.player_awards for select to authenticated
  using (true);
grant select, insert, update, delete on table public.player_awards to service_role;
revoke all on table public.player_awards from anon, authenticated;
grant select on table public.player_awards to authenticated;

/** Grant awards once; returns the ones that are new. */
create or replace function public.grant_awards(p_player uuid, p_awards text[], p_game text) returns text[]
language sql security definer set search_path = '' as $$
  with added as (
    insert into public.player_awards (player_id, award_id, game_id)
    select p_player, a, p_game from unnest(p_awards) a
    on conflict (player_id, award_id) do nothing
    returning award_id
  )
  select coalesce(array_agg(award_id), '{}') from added;
$$;
revoke all on function public.grant_awards(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.grant_awards(uuid, text[], text) to service_role;

-- What players had earned before awards were stored (the same rules, from their stats and
-- recorded games). Ranks count by the highest MMR of the season (gold 1,200, platinum 1,600,
-- diamond 2,400, as in rating.ts).
insert into public.player_awards (player_id, award_id)
select p.id, a.award_id
from public.players p
cross join lateral (values
  ('first-win', p.wins >= 1),
  ('wins-10', p.wins >= 10),
  ('wins-100', p.wins >= 100),
  ('games-500', p.wins + p.losses + p.draws >= 500),
  ('streak-5', p.best_streak >= 5),
  ('streak-10', p.best_streak >= 10),
  ('tier-gold', greatest(p.mmr, p.season_peak_mmr) >= 1200),
  ('tier-platinum', greatest(p.mmr, p.season_peak_mmr) >= 1600),
  ('tier-diamond', greatest(p.mmr, p.season_peak_mmr) >= 2400)
) as a (award_id, met)
where a.met
on conflict do nothing;

insert into public.player_awards (player_id, award_id, earned_at, game_id)
select distinct on (r.player_id, a.award_id) r.player_id, a.award_id, r.played_at, r.game_id
from public.game_results r
cross join lateral (values
  ('accuracy-90', coalesce(r.accuracy, 0) >= 90),
  ('quick-mate', r.outcome = 'win' and r.reason = 'checkmate' and r.moves <= 40)
) as a (award_id, met)
where a.met
order by r.player_id, a.award_id, r.played_at
on conflict do nothing;
