// How puzzle modules look in the app: their icon and their texts (registered for translation).
import { BookOpen, Castle, Crown, Flame, Pin, Sprout, Swords, type LucideIcon } from 'lucide-react';
import type { PuzzleModule } from '#shared/puzzles.ts';
import { tk } from '../../i18n';

export const MODULE_ICONS: Record<PuzzleModule['icon'], LucideIcon> = { sprout: Sprout, book: BookOpen, crown: Crown, swords: Swords, pin: Pin, flame: Flame, castle: Castle };

// the English names and descriptions in _shared/puzzles.ts, for the translator
export const MODULE_TEXT = [
  tk('First Steps'),
  tk('Short, friendly puzzles to warm up: win material, spot the mate.'),
  tk('Openings'),
  tk('The best first moves for White and Black, the fastest mates and the traps to know.'),
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

// the goals of the hand-made puzzles (scripts/puzzles/curated.ts), for the translator
export const PUZZLE_GOALS = [
  tk("Fool's Mate"),
  tk("Scholar's Mate"),
  tk("Stop the Scholar's Mate"),
  tk('Smothered Mate in the Caro-Kann'),
  tk('Italian Game'),
  tk('Two Knights Defence'),
  tk('Scotch Game'),
  tk("Queen's Gambit"),
  tk('Sicilian Defence: Najdorf'),
  tk('London System'),
  tk('French Defence'),
  tk('Petrov Trap'),
  tk('Caro-Kann Defence'),
  tk('Ruy Lopez'),
  tk('Scandinavian Defence'),
  tk('Punish the Damiano Defence'),
  tk("King's Indian Defence"),
  tk('English Opening'),
  tk("Queen's Gambit Declined"),
  tk("Légal's Mate"),
  tk('Slav Defence'),
  tk("King's Gambit"),
  tk('Nimzo-Indian Defence'),
  tk('Blackburne Shilling Trap'),
  tk('Vienna Game'),
  tk("Petrov's Defence"),
  tk('Fried Liver Attack'),
  tk('Danish Gambit'),
  tk('Dutch Defence'),
  tk('Kieninger Trap'),
  tk('Berlin Defence'),
  tk('Evans Gambit'),
  tk('Budapest Gambit'),
  tk('Englund Gambit Trap'),
  tk('Elephant Trap'),
  tk('Benko Gambit'),
  tk('Stafford Gambit Trap'),
  tk('Siberian Trap'),
  tk("Noah's Ark Trap"),
  tk('Lasker Trap'),
];
