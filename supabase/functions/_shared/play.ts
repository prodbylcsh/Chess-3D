// Ranked, casual and coin games on the server: time controls, clocks, the first-move
// window, timeouts, and what a finished game does to both players (MMR, coins, stats).
// Pure functions shared by the `game`, `play` and `account` Edge Functions and the app.
import type { Chess, Move } from 'chess.js';
import { COINS, STAKES, coinReward, wagerNet, type CoinReward, type StakeId } from './economy.ts';
import { MMR, mmrChange, rankOf, type MmrChange, type Outcome } from './rating.ts';
import { SEASON_ONE, bracketOf, rankedOpen, resetAfterSeason, rewardHistory, seasonAt, type Month, type SeasonReward } from './seasons.ts';
import { itemDef, seasonRewardPool } from './shop.ts';

export type Side = 'w' | 'b';
export type MatchKind = 'ranked' | 'casual' | 'wager';
export type Result = '1-0' | '0-1' | '1/2-1/2';

// ------------------------------------------------------------------ time controls

export type ControlId = 'fast' | 'blitz' | 'rapid' | 'classical';

export interface Control {
  id: ControlId;
  /** English name; the app translates it */
  name: string;
  baseMs: number;
  incrementMs: number;
  kinds: readonly MatchKind[];
}

export const CONTROLS: Record<ControlId, Control> = {
  fast: { id: 'fast', name: 'Fast blitz', baseMs: 3 * 60_000, incrementMs: 2_000, kinds: ['casual'] },
  blitz: { id: 'blitz', name: 'Blitz', baseMs: 5 * 60_000, incrementMs: 3_000, kinds: ['ranked', 'casual', 'wager'] },
  rapid: { id: 'rapid', name: 'Rapid', baseMs: 10 * 60_000, incrementMs: 5_000, kinds: ['ranked', 'casual', 'wager'] },
  classical: { id: 'classical', name: 'Classical', baseMs: 15 * 60_000, incrementMs: 10_000, kinds: ['ranked', 'casual', 'wager'] },
};

export const DEFAULT_CONTROL: ControlId = 'rapid';

/**
 * Whether players can search for games of this kind. Ranked is closed until season 1
 * starts (SEASON_ONE in seasons.ts, decided October 2026: once there are enough players);
 * casual and coin games are always open.
 */
export function kindOpen(kind: MatchKind, ranked: boolean = rankedOpen()): boolean {
  return kind !== 'ranked' || ranked;
}

/** "10 + 5" */
export function controlLabel(id: ControlId): string {
  const c = CONTROLS[id];
  return `${c.baseMs / 60_000} + ${c.incrementMs / 1000}`;
}

export function controlsFor(kind: MatchKind): Control[] {
  return Object.values(CONTROLS).filter((c) => c.kinds.includes(kind));
}

export function isControl(kind: MatchKind, id: unknown): id is ControlId {
  return typeof id === 'string' && id in CONTROLS && CONTROLS[id as ControlId].kinds.includes(kind);
}

/** Each player has this long for their first move; until then no clock runs. */
export const FIRST_MOVE_MS = 30_000;

/** Games with fewer half-moves than this pay no coins (MMR still counts). */
export const MIN_PAID_PLIES = 20;

/**
 * Time the opponent's move takes to play out on screen: the next player's clock starts
 * only after it, so the cinematic animations never cost anyone time.
 */
export function graceMs(move: Pick<Move, 'flags'>): number {
  if (/[ce]/.test(move.flags)) return 3_000; // captures (en passant too) play the longest
  if (/[kqp]/.test(move.flags)) return 2_500; // castling, promotion
  return 1_500;
}

/** The clock part of a game row. `turnStartedAt` is when the side to move's time started (ms). */
export interface Clocks {
  control: ControlId;
  white: number;
  black: number;
  turnStartedAt: number;
}

/** A side's first move is the first or second half-move of the game. */
export const isFirstMove = (plies: number) => plies < 2;

/** Time left for the side to move at `now` (the first move has its own window). */
export function remaining(clocks: Clocks, side: Side, plies: number, now: number): number {
  const elapsed = Math.max(0, now - clocks.turnStartedAt);
  if (isFirstMove(plies)) return FIRST_MOVE_MS - elapsed;
  return (side === 'w' ? clocks.white : clocks.black) - elapsed;
}

/** Clocks after `side` moves at `now`, or 'flagged' when its time had already run out. */
export function clocksAfterMove(clocks: Clocks, side: Side, plies: number, now: number, move: Pick<Move, 'flags'>): Clocks | 'flagged' | 'aborted' {
  const left = remaining(clocks, side, plies, now);
  if (left <= 0) return isFirstMove(plies) ? 'aborted' : 'flagged';
  const next: Clocks = { ...clocks, turnStartedAt: now + graceMs(move) };
  if (!isFirstMove(plies)) {
    const after = left + CONTROLS[clocks.control].incrementMs;
    if (side === 'w') next.white = after;
    else next.black = after;
  }
  return next;
}

