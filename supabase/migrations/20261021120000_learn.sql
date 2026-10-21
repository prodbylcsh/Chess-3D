-- Learn (docs/PLATFORM.md §4.3): lessons that teach the game. The `puzzles` function
-- records finished lessons (in order, not faster than MIN_LESSON_MS apart), pays
-- CHAPTER_REWARD once per finished chapter and unlocks the paid chapters together for
-- LEARN_PRICE coins (functions/_shared/learn.ts). Guests keep their lessons until they sign
-- up or in, like their puzzles. Clients read their own rows; every write goes through the
-- function.

create table public.learn_lessons (
  player_id uuid not null references auth.users (id) on delete cascade,
  lesson    text not null,
  done_at   timestamptz not null default now(),
  primary key (player_id, lesson)
);

create table public.learn_chapters (
  player_id  uuid not null references auth.users (id) on delete cascade,
  chapter    text not null,
  coins      integer not null,
  rewarded_at timestamptz not null default now(),
  primary key (player_id, chapter)
);

create table public.learn_unlocks (
  player_id   uuid primary key references auth.users (id) on delete cascade,
  unlocked_at timestamptz not null default now()
);

alter table public.learn_lessons enable row level security;
alter table public.learn_chapters enable row level security;
alter table public.learn_unlocks enable row level security;
create policy "players see their own lessons" on public.learn_lessons for select to authenticated
  using ((select auth.uid()) = player_id);
create policy "players see their own chapters" on public.learn_chapters for select to authenticated
  using ((select auth.uid()) = player_id);
create policy "players see their own unlock" on public.learn_unlocks for select to authenticated
  using ((select auth.uid()) = player_id);
grant select, insert, update, delete on table public.learn_lessons, public.learn_chapters, public.learn_unlocks to service_role;
revoke all on table public.learn_lessons, public.learn_chapters, public.learn_unlocks from anon, authenticated;
grant select on table public.learn_lessons, public.learn_chapters, public.learn_unlocks to authenticated;

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('game', 'wager_stake', 'wager_payout', 'purchase', 'season', 'performance', 'coins_bought',
                    'coins_refunded', 'puzzle', 'puzzle_bonus', 'puzzle_unlock', 'puzzle_reward',
                    'puzzle_daily', 'puzzle_streak', 'learn_unlock', 'learn_reward'));

/**
 * Record a finished lesson. `p_lessons`: the lesson ids of its chapter. When this lesson
 * finishes the chapter, `p_reward` coins are paid once (a guest has no player row: the
 * ledger keeps it until they claim). Returns { first, chapter_done, reward }.
 * Raises 'too_fast' when the player's previous lesson ended less than `p_min_ms` ago.
 */
create or replace function public.complete_lesson(
  p_player uuid, p_lesson text, p_chapter text, p_lessons text[], p_reward integer, p_min_ms integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  last timestamptz;
  done integer;
  paid integer := 0;
begin
  if exists (select 1 from public.learn_lessons l where l.player_id = p_player and l.lesson = p_lesson) then
    return jsonb_build_object('first', false, 'chapter_done', false, 'reward', 0);
  end if;
  select max(l.done_at) into last from public.learn_lessons l where l.player_id = p_player;
  if last is not null and now() < last + make_interval(secs => p_min_ms / 1000.0) then
    raise exception 'too_fast';
  end if;
  insert into public.learn_lessons (player_id, lesson) values (p_player, p_lesson) on conflict do nothing;
  if not found then
    return jsonb_build_object('first', false, 'chapter_done', false, 'reward', 0);
  end if;
  select count(*) into done from public.learn_lessons l where l.player_id = p_player and l.lesson = any (p_lessons);
  if done >= array_length(p_lessons, 1) then
    insert into public.learn_chapters (player_id, chapter, coins) values (p_player, p_chapter, p_reward) on conflict do nothing;
    if found then
      paid := p_reward;
      update public.players pl set coins = pl.coins + p_reward where pl.id = p_player;
      insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, p_reward, 'learn_reward', p_chapter);
    end if;
  end if;
  return jsonb_build_object('first', true, 'chapter_done', done >= array_length(p_lessons, 1), 'reward', paid);
end;
$$;

/** Unlock the paid chapters for `p_price` coins, once. */
create or replace function public.unlock_learn(p_player uuid, p_price integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.learn_unlocks u where u.player_id = p_player) then
    return false;
  end if;
  update public.players pl set coins = pl.coins - p_price where pl.id = p_player and pl.coins >= p_price;
  if not found then
    raise exception 'cannot_unlock';
  end if;
  insert into public.learn_unlocks (player_id) values (p_player);
  insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, -p_price, 'learn_unlock', 'learn');
  return true;
end;
$$;

/** A chapter a guest finished, moved into the account: the reward once, if the account had not had it. */
create or replace function public.claim_chapter(p_player uuid, p_chapter text, p_reward integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.learn_chapters (player_id, chapter, coins) values (p_player, p_chapter, p_reward) on conflict do nothing;
  if not found then
    return false;
  end if;
  update public.players pl set coins = pl.coins + p_reward where pl.id = p_player;
  insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, p_reward, 'learn_reward', p_chapter);
  return true;
end;
$$;

revoke all on function public.claim_chapter(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_chapter(uuid, text, integer) to service_role;
revoke all on function public.complete_lesson(uuid, text, text, text[], integer, integer) from public, anon, authenticated;
revoke all on function public.unlock_learn(uuid, integer) from public, anon, authenticated;
grant execute on function public.complete_lesson(uuid, text, text, text[], integer, integer) to service_role;
grant execute on function public.unlock_learn(uuid, integer) to service_role;

-- a guest who keeps learning is active too (retention, Privacy Policy §6)
create or replace function public.cleanup_inactive(older_than interval default interval '6 months')
returns table (games_deleted integer, guests_deleted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := now() - older_than;
begin
  with gone as (
    delete from public.games g
    where g.updated_at < cutoff
      and not exists (
        select 1 from auth.users u
        where u.id in (g.white_id, g.black_id) and not u.is_anonymous
      )
    returning 1
  )
  select count(*) into games_deleted from gone;

  with gone as (
    delete from auth.users u
    where u.is_anonymous
      and coalesce(u.last_sign_in_at, u.created_at) < cutoff
      and not exists (
        select 1 from public.games g
        where u.id in (g.white_id, g.black_id) and g.updated_at >= cutoff
      )
      and not exists (select 1 from public.puzzle_solves s where s.player_id = u.id and s.tried_at >= cutoff)
      and not exists (select 1 from public.puzzle_daily d where d.player_id = u.id and d.solved_at >= cutoff)
      and not exists (select 1 from public.puzzle_attempts a where a.player_id = u.id and a.started_at >= cutoff)
      and not exists (select 1 from public.learn_lessons l where l.player_id = u.id and l.done_at >= cutoff)
    returning 1
  )
  select count(*) into guests_deleted from gone;

  return next;
end;
$$;

revoke all on function public.cleanup_inactive(interval) from public, anon, authenticated;
grant execute on function public.cleanup_inactive(interval) to service_role;
