// Coin rewards, coin wagers and shop pricing. Pure functions shared by the web
// app (previews) and the server (the only place balances change).
import { performanceFactor, streakShare, type Outcome } from './rating.ts';

/** Kinds of games. Only some of them pay coins; see `paysCoins`. */
export type GameKind = 'ranked' | 'casual' | 'wager' | 'friend' | 'ai' | 'local';

export const COINS = {
  /** new accounts start with this balance */
  startingBalance: 500,
  win: 100,
  loss: 50,
  draw: 75,
  /** performance moves the reward by up to ±20% of the baseline */
  performanceShare: 0.2,
  /** ranked only: +10% of the baseline per 100 MMR the opponent is stronger, from -25% up to +50% */
  diffPer100: 0.1,
  diffMin: -0.25,
  diffMax: 0.5,
  /** a game always pays at least half its baseline */
  minShare: 0.5,
} as const;

/** Coins never come from games against the AI, on one device or with friends (easy to farm). */
export function paysCoins(kind: GameKind): boolean {
  return kind === 'ranked' || kind === 'casual';
}

export interface CoinGame {
  kind: GameKind;
  outcome: Outcome;
  accuracy?: number | null;
  mmr?: number;
  opponentMmr?: number;
  /** consecutive wins before this game (same counter as ranked MMR for ranked games) */
  winStreak?: number;
}

export interface CoinReward {
  baseline: number;
  performance: number;
  difference: number;
  streak: number;
  total: number;
}

const ZERO: CoinReward = { baseline: 0, performance: 0, difference: 0, streak: 0, total: 0 };

export function coinReward(game: CoinGame): CoinReward {
  if (!paysCoins(game.kind)) return ZERO;
  const baseline = game.outcome === 'win' ? COINS.win : game.outcome === 'loss' ? COINS.loss : COINS.draw;

  const performance = Math.round(performanceFactor(game.accuracy) * COINS.performanceShare * baseline);

  let difference = 0;
  if (game.kind === 'ranked' && game.mmr != null && game.opponentMmr != null) {
    const share = ((game.opponentMmr - game.mmr) / 100) * COINS.diffPer100;
    difference = Math.round(Math.min(COINS.diffMax, Math.max(COINS.diffMin, share)) * baseline);
  }

  const streak = game.outcome === 'win' ? Math.round(streakShare((game.winStreak ?? 0) + 1) * baseline) : 0;

  const total = Math.max(Math.round(baseline * COINS.minShare), baseline + performance + difference + streak);
  return { baseline, performance, difference, streak, total };
}

// ------------------------------------------------------------------ wagers ("Play for coins")

export type StakeId = 'low' | 'medium' | 'high';

export const STAKES: Record<StakeId, { name: string; amount: number }> = {
  low: { name: 'Low', amount: 100 },
  medium: { name: 'Medium', amount: 500 },
  high: { name: 'High', amount: 2000 },
};

/** The house keeps this share of the pot: the economy's main coin sink. */
export const WAGER_FEE = 0.1;

/** Net balance change for a wager game: the winner takes the pot minus the fee, a draw refunds. */
export function wagerNet(stake: number, outcome: Outcome): number {
  if (outcome === 'draw') return 0;
  if (outcome === 'loss') return -stake;
  return Math.round(stake * 2 * (1 - WAGER_FEE)) - stake;
}
