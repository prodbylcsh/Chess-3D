// Demo players for the mock back-end: matchmaking opponents, friends, search results.
import { MMR } from '#shared/rating.ts';
import { DEFAULT_LOADOUT as SHARED_DEFAULT, ITEMS } from '#shared/shop.ts';
import type { Loadout, Stats } from '../types';

export const DEFAULT_LOADOUT: Loadout = { ...SHARED_DEFAULT };

export interface SeedPlayer {
  id: string;
  username: string;
  iconId: string;
  mmr: number;
  online: boolean;
  stats: Stats;
  loadout: Loadout;
  createdAt: string;
}

const NAMES: Array<[string, string, number]> = [
  ['MagnusFanboy', 'king', 1420],
  ['QueenGambitQ', 'queen', 1180],
  ['RookieRook', 'rook', 760],
  ['BishopBlitz', 'bishop', 1050],
  ['KnightOwl', 'knight', 990],
  ['PawnStorm', 'pawn', 880],
  ['Endgame_Ella', 'queen', 1640],
  ['TacticalTom', 'knight', 1270],
  ['SicilianSam', 'bishop', 1110],
  ['CastleKing', 'rook', 940],
  ['ZugzwangZoe', 'king', 1890],
  ['ForkFiend', 'knight', 1020],
  ['GrandMasterFlash', 'king', 2450],
  ['EnPassantPete', 'pawn', 1005],
  ['LadyLuzhin', 'queen', 1330],
  ['CheckMateo', 'bishop', 970],
  ['DragonVariant', 'knight', 2100],
  ['SlowAndSteady', 'pawn', 610],
  ['OpeningOracle', 'bishop', 1550],
  ['RuyLopezRuth', 'rook', 1210],
];

/** deterministic pseudo-random numbers so demo data is stable between reloads */
function seeded(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export const SEED_PLAYERS: SeedPlayer[] = NAMES.map(([username, iconId, mmr], i) => {
  const games = 40 + Math.floor(seeded(i) * 400);
  const winRate = 0.42 + seeded(i + 100) * 0.16;
  const wins = Math.round(games * winRate);
  const draws = Math.round(games * 0.06);
  return {
    id: `seed-${i + 1}`,
    username,
    iconId,
    mmr,
    online: seeded(i + 7) > 0.35,
    stats: {
      wins,
      losses: games - wins - draws,
      draws,
      winStreak: Math.floor(seeded(i + 3) * 4),
      rankedStreak: Math.floor(seeded(i + 3) * 4),
      bestStreak: 3 + Math.floor(seeded(i + 5) * 9),
    },
    loadout: seedLoadout(i, mmr),
    createdAt: new Date(Date.UTC(2026, 0, 1) + seeded(i + 11) * 2.5e10).toISOString(),
  };
});

/** Demo players show off shop items: stronger players own more of them. */
function seedLoadout(i: number, mmr: number): Loadout {
  const loadout: Loadout = { ...DEFAULT_LOADOUT };
  const keys = Object.keys(loadout) as Array<keyof Loadout>;
  keys.forEach((category, k) => {
    if (seeded(i * 7 + k + 50) > Math.min(0.85, mmr / 2600)) return;
    const paid = ITEMS.filter((x) => x.category === category && x.price > 0);
    loadout[category] = paid[Math.floor(seeded(i * 13 + k + 90) * paid.length)].id;
  });
  return loadout;
}

/** demo friends of every new account */
export const SEED_FRIENDS = ['seed-5', 'seed-2', 'seed-9', 'seed-14', 'seed-11'];

export const NEW_PLAYER_STATS: Stats = { wins: 0, losses: 0, draws: 0, winStreak: 0, rankedStreak: 0, bestStreak: 0 };

export const START_MMR = MMR.start;
