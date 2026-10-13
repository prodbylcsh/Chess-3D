-- Coins for real money (docs/PLATFORM.md §4.5, §8.2): Paddle sells the coin packs as the
-- merchant of record; the `payments` function opens a Paddle transaction for a pack and
-- credits the coins when Paddle's signed webhook says it was paid. A refund or chargeback
-- takes them back. Rules: functions/_shared/payments.ts.

create table public.purchases (
  -- Paddle's transaction id (txn_…)
  id           text primary key,
  player_id    uuid not null references auth.users (id) on delete cascade,
  pack         text not null,
  coins        integer not null check (coins > 0),
  -- what was charged, in minor units (cents) of `currency`, VAT included
  amount       integer not null,
  currency     text not null,
  status       text not null default 'created' check (status in ('created', 'completed', 'refunded')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  refunded_at  timestamptz
);
create index purchases_player_idx on public.purchases (player_id, created_at desc);

alter table public.purchases enable row level security;
create policy "players see their own purchases" on public.purchases for select to authenticated
  using ((select auth.uid()) = player_id);
grant select, insert, update, delete on table public.purchases to service_role;
revoke all on table public.purchases from anon, authenticated;
grant select on table public.purchases to authenticated;

alter table public.coin_ledger drop constraint coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('game', 'wager_stake', 'wager_payout', 'purchase', 'season', 'performance', 'coins_bought', 'coins_refunded'));

/** Credit a paid purchase once (the webhook may come more than once, or before the app's row). */
create or replace function public.complete_purchase(
  p_id text, p_player uuid, p_pack text, p_coins integer, p_amount integer, p_currency text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.purchases (id, player_id, pack, coins, amount, currency)
  values (p_id, p_player, p_pack, p_coins, p_amount, p_currency)
  on conflict (id) do nothing;
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

revoke all on function public.complete_purchase(text, uuid, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.reverse_purchase(text) from public, anon, authenticated;
grant execute on function public.complete_purchase(text, uuid, text, integer, integer, text) to service_role;
grant execute on function public.reverse_purchase(text) to service_role;
