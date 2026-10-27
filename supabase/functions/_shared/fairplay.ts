// Fair play: signs that a player gets help from an engine in ranked, casual and coin games,
// for the operator to review (docs/PLATFORM.md §6.4). Nothing here punishes anyone. A game's
// engine analysis (the same reports that give accuracy), the server's think time per move and
// the player's own record of leaving the game become per-game signals; a player's recent games
// together become a level and the reasons for the review queue.
//
// An engine on a second device leaves no trace in the browser, so the signals are in the moves
// themselves: how often the player finds the engine's first choice after the opening, quiet
// moves included, and how they spend their time (someone relaying moves to another device
// takes as long over an obvious recapture as over a hard move). How strict the review is
// follows the player's MMR: a low-ranked player is expected to find fewer engine moves and to
// think longer before the hard ones than a top player (`barFor`). Pure functions shared by the
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
  /** real players vary more than coin flips: the spread of the match rate is widened by this */
  spread: 1.5,
  /** counted moves before the match rate over several games counts */
  minMoves: 60,
  /** standard deviations above the human bar for 'engine_match' (2 points), and for 3 points */
  matchZ: 3,
  matchZStrong: 5,
  /** one game played like an engine (with this many counted moves; match and accuracy by MMR) */
  gameMoves: 20,
  /** quiet moves (no capture, check or promotion) are the hard ones to find */
  quietMoves: 25,
  /** average accuracy over at least `accuracyGames` games */
  accuracyGames: 5,
  /** the last `jumpGames` games against the ones before (at least as many) */
  jumpGames: 5,
  accuracyJump: 15,
  /** obvious moves (the only legal one, taking back) made as slowly as the rest: at least this many */
  obviousMoves: 8,
  /** hard engine moves (quiet first choices) found without thinking longer: at least this many */
  foundMoves: 10,
  /** left the game during this share of counted moves, at least `awayMoves` times */
  awayMoves: 5,
  awayShare: 0.1,
  /** … and found the engine's choice this often after coming back */
  awayMatch: 0.7,
  /** the review queue shows players from this level */
  reviewLevel: 2,
  /** MMR sets the bar only once ranked is open and the player has this many ranked games */
  rankedGames: 10,
} as const;

/**
 * What an honest player at a given MMR does, at these MMRs (Bronze, Silver II, Platinum IV,
 * Diamond IV, Grandmaster); in between it is interpolated, beyond it stays at the ends.
 */
export const BY_MMR = {
  mmr: [600, 1000, 1600, 2400, 3200],
  /** the engine's first choice found this often */
  humanMatch: [0.32, 0.36, 0.42, 0.5, 0.56],
  /** one game played like an engine: match rate and accuracy */
  gameMatch: [0.75, 0.78, 0.82, 0.85, 0.9],
  gameAccuracy: [90, 91, 93, 95, 97],
  /** quiet first choices found this often */
  quietMatch: [0.5, 0.55, 0.62, 0.7, 0.76],
  /** average accuracy over several games */
  highAccuracy: [85, 87, 89, 92, 94],
  /** obvious moves: a median this slow, and this close to the player's median move, look like a relay */
  obviousMs: [3_500, 3_000, 2_500, 2_000, 1_500],
  obviousRatio: [0.75, 0.7, 0.65, 0.6, 0.5],
  /** hard engine moves found in at most this share of the player's median think time */
  foundRatio: [0.8, 0.75, 0.7, 0.6, 0.5],
} as const;

/** The MMR whose bar applies while a player's MMR says nothing yet: a strong player's (lenient). */
export const NEUTRAL_MMR = 2400;

export type Bar = { [K in Exclude<keyof typeof BY_MMR, 'mmr'>]: number };

/** How strict the review is for a player at this MMR (null: unknown strength, the neutral bar). */
export function barFor(mmr: number | null): Bar {
  const at = mmr ?? NEUTRAL_MMR;
  const xs = BY_MMR.mmr;
  const i = Math.max(0, Math.min(xs.length - 2, xs.findIndex((x, k) => k === xs.length - 1 || at < xs[k + 1])));
  const t = Math.max(0, Math.min(1, (at - xs[i]) / (xs[i + 1] - xs[i])));
  const bar = {} as Bar;
  for (const key of Object.keys(BY_MMR) as Array<keyof typeof BY_MMR>) {
    if (key === 'mmr') continue;
    const ys = BY_MMR[key];
    bar[key] = Math.round((ys[i] + (ys[i + 1] - ys[i]) * t) * 10_000) / 10_000;
  }
  return bar;
}

/** The MMR the review goes by: only while ranked runs and once the player has played enough of it. */
export const reviewMmr = (mmr: number, rankedOpen: boolean, rankedGames: number): number | null =>
  rankedOpen && rankedGames >= FAIRPLAY.rankedGames ? mmr : null;

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
  /** think time of the counted moves where the player found a quiet first choice (hard moves) */
  found: number[];
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
  const s: GameSignals = { counted: 0, matched: 0, quiet: 0, quietMatched: 0, accuracy: accuracies(scores)[color], times: [], obvious: [], found: [], away: 0, awayMatched: 0 };
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
      if (match && timed) s.found.push(moveMs![i]);
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

