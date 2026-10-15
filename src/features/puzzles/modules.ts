// How puzzle modules look in the app: their icon and their texts (registered for translation).
import { Castle, Crown, Flame, Pin, Sprout, Swords, type LucideIcon } from 'lucide-react';
import type { PuzzleModule } from '#shared/puzzles.ts';
import { tk } from '../../i18n';

export const MODULE_ICONS: Record<PuzzleModule['icon'], LucideIcon> = { sprout: Sprout, crown: Crown, swords: Swords, pin: Pin, flame: Flame, castle: Castle };

// the English names and descriptions in _shared/puzzles.ts, for the translator
export const MODULE_TEXT = [
  tk('First Steps'),
  tk('Short, friendly puzzles to warm up: win material, spot the mate.'),
  tk('Mate in Two'),
  tk('Find the checkmate in two moves.'),
  tk('Forks'),
  tk('One piece, two targets: attack twice and collect.'),
  tk('Pins & Skewers'),
  tk('Pin pieces to their king and skewer what stands behind.'),
  tk('Sacrifices'),
  tk('Give material away to win something bigger.'),
  tk('Endgames'),
  tk('Few pieces, exact moves: promote, mate and hold.'),
];
