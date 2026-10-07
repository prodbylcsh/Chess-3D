// Ranked rating (MMR), ranks and the accuracy-based performance factor.
//
// Pure functions shared by the web app (previews, result screens) and the
// server (the only place real MMR changes are applied). Every constant is a
// tuning knob; see docs/PLATFORM.md for the reasoning and worked examples.

export type Outcome = 'win' | 'loss' | 'draw';

export const MMR = {
  start: 1000,
  min: 0,
  max: 1_000_000,

  /** points for a win / lost for a loss against an equally rated opponent */
  baseWin: 20,
  baseLoss: 18,

  /** share of the rating difference added or removed (10%) */
  diffRate: 0.1,
  /** an upset (beating a stronger player, losing to a weaker one) moves at most this much extra */
  upsetCap: 30,
  /** an expected result (beating a weaker player, losing to a stronger one) is reduced by at most this much */
  expectedCap: 15,

  /** performance moves the result by up to ±20% of the baseline */
  performanceShare: 0.2,

  /** consecutive wins: the 3rd win gives +10% of the baseline, each further win +2% more, up to +30% */
  streakFrom: 3,
  streakFirst: 0.1,
  streakStep: 0.02,
  streakMax: 0.3,

  /** a win always gains, a loss always costs, at least this much */
  minWin: 3,
  minLoss: 3,

  /** draws: the lower-rated player gains 5% of the difference (capped), performance counts half */
  drawDiffRate: 0.05,
  drawDiffCap: 10,
  drawPerformanceShare: 0.1,
} as const;

/** Accuracy (0-100) that counts as neither good nor bad play. */
export const NEUTRAL_ACCURACY = 70;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Map game accuracy (0-100) to a performance factor in [-1, 1]; 70% accuracy is neutral. */
export function performanceFactor(accuracy: number | null | undefined): number {
  if (accuracy == null || Number.isNaN(accuracy)) return 0;
  const a = clamp(accuracy, 0, 100);
  return a >= NEUTRAL_ACCURACY
    ? (a - NEUTRAL_ACCURACY) / (100 - NEUTRAL_ACCURACY)
    : (a - NEUTRAL_ACCURACY) / NEUTRAL_ACCURACY;
}

/** Win-streak bonus as a share of the baseline, for the n-th consecutive win (n counts this win). */
export function streakShare(consecutiveWins: number): number {
  if (consecutiveWins < MMR.streakFrom) return 0;
  const share = MMR.streakFirst + MMR.streakStep * (consecutiveWins - MMR.streakFrom);
  return Math.round(Math.min(MMR.streakMax, share) * 1000) / 1000;
}

export interface RatedGame {
  outcome: Outcome;
  /** the player's MMR before the game */
  mmr: number;
  opponentMmr: number;
  /** the player's accuracy in this game (0-100), if analysed */
  accuracy?: number | null;
  /** consecutive ranked wins before this game */
  winStreak: number;
}

export interface MmrChange {
  baseline: number;
  difference: number;
  performance: number;
  streak: number;
  /** sum of the parts after the minimum-change rule; what the player sees as "+23 MMR" */
  total: number;
  mmrAfter: number;
  winStreakAfter: number;
}

/** MMR change for one ranked game. Parts are rounded individually so they always add up. */
export function mmrChange(game: RatedGame): MmrChange {
  const gap = game.opponentMmr - game.mmr; // > 0: the opponent is stronger
  const perf = performanceFactor(game.accuracy);
  let baseline: number;
  let difference: number;
  let performance: number;
  let streak = 0;
  let winStreakAfter: number;

  switch (game.outcome) {
    case 'win': {
      baseline = MMR.baseWin;
      difference = clamp(gap * MMR.diffRate, -MMR.expectedCap, MMR.upsetCap);
      performance = perf * MMR.performanceShare * MMR.baseWin;
      winStreakAfter = game.winStreak + 1;
      streak = streakShare(winStreakAfter) * MMR.baseWin;
      break;
    }
    case 'loss': {
      baseline = -MMR.baseLoss;
      difference = clamp(gap * MMR.diffRate, -MMR.upsetCap, MMR.expectedCap);
      performance = perf * MMR.performanceShare * MMR.baseLoss;
      winStreakAfter = 0;
      break;
    }
    case 'draw': {
      baseline = 0;
      difference = clamp(gap * MMR.drawDiffRate, -MMR.drawDiffCap, MMR.drawDiffCap);
      performance = perf * MMR.drawPerformanceShare * MMR.baseWin;
      winStreakAfter = game.winStreak; // a draw neither extends nor breaks a streak
      break;
    }
  }

  const parts = {
    baseline: Math.round(baseline),
    difference: Math.round(difference),
    performance: Math.round(performance),
    streak: Math.round(streak),
  };
  let total = parts.baseline + parts.difference + parts.performance + parts.streak;
  if (game.outcome === 'win') total = Math.max(total, MMR.minWin);
  if (game.outcome === 'loss') total = Math.min(total, -MMR.minLoss);

  const mmrAfter = clamp(game.mmr + total, MMR.min, MMR.max);
  return { ...parts, total: mmrAfter - game.mmr, mmrAfter, winStreakAfter };
}

