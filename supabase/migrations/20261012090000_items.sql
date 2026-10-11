-- Shop items and who owns what. `items` is the catalogue as the server sells it: the
-- source of truth is supabase/functions/_shared/shop.ts, copied here on every deploy by
-- supabase/catalog.ts (new items, prices; items removed from the shop stay as retired,
-- because players may still own them). `player_items` has one row per item a player
-- owns, with how and when they got it: a purchase (and its price), a season reward, or a
-- grant by the operator. Free standard items belong to everyone and have no rows.
-- Replaces the `players.inventory` array.

create table public.items (
  id         text primary key,
  category   text not null check (category in ('pieces', 'board', 'background', 'moveAnimation', 'destruction', 'icon')),
  rarity     text not null check (rarity in ('standard', 'common', 'rare', 'epic', 'legendary')),
  price      integer not null check (price >= 0),
  for_sale   boolean not null,
  -- taken out of the shop: no longer sold, still owned by whoever has it
  retired    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.items enable row level security;
create policy "the catalogue is public" on public.items for select to anon, authenticated using (true);
grant select on table public.items to anon, authenticated;
grant select, insert, update, delete on table public.items to service_role;

create table public.player_items (
  player_id   uuid not null references auth.users (id) on delete cascade,
  item_id     text not null references public.items (id) on update cascade,
  source      text not null check (source in ('purchase', 'season', 'grant')),
  -- coins paid (purchases), the season it was won in (season rewards)
  price_paid  integer not null default 0 check (price_paid >= 0),
  season      integer,
  acquired_at timestamptz not null default now(),
  primary key (player_id, item_id)
);
-- "who owns item X" and "how many sold"
create index player_items_item_idx on public.player_items (item_id, acquired_at);

alter table public.player_items enable row level security;
create policy "players see their own items" on public.player_items for select to authenticated
  using ((select auth.uid()) = player_id);
grant select on table public.player_items to authenticated;
grant select, insert, update, delete on table public.player_items to service_role;

-- ------------------------------------------------------------------ the catalogue today

insert into public.items (id, category, rarity, price, for_sale, retired) values
  ('marble-set', 'pieces', 'standard', 0, false, false),
  ('monolith-set', 'pieces', 'legendary', 68000, true, false),
  ('marble-board', 'board', 'standard', 0, false, false),
  ('monolith-board', 'board', 'legendary', 42500, true, false),
  ('candlelit-study', 'background', 'standard', 0, false, false),
  ('glide', 'moveAnimation', 'standard', 0, false, false),
  ('shatter', 'destruction', 'standard', 0, false, false),
  ('king', 'icon', 'standard', 0, false, false),
  ('queen', 'icon', 'standard', 0, false, false),
  ('rook', 'icon', 'standard', 0, false, false),
  ('bishop', 'icon', 'standard', 0, false, false),
  ('knight', 'icon', 'standard', 0, false, false),
  ('pawn', 'icon', 'standard', 0, false, false),
  ('ember-rook', 'icon', 'common', 1500, true, false),
  ('frost-knight', 'icon', 'common', 1500, true, false),
  ('jade-bishop', 'icon', 'rare', 2000, true, false),
  ('storm-pawn', 'icon', 'rare', 2000, true, false),
  ('void-queen', 'icon', 'epic', 2500, true, false),
  ('sun-king', 'icon', 'legendary', 3000, true, false),
  ('onyx-gold-set', 'pieces', 'common', 0, false, true),
  ('frost-set', 'pieces', 'common', 0, false, true),
  ('ember-set', 'pieces', 'common', 0, false, true),
  ('celestial-set', 'pieces', 'common', 0, false, true),
  ('walnut-board', 'board', 'common', 0, false, true),
  ('moonstone-board', 'board', 'common', 0, false, true),
  ('jade-board', 'board', 'common', 0, false, true),
  ('royal-board', 'board', 'common', 0, false, true),
  ('moonlit-hall', 'background', 'common', 0, false, true),
  ('emerald-grove', 'background', 'common', 0, false, true),
  ('arcane-void', 'background', 'common', 0, false, true),
  ('volcanic-forge', 'background', 'common', 0, false, true),
  ('levitate', 'moveAnimation', 'common', 0, false, true),
  ('blink', 'moveAnimation', 'common', 0, false, true),
  ('comet', 'moveAnimation', 'common', 0, false, true),
  ('embers', 'destruction', 'common', 0, false, true),
  ('frostbite', 'destruction', 'common', 0, false, true),
  ('implode', 'destruction', 'common', 0, false, true)
on conflict (id) do nothing;

-- season reward icons ("season-2-gold-platinum") are real items too; apply_seasons adds
-- each one the first time it is handed out

-- ------------------------------------------------------------------ inventories move over

insert into public.items (id, category, rarity, price, for_sale, retired)
select distinct i, 'icon', 'legendary', 0, false, false
from public.players p, unnest(p.inventory) i
where i like 'season-%'
on conflict (id) do nothing;

insert into public.player_items (player_id, item_id, source, price_paid, season, acquired_at)
select
  p.id,
  i,
  case when i like 'season-%' then 'season' when l.amount is not null then 'purchase' else 'grant' end,
  coalesce(-l.amount, 0),
  case when i like 'season-%' then split_part(i, '-', 2)::integer end,
  coalesce(l.created_at, p.created_at)
from public.players p
cross join lateral unnest(p.inventory) i
left join lateral (
  select c.amount, c.created_at from public.coin_ledger c
  where c.player_id = p.id and c.reason = 'purchase' and c.ref = i
  order by c.created_at limit 1
) l on true
where exists (select 1 from public.items it where it.id = i)
on conflict do nothing;

drop function public.buy_item(uuid, text, integer);
drop function public.apply_seasons(uuid, integer, jsonb, jsonb);
alter table public.players drop column inventory;

-- ------------------------------------------------------------------ buying and season rewards

/**
 * Buy an item: take the price, record the item as the player's. Raises 'cannot_buy' when
 * the item is not on sale at that price, already owned, or the coins are short.
 */
create function public.buy_item(p_player uuid, p_item text, p_price integer) returns public.players
language plpgsql security definer set search_path = '' as $$
declare
  row public.players;
begin
  perform 1 from public.items i where i.id = p_item and i.for_sale and not i.retired and i.price = p_price;
  if not found then
    raise exception 'cannot_buy';
  end if;
  update public.players p set coins = p.coins - p_price
  where p.id = p_player and p.coins >= p_price
  returning * into row;
  if not found then
    raise exception 'cannot_buy';
  end if;
  insert into public.player_items (player_id, item_id, source, price_paid) values (p_player, p_item, 'purchase', p_price)
  on conflict do nothing;
  if not found then
    raise exception 'cannot_buy'; -- owned already: nothing is charged (the update rolls back)
  end if;
  insert into public.coin_ledger (player_id, amount, reason, ref) values (p_player, -p_price, 'purchase', p_item);
  return row;
end;
$$;

/**
 * Apply season ends computed by _shared/play.ts rollSeasons, once: only when the stored
 * season is still `p_from`. Grants: [{ season, coins, items[], badge }].
 */
create function public.apply_seasons(p_player uuid, p_from integer, p_state jsonb, p_grants jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  g jsonb;
  item text;
begin
  update public.players p set
    season = (p_state->>'season')::integer,
    mmr = (p_state->>'mmr')::integer,
    season_peak_mmr = (p_state->>'season_peak_mmr')::integer,
    win_streak = 0,
    ranked_streak = 0
  where p.id = p_player and p.season = p_from;
  if not found then
    return false;
  end if;
  for g in select * from jsonb_array_elements(p_grants) loop
    update public.players p set
      coins = p.coins + (g->>'coins')::integer,
      badges = array_append(p.badges, g->>'badge')
    where p.id = p_player;
    for item in select jsonb_array_elements_text(g->'items') loop
      if item like 'season-%' then
        insert into public.items (id, category, rarity, price, for_sale) values (item, 'icon', 'legendary', 0, false)
        on conflict (id) do nothing;
      end if;
      insert into public.player_items (player_id, item_id, source, season)
      values (p_player, item, 'season', (g->>'season')::integer)
      on conflict do nothing;
    end loop;
    insert into public.coin_ledger (player_id, amount, reason, ref)
    values (p_player, (g->>'coins')::integer, 'season', 'season-' || (g->>'season'));
  end loop;
  return true;
end;
$$;

revoke all on function public.buy_item(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.apply_seasons(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.buy_item(uuid, text, integer) to service_role;
grant execute on function public.apply_seasons(uuid, integer, jsonb, jsonb) to service_role;
