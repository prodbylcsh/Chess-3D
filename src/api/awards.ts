// Achievements shown on profiles. Computed from stats, rank and history; the
// server will store earned awards (with dates) once it exists.
import { TIERS } from '#shared/rating.ts';
import { t, tierName, tk } from '../i18n';
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

const tierIndex = (id: string) => TIERS.findIndex((x) => x.id === id);

export function awardsFor(stats: Stats, rank: RankInfo, history: GameRecord[]): Award[] {
  const count = (id: string, name: string, description: string, icon: AwardIcon, value: number, goal: number): Award => ({
    id,
    name: t(name),
    description: t(description),
    icon,
    earned: value >= goal,
    progress: [Math.min(value, goal), goal],
  });
  const reached = (tier: string, name: string): Award => ({
    id: `tier-${tier}`,
    name: t(name),
    description: t('Reach {tier} in ranked', { tier: tierName(tier) }),
    icon: 'crown',
    earned: tierIndex(rank.tier) >= tierIndex(tier),
  });
  const games = stats.wins + stats.losses + stats.draws;
  return [
    count('first-win', tk('First Blood'), tk('Win your first game'), 'swords', stats.wins, 1),
    count('wins-10', tk('Seasoned'), tk('Win 10 games'), 'trophy', stats.wins, 10),
    count('wins-100', tk('Veteran'), tk('Win 100 games'), 'trophy', stats.wins, 100),
    count('games-500', tk('Devoted'), tk('Play 500 games'), 'zap', games, 500),
    count('streak-5', tk('On Fire'), tk('Win 5 games in a row'), 'flame', stats.bestStreak, 5),
    count('streak-10', tk('Unstoppable'), tk('Win 10 games in a row'), 'flame', stats.bestStreak, 10),
    reached('gold', tk('Gilded')),
    reached('platinum', tk('Platinum Mind')),
    reached('diamond', tk('Diamond Mind')),
    {
      id: 'accuracy-90',
      name: t('Precision'),
      description: t('Play a game with 90% accuracy or more'),
      icon: 'target',
      earned: history.some((g) => (g.accuracy ?? 0) >= 90),
    },
    {
      id: 'quick-mate',
      name: t('Swift Strike'),
      description: t('Win by checkmate in 20 moves or fewer'),
      icon: 'gem',
      earned: history.some((g) => g.outcome === 'win' && g.reason === 'checkmate' && g.moves <= 40),
    },
  ];
}
