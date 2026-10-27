// Fair play: signs that a player gets help from an engine in ranked, casual and coin games,
// for the operator to review (docs/PLATFORM.md §6.4). Nothing here punishes anyone. A game's
// engine analysis (the same reports that give accuracy), the server's think time per move and
// the player's own record of leaving the game become per-game signals; a player's recent games
// together become a level and the reasons for the review queue.
//
// An engine on a second device leaves no trace in the browser, so the signals are in the moves
// themselves: how often the player finds the engine's first choice after the opening, quiet
// moves included, and how they spend their time (someone relaying moves to another device
// takes as long over an obvious recapture as over a hard move). Pure functions shared by the
// server and the tests.
import { Chess } from 'chess.js';
import { accuracies } from './analysis.ts';
import type { Side } from './play.ts';

export const FAIRPLAY = {
  /** the first moves of each side are opening theory: not counted */
  openingPlies: 16,
  /** positions already decided for either side say little: not counted */
  decidedCp: 400,
  /** a move counts as played after leaving the game when the player was away this long during it */
  awayMs: 2_000,
  /** a player's last analysed games, looked at together */
  window: 20,
  /** the engine's first choice found this often is a strong human's level (a fixed bar: MMR is a ladder, not strength) */
  humanMatch: 0.5,
  /** real players vary more than coin flips: the spread of the match rate is widened by this */
  spread: 1.5,
  /** counted moves before the match rate over several games counts */
  minMoves: 60,
  /** standard deviations above the human bar for 'engine_match' (2 points), and for 3 points */
  matchZ: 3,
  matchZStrong: 5,
  /** one game played like an engine: this many counted moves, this match rate and accuracy */
  gameMoves: 20,
  gameMatch: 0.85,
  gameAccuracy: 95,
  /** quiet moves (no capture, check or promotion) are the hard ones to find */
  quietMoves: 25,
  quietMatch: 0.7,
  /** average accuracy over at least `accuracyGames` games */
  accuracyGames: 5,
  highAccuracy: 92,
  /** the last `jumpGames` games against the ones before (at least as many) */
  jumpGames: 5,
  accuracyJump: 15,
  /** obvious moves (the only legal one, taking back) made as slowly as the rest */
  obviousMoves: 8,
  obviousMs: 3_000,
  obviousRatio: 0.6,
  /** left the game during this share of counted moves, at least `awayMoves` times */
  awayMoves: 5,
  awayShare: 0.1,
  /** … and found the engine's choice this often after coming back */
  awayMatch: 0.7,
  /** the review queue shows players from this level */
  reviewLevel: 2,
} as const;

/** What one game says about one player. Kept per game (`fairplay_games`). */
export interface GameSignals {
  /** the player's moves after the opening, with a choice, in undecided positions */
  counted: number;
  /** … where the player chose the engine's first choice */
  matched: number;
  /** counted moves where the engine's first choice was quiet, and how often the player found it */
  quiet: number;
  quietMatched: number;
  /** the player's accuracy in this game (0-100) */
  accuracy: number | null;
  /** think time (ms) of each of the player's moves after the first, from the server's clock */
  times: number[];
  /** think time of the obvious ones among them: the only legal move, or taking back at once */
  obvious: number[];
  /** counted moves made after leaving the game, and how many of those were the engine's choice */
  away: number;
  awayMatched: number;
}

export interface GameInput {
  /** UCI moves from the start position */
  moves: string[];
  /** the analysis: a score per position (White's point of view) and the engine's first choice ('' for none) */
  scores: number[];
  best: string[] | null;
  color: Side;
  /** the server's think time per ply, when the game had clocks */
  moveMs: number[] | null;
  /** how long the player was away from the game during each ply (their own report) */
  away: number[] | null;
}

