// Names and descriptions of shop items. Prices and rules live in
// supabase/functions/_shared/shop.ts; how items look lives in src/cosmetics/looks.ts.
import { BRACKETS } from '#shared/seasons.ts';
import { ITEMS, itemDef, type ItemCategory, type ShopItemDef } from '#shared/shop.ts';
import { locale, t, tk } from '../i18n';
import type { Loadout } from './types';

export type { ItemCategory };
export type LoadoutCategory = keyof Loadout;

/** Display order of the categories. */
export const CATEGORIES: ItemCategory[] = ['pieces', 'board', 'background', 'moveAnimation', 'destruction', 'icon'];
export const LOADOUT_CATEGORIES: LoadoutCategory[] = ['pieces', 'board', 'background', 'moveAnimation', 'destruction'];
/** Categories the shop shows: those with something to buy (the rest hold only the standard item). */
export const SHOP_CATEGORIES: ItemCategory[] = CATEGORIES.filter((c) => ITEMS.some((i) => i.category === c && i.forSale));

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
  'monolith-set': [tk('Monolith'), tk('Faceted towers of black stone and ivory marble, crowned in polished chrome.')],
  'squircle-set': [tk('Squircle'), tk('Pieces that melt from circle to square, in soft white and deep black.')],
  'cut-set': [tk('Cut'), tk('Blocks of pale and black-stained linden, cut to the shape of each piece.')],
  'cylindra-set': [tk('Cylindra'), tk('Turned beech cylinders, pale and black-stained, sliced at a slant.')],
  'hexalith-set': [tk('Hexalith'), tk('Six-sided towers of cast concrete in white and black.')],
  'henge-set': [tk('Henge'), tk('Stone cones and drums, like a circle of standing stones.')],
  'teel-set': [tk('Teel'), tk('Tubes of brushed steel, light and dark, cut at a slant.')],
  'phyrm-set': [tk('Phyrm'), tk('Blocks of speckled white and black granite.')],
  'marb-set': [tk('Marb'), tk('Slim columns of cream and black veined marble, each with its own notch.')],
  'domina-set': [tk('Domina'), tk('Flat stone silhouettes with sharp, angular profiles.')],
  'frost-glass-set': [tk('Frost'), tk('Slanted slabs of frosted milk glass and polished smoky glass.')],
  'dune-set': [tk('Dune'), tk('Faceted white and black patina with polished bronze edges.')],
  'minima-set': [tk('Minima'), tk('Smooth hourglass shapes in gloss white and black on thin gold rings.')],
  'metal-set': [tk('Metal'), tk('Squat bells of brushed stainless steel with polished edges.')],
  'titani-set': [tk('Titani'), tk('Cones of brushed metal, bright and dark, with machined crowns.')],
  'ferro-orbis-set': [tk('Ferro Orbis'), tk('Ivory and blackened steel drums topped with polished chrome spheres.')],
  'stoni-set': [tk('Stoni'), tk('Classic shapes carved from white and grey stone.')],
  'dismorph-set': [tk('Dismorph'), tk('Soft, organic forms in glazed white and black ceramic.')],
  'hexa-set': [tk('Hexa'), tk('Classic shapes cut into faceted planes, in white and black.')],
  'lithoxyl-set': [tk('Lithoxyl'), tk('Petrified oak, fossil stone and burl wood in faceted classic shapes.')],
  'spirl-set': [tk('Spirl'), tk('White and black ceramic pieces wrapped in rising spirals.')],
  'serpentina-set': [tk('Serpentina'), tk('Polished marble that flows upward like smoke.')],
  'cobalt-set': [tk('Cobalt'), tk('White and black stone run through with cobalt-blue veins.')],
  'glanc-set': [tk('Glanc'), tk('Glossy resin with teal swirls on polished copper bases.')],
  'aurum-set': [tk('Aurum'), tk('Matte ivory and black on brushed brass, finished in gold.')],
  'crystalic-set': [tk('Crystalic'), tk('Classic pieces in clear crystal and black obsidian glass.')],
  'hallow-set': [tk('Hallow'), tk('Kings, queens and knights cast as silver figures with gold gilding.')],
  'marble-board': [tk('Classic Marble'), tk('Veined marble squares in a dark frame.')],
  'monolith-board': [tk('Monolith'), tk('Graphite oak and matte black squares on a polished chrome hull.')],
  'maple-board': [tk('Maple'), tk('Oiled walnut and maple squares, edge to edge.')],
  'mozaic-board': [tk('Mozaic'), tk('Cream porcelain and slate-blue crackle-glazed tiles.')],
  'frost-board': [tk('Frost'), tk('Frosted acrylic squares in a clear frame on graphite.')],
  'zlata-board': [tk('Zlata'), tk('Brushed brass and blackened patina in a bronze frame.')],
  'greel-board': [tk('Greel'), tk('Celadon and ivory marquetry framed in pale wood.')],
  'classie-board': [tk('Classie'), tk('Black and cream leather in an oiled walnut frame with brass trim.')],
  'gappa-board': [tk('Gappa'), tk('Separate maple and dark-stained blocks on green felt.')],
  'azure-lagoon-board': [tk('Azure Lagoon'), tk('Oak end grain with squares of cyan epoxy resin.')],
  'beton-board': [tk('Beton'), tk('Light and dark stone tiles set in a concrete slab.')],
  'legoed-board': [tk('Legoed'), tk('Black oak and maple squares, each with a round hollow for its piece.')],
  'argentum-board': [tk('Argentum'), tk('Spun aluminium and black leather in a polished aluminium frame.')],
  'candlelit-study': [tk('Candlelit Study'), tk('A warm, dark study lit by candles.')],
  glide: [tk('Glide'), tk('Pieces lean into the move and leap over blockers.')],
  shatter: [tk('Shatter'), tk('Victims break into physics-driven shards.')],
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
  /** monthly Premium icons: their month */
  month?: Date;
}

