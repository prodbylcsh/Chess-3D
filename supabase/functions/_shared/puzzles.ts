// Puzzles (docs/PLATFORM.md §4.2): themed modules of 100 puzzles from the Lichess puzzle
// database (CC0), easiest first. Pure rules shared by the `puzzles` Edge Function, the
// app and the tests; the puzzles themselves are in ./puzzle-data/<module>.json
// (scripts/puzzles/build.ts).
import { Chess } from 'chess.js';

export const PUZZLES_PER_MODULE = 100;
/** Unlocking a module that is not free (decided October 2026; a subscription comes later). */
export const MODULE_PRICE = 100_000;
/** Every 10 puzzles solved in a module pay a bonus. */
export const BONUS_EVERY = 10;
export const BONUS_COINS = 500;
/** Finishing a module gives a random shop item the player lacks, or these coins when they own everything. */
export const COMPLETION_COINS = 25_000;

export interface PuzzleModule {
  id: string;
  /** English; the app translates it */
  name: string;
  description: string;
  free: boolean;
  /** the module's colour, on its card and in the scene while playing it */
  color: string;
  icon: 'sprout' | 'crown' | 'swords' | 'pin' | 'flame' | 'castle';
  /** how scripts/puzzles/build.ts picks its puzzles from the Lichess database */
  select: { min: number; max: number; maxPlies: number; themes?: string[]; without?: string[] };
}

export const MODULES: readonly PuzzleModule[] = [
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Short, friendly puzzles to warm up: win material, spot the mate.',
    free: true,
    color: '#6fd3c7',
    icon: 'sprout',
    select: { min: 400, max: 1300, maxPlies: 4 },
  },
  {
    id: 'mate-in-2',
    name: 'Mate in Two',
    description: 'Find the checkmate in two moves.',
    free: false,
    color: '#ff6a7a',
    icon: 'crown',
    select: { min: 600, max: 2000, maxPlies: 4, themes: ['mateIn2'] },
  },
  {
    id: 'forks',
    name: 'Forks',
    description: 'One piece, two targets: attack twice and collect.',
    free: false,
    color: '#f2c27a',
    icon: 'swords',
    select: { min: 600, max: 2200, maxPlies: 8, themes: ['fork'] },
  },
  {
    id: 'pins',
    name: 'Pins & Skewers',
    description: 'Pin pieces to their king and skewer what stands behind.',
    free: false,
    color: '#8fb6ff',
    icon: 'pin',
    select: { min: 600, max: 2200, maxPlies: 8, themes: ['pin', 'skewer'] },
  },
  {
    id: 'sacrifices',
    name: 'Sacrifices',
    description: 'Give material away to win something bigger.',
    free: false,
    color: '#c08cff',
    icon: 'flame',
    select: { min: 900, max: 2400, maxPlies: 8, themes: ['sacrifice'] },
  },
  {
    id: 'endgames',
    name: 'Endgames',
    description: 'Few pieces, exact moves: promote, mate and hold.',
    free: false,
    color: '#3fcf8e',
    icon: 'castle',
    select: { min: 700, max: 2300, maxPlies: 10, themes: ['endgame'] },
  },
];

export const moduleOf = (id: unknown): PuzzleModule | null => MODULES.find((m) => m.id === id) ?? null;

/** A puzzle as stored: the position before the opponent's move, then the moves (UCI). */
export interface Puzzle {
  id: string;
  fen: string;
  /** the opponent's move that sets the puzzle up, then the solution, alternating */
  moves: string;
  rating: number;
}

/** Coins for solving a puzzle the first time: 25 for the easiest, up to 50 for the hardest. */
export function puzzleCoins(rating: number): number {
  return 25 + Math.round(25 * Math.min(1, Math.max(0, (rating - 400) / 2000)));
}

/** The bonus a solve pays when it brings the module's count to `solved` (every 10th). */
export const bonusFor = (solved: number) => (solved > 0 && solved % BONUS_EVERY === 0 ? BONUS_COINS : 0);

/** 3 stars for a clean solve, 2 with one mistake or hint, 1 otherwise. For fun only. */
export function stars(mistakes: number, hints: number): 1 | 2 | 3 {
  const slips = mistakes + hints;
  return slips === 0 ? 3 : slips === 1 ? 2 : 1;
}

/** The side the player plays in a puzzle (the one to move after the opponent's first move). */
export function playerSide(p: Puzzle): 'w' | 'b' {
  return p.fen.split(' ')[1] === 'w' ? 'b' : 'w';
}

const uci = (m: { from: string; to: string; promotion?: string }) => `${m.from}${m.to}${m.promotion ?? ''}`;

/**
 * Whether the player's moves solve the puzzle: each one must be the solution's move, except
 * that any move that checkmates is right too (puzzles often have more than one mate).
 */
export function solves(p: Puzzle, played: string[]): boolean {
  const line = p.moves.split(' ');
  const answers = line.filter((_, i) => i % 2 === 1);
  if (played.length !== answers.length) return false;
  const chess = new Chess(p.fen);
  try {
    chess.move(toMove(line[0]));
    for (let i = 0; i < answers.length; i++) {
      const move = chess.move(toMove(played[i]));
      if (uci(move) !== answers[i] && !chess.isCheckmate()) return false;
      if (chess.isCheckmate()) return i === answers.length - 1;
      if (line[2 * i + 2]) chess.move(toMove(line[2 * i + 2]));
    }
  } catch {
    return false; // an illegal move
  }
  return true;
}

/** Whether `move` (UCI) is right at this point of the puzzle: the solution's move, or a mate. */
export function rightMove(p: Puzzle, playedSoFar: string[], move: string): boolean {
  const line = p.moves.split(' ');
  const answer = line[2 * playedSoFar.length + 1];
  if (!answer) return false;
  if (move === answer) return true;
  const chess = new Chess(p.fen);
  try {
    chess.move(toMove(line[0]));
    playedSoFar.forEach((m, i) => {
      chess.move(toMove(m));
      if (line[2 * i + 2]) chess.move(toMove(line[2 * i + 2]));
    });
    chess.move(toMove(move));
    return chess.isCheckmate();
  } catch {
    return false;
  }
}

function toMove(m: string) {
  return { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] };
}

/** The finishing reward: a random item the player lacks, or null (they get the coins instead). */
export function completionItem(candidates: readonly string[], random = Math.random()): string | null {
  return candidates.length ? candidates[Math.floor(random * candidates.length) % candidates.length] : null;
}
