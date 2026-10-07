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
  /** false for items that cannot be bought (season rewards) */
  forSale: boolean;
}

/** Price range per category (docs/PLATFORM.md §4.5). */
export const PRICE_RANGES: Record<ItemCategory, [number, number]> = {
  icon: [1_500, 3_000],
  background: [5_000, 12_000],
  moveAnimation: [8_000, 20_000],
  destruction: [8_000, 20_000],
  board: [10_000, 25_000],
  pieces: [15_000, 40_000],
};

const item = (id: string, category: ItemCategory, price: number, rarity: Rarity): ShopItemDef => ({ id, category, price, rarity, forSale: price > 0 });

export const ITEMS: readonly ShopItemDef[] = [
  // piece sets
  item('marble-set', 'pieces', 0, 'standard'),
  item('onyx-gold-set', 'pieces', 15_000, 'rare'),
  item('frost-set', 'pieces', 22_000, 'epic'),
  item('ember-set', 'pieces', 28_000, 'epic'),
  item('celestial-set', 'pieces', 40_000, 'legendary'),
  // boards
  item('marble-board', 'board', 0, 'standard'),
  item('walnut-board', 'board', 10_000, 'common'),
  item('moonstone-board', 'board', 14_000, 'rare'),
  item('jade-board', 'board', 18_000, 'epic'),
  item('royal-board', 'board', 25_000, 'legendary'),
  // backgrounds
  item('candlelit-study', 'background', 0, 'standard'),
  item('moonlit-hall', 'background', 5_000, 'common'),
  item('emerald-grove', 'background', 7_000, 'rare'),
  item('arcane-void', 'background', 9_500, 'epic'),
  item('volcanic-forge', 'background', 12_000, 'legendary'),
  // move animations
  item('glide', 'moveAnimation', 0, 'standard'),
  item('levitate', 'moveAnimation', 8_000, 'rare'),
  item('blink', 'moveAnimation', 14_000, 'epic'),
  item('comet', 'moveAnimation', 20_000, 'legendary'),
  // destruction effects
  item('shatter', 'destruction', 0, 'standard'),
  item('embers', 'destruction', 9_000, 'rare'),
  item('frostbite', 'destruction', 14_000, 'epic'),
  item('implode', 'destruction', 20_000, 'legendary'),
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

/** What every new account owns and uses. */
export const DEFAULT_LOADOUT = {
  pieces: 'marble-set',
  board: 'marble-board',
  background: 'candlelit-study',
  moveAnimation: 'glide',
  destruction: 'shatter',
} as const;

export function itemDef(id: string): ShopItemDef | undefined {
  return ITEMS.find((i) => i.id === id) ?? seasonIconDef(id);
}

/** Free items everyone owns. */
export const FREE_ITEMS: readonly string[] = ITEMS.filter((i) => i.price === 0).map((i) => i.id);

/** Season reward icons ("season-3-gold-platinum") are not in the list but are real items. */
function seasonIconDef(id: string): ShopItemDef | undefined {
  return /^season-\d+-[a-z-]+$/.test(id) ? { id, category: 'icon', price: 0, rarity: 'legendary', forSale: false } : undefined;
}

/** Items that can be handed out as season rewards: piece sets, boards and effects. */
export function seasonRewardPool(): ShopItemDef[] {
  return ITEMS.filter((i) => i.forSale && (i.category === 'pieces' || i.category === 'board' || i.category === 'moveAnimation' || i.category === 'destruction'));
}

export type PurchaseProblem = 'unknown' | 'not-for-sale' | 'owned' | 'coins';

/** Why a purchase cannot happen, or null when it can. */
export function purchaseProblem(id: string, owned: readonly string[], coins: number): PurchaseProblem | null {
  const def = itemDef(id);
  if (!def) return 'unknown';
  if (owned.includes(id) || FREE_ITEMS.includes(id)) return 'owned';
  if (!def.forSale) return 'not-for-sale';
  if (coins < def.price) return 'coins';
  return null;
}
