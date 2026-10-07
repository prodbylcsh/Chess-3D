// Cosmetic items. Milestone 3 (Shop) fills this with the full catalogue; for now
// every player owns and uses the classic set.
import { tk } from '../i18n';
import type { Loadout } from './types';

export type ItemCategory = keyof Loadout;

export interface CatalogItem {
  id: string;
  category: ItemCategory;
  name: string;
  description: string;
}

export const CATEGORY_NAMES: Record<ItemCategory, string> = {
  pieces: tk('Piece set'),
  board: tk('Board'),
  background: tk('Background'),
  moveAnimation: tk('Move animation'),
  destruction: tk('Destruction effect'),
};

export const CATALOG: CatalogItem[] = [
  { id: 'classic-marble', category: 'pieces', name: tk('Classic Marble'), description: tk('Polished ivory and obsidian marble.') },
  { id: 'classic-marble', category: 'board', name: tk('Classic Marble'), description: tk('Veined marble squares in a dark frame.') },
  { id: 'candlelit-study', category: 'background', name: tk('Candlelit Study'), description: tk('A warm, dark study lit by candles.') },
  { id: 'glide', category: 'moveAnimation', name: tk('Glide'), description: tk('Pieces lean into the move and leap over blockers.') },
  { id: 'shatter', category: 'destruction', name: tk('Shatter'), description: tk('Victims break into physics-driven shards.') },
];

export function itemFor(category: ItemCategory, id: string): CatalogItem {
  return CATALOG.find((i) => i.category === category && i.id === id) ?? { id, category, name: id, description: '' };
}