/** Whether `side` still has material that could ever checkmate. */
export function canMate(chess: Chess, side: Side): boolean {
  const pieces = chess
    .board()
    .flat()
    .filter((p) => p && p.color === side && p.type !== 'k')
    .map((p) => p!.type);
  if (pieces.some((p) => p === 'q' || p === 'r' || p === 'p')) return true;
  return pieces.length >= 2; // two minor pieces can (two knights rarely, but the rules count them)
}

/**
 * The game's end when the side to move is out of time: a loss, or a draw when the
 * opponent cannot checkmate. Before the first moves it is aborted instead.
 */
export function timeoutEnd(chess: Chess, plies: number): { result: Result | null; reason: string } {
  if (isFirstMove(plies)) return { result: null, reason: 'aborted' };
  const loser = chess.turn();
  const winner: Side = loser === 'w' ? 'b' : 'w';
  if (!canMate(chess, winner)) return { result: '1/2-1/2', reason: 'timeout vs insufficient material' };
  return { result: winner === 'w' ? '1-0' : '0-1', reason: 'timeout' };
}

// ------------------------------------------------------------------ results

/** A player's competitive state, as stored on the server. */
export interface PlayerState {
  id: string;
  mmr: number;
  coins: number;
  wins: number;
  losses: number;
  draws: number;
  /** consecutive wins in coin-paying games (casual + ranked) */
  win_streak: number;
  /** consecutive ranked wins */
  ranked_streak: number;
  best_streak: number;
  season: number;
  season_peak_mmr: number;
}

export interface Settlement {
  playerId: string;
  color: Side;
  /** null when the game was aborted */
  outcome: Outcome | null;
  mmr: MmrChange | null;
  coins: CoinReward | null;
  /** net coins of a coin game */
  wager: number | null;
  /** coins credited now (a coin game's stake was taken when the game started) */
  credit: number;
  /** the coin change the player sees */
  coinsDelta: number;
  after: PlayerState;
}

export interface FinishedGame {
  kind: MatchKind;
  stake: number | null;
  /** null: aborted */
  result: Result | null;
  plies: number;
  white: PlayerState;
  black: PlayerState;
  /** each player's accuracy once the engine analysis is in; null or missing counts as neutral */
  accuracy?: Record<Side, number | null>;
}

const outcomeFor = (result: Result, color: Side): Outcome =>
  result === '1/2-1/2' ? 'draw' : (result === '1-0') === (color === 'w') ? 'win' : 'loss';

/**
 * What the finished game does to both players. The game is settled at once with neutral
 * accuracy; the engine analysis adds the performance part later (`performanceAdjustment`).
 */
export function settle(game: FinishedGame): [Settlement, Settlement] {
  const one = (color: Side): Settlement => {
    const me = color === 'w' ? game.white : game.black;
    const opponent = color === 'w' ? game.black : game.white;
    const after: PlayerState = { ...me };

    if (game.result === null) {
      const refund = game.kind === 'wager' ? (game.stake ?? 0) : 0;
      after.coins += refund;
      return { playerId: me.id, color, outcome: null, mmr: null, coins: null, wager: null, credit: refund, coinsDelta: 0, after };
    }

    const outcome = outcomeFor(game.result, color);
    let mmr: MmrChange | null = null;
    let coins: CoinReward | null = null;
    let wager: number | null = null;
    let credit = 0;

    if (game.kind === 'ranked') {
      mmr = mmrChange({ outcome, mmr: me.mmr, opponentMmr: opponent.mmr, accuracy: game.accuracy?.[color], winStreak: me.ranked_streak });
      after.mmr = mmr.mmrAfter;
      after.ranked_streak = mmr.winStreakAfter;
      after.season_peak_mmr = Math.max(me.season_peak_mmr, after.mmr);
    }
    if (game.kind === 'wager') {
      const stake = game.stake ?? 0;
      wager = wagerNet(stake, outcome);
      credit = stake + wager; // the stake was already taken
    } else if (game.plies >= MIN_PAID_PLIES) {
      coins = coinReward({ kind: game.kind, outcome, accuracy: game.accuracy?.[color], mmr: me.mmr, opponentMmr: opponent.mmr, winStreak: me.win_streak });
      credit = coins.total;
    } else {
      coins = { baseline: 0, performance: 0, difference: 0, streak: 0, total: 0 };
    }
    after.coins += credit;

    if (outcome === 'win') {
      after.wins++;
      if (game.kind !== 'wager') after.win_streak++;
      after.best_streak = Math.max(after.best_streak, after.win_streak);
    } else if (outcome === 'loss') {
      after.losses++;
      after.win_streak = 0;
    } else {
      after.draws++;
    }
    return { playerId: me.id, color, outcome, mmr, coins, wager, credit, coinsDelta: wager ?? coins?.total ?? 0, after };
  };
  return [one('w'), one('b')];
}

