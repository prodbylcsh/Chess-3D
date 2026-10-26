-- Wizard Chess Premium, the subscription (docs/PLATFORM.md §4.9; rules in
-- functions/_shared/subscription.ts). Paddle sells it as the merchant of record, like the
-- coin packs: the `payments` function opens the checkout, Paddle's signed webhooks keep
-- `subscriptions` and `subscription_payments` in step. The monthly coins (and the
-- subscriber icon and streak shields that come with them) are given lazily from the paid
-- periods the next time the player shows up (`grant_subscription`), like season ends.

create table public.subscriptions (
  -- Paddle's subscription id (sub_…)
  id           text primary key,
  player_id    uuid not null references auth.users (id) on delete cascade,
  plan         text not null check (plan in ('apprentice', 'wizard', 'archmage')),
  period       text not null check (period in ('month', 'year')),
  status       text not null check (status in ('trialing', 'active', 'past_due', 'paused', 'canceled')),
  customer_id  text,
  -- the current billing period (the trial while trialing)
  period_start timestamptz,
  period_end   timestamptz,
  -- a cancellation takes effect then
  cancel_at    timestamptz,
  founder      boolean not null default false,
  created_at   timestamptz not null default now(),
  -- when Paddle saw the change this row holds: older webhooks are ignored
  event_at     timestamptz not null default now()
);
create index subscriptions_player_idx on public.subscriptions (player_id, created_at desc);

-- one row per paid billing period (a Paddle transaction of a subscription)
create table public.subscription_payments (
  id              text primary key,
  subscription_id text not null,
  player_id       uuid not null references auth.users (id) on delete cascade,
  plan            text not null check (plan in ('apprentice', 'wizard', 'archmage')),
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  amount          integer not null,
  currency        text not null,
  status          text not null default 'completed' check (status in ('completed', 'refunded')),
  created_at      timestamptz not null default now(),
  refunded_at     timestamptz
);
create index subscription_payments_player_idx on public.subscription_payments (player_id);

-- the coins (and icon) given for one month of a paid period
create table public.subscription_grants (
  payment_id      text not null references public.subscription_payments (id) on delete cascade,
  month_start     timestamptz not null,
  subscription_id text not null,
  player_id       uuid not null references auth.users (id) on delete cascade,
  plan            text not null,
  coins           integer not null check (coins >= 0),
  icon            text,
  created_at      timestamptz not null default now(),
  primary key (payment_id, month_start)
);
create index subscription_grants_player_idx on public.subscription_grants (player_id);

-- Game Reviews per UTC day (the free number and the plans' limits are in the rules)
create table public.review_uses (
  player_id uuid not null references auth.users (id) on delete cascade,
  day       date not null,
  game_id   text not null,
  at        timestamptz not null default now(),
  primary key (player_id, day, game_id)
);

-- streak shields: a missed UTC day doesn't end the daily streak
alter table public.puzzle_streaks add column shields integer not null default 0 check (shields >= 0);

alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_grants enable row level security;
alter table public.review_uses enable row level security;
create policy "players see their own subscriptions" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = player_id);
create policy "players see their own subscription payments" on public.subscription_payments for select to authenticated
  using ((select auth.uid()) = player_id);
create policy "players see their own subscription grants" on public.subscription_grants for select to authenticated
  using ((select auth.uid()) = player_id);
create policy "players see their own reviews" on public.review_uses for select to authenticated
  using ((select auth.uid()) = player_id);
grant select, insert, update, delete on table public.subscriptions, public.subscription_payments, public.subscription_grants, public.review_uses to service_role;
revoke all on table public.subscriptions, public.subscription_payments, public.subscription_grants, public.review_uses from anon, authenticated;
grant select on table public.subscriptions, public.subscription_payments, public.subscription_grants, public.review_uses to authenticated;

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('game', 'wager_stake', 'wager_payout', 'purchase', 'season', 'performance', 'coins_bought',
                    'coins_refunded', 'puzzle', 'puzzle_bonus', 'puzzle_unlock', 'puzzle_reward',
                    'puzzle_daily', 'puzzle_streak', 'learn_unlock', 'learn_reward',
                    'subscription_coins', 'subscription_refunded', 'shield_bought'));
alter table public.player_items drop constraint player_items_source_check;
alter table public.player_items add constraint player_items_source_check
  check (source in ('purchase', 'season', 'grant', 'puzzle', 'streak', 'subscription'));

