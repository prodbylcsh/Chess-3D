-- Blocking and reporting players (docs/PLATFORM.md §4.4, October 2026).
--  * blocks: a player blocks another; the friendship or request between them goes, neither
--    can send the other a friend request, and matchmaking never pairs them. Only the
--    blocker sees the row; the blocked player is not told.
--  * reports: a player reports another (their username, cheating, their behaviour) or one
--    of their messages, for the operator to review (`report_queue`, service role only).
--    Kept for 12 months (Privacy Policy §6).
-- Every write goes through the `social` function.

create table public.blocks (
  blocker    uuid not null references auth.users (id) on delete cascade,
  blocked    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint blocks_not_self check (blocker <> blocked)
);
create index blocks_blocked_idx on public.blocks (blocked);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  -- a report stays when the reporter deletes their account (the operator may still act on it)
  reporter     uuid references auth.users (id) on delete set null,
  reported     uuid not null references auth.users (id) on delete cascade,
  reason       text not null check (reason in ('cheating', 'abuse', 'username', 'spam', 'other')),
  -- a reported message: its id and a copy of what it said when it was reported
  message_id   uuid,
  message_body text,
  note         text check (char_length(note) <= 500),
  status       text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  handled_at   timestamptz,
  handled_note text,
  created_at   timestamptz not null default now()
);
create index reports_open_idx on public.reports (status, created_at);
create index reports_reporter_idx on public.reports (reporter, created_at);

alter table public.blocks enable row level security;
alter table public.reports enable row level security; -- no policies: the operator only
create policy "players see whom they blocked" on public.blocks for select to authenticated
  using ((select auth.uid()) = blocker);
grant select, insert, update, delete on table public.blocks, public.reports to service_role;
revoke all on table public.blocks, public.reports from anon, authenticated;
grant select on table public.blocks to authenticated;

-- For the operator (dashboard, SQL editor): open reports first, with both usernames and
-- how often the reported player was reported.
create view public.report_queue as
select
  r.id, r.status, r.created_at, r.reason,
  reported.username as reported_name, r.reported,
  reporter.username as reporter_name, r.reporter,
  r.message_body, r.note,
  (select count(*) from public.reports o where o.reported = r.reported)::int as reports_of_player,
  r.handled_at, r.handled_note
from public.reports r
left join public.profiles reported on reported.id = r.reported
left join public.profiles reporter on reporter.id = r.reporter
order by (r.status = 'open') desc, r.created_at desc;
revoke all on table public.report_queue from public, anon, authenticated;
grant select on table public.report_queue to service_role;

select cron.schedule('cleanup-reports', '27 3 * * *', $$delete from public.reports where created_at < now() - interval '12 months'$$);

-- matchmaking, as before (20261011120000_competitive.sql), never pairing blocked players
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
  -- searches that stopped polling, and matches nobody picked up within an hour
  delete from public.mm_queue q
  where (q.game_id is null and q.heartbeat_at < now() - interval '15 seconds')
     or (q.game_id is not null and q.heartbeat_at < now() - interval '1 hour');

  select * into me from public.mm_queue q where q.player_id = p_player for update;
  if found and me.game_id is not null then
    -- another player's search matched this one: hand over the game, unless it has already
    -- ended (the player came back later); then this is a new search
    delete from public.mm_queue q where q.player_id = p_player;
    if exists (select 1 from public.games g where g.id = me.game_id and g.status = 'active') then
      return me.game_id;
    end if;
    me := null;
  end if;
  if me.player_id is null or me.kind <> p_kind or me.control <> p_control or coalesce(me.stake, 0) <> coalesce(p_stake, 0) then
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
    -- players who blocked each other are never matched
    and not exists (
      select 1 from public.blocks b
      where (b.blocker = p_player and b.blocked = q.player_id) or (b.blocker = q.player_id and b.blocked = p_player)
    )
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
