-- Data retention (Privacy Policy §6): a daily job deletes what nobody uses any more.
--   * online games without activity for 6 months in which no registered player is seated
--     (games of registered players stay; deleting an account unlinks its games, so they
--     fall under this rule afterwards);
--   * guest (anonymous) users without a sign-in or a game move for 6 months.
-- The cutoff is a parameter so tests can run it with a short one.

create extension if not exists pg_cron with schema pg_catalog;

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
    returning 1
  )
  select count(*) into guests_deleted from gone;

  return next;
end;
$$;

revoke all on function public.cleanup_inactive(interval) from public, anon, authenticated;
grant execute on function public.cleanup_inactive(interval) to service_role;

select cron.schedule('cleanup-inactive', '17 3 * * *', $$select public.cleanup_inactive()$$);
