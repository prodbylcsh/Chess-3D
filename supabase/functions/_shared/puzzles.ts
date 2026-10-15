// Puzzles (docs/PLATFORM.md §4.2): themed modules of 100 puzzles from the Lichess puzzle
// database (CC0), easiest first. Pure rules shared by the `puzzles` Edge Function, the
// app and the tests; the puzzles themselves are in ./puzzle-data/<module>.json
// (scripts/puzzles/build.ts).
import { Chess } from 'chess.js';

export const PUZZLES_PER_MODULE = 100;
/** Unlocking a module that is not free (decided October 2026; a subscription comes later).
 *  Openings is the free one; players who had started First Steps while it was free keep it. */
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
  icon: 'sprout' | 'book' | 'crown' | 'swords' | 'pin' | 'flame' | 'castle';
  /**
   * how scripts/puzzles/build.ts picks its puzzles from the Lichess database; `curated`:
   * the module starts with hand-made puzzles (scripts/puzzles/curated.ts) and Lichess fills the rest
   */
  select: { min: number; max: number; maxPlies: number; themes?: string[]; without?: string[]; curated?: boolean };
}

export const MODULES: readonly PuzzleModule[] = [
  {
    id: 'openings',
    name: 'Openings',
    description: 'The best first moves for White and Black, the fastest mates and the traps to know.',
    free: true,
    color: '#ff9a4d',
    icon: 'book',
    select: { min: 600, max: 1800, maxPlies: 6, themes: ['opening'], curated: true },
  },
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Short, friendly puzzles to warm up: win material, spot the mate.',
    free: false,
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

/**
 * A puzzle as stored: a position and a line of moves (UCI). Usually the line starts with the
 * opponent's move that sets the puzzle up, then the solution and the replies alternate;
 * with `playerFirst` the player moves first (an opening from the starting position).
 */
export interface Puzzle {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  playerFirst?: boolean;
  /** what to play, shown to the player (English; the app translates it), e.g. an opening's name */
  goal?: string;
  /** the Lichess themes (fork, pin, mateIn2, endgame, …): the app explains the puzzle with them */
  themes?: string[];
}

const lineOf = (p: Puzzle) => p.moves.split(' ');
const firstAnswer = (p: Puzzle) => (p.playerFirst ? 0 : 1);

/** The opponent's move that sets the puzzle up, or null when the player moves first. */
export const setupMove = (p: Puzzle): string | null => (p.playerFirst ? null : lineOf(p)[0]);
/** The player's moves of the solution. */
export const solution = (p: Puzzle): string[] => lineOf(p).filter((_, i) => i >= firstAnswer(p) && (i - firstAnswer(p)) % 2 === 0);
/** The solution's move after the player has played `n` right moves (undefined when solved). */
export const answerAt = (p: Puzzle, n: number): string | undefined => lineOf(p)[firstAnswer(p) + 2 * n];
/** The opponent's reply to the player's `n`th move (from 1), if the line goes on. */
export const replyAfter = (p: Puzzle, n: number): string | undefined => lineOf(p)[firstAnswer(p) + 2 * n - 1];

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

/** The side the player plays in a puzzle (the one to move after the opponent's setup move). */
export function playerSide(p: Puzzle): 'w' | 'b' {
  const toMove = p.fen.split(' ')[1] === 'w' ? 'w' : 'b';
  return p.playerFirst ? toMove : toMove === 'w' ? 'b' : 'w';
}

const uci = (m: { from: string; to: string; promotion?: string }) => `${m.from}${m.to}${m.promotion ?? ''}`;

/** The position after the setup move and the player's right moves so far, with the replies. */
function replay(p: Puzzle, playedSoFar: string[]): Chess {
  const chess = new Chess(p.fen);
  const setup = setupMove(p);
  if (setup) chess.move(toMove(setup));
  playedSoFar.forEach((m, i) => {
    chess.move(toMove(m));
    const reply = replyAfter(p, i + 1);
    if (reply) chess.move(toMove(reply));
  });
  return chess;
}

/**
 * Whether the player's moves solve the puzzle: each one must be the solution's move, except
 * that any move that checkmates is right too (puzzles often have more than one mate), and a
 * mate ends the puzzle.
 */
export function solves(p: Puzzle, played: string[]): boolean {
  const answers = solution(p);
  if (!played.length || played.length > answers.length) return false;
  for (let i = 0; i < played.length; i++) {
    if (!rightMove(p, played.slice(0, i), played[i])) return false;
  }
  return played.length === answers.length || mates(p, played.slice(0, -1), played.at(-1)!);
}

/** Whether `move` (UCI) is right at this point of the puzzle: the solution's move, or a mate. */
export function rightMove(p: Puzzle, playedSoFar: string[], move: string): boolean {
  const answer = answerAt(p, playedSoFar.length);
  if (!answer) return false;
  try {
    const chess = replay(p, playedSoFar);
    const made = chess.move(toMove(move));
    return uci(made) === answer || chess.isCheckmate();
  } catch {
    return false; // an illegal move
  }
}

/** Whether `move` (UCI) checkmates at this point of the puzzle. */
export function mates(p: Puzzle, playedSoFar: string[], move: string): boolean {
  try {
    const chess = replay(p, playedSoFar);
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
