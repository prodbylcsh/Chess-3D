-- Guests in puzzles (docs/PLATFORM.md §4.2, October 2026): signed-out visitors play the
-- first puzzles of the free module and the daily puzzle under an anonymous session; the
-- `puzzles` function moves their progress into the account they sign up or in to. A guest
-- keeps playing without signing in again (token refreshes don't update last_sign_in_at),
-- so the retention job (Privacy Policy §6) now counts their last puzzle as activity too.

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
    returning 1
  )
  select count(*) into guests_deleted from gone;

  return next;
end;
$$;

revoke all on function public.cleanup_inactive(interval) from public, anon, authenticated;
grant execute on function public.cleanup_inactive(interval) to service_role;
