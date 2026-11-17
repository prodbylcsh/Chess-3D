-- Platform audit, 17 November 2026.
--
-- 1. Waiting games are no longer listable. Until now every signed-in user (anonymous guests
--    too) could select every waiting game from `games` (and its copy in `game_watch`) and
--    take its free seat. Now a waiting game is read only by its id (`waiting_game`, the
--    invite link), and an invite for one player (a friend's invite, a rematch) can be
--    joined only by that player (`games.invited_id`, checked by the `game` function).
--
-- 2. A refund or chargeback that arrives before the payment's own notification is kept
--    (`payment_reversals`): the payment, when it comes, is recorded as refunded and gives
--    nothing. Paddle does not promise the order of its notifications. All four payment
--    functions take a lock per transaction id, so a payment and its reversal never
--    interleave.

-- ------------------------------------------------------------------ 1. invites

alter table public.games add column invited_id uuid references auth.users (id) on delete set null;

drop policy "players read their games" on public.games;
create policy "players read their games" on public.games for select to authenticated
  using ((select auth.uid()) = white_id or (select auth.uid()) = black_id);

/** A waiting game by its id (the invite link carries it). Nobody can list waiting games. */
create or replace function public.waiting_game(p_id text)
returns setof public.games
language sql
stable
security definer
set search_path = ''
as $$
  select g.* from public.games g
  where (select auth.uid()) is not null and g.id = p_id and g.status = 'waiting';
$$;
revoke all on function public.waiting_game(text) from public, anon;
grant execute on function public.waiting_game(text) to authenticated;

/** Is this game an invite for one player (spectators may follow such a rematch while it waits)? */
create or replace function public.invite_only(p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.games g where g.id = p_id and g.invited_id is not null);
$$;
revoke all on function public.invite_only(text) from public, anon;
grant execute on function public.invite_only(text) to authenticated;

-- spectators: a waiting game only when it is a rematch (an invite for one player), never a
-- game anyone could still join
drop policy "spectators read games they may watch" on public.game_watch;
create policy "spectators read games they may watch" on public.game_watch for select to authenticated
  using (
    public.can_watch(white_id, black_id)
    and (status <> 'waiting' or (select auth.uid()) = white_id or (select auth.uid()) = black_id or public.invite_only(id))
  );

-- ------------------------------------------------------------------ 2. reversals

-- every refund or chargeback Paddle reported, by transaction id, whatever arrived first
create table public.payment_reversals (
  id          text primary key,
  reversed_at timestamptz not null default now()
);
alter table public.payment_reversals enable row level security;
grant select, insert, update, delete on table public.payment_reversals to service_role;
revoke all on table public.payment_reversals from anon, authenticated;

/** Credit a paid purchase once (the webhook may come more than once, or before the app's row). */
create or replace function public.complete_purchase(
  p_id text, p_player uuid, p_pack text, p_coins integer, p_amount integer, p_currency text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_id));
  insert into public.purchases (id, player_id, pack, coins, amount, currency)
  values (p_id, p_player, p_pack, p_coins, p_amount, p_currency)
  on conflict (id) do nothing;
  if exists (select 1 from public.payment_reversals r where r.id = p_id) then
    -- refunded before Paddle told us it was paid: nothing to credit
    update public.purchases p set status = 'refunded', refunded_at = coalesce(p.refunded_at, now()), amount = p_amount, currency = p_currency
    where p.id = p_id and p.status = 'created';
    return false;
  end if;
  update public.purchases p set status = 'completed', completed_at = now(), amount = p_amount, currency = p_currency
  where p.id = p_id and p.status = 'created';
  if not found then
    return false;
  end if;
  update public.players pl set coins = pl.coins + p_coins where pl.id = p_player;
  insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, p_coins, 'coins_bought', p_id);
  return true;
end;
$$;

/** Take back the coins of a refunded or charged-back purchase once (never below zero). */
create or replace function public.reverse_purchase(p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  bought public.purchases;
  old_coins integer;
  new_coins integer;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_id));
  insert into public.payment_reversals (id) values (p_id) on conflict do nothing;
  -- opened but not paid yet: it never will be credited
  update public.purchases p set status = 'refunded', refunded_at = now() where p.id = p_id and p.status = 'created';
  update public.purchases p set status = 'refunded', refunded_at = now()
  where p.id = p_id and p.status = 'completed'
  returning * into bought;
  if not found then
    return false;
  end if;
  select pl.coins into old_coins from public.players pl where pl.id = bought.player_id for update;
  new_coins := greatest(0, old_coins - bought.coins);
  update public.players pl set coins = new_coins where pl.id = bought.player_id;
  insert into public.coin_ledger (player_id, amount, reason, ref) values (bought.player_id, new_coins - old_coins, 'coins_refunded', p_id);
  return true;
end;
$$;

/** Record a paid period once (the webhook may come more than once); a period refunded before it was recorded owes nothing. */
create or replace function public.record_subscription_payment(
  p_id text, p_sub text, p_player uuid, p_plan text, p_start timestamptz, p_end timestamptz, p_amount integer, p_currency text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  reversed boolean;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_id));
  reversed := exists (select 1 from public.payment_reversals r where r.id = p_id);
  insert into public.subscription_payments (id, subscription_id, player_id, plan, period_start, period_end, amount, currency, status, refunded_at)
  values (p_id, p_sub, p_player, p_plan, p_start, p_end, p_amount, p_currency,
          case when reversed then 'refunded' else 'completed' end, case when reversed then now() end)
  on conflict (id) do nothing;
  return found and not reversed;
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
  perform pg_advisory_xact_lock(hashtext('payment:' || p_id));
  insert into public.payment_reversals (id) values (p_id) on conflict do nothing;
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
