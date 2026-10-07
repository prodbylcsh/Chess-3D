// Achievements shown on profiles. Computed from stats, rank and history; the
// server will store earned awards (with dates) once it exists.
import { TIERS } from '#shared/rating.ts';
import type { GameRecord, RankInfo, Stats } from './types';

export type AwardIcon = 'trophy' | 'flame' | 'crown' | 'target' | 'zap' | 'swords' | 'gem';

export interface Award {
  id: string;
  name: string;
  description: string;
  icon: AwardIcon;
  earned: boolean;
  /** [current, goal] for awards that count something */
  progress?: [number, number];
}

const tierIndex = (id: string) => TIERS.findIndex((t) => t.id === id);

export function awardsFor(stats: Stats, rank: RankInfo, history: GameRecord[]): Award[] {
  const count = (id: string, name: string, description: string, icon: AwardIcon, value: number, goal: number): Award => ({
    id,
    name,
    description,
    icon,
    earned: value >= goal,
    progress: [Math.min(value, goal), goal],
  });
  const reached = (tier: string, name: string): Award => ({
    id: `tier-${tier}`,
    name,
    description: `Reach ${TIERS[tierIndex(tier)].name} in ranked`,
    icon: 'crown',
    earned: tierIndex(rank.tier) >= tierIndex(tier),
  });
  const games = stats.wins + stats.losses + stats.draws;
  return [
    count('first-win', 'First Blood', 'Win your first game', 'swords', stats.wins, 1),
    count('wins-10', 'Seasoned', 'Win 10 games', 'trophy', stats.wins, 10),
    count('wins-100', 'Veteran', 'Win 100 games', 'trophy', stats.wins, 100),
    count('games-500', 'Devoted', 'Play 500 games', 'zap', games, 500),
    count('streak-5', 'On Fire', 'Win 5 games in a row', 'flame', stats.bestStreak, 5),
    count('streak-10', 'Unstoppable', 'Win 10 games in a row', 'flame', stats.bestStreak, 10),
    reached('gold', 'Gilded'),
    reached('platinum', 'Platinum Mind'),
    reached('diamond', 'Diamond Mind'),
    {
      id: 'accuracy-90',
      name: 'Precision',
      description: 'Play a game with 90% accuracy or more',
      icon: 'target',
      earned: history.some((g) => (g.accuracy ?? 0) >= 90),
    },
    {
      id: 'quick-mate',
      name: 'Swift Strike',
      description: 'Win by checkmate in 20 moves or fewer',
      icon: 'gem',
      earned: history.some((g) => g.outcome === 'win' && g.reason === 'checkmate' && g.moves <= 40),
    },
  ];
}
