// Cosmetic items. Milestone 3 (Shop) fills this with the full catalogue; for now
// every player owns and uses the classic set.
import type { Loadout } from './types';

export type ItemCategory = keyof Loadout;

export interface CatalogItem {
  id: string;
  category: ItemCategory;
  name: string;
  description: string;
}

export const CATEGORY_NAMES: Record<ItemCategory, string> = {
  pieces: 'Piece set',
  board: 'Board',
  background: 'Background',
  moveAnimation: 'Move animation',
  destruction: 'Destruction effect',
};

export const CATALOG: CatalogItem[] = [
  { id: 'classic-marble', category: 'pieces', name: 'Classic Marble', description: 'Polished ivory and obsidian marble.' },
  { id: 'classic-marble', category: 'board', name: 'Classic Marble', description: 'Veined marble squares in a dark frame.' },
  { id: 'candlelit-study', category: 'background', name: 'Candlelit Study', description: 'A warm, dark study lit by candles.' },
  { id: 'glide', category: 'moveAnimation', name: 'Glide', description: 'Pieces lean into the move and leap over blockers.' },
  { id: 'shatter', category: 'destruction', name: 'Shatter', description: 'Victims break into physics-driven shards.' },
];

export function itemFor(category: ItemCategory, id: string): CatalogItem {
  return CATALOG.find((i) => i.category === category && i.id === id) ?? { id, category, name: id, description: '' };
}