/**
 * Keep a subscription row in step with a Paddle webhook (events may come in any order:
 * one older than the row's is ignored). `founder` is set when the row is created.
 */
create or replace function public.sync_subscription(
  p_id text, p_player uuid, p_plan text, p_period text, p_status text, p_customer text,
  p_start timestamptz, p_end timestamptz, p_cancel timestamptz, p_founder boolean, p_created timestamptz, p_at timestamptz
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions (id, player_id, plan, period, status, customer_id, period_start, period_end, cancel_at, founder, created_at, event_at)
  values (p_id, p_player, p_plan, p_period, p_status, p_customer, p_start, p_end, p_cancel, p_founder, p_created, p_at)
  on conflict (id) do update set
    plan = excluded.plan, period = excluded.period, status = excluded.status,
    customer_id = coalesce(excluded.customer_id, public.subscriptions.customer_id),
    period_start = excluded.period_start, period_end = excluded.period_end, cancel_at = excluded.cancel_at,
    event_at = excluded.event_at
  where public.subscriptions.event_at <= excluded.event_at and public.subscriptions.player_id = excluded.player_id;
  return found;
end;
$$;

/**
 * Give what the paid periods owe (computed by `grantsDue` in the rules): each grant once,
 * its coins, its subscriber icon, and streak shields refilled to the plan's number.
 * `p_grants`: [{ payment_id, subscription_id, month_start, plan, coins, icon, shields }].
 * Returns the coins given now.
 */
create or replace function public.grant_subscription(p_player uuid, p_grants jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  g jsonb;
  total integer := 0;
  amt integer;
begin
  for g in select value from jsonb_array_elements(p_grants) loop
    amt := (g ->> 'coins')::integer;
    insert into public.subscription_grants (payment_id, month_start, subscription_id, player_id, plan, coins, icon)
    select g ->> 'payment_id', (g ->> 'month_start')::timestamptz, g ->> 'subscription_id', p_player, g ->> 'plan', amt, g ->> 'icon'
    where exists (select 1 from public.subscription_payments p where p.id = g ->> 'payment_id' and p.player_id = p_player and p.status = 'completed')
    on conflict do nothing;
    if not found then
      continue;
    end if;
    if amt > 0 then
      update public.players pl set coins = pl.coins + amt where pl.id = p_player;
      insert into public.coin_ledger (player_id, amount, reason, ref)
      values (p_player, amt, 'subscription_coins', (g ->> 'payment_id') || ':' || (g ->> 'month_start'));
      total := total + amt;
    end if;
    if g ->> 'icon' is not null then
      -- the month's icon joins the catalogue (never for sale), like season icons
      insert into public.items (id, category, rarity, price, for_sale) values (g ->> 'icon', 'icon', 'epic', 0, false)
      on conflict (id) do nothing;
      insert into public.player_items (player_id, item_id, source) values (p_player, g ->> 'icon', 'subscription') on conflict do nothing;
    end if;
    insert into public.puzzle_streaks (player_id, shields) values (p_player, (g ->> 'shields')::integer)
    on conflict (player_id) do update set shields = greatest(public.puzzle_streaks.shields, excluded.shields);
  end loop;
  return total;
end;
$$;

/** Record a paid period once (the webhook may come more than once). */
create or replace function public.record_subscription_payment(
  p_id text, p_sub text, p_player uuid, p_plan text, p_start timestamptz, p_end timestamptz, p_amount integer, p_currency text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscription_payments (id, subscription_id, player_id, plan, period_start, period_end, amount, currency)
  values (p_id, p_sub, p_player, p_plan, p_start, p_end, p_amount, p_currency)
  on conflict (id) do nothing;
  return found;
end;
$$;

/**
 * A refunded or charged-back subscription payment: its months' coins go back (never below
 * zero), its subscriber icons too, and it owes nothing more.
 */
create or replace function public.reverse_subscription_payment(p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  paid public.subscription_payments;
  given integer;
  old_coins integer;
  new_coins integer;
begin
  update public.subscription_payments p set status = 'refunded', refunded_at = now()
  where p.id = p_id and p.status = 'completed'
  returning * into paid;
  if not found then
    return false;
  end if;
  select coalesce(sum(g.coins), 0) into given from public.subscription_grants g where g.payment_id = p_id;
  select pl.coins into old_coins from public.players pl where pl.id = paid.player_id for update;
  if old_coins is not null and given > 0 then
    new_coins := greatest(0, old_coins - given);
    update public.players pl set coins = new_coins where pl.id = paid.player_id;
    insert into public.coin_ledger (player_id, amount, reason, ref) values (paid.player_id, new_coins - old_coins, 'subscription_refunded', p_id);
  end if;
  delete from public.player_items i
  where i.player_id = paid.player_id and i.source = 'subscription'
    and i.item_id in (select g.icon from public.subscription_grants g where g.payment_id = p_id and g.icon is not null)
    -- an icon another payment's month gave stays
    and not exists (select 1 from public.subscription_grants o where o.player_id = paid.player_id and o.icon = i.item_id and o.payment_id <> p_id
                    and exists (select 1 from public.subscription_payments op where op.id = o.payment_id and op.status = 'completed'));
  return true;
end;
$$;

/**
 * Streak shields: when the daily streak would break on `p_today` (days were missed since
 * the last one solved), and the player holds a shield for every missed day, the shields are
 * used and the streak goes on (the missed days count as kept, not solved). Returns the
 * shields used now.
 */
create or replace function public.use_shields(p_player uuid, p_today date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  st record;
  missed integer;
begin
  select * into st from public.puzzle_streaks s where s.player_id = p_player for update;
  if not found or st.last_day is null or st.current = 0 then
    return 0;
  end if;
  missed := (p_today - st.last_day) - 1;
  if missed < 1 or missed > st.shields then
    return 0;
  end if;
  update public.puzzle_streaks s set shields = s.shields - missed, last_day = p_today - 1 where s.player_id = p_player;
  return missed;
end;
$$;

/** Buy a streak shield for coins, while the player holds fewer than `p_cap`. */
create or replace function public.buy_shield(p_player uuid, p_price integer, p_cap integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  held integer;
begin
  insert into public.puzzle_streaks (player_id) values (p_player) on conflict do nothing;
  select s.shields into held from public.puzzle_streaks s where s.player_id = p_player for update;
  if held >= p_cap then
    raise exception 'shields_full';
  end if;
  update public.players pl set coins = pl.coins - p_price where pl.id = p_player and pl.coins >= p_price;
  if not found then
    raise exception 'cannot_buy';
  end if;
  update public.puzzle_streaks s set shields = s.shields + 1 where s.player_id = p_player;
  insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, -p_price, 'shield_bought', null);
  return held + 1;
end;
$$;

/**
 * Start a Game Review of a game on `p_day`: a game already reviewed that day opens again
 * for free; otherwise one of the day's reviews is used, while fewer than `p_limit` (null:
 * unlimited). Returns { allowed, used }.
 */
create or replace function public.start_review(p_player uuid, p_day date, p_game text, p_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  used integer;
begin
  perform pg_advisory_xact_lock(hashtext('review:' || p_player::text));
  -- only today's count matters: older days go
  delete from public.review_uses r where r.player_id = p_player and r.day < p_day - 7;
  if exists (select 1 from public.review_uses r where r.player_id = p_player and r.day = p_day and r.game_id = p_game) then
    select count(*) into used from public.review_uses r where r.player_id = p_player and r.day = p_day;
    return jsonb_build_object('allowed', true, 'used', used);
  end if;
  select count(*) into used from public.review_uses r where r.player_id = p_player and r.day = p_day;
  if p_limit is not null and used >= p_limit then
    return jsonb_build_object('allowed', false, 'used', used);
  end if;
  insert into public.review_uses (player_id, day, game_id) values (p_player, p_day, p_game);
  return jsonb_build_object('allowed', true, 'used', used + 1);
end;
$$;

revoke all on function public.sync_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.grant_subscription(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.record_subscription_payment(text, text, uuid, text, timestamptz, timestamptz, integer, text) from public, anon, authenticated;
revoke all on function public.reverse_subscription_payment(text) from public, anon, authenticated;
revoke all on function public.use_shields(uuid, date) from public, anon, authenticated;
revoke all on function public.buy_shield(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.start_review(uuid, date, text, integer) from public, anon, authenticated;
grant execute on function public.sync_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz, timestamptz) to service_role;
grant execute on function public.grant_subscription(uuid, jsonb) to service_role;
grant execute on function public.record_subscription_payment(text, text, uuid, text, timestamptz, timestamptz, integer, text) to service_role;
grant execute on function public.reverse_subscription_payment(text) to service_role;
grant execute on function public.use_shields(uuid, date) to service_role;
grant execute on function public.buy_shield(uuid, integer, integer) to service_role;
grant execute on function public.start_review(uuid, date, text, integer) to service_role;
