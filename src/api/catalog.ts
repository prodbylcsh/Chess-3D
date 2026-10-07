// Names and descriptions of shop items. Prices and rules live in
// supabase/functions/_shared/shop.ts; how items look lives in src/cosmetics/looks.ts.
import { BRACKETS } from '#shared/seasons.ts';
import { ITEMS, itemDef, type ItemCategory, type ShopItemDef } from '#shared/shop.ts';
import { t, tk } from '../i18n';
import type { Loadout } from './types';

export type { ItemCategory };
export type LoadoutCategory = keyof Loadout;

/** Display order of the categories. */
export const CATEGORIES: ItemCategory[] = ['pieces', 'board', 'background', 'moveAnimation', 'destruction', 'icon'];
export const LOADOUT_CATEGORIES: LoadoutCategory[] = ['pieces', 'board', 'background', 'moveAnimation', 'destruction'];

export const CATEGORY_NAMES: Record<ItemCategory, string> = {
  pieces: tk('Piece set'),
  board: tk('Board'),
  background: tk('Background'),
  moveAnimation: tk('Move animation'),
  destruction: tk('Destruction effect'),
  icon: tk('Profile icon'),
};

export const CATEGORY_PLURALS: Record<ItemCategory, string> = {
  pieces: tk('Piece sets'),
  board: tk('Boards'),
  background: tk('Backgrounds'),
  moveAnimation: tk('Move animations'),
  destruction: tk('Destruction effects'),
  icon: tk('Profile icons'),
};

/** Who sees the item in a game (docs/PLATFORM.md §4.5). */
export const CATEGORY_AUDIENCE: Record<ItemCategory, string> = {
  pieces: tk('Your pieces wear this set. Your opponent sees it too.'),
  board: tk('Both players see it. If your boards differ, one is picked at random for the game.'),
  background: tk('Both players see it. If your backgrounds differ, one is picked at random for the game.'),
  moveAnimation: tk('How your pieces move. Your opponent sees it too.'),
  destruction: tk('How your captures look. Your opponent sees it too.'),
  icon: tk('Shown next to your name everywhere.'),
};

const TEXT: Record<string, [name: string, description: string]> = {
  'marble-set': [tk('Classic Marble'), tk('Polished ivory and obsidian marble.')],
  'onyx-gold-set': [tk('Onyx & Gold'), tk('Black onyx veined with gold, against pieces of solid gold.')],
  'frost-set': [tk('Frostbound'), tk('Carved from glacier ice, with veins of cold blue light.')],
  'ember-set': [tk('Emberforged'), tk('Pieces cooled from lava, still glowing inside.')],
  'celestial-set': [tk('Celestial'), tk('Starlight and night sky, veined with gold and violet.')],
  'marble-board': [tk('Classic Marble'), tk('Veined marble squares in a dark frame.')],
  'walnut-board': [tk('Walnut'), tk('Warm walnut and maple, like a club board.')],
  'moonstone-board': [tk('Moonstone'), tk('Pale moonstone and deep slate blue.')],
  'jade-board': [tk('Jade Palace'), tk('Polished jade and white nephrite.')],
  'royal-board': [tk('Royal Court'), tk('Ivory and crimson marble with veins of gold.')],
  'candlelit-study': [tk('Candlelit Study'), tk('A warm, dark study lit by candles.')],
  'moonlit-hall': [tk('Moonlit Hall'), tk('Cold moonlight and drifting dust in an empty hall.')],
  'emerald-grove': [tk('Emerald Grove'), tk('A quiet forest clearing full of fireflies.')],
  'arcane-void': [tk('Arcane Void'), tk('The board floats in violet nothingness.')],
  'volcanic-forge': [tk('Volcanic Forge'), tk('Glowing embers rise from the heart of a forge.')],
  glide: [tk('Glide'), tk('Pieces lean into the move and leap over blockers.')],
  levitate: [tk('Levitate'), tk('Pieces rise into the air and float to their square.')],
  blink: [tk('Blink'), tk('Pieces vanish in a swirl of magic and reappear on their square.')],
  comet: [tk('Comet'), tk('Pieces streak across the board trailing sparks.')],
  shatter: [tk('Shatter'), tk('Victims break into physics-driven shards.')],
  embers: [tk('Embers'), tk('Victims burn away into rising embers.')],
  frostbite: [tk('Frostbite'), tk('Victims freeze solid, then burst into ice.')],
  implode: [tk('Implode'), tk('Victims collapse into a tiny star and vanish in a flash.')],
  king: [tk('King'), tk('One of the six starter icons.')],
  queen: [tk('Queen'), tk('One of the six starter icons.')],
  rook: [tk('Rook'), tk('One of the six starter icons.')],
  bishop: [tk('Bishop'), tk('One of the six starter icons.')],
  knight: [tk('Knight'), tk('One of the six starter icons.')],
  pawn: [tk('Pawn'), tk('One of the six starter icons.')],
  'ember-rook': [tk('Ember Rook'), tk('A rook glowing like a coal.')],
  'frost-knight': [tk('Frost Knight'), tk('A knight of the northern ice.')],
  'jade-bishop': [tk('Jade Bishop'), tk('A bishop carved from jade.')],
  'storm-pawn': [tk('Storm Pawn'), tk('A small pawn with a thunderstorm inside.')],
  'void-queen': [tk('Void Queen'), tk('A queen from beyond the stars.')],
  'sun-king': [tk('Sun King'), tk('The king, crowned with sunlight.')],
};

export interface ItemInfo extends ShopItemDef {
  /** English text; translate with t() when shown */
  name: string;
  description: string;
  /** season reward icons: the season and bracket */
  season?: { number: number; bracket: string };
}

/** Name of a season icon, e.g. "Season 2 · Gold & Platinum". */
export const SEASON_ICON_NAME = tk('Season {n} · {bracket}');
export const SEASON_ICON_TEXT = tk('Season reward for reaching {bracket}.');

export function parseSeasonId(id: string): { number: number; bracket: string } | null {
  const m = /^season-(\d+)-([a-z-]+)$/.exec(id);
  return m && BRACKETS.some((b) => b.id === m[2]) ? { number: Number(m[1]), bracket: m[2] } : null;
}

export function itemInfo(id: string): ItemInfo | null {
  const def = itemDef(id);
  if (!def) return null;
  const season = parseSeasonId(id);
  if (season) return { ...def, name: SEASON_ICON_NAME, description: SEASON_ICON_TEXT, season };
  const [name, description] = TEXT[id] ?? [id, ''];
  return { ...def, name, description };
}

const bracketName = (id: string) => t(BRACKETS.find((b) => b.id === id)?.name ?? id);

/** Translated name of an item. */
export function itemName(id: string): string {
  const info = itemInfo(id);
  if (!info) return id;
  return info.season ? t(SEASON_ICON_NAME, { n: info.season.number, bracket: bracketName(info.season.bracket) }) : t(info.name);
}

/** Translated description of an item. */
export function itemDescription(id: string): string {
  const info = itemInfo(id);
  if (!info) return '';
  return info.season ? t(SEASON_ICON_TEXT, { bracket: bracketName(info.season.bracket) }) : t(info.description);
}

/** Every regular item, in catalogue order. */
export const CATALOG: ItemInfo[] = ITEMS.map((i) => itemInfo(i.id)!);

export const RARITY_NAMES: Record<string, string> = {
  standard: tk('Standard'),
  common: tk('Common'),
  rare: tk('Rare'),
  epic: tk('Epic'),
  legendary: tk('Legendary'),
};