// ------------------------------------------------------------------ ranks

export type TierId =
  | 'iron'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'emerald'
  | 'diamond'
  | 'master'
  | 'grandmaster'
  | 'challenger';

export interface Tier {
  id: TierId;
  name: string;
  /** MMR where the tier starts */
  from: number;
  /** tiers below Master have four divisions (IV → I) of `divisionSize` MMR */
  divisions: boolean;
  color: string;
}

export const DIVISION_SIZE = 100;

export const TIERS: readonly Tier[] = [
  { id: 'iron', name: 'Iron', from: 0, divisions: true, color: '#8b8f98' },
  { id: 'bronze', name: 'Bronze', from: 400, divisions: true, color: '#c58a5a' },
  { id: 'silver', name: 'Silver', from: 800, divisions: true, color: '#c9d2dd' },
  { id: 'gold', name: 'Gold', from: 1200, divisions: true, color: '#f2c27a' },
  { id: 'platinum', name: 'Platinum', from: 1600, divisions: true, color: '#6fd3c7' },
  { id: 'emerald', name: 'Emerald', from: 2000, divisions: true, color: '#3fcf8e' },
  { id: 'diamond', name: 'Diamond', from: 2400, divisions: true, color: '#8fb6ff' },
  { id: 'master', name: 'Master', from: 2800, divisions: false, color: '#c08cff' },
  { id: 'grandmaster', name: 'Grandmaster', from: 3200, divisions: false, color: '#ff6a7a' },
  { id: 'challenger', name: 'Challenger', from: 3600, divisions: false, color: '#ffe08a' },
];

const ROMAN = ['I', 'II', 'III', 'IV'] as const;

export interface Rank {
  tier: Tier;
  /** 4 (lowest) … 1 (highest); null for Master and above */
  division: 1 | 2 | 3 | 4 | null;
  /** e.g. "Silver II", "Master" */
  label: string;
  /** progress through the current division (or the apex tier band), 0..1 */
  progress: number;
}

export function rankOf(mmr: number): Rank {
  const m = clamp(Math.floor(mmr), MMR.min, MMR.max);
  let i = TIERS.length - 1;
  while (i > 0 && m < TIERS[i].from) i--;
  const tier = TIERS[i];
  const into = m - tier.from;

  if (!tier.divisions) {
    const next = TIERS[i + 1];
    const band = next ? next.from - tier.from : 400;
    return { tier, division: null, label: tier.name, progress: next ? into / band : Math.min(1, into / band) };
  }
  const step = Math.min(3, Math.floor(into / DIVISION_SIZE)); // 0 = IV … 3 = I
  const division = (4 - step) as 1 | 2 | 3 | 4;
  return {
    tier,
    division,
    label: `${tier.name} ${ROMAN[division - 1]}`,
    progress: (into - step * DIVISION_SIZE) / DIVISION_SIZE,
  };
}

/** Compare two MMR values by rank: 1 promoted, -1 demoted, 0 same division. */
export function rankMove(before: number, after: number): -1 | 0 | 1 {
  const a = rankOf(before);
  const b = rankOf(after);
  if (a.label === b.label) return 0;
  return after > before ? 1 : -1;
}

// ------------------------------------------------------------------ accuracy

/** Winning chance (0-100) for the side with an evaluation of `cp` centipawns. */
export function winPercent(cp: number): number {
  const c = clamp(cp, -1000, 1000);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Accuracy (0-100) of one move from the mover's winning chance before and after it. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  return clamp(103.1668 * Math.exp(-0.04354 * drop) - 3.1669, 0, 100);
}

/**
 * Game accuracy from per-move evaluations (centipawns, from the mover's point of
 * view, before and after each of the player's moves). Same model as lichess.
 */
export function gameAccuracy(moves: Array<{ before: number; after: number }>): number | null {
  if (!moves.length) return null;
  const accs = moves.map((m) => moveAccuracy(winPercent(m.before), winPercent(m.after)));
  const mean = accs.reduce((s, a) => s + a, 0) / accs.length;
  // the harmonic mean punishes blunders harder than a plain average
  const harmonic = accs.length / accs.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
  return Math.round(((mean + harmonic) / 2) * 10) / 10;
}

// ------------------------------------------------------------------ seasons

/** Share of the distance to the start MMR removed at a season reset. */
export const SEASON_RESET_SHARE = 0.25;

/** MMR at the start of a new season: pulled part of the way back towards 1,000. */
export function seasonReset(mmr: number, share = SEASON_RESET_SHARE): number {
  return Math.round(mmr - (mmr - MMR.start) * share);
}
