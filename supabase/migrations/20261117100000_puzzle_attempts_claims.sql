-- Platform audit, 17 November 2026.
--
-- 1. Puzzle attempts per puzzle, not per player. One row per player used to hold the puzzle
--    opened last: a second tab (or the daily puzzle) overwrote the first tab's attempt, and
--    a solve deleted whatever attempt was there, even a newer one. Now each puzzle has its
--    own attempt row with an id; a solve or reveal consumes exactly the attempt it checked.
--    The daily puzzle's attempt carries its UTC day: after midnight it no longer counts
--    for the new day's puzzle (the app offers the new one).
--
-- 2. A guest's progress goes to one account only. `guest_claims` binds a guest to the
--    first account that claims it; a second account gets nothing, and the same account may
--    retry a claim that failed half-way (each step is idempotent).

-- ------------------------------------------------------------------ 1. attempts

alter table public.puzzle_attempts drop constraint puzzle_attempts_pkey;
alter table public.puzzle_attempts add column id uuid not null default gen_random_uuid();
alter table public.puzzle_attempts add column day date;
alter table public.puzzle_attempts add primary key (player_id, module, idx);
create unique index puzzle_attempts_id_idx on public.puzzle_attempts (id);

-- ------------------------------------------------------------------ 2. guest claims

create table public.guest_claims (
  guest_id   uuid primary key,
  account_id uuid not null references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);
alter table public.guest_claims enable row level security; -- no policies: server only
grant select, insert, update, delete on table public.guest_claims to service_role;
revoke all on table public.guest_claims from anon, authenticated;

/** Bind a guest's progress to an account, once. Returns the account it belongs to now. */
create or replace function public.bind_guest(p_guest uuid, p_account uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  insert into public.guest_claims (guest_id, account_id) values (p_guest, p_account) on conflict (guest_id) do nothing;
  select c.account_id into owner from public.guest_claims c where c.guest_id = p_guest;
  return owner;
end;
$$;
revoke all on function public.bind_guest(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bind_guest(uuid, uuid) to service_role;