/** Name of a season icon, e.g. "Season 2 · Gold & Platinum". */
export const SEASON_ICON_NAME = tk('Season {n} · {bracket}');
export const SEASON_ICON_TEXT = tk('Season reward for reaching {bracket}.');

export function parseSeasonId(id: string): { number: number; bracket: string } | null {
  const m = /^season-(\d+)-([a-z-]+)$/.exec(id);
  return m && BRACKETS.some((b) => b.id === m[2]) ? { number: Number(m[1]), bracket: m[2] } : null;
}

/** Name of a monthly Premium icon, e.g. "Premium · November 2026" (docs/PLATFORM.md §4.9). */
export const PREMIUM_ICON_NAME = tk('Premium · {month}');
export const PREMIUM_ICON_TEXT = tk('The subscriber icon of {month}. Yours to keep.');

/** The month of a Premium icon id ("premium-2026-11"), as a date. */
export function premiumIconMonth(id: string): Date | null {
  const m = /^premium-(\d{4})-(0[1-9]|1[0-2])$/.exec(id);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15)) : null;
}

const monthName = (d: Date) => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

export function itemInfo(id: string): ItemInfo | null {
  const def = itemDef(id);
  if (!def) return null;
  const season = parseSeasonId(id);
  if (season) return { ...def, name: SEASON_ICON_NAME, description: SEASON_ICON_TEXT, season };
  const month = premiumIconMonth(id);
  if (month) return { ...def, name: PREMIUM_ICON_NAME, description: PREMIUM_ICON_TEXT, month };
  const [name, description] = TEXT[id] ?? [id, ''];
  return { ...def, name, description };
}

const bracketName = (id: string) => t(BRACKETS.find((b) => b.id === id)?.name ?? id);

/** Translated name of an item. */
export function itemName(id: string): string {
  const info = itemInfo(id);
  if (!info) return id;
  if (info.month) return t(PREMIUM_ICON_NAME, { month: monthName(info.month) });
  return info.season ? t(SEASON_ICON_NAME, { n: info.season.number, bracket: bracketName(info.season.bracket) }) : t(info.name);
}

/** Translated description of an item. */
export function itemDescription(id: string): string {
  const info = itemInfo(id);
  if (!info) return '';
  if (info.month) return t(PREMIUM_ICON_TEXT, { month: monthName(info.month) });
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
