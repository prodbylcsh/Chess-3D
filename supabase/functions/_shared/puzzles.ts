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
   * (Openings is all hand-made: real games from the first move, so it takes nothing from Lichess)
   */
  select: { min: number; max: number; maxPlies: number; themes?: string[]; without?: string[]; curated?: boolean };
}

export const MODULES: readonly PuzzleModule[] = [
  {
    id: 'openings',
    name: 'Openings',
    description: 'Real games from the first move, as White and as Black: the main lines and how to answer them, quick mates and the traps to spot.',
    free: true,
    color: '#ff9a4d',
    icon: 'book',
    select: { min: 400, max: 1600, maxPlies: 0, curated: true },
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

/** Hints a puzzle offers per move of the solution: the piece, then the square. */
export const HINTS_PER_MOVE = 2;
/** Using every hint of a puzzle takes this many coins off its reward (decided October 2026). */
export const HINT_PENALTY = 10;

/** Coins the hints cost: up to HINT_PENALTY, in proportion to the hints available. */
export function hintPenalty(hints: number, moves: number): number {
  const available = Math.max(1, HINTS_PER_MOVE * moves);
  return Math.round((HINT_PENALTY * Math.min(Math.max(0, hints), available)) / available);
}

/** Coins for a first solve: the puzzle's coins less what the hints cost. */
export const solveCoins = (rating: number, hints: number, moves: number) => Math.max(0, puzzleCoins(rating) - hintPenalty(hints, moves));

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

// ---------------------------------------------------------------- review (docs/PLATFORM.md §4.2)

/**
 * A puzzle solved with fewer than three stars (or whose solution was shown) can be replayed
 * any time, but its stars only improve when the player hasn't touched it for this long:
 * then the solve shows understanding, not a fresh memory of the moves (decided 20 Oct 2026).
 * Every finished attempt (a solve, or showing the solution) starts the wait again.
 */
export const REVIEW_AFTER_HOURS = 20;
const REVIEW_MS = REVIEW_AFTER_HOURS * 3600_000;

/** When a replay of a puzzle tried at `triedAt` can improve its stars (null: it can't, three stars). */
export function reviewFrom(stars: number, triedAt: string | null): string | null {
  if (stars >= 3 || !triedAt) return null;
  return new Date(Date.parse(triedAt) + REVIEW_MS).toISOString();
}

/** Whether a solve now counts for the stars of a puzzle that was last tried at `triedAt`. */
export const reviewCounts = (triedAt: string | null, now = Date.now()): boolean => !triedAt || now >= Date.parse(triedAt) + REVIEW_MS;

// ---------------------------------------------------------------- daily puzzle and streak

/** The day a daily puzzle belongs to: the UTC date, so it is the same for everyone. */
export const dayOf = (at: number | Date = Date.now()): string => new Date(at).toISOString().slice(0, 10);

const daysSinceEpoch = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/**
 * The daily puzzle: the same for everyone, from any module (locked ones too: a taste of
 * them), easy at the start of the week and harder towards Sunday.
 */
export function dailyPuzzle(day: string): { module: string; index: number } {
  const d = daysSinceEpoch(day);
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const module = MODULES[(d * 3) % MODULES.length].id;
  const spread = (d * 7919) % 14;
  return { module, index: Math.min(PUZZLES_PER_MODULE - 1, weekday * 14 + spread) };
}

export interface Streak {
  /** days in a row with the daily puzzle solved, up to `lastDay` */
  current: number;
  best: number;
  lastDay: string | null;
}

/** The streak after solving the daily puzzle of `day`. */
export function nextStreak(prev: Streak | null, day: string): Streak {
  const p = prev ?? { current: 0, best: 0, lastDay: null };
  if (p.lastDay === day) return p;
  const current = p.lastDay && daysSinceEpoch(day) - daysSinceEpoch(p.lastDay) === 1 ? p.current + 1 : 1;
  return { current, best: Math.max(p.best, current), lastDay: day };
}

/** The streak as it stands on `today`: broken when yesterday's puzzle wasn't solved. */
export function liveStreak(s: Streak | null, today: string): number {
  if (!s?.lastDay) return 0;
  const gap = daysSinceEpoch(today) - daysSinceEpoch(s.lastDay);
  return gap <= 1 ? s.current : 0;
}

/** How a streak looks: the flame grows and changes with it (the app draws each tier). */
export const STREAK_TIERS = [
  { from: 1, id: 'spark', name: 'Spark' },
  { from: 7, id: 'flame', name: 'Flame' },
  { from: 30, id: 'blaze', name: 'Blaze' },
  { from: 100, id: 'azure', name: 'Azure Fire' },
  { from: 365, id: 'phoenix', name: 'Phoenix' },
  { from: 1000, id: 'star', name: 'Starfire' },
] as const;

/** The tier of a streak (0 = spark … 5 = starfire), -1 without one. */
export function streakTier(days: number): number {
  let tier = -1;
  STREAK_TIERS.forEach((x, i) => {
    if (days >= x.from) tier = i;
  });
  return tier;
}

/** Coins for solving the daily puzzle, less what the hints cost (decided 20 Oct 2026). */
export const DAILY_COINS = 40;
export const dailyCoins = (hints: number, moves: number) => Math.max(0, DAILY_COINS - hintPenalty(hints, moves));

/**
 * Streak milestones: coins, and at a year and at 1000 days also a shop item the player lacks
 * (decided 20 Oct 2026). After 1000, every further 100 days pay 10,000.
 */
export const STREAK_MILESTONES: readonly { days: number; coins: number; item?: boolean }[] = [
  { days: 3, coins: 100 },
  { days: 7, coins: 300 },
  { days: 14, coins: 600 },
  { days: 30, coins: 1_500 },
  { days: 50, coins: 2_500 },
  { days: 100, coins: 5_000 },
  { days: 200, coins: 10_000 },
  { days: 365, coins: 25_000, item: true },
  { days: 500, coins: 40_000 },
  { days: 1000, coins: 100_000, item: true },
];

/** The milestone a streak of `days` reaches, if it is one. */
export function streakMilestone(days: number): { days: number; coins: number; item?: boolean } | null {
  const m = STREAK_MILESTONES.find((x) => x.days === days);
  if (m) return m;
  return days > 1000 && days % 100 === 0 ? { days, coins: 10_000 } : null;
}

/** The next milestone ahead of a streak. */
export const nextMilestone = (days: number) => STREAK_MILESTONES.find((x) => x.days > days) ?? { days: Math.floor(days / 100) * 100 + 100, coins: 10_000 };