/** What the engine analysis changes for one player of a settled game. */
export interface Adjustment {
  playerId: string;
  color: Side;
  accuracy: number | null;
  /** added to the MMR and coins the game already gave */
  mmrDelta: number;
  coinsDelta: number;
  /** the game's MMR and coins with the performance part, as the result shows them */
  mmr: MmrChange | null;
  coins: CoinReward | null;
}

/**
 * The performance part of a settled game: the same settlement with the players' accuracy,
 * minus the neutral one it was settled with. Streaks and stats do not change.
 */
export function performanceAdjustment(game: FinishedGame, accuracy: Record<Side, number | null>): [Adjustment, Adjustment] {
  const before = settle({ ...game, accuracy: undefined });
  const after = settle({ ...game, accuracy });
  const one = (i: 0 | 1): Adjustment => ({
    playerId: after[i].playerId,
    color: after[i].color,
    accuracy: accuracy[after[i].color],
    mmrDelta: (after[i].mmr?.total ?? 0) - (before[i].mmr?.total ?? 0),
    coinsDelta: after[i].credit - before[i].credit,
    mmr: after[i].mmr,
    coins: after[i].coins,
  });
  return [one(0), one(1)];
}

/** The stake of a coin game. */
export const stakeAmount = (stake: StakeId) => STAKES[stake].amount;

// ------------------------------------------------------------------ seasons

export interface SeasonGrant {
  season: number;
  bracket: string;
  coins: number;
  /** items added to the inventory (the reward item unless already owned, and the season icon) */
  items: string[];
  badge: string;
  /** the reward item was owned already: its price was paid out in coins instead */
  itemAsCoins: number;
}

/**
 * Apply the season ends a player has not had yet (the server does this lazily, the next
 * time the player shows up). Rewards go by the highest rank reached in each season;
 * MMR is pulled towards 1,000 and win streaks reset.
 */
export function rollSeasons(
  player: PlayerState,
  inventory: readonly string[],
  now: Date,
  first: Month | null = SEASON_ONE,
): { after: PlayerState; grants: SeasonGrant[] } {
  const current = seasonAt(now, first)?.number ?? 0;
  const after = { ...player };
  const grants: SeasonGrant[] = [];
  if (player.season >= current) return { after, grants };

  const history = rewardHistory(current - 1, seasonRewardPool());
  const owned = new Set(inventory);
  for (let s = player.season; s < current; s++) {
    if (s < 1) {
      // before season 1 (ranked closed): no rewards; season 1 is a fresh start for everyone
      after.mmr = MMR.start;
      after.season_peak_mmr = MMR.start;
      after.win_streak = 0;
      after.ranked_streak = 0;
      continue;
    }
    const peak = Math.max(after.season_peak_mmr, after.mmr);
    const bracket = bracketOf(rankOf(peak).tier.id);
    const reward = history[s - 1]?.find((r: SeasonReward) => r.bracket === bracket.id);
    const items: string[] = [];
    let itemAsCoins = 0;
    if (reward?.item) {
      if (owned.has(reward.item)) itemAsCoins = itemDef(reward.item)?.price ?? 0;
      else items.push(reward.item);
    }
    if (reward) items.push(reward.icon);
    items.forEach((i) => owned.add(i));
    const coins = (reward?.coins ?? bracket.coins) + itemAsCoins;
    after.coins += coins;
    grants.push({ season: s, bracket: bracket.id, coins, items, badge: reward?.badge ?? `season-${s}-${bracket.id}`, itemAsCoins });

    after.mmr = resetAfterSeason(after.mmr, s);
    after.season_peak_mmr = after.mmr;
    after.win_streak = 0;
    after.ranked_streak = 0;
  }
  after.season = current;
  return { after, grants };
}

/** A new player on the server: the fresh start everyone gets. */
export function newPlayer(id: string, now: Date, first: Month | null = SEASON_ONE): PlayerState {
  return {
    id,
    mmr: MMR.start,
    coins: COINS.startingBalance,
    wins: 0,
    losses: 0,
    draws: 0,
    win_streak: 0,
    ranked_streak: 0,
    best_streak: 0,
    season: seasonAt(now, first)?.number ?? 0,
    season_peak_mmr: MMR.start,
  };
}
