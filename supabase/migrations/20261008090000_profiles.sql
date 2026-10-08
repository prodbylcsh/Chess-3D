-- Player profiles (milestone 4). One row per registered account, created by the
-- `account` Edge Function the first time the player signs in. Anonymous guests
-- (invite-link games) have no profile.
--
-- Clients may only READ profiles; every write goes through the `account`
-- function, which applies the rules in functions/_shared/accounts.ts. The
-- constraints below repeat the essentials so the database stays consistent even
-- if a write ever bypasses the function.

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            text,
  icon_id             text,
  onboarding_step     smallint not null default 0 check (onboarding_step between 0 and 4),
  onboarded_at        timestamptz,
  username_changed_at timestamptz,
  created_at          timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint profiles_onboarded_complete check (onboarded_at is null or (username is not null and icon_id is not null))
);

-- Usernames are unique regardless of case ("Knight" blocks "knight").
create unique index profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

-- Profiles are public (username, icon, join date): anyone signed in may read
-- them, anonymous guests included. No insert/update/delete policies exist.
create policy "profiles are readable by signed-in users"
  on public.profiles for select
  to authenticated
  using (true);

grant select, insert, update, delete on table public.profiles to service_role;
grant select on table public.profiles to authenticated;
revoke all on table public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on table public.profiles from authenticated;
