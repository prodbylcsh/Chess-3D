-- Fair play (docs/PLATFORM.md §6.4): signs of engine help in ranked, casual and coin games,
-- for the operator to review. Nothing here punishes anyone.
--  * games.move_ms: the server's think time per move (games with clocks)
--  * fairplay_games: per player and analysed game, the signals from the engine analysis, the
--    move times and the player's own record of leaving the game (`play` function, _shared/fairplay.ts)
--  * fairplay_flags: per player, the level and reasons over their recent games; the operator
--    reviews `fairplay_queue` in the dashboard and sets the status (open / cleared / confirmed)
-- Server only. Signals are kept for 12 months (Privacy Policy §6).

alter table public.games add column move_ms integer[];

create table public.fairplay_games (
  game_id    text not null references public.games (id) on delete cascade,
  player_id  uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('ranked', 'casual', 'wager')),
  -- the player's MMR before the game
  mmr        integer not null,
  -- 'agreed': both analyses; 'opponent': only the opponent's report so far (it could be made up)
  source     text not null check (source in ('agreed', 'opponent')),
  signals    jsonb not null,
  played_at  timestamptz not null,
  primary key (game_id, player_id)
);
create index fairplay_games_player_idx on public.fairplay_games (player_id, played_at desc);
alter table public.fairplay_games enable row level security; -- no policies: server only
grant select, insert, update, delete on table public.fairplay_games to service_role;
revoke all on table public.fairplay_games from anon, authenticated;

create table public.fairplay_flags (
  player_id      uuid primary key references auth.users (id) on delete cascade,
  level          integer not null default 0,
  reasons        jsonb not null default '[]',
  stats          jsonb not null default '{}',
  updated_at     timestamptz not null default now(),
  -- the operator's verdict; a cleared player comes back to the queue when the level rises
  status         text not null default 'open' check (status in ('open', 'cleared', 'confirmed')),
  reviewed_level integer,
  reviewed_at    timestamptz,
  note           text
);
alter table public.fairplay_flags enable row level security; -- no policies: server only
grant select, insert, update, delete on table public.fairplay_flags to service_role;
revoke all on table public.fairplay_flags from anon, authenticated;

-- the operator sets status (and a note) in the dashboard: remember the level they saw
create or replace function public.fairplay_reviewed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status <> 'open' then
    new.reviewed_level := new.level;
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
create trigger fairplay_reviewed before update of status on public.fairplay_flags
  for each row execute function public.fairplay_reviewed();

/** A player's new review (the `play` function): a cleared player is reopened when the level rises. */
create or replace function public.fairplay_flag(p_player uuid, p_level integer, p_reasons jsonb, p_stats jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fairplay_flags as f (player_id, level, reasons, stats, updated_at)
  values (p_player, p_level, p_reasons, p_stats, now())
  on conflict (player_id) do update set
    level = excluded.level,
    reasons = excluded.reasons,
    stats = excluded.stats,
    updated_at = now(),
    status = case when f.status = 'cleared' and excluded.level > coalesce(f.reviewed_level, 0) then 'open' else f.status end;
end;
$$;
revoke all on function public.fairplay_flag(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.fairplay_flag(uuid, integer, jsonb, jsonb) to service_role;

-- what the operator reviews: open flags from level 2 (FAIRPLAY.reviewLevel), and anyone with
-- an open cheating report, highest first
create view public.fairplay_queue as
select
  f.player_id, p.username, f.level, f.reasons, f.stats,
  (select count(*) from public.reports r where r.reported = f.player_id and r.reason = 'cheating' and r.status = 'open')::int as cheating_reports,
  pl.mmr, f.status, f.updated_at, f.reviewed_level, f.reviewed_at, f.note
from public.fairplay_flags f
left join public.profiles p on p.id = f.player_id
left join public.players pl on pl.id = f.player_id
where f.status = 'open'
  and (f.level >= 2 or exists (select 1 from public.reports r where r.reported = f.player_id and r.reason = 'cheating' and r.status = 'open'))
order by f.level desc, cheating_reports desc, f.updated_at desc;
revoke all on table public.fairplay_queue from public, anon, authenticated;
grant select on table public.fairplay_queue to service_role;

-- the report queue shows the reported player's fair-play level next to a report
create or replace view public.report_queue as
select
  r.id, r.status, r.created_at, r.reason,
  reported.username as reported_name, r.reported,
  reporter.username as reporter_name, r.reporter,
  r.message_body, r.note,
  (select count(*) from public.reports o where o.reported = r.reported)::int as reports_of_player,
  r.handled_at, r.handled_note,
  (select f.level from public.fairplay_flags f where f.player_id = r.reported) as fair_play_level
from public.reports r
left join public.profiles reported on reported.id = r.reported
left join public.profiles reporter on reporter.id = r.reporter
order by (r.status = 'open') desc, r.created_at desc;
revoke all on table public.report_queue from public, anon, authenticated;
grant select on table public.report_queue to service_role;

select cron.schedule('cleanup-fairplay', '47 3 * * *', $$delete from public.fairplay_games where played_at < now() - interval '12 months'$$);