export type Reason =
  | 'engine_match'
  | 'engine_game'
  | 'quiet_match'
  | 'high_accuracy'
  | 'accuracy_jump'
  | 'steady_timing'
  | 'fast_precision'
  | 'left_game';

export interface Review {
  /** the sum of the reasons' points; the queue shows players from FAIRPLAY.reviewLevel */
  level: number;
  reasons: Array<{ id: Reason; points: number }>;
  stats: {
    /** the MMR the bar was set by (null: not known yet, the neutral bar) and the expected match rate */
    mmr: number | null;
    humanMatch: number;
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
    foundMs: number | null;
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

/** How far a match rate over n moves is above an honest player's rate p, in (widened) standard deviations. */
export function matchZ(matched: number, n: number, p: number): number | null {
  if (!n) return null;
  return (matched / n - p) / (Math.sqrt((p * (1 - p)) / n) * FAIRPLAY.spread);
}

/**
 * A player's recent analysed games (newest first) together: a level and its reasons, against
 * the bar for the player's MMR (`reviewMmr`; null: the neutral bar).
 */
export function review(recent: ReviewedGame[], mmr: number | null): Review {
  const bar = barFor(mmr);
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
  const found = all.flatMap((s) => s.found ?? []);
  const away = sum(all.map((s) => s.away));
  const awayMatched = sum(all.map((s) => s.awayMatched));
  const engineGames = all.filter((s) => s.counted >= FAIRPLAY.gameMoves && s.matched / s.counted >= bar.gameMatch && (s.accuracy ?? 0) >= bar.gameAccuracy).length;

  const z = matchZ(matched, counted, bar.humanMatch);
  const accuracy = mean(accs);
  const recentAccuracy = mean(recentAccs);
  const earlierAccuracy = earlierAccs.length >= FAIRPLAY.jumpGames ? mean(earlierAccs) : null;
  const obviousMs = median(obvious);
  const medianMs = median(times);
  const foundMs = median(found);
  const quietRate = rate(quietMatched, quiet);

  const reasons: Review['reasons'] = [];
  if (counted >= FAIRPLAY.minMoves && z !== null && z >= FAIRPLAY.matchZ) reasons.push({ id: 'engine_match', points: z >= FAIRPLAY.matchZStrong ? 3 : 2 });
  if (engineGames) reasons.push({ id: 'engine_game', points: 2 });
  if (quiet >= FAIRPLAY.quietMoves && quietRate! >= bar.quietMatch) reasons.push({ id: 'quiet_match', points: 1 });
  if (accs.length >= FAIRPLAY.accuracyGames && accuracy! >= bar.highAccuracy) reasons.push({ id: 'high_accuracy', points: 1 });
  if (earlierAccuracy !== null && recentAccs.length === FAIRPLAY.jumpGames && recentAccuracy! - earlierAccuracy >= FAIRPLAY.accuracyJump) {
    reasons.push({ id: 'accuracy_jump', points: 1 });
  }
  // a relay to a second device: obvious moves take about as long as any other
  if (obvious.length >= FAIRPLAY.obviousMoves && obviousMs! >= bar.obviousMs && medianMs && obviousMs! / medianMs >= bar.obviousRatio) {
    reasons.push({ id: 'steady_timing', points: 1 });
  }
  // hard engine moves found, often, without the longer think a player of this rank needs
  if (found.length >= FAIRPLAY.foundMoves && quietRate! >= bar.quietMatch && medianMs && foundMs! / medianMs <= bar.foundRatio) {
    reasons.push({ id: 'fast_precision', points: 1 });
  }
  if (away >= FAIRPLAY.awayMoves && away / counted >= FAIRPLAY.awayShare) {
    reasons.push({ id: 'left_game', points: awayMatched / away >= FAIRPLAY.awayMatch ? 2 : 1 });
  }

  return {
    level: sum(reasons.map((r) => r.points)),
    reasons,
    stats: {
      mmr,
      humanMatch: round(bar.humanMatch)!,
      games: games.length,
      fromOpponent: games.filter((g) => g.source === 'opponent').length,
      counted,
      matchRate: round(rate(matched, counted)),
      matchZ: round(z, 1),
      quietRate: round(quietRate),
      engineGames,
      accuracy: round(accuracy, 1),
      recentAccuracy: round(recentAccuracy, 1),
      earlierAccuracy: round(earlierAccuracy, 1),
      obviousMs: obviousMs === null ? null : Math.round(obviousMs),
      foundMs: foundMs === null ? null : Math.round(foundMs),
      medianMs: medianMs === null ? null : Math.round(medianMs),
      away,
      awayMatchRate: round(rate(awayMatched, away)),
    },
  };
}