/** chess.js flags: c capture, e en passant, p promotion */
const isQuiet = (m: { flags: string; san: string }) => !/[cep]/.test(m.flags) && !/[+#]/.test(m.san);

/** The signals of one player in one analysed game. */
export function gameSignals({ moves, scores, best, color, moveMs, away }: GameInput): GameSignals {
  const s: GameSignals = { counted: 0, matched: 0, quiet: 0, quietMatched: 0, accuracy: accuracies(scores)[color], times: [], obvious: [], away: 0, awayMatched: 0 };
  const timed = moveMs?.length === moves.length;
  const chess = new Chess();
  let lastCapture: string | null = null;
  for (let i = 0; i < moves.length; i++) {
    const uci = moves[i];
    const mover = chess.turn();
    const legal = mover === color ? chess.moves({ verbose: true }) : [];
    const played = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (mover !== color) {
      lastCapture = played.captured ? played.to : null;
      continue;
    }

    if (timed && i >= 2) {
      s.times.push(moveMs![i]);
      if (legal.length === 1 || (lastCapture === played.to && !!played.captured)) s.obvious.push(moveMs![i]);
    }
    lastCapture = played.captured ? played.to : null;

    const mine = color === 'w' ? scores[i] : -scores[i];
    const choice = best?.[i];
    if (i < FAIRPLAY.openingPlies || !choice || legal.length < 2 || Math.abs(mine) >= FAIRPLAY.decidedCp) continue;
    const engine = legal.find((m) => m.lan === choice);
    if (!engine) continue;
    const match = played.lan === choice;
    s.counted++;
    if (match) s.matched++;
    if (isQuiet(engine)) {
      s.quiet++;
      if (match) s.quietMatched++;
    }
    if ((away?.[i] ?? 0) >= FAIRPLAY.awayMs) {
      s.away++;
      if (match) s.awayMatched++;
    }
  }
  return s;
}

/** A game's signals as the review sees them, newest first. */
export interface ReviewedGame {
  signals: GameSignals;
  /** 'agreed': both players' analyses; 'opponent': only the opponent's report (it could be made up) */
  source: 'agreed' | 'opponent';
}

export type Reason = 'engine_match' | 'engine_game' | 'quiet_match' | 'high_accuracy' | 'accuracy_jump' | 'steady_timing' | 'left_game';

export interface Review {
  /** the sum of the reasons' points; the queue shows players from FAIRPLAY.reviewLevel */
  level: number;
  reasons: Array<{ id: Reason; points: number }>;
  stats: {
    games: number;
    fromOpponent: number;
    counted: number;
    matchRate: number | null;
    /** standard deviations above the human bar */
    matchZ: number | null;
    quietRate: number | null;
    engineGames: number;
    accuracy: number | null;
    recentAccuracy: number | null;
    earlierAccuracy: number | null;
    obviousMs: number | null;
    medianMs: number | null;
    away: number;
    awayMatchRate: number | null;
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);
const rate = (part: number, whole: number) => (whole ? part / whole : null);
const round = (x: number | null, digits = 2) => (x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** How far a match rate over n moves is above the human bar, in (widened) standard deviations. */
export function matchZ(matched: number, n: number): number | null {
  if (!n) return null;
  const p = FAIRPLAY.humanMatch;
  return (matched / n - p) / (Math.sqrt((p * (1 - p)) / n) * FAIRPLAY.spread);
}

/** A player's recent analysed games (newest first) together: a level and its reasons. */
export function review(recent: ReviewedGame[]): Review {
  const games = recent.slice(0, FAIRPLAY.window);
  const all = games.map((g) => g.signals);
  const counted = sum(all.map((s) => s.counted));
  const matched = sum(all.map((s) => s.matched));
  const quiet = sum(all.map((s) => s.quiet));
  const quietMatched = sum(all.map((s) => s.quietMatched));
  const accs = all.map((s) => s.accuracy).filter((a): a is number => a !== null);
  const recentAccs = accs.slice(0, FAIRPLAY.jumpGames);
  const earlierAccs = accs.slice(FAIRPLAY.jumpGames);
  const obvious = all.flatMap((s) => s.obvious);
  const times = all.flatMap((s) => s.times);
  const away = sum(all.map((s) => s.away));
  const awayMatched = sum(all.map((s) => s.awayMatched));
  const engineGames = all.filter((s) => s.counted >= FAIRPLAY.gameMoves && s.matched / s.counted >= FAIRPLAY.gameMatch && (s.accuracy ?? 0) >= FAIRPLAY.gameAccuracy).length;

  const z = matchZ(matched, counted);
  const accuracy = mean(accs);
  const recentAccuracy = mean(recentAccs);
  const earlierAccuracy = earlierAccs.length >= FAIRPLAY.jumpGames ? mean(earlierAccs) : null;
  const obviousMs = median(obvious);
  const medianMs = median(times);

  const reasons: Review['reasons'] = [];
  if (counted >= FAIRPLAY.minMoves && z !== null && z >= FAIRPLAY.matchZ) reasons.push({ id: 'engine_match', points: z >= FAIRPLAY.matchZStrong ? 3 : 2 });
  if (engineGames) reasons.push({ id: 'engine_game', points: 2 });
  if (quiet >= FAIRPLAY.quietMoves && quietMatched / quiet >= FAIRPLAY.quietMatch) reasons.push({ id: 'quiet_match', points: 1 });
  if (accs.length >= FAIRPLAY.accuracyGames && accuracy! >= FAIRPLAY.highAccuracy) reasons.push({ id: 'high_accuracy', points: 1 });
  if (earlierAccuracy !== null && recentAccs.length === FAIRPLAY.jumpGames && recentAccuracy! - earlierAccuracy >= FAIRPLAY.accuracyJump) {
    reasons.push({ id: 'accuracy_jump', points: 1 });
  }
  if (obvious.length >= FAIRPLAY.obviousMoves && obviousMs! >= FAIRPLAY.obviousMs && medianMs && obviousMs! / medianMs >= FAIRPLAY.obviousRatio) {
    reasons.push({ id: 'steady_timing', points: 1 });
  }
  if (away >= FAIRPLAY.awayMoves && away / counted >= FAIRPLAY.awayShare) {
    reasons.push({ id: 'left_game', points: awayMatched / away >= FAIRPLAY.awayMatch ? 2 : 1 });
  }

  return {
    level: sum(reasons.map((r) => r.points)),
    reasons,
    stats: {
      games: games.length,
      fromOpponent: games.filter((g) => g.source === 'opponent').length,
      counted,
      matchRate: round(rate(matched, counted)),
      matchZ: round(z, 1),
      quietRate: round(rate(quietMatched, quiet)),
      engineGames,
      accuracy: round(accuracy, 1),
      recentAccuracy: round(recentAccuracy, 1),
      earlierAccuracy: round(earlierAccuracy, 1),
      obviousMs: obviousMs === null ? null : Math.round(obviousMs),
      medianMs: medianMs === null ? null : Math.round(medianMs),
      away,
      awayMatchRate: round(rate(awayMatched, away)),
    },
  };
}
