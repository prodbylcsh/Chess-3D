// Shop items and prices. Shared by the server (the only place purchases happen)
// and the app. Names, descriptions and visuals live in the app (src/api/catalog.ts,
// src/cosmetics/looks.ts); this file holds only what the server must trust.

export type ItemCategory = 'pieces' | 'board' | 'background' | 'moveAnimation' | 'destruction' | 'icon';

export type Rarity = 'standard' | 'common' | 'rare' | 'epic' | 'legendary';

export interface ShopItemDef {
  id: string;
  category: ItemCategory;
  /** 0 for items everyone owns */
  price: number;
  rarity: Rarity;
  /** false for items that cannot be bought (season rewards, subscriber icons) */
  forSale: boolean;
  /**
   * New items can wait for a release date (ISO): Archmage subscribers may use them
   * `PLANS.archmage.earlyDays` before everyone can buy them (_shared/subscription.ts).
   */
  releaseAt?: string | null;
}

/** Price range per category (docs/PLATFORM.md §4.5). */
export const PRICE_RANGES: Record<ItemCategory, [number, number]> = {
  icon: [1_500, 3_000],
  background: [5_000, 12_000],
  moveAnimation: [8_000, 20_000],
  destruction: [8_000, 20_000],
  board: [10_000, 45_000],
  pieces: [15_000, 70_000],
};

const item = (id: string, category: ItemCategory, price: number, rarity: Rarity): ShopItemDef => ({ id, category, price, rarity, forSale: price > 0 });

export const ITEMS: readonly ShopItemDef[] = [
  // piece sets
  item('marble-set', 'pieces', 0, 'standard'),
  item('monolith-set', 'pieces', 68_000, 'legendary'),
  item('squircle-set', 'pieces', 25_000, 'common'),
  // boards
  item('marble-board', 'board', 0, 'standard'),
  item('monolith-board', 'board', 42_500, 'legendary'),
  // backgrounds, move animations and destruction effects: only the standard ones so far
  item('candlelit-study', 'background', 0, 'standard'),
  item('glide', 'moveAnimation', 0, 'standard'),
  item('shatter', 'destruction', 0, 'standard'),
  // profile icons (the six starters are free)
  item('king', 'icon', 0, 'standard'),
  item('queen', 'icon', 0, 'standard'),
  item('rook', 'icon', 0, 'standard'),
  item('bishop', 'icon', 0, 'standard'),
  item('knight', 'icon', 0, 'standard'),
  item('pawn', 'icon', 0, 'standard'),
  item('ember-rook', 'icon', 1_500, 'common'),
  item('frost-knight', 'icon', 1_500, 'common'),
  item('jade-bishop', 'icon', 2_000, 'rare'),
  item('storm-pawn', 'icon', 2_000, 'rare'),
  item('void-queen', 'icon', 2_500, 'epic'),
  item('sun-king', 'icon', 3_000, 'legendary'),
];

/**
 * Items taken out of the shop. Never reuse their ids: players may still own them (the
 * database keeps them as retired, `supabase/catalog.ts`). The first looks were
 * placeholders that recoloured the classic set; they were removed when real models
 * arrived (October 2026).
 */
export const RETIRED_ITEMS: ReadonlyArray<Pick<ShopItemDef, 'id' | 'category'>> = [
  ...(['onyx-gold-set', 'frost-set', 'ember-set', 'celestial-set'] as const).map((id) => ({ id, category: 'pieces' as const })),
  ...(['walnut-board', 'moonstone-board', 'jade-board', 'royal-board'] as const).map((id) => ({ id, category: 'board' as const })),
  ...(['moonlit-hall', 'emerald-grove', 'arcane-void', 'volcanic-forge'] as const).map((id) => ({ id, category: 'background' as const })),
  ...(['levitate', 'blink', 'comet'] as const).map((id) => ({ id, category: 'moveAnimation' as const })),
  ...(['embers', 'frostbite', 'implode'] as const).map((id) => ({ id, category: 'destruction' as const })),
];

/** What every new account owns and uses. */
export const DEFAULT_LOADOUT = {
  pieces: 'marble-set',
  board: 'marble-board',
  background: 'candlelit-study',
  moveAnimation: 'glide',
  destruction: 'shatter',
} as const;

export function itemDef(id: string): ShopItemDef | undefined {
  return ITEMS.find((i) => i.id === id) ?? seasonIconDef(id) ?? premiumIconDef(id);
}

/** On sale for everyone now (no release date, or it has passed). */
export const onSale = (def: ShopItemDef, now = Date.now()): boolean => def.forSale && (!def.releaseAt || now >= Date.parse(def.releaseAt));

/** Free items everyone owns. */
export const FREE_ITEMS: readonly string[] = ITEMS.filter((i) => i.price === 0).map((i) => i.id);

/** Season reward icons ("season-3-gold-platinum") are not in the list but are real items. */
function seasonIconDef(id: string): ShopItemDef | undefined {
  return /^season-\d+-[a-z-]+$/.test(id) ? { id, category: 'icon', price: 0, rarity: 'legendary', forSale: false } : undefined;
}

/**
 * The monthly subscriber icons ("premium-2026-11", Wizard and Archmage, kept forever) are
 * real items too, never for sale (docs/PLATFORM.md §4.9).
 */
function premiumIconDef(id: string): ShopItemDef | undefined {
  return /^premium-\d{4}-(0[1-9]|1[0-2])$/.test(id) ? { id, category: 'icon', price: 0, rarity: 'epic', forSale: false } : undefined;
}

/** Items that can be handed out as season rewards: piece sets, boards and effects. */
export function seasonRewardPool(): ShopItemDef[] {
  return ITEMS.filter((i) => i.forSale && (i.category === 'pieces' || i.category === 'board' || i.category === 'moveAnimation' || i.category === 'destruction'));
}

export type PurchaseProblem = 'unknown' | 'not-for-sale' | 'owned' | 'coins';

/** Why a purchase cannot happen, or null when it can. */
export function purchaseProblem(id: string, owned: readonly string[], coins: number, now = Date.now()): PurchaseProblem | null {
  const def = itemDef(id);
  if (!def) return 'unknown';
  if (owned.includes(id) || FREE_ITEMS.includes(id)) return 'owned';
  if (!onSale(def, now)) return 'not-for-sale';
  if (coins < def.price) return 'coins';
  return null;
}
