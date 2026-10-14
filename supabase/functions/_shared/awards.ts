// Awards (achievements) on profiles. The server grants them when a game is settled or its
// analysis is applied, and keeps each one with the date it was earned, so an award stays
// even when what earned it changes later (a season reset, old games leaving the history).
// Pure rules shared by the server and the app (names are translated in src/api/awards.ts).
import { TIERS, rankOf, type TierId } from './rating.ts';

export type AwardIcon = 'trophy' | 'flame' | 'crown' | 'target' | 'zap' | 'swords' | 'gem';

/** What a player has done so far: the stats the server keeps, and the MMR now. */
export interface AwardStats {
  wins: number;
  losses: number;
  draws: number;
  best_streak: number;
  mmr: number;
}

/** A finished game, for the awards a single game can earn. */
export interface AwardGame {
  outcome: 'win' | 'loss' | 'draw';
  reason: string;
  /** half-moves */
  plies: number;
  accuracy: number | null;
}

export interface AwardDef {
  id: string;
  icon: AwardIcon;
  /** counted awards: what counts and how far; the others are earned by one game or a rank */
  count?: { of: 'wins' | 'games' | 'streak'; goal: number };
  tier?: TierId;
}

export const AWARDS: readonly AwardDef[] = [
  { id: 'first-win', icon: 'swords', count: { of: 'wins', goal: 1 } },
  { id: 'wins-10', icon: 'trophy', count: { of: 'wins', goal: 10 } },
  { id: 'wins-100', icon: 'trophy', count: { of: 'wins', goal: 100 } },
  { id: 'games-500', icon: 'zap', count: { of: 'games', goal: 500 } },
  { id: 'streak-5', icon: 'flame', count: { of: 'streak', goal: 5 } },
  { id: 'streak-10', icon: 'flame', count: { of: 'streak', goal: 10 } },
  { id: 'tier-gold', icon: 'crown', tier: 'gold' },
  { id: 'tier-platinum', icon: 'crown', tier: 'platinum' },
  { id: 'tier-diamond', icon: 'crown', tier: 'diamond' },
  { id: 'accuracy-90', icon: 'target' },
  { id: 'quick-mate', icon: 'gem' },
];

const tierIndex = (id: TierId) => TIERS.findIndex((t) => t.id === id);

/** How far a player is towards a counted award: [current, goal]. */
export function awardProgress(award: AwardDef, stats: AwardStats): [number, number] | null {
  if (!award.count) return null;
  const value =
    award.count.of === 'wins' ? stats.wins : award.count.of === 'games' ? stats.wins + stats.losses + stats.draws : stats.best_streak;
  return [Math.min(value, award.count.goal), award.count.goal];
}

/** The awards this player has met now (with the game just played, if any). */
export function awardsMet(stats: AwardStats, game?: Partial<AwardGame>): string[] {
  const tier = tierIndex(rankOf(stats.mmr).tier.id);
  return AWARDS.filter((a) => {
    if (a.count) {
      const [value, goal] = awardProgress(a, stats)!;
      return value >= goal;
    }
    if (a.tier) return tier >= tierIndex(a.tier);
    if (!game) return false;
    if (a.id === 'accuracy-90') return (game.accuracy ?? 0) >= 90;
    if (a.id === 'quick-mate') return game.outcome === 'win' && game.reason === 'checkmate' && (game.plies ?? Infinity) <= 40;
    return false;
  }).map((a) => a.id);
}
