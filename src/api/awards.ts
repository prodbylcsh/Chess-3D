// Achievements shown on profiles. The rules are shared with the server
// (supabase/functions/_shared/awards.ts), which keeps earned awards with their dates; the
// demo back-end works them out here from stats, rank and history.
import { AWARDS, awardProgress, awardsMet, type AwardIcon } from '#shared/awards.ts';
import { TIERS } from '#shared/rating.ts';
import { t, tierName, tk } from '../i18n';
import type { EarnedAward, GameRecord, RankInfo, Stats } from './types';

export type { AwardIcon };

export interface Award {
  id: string;
  name: string;
  description: string;
  icon: AwardIcon;
  earned: boolean;
  /** when the server gave it */
  earnedAt?: string;
  /** [current, goal] for awards that count something */
  progress?: [number, number];
}

const TEXT: Record<string, [string, string]> = {
  'first-win': [tk('First Blood'), tk('Win your first game')],
  'wins-10': [tk('Seasoned'), tk('Win 10 games')],
  'wins-100': [tk('Veteran'), tk('Win 100 games')],
  'games-500': [tk('Devoted'), tk('Play 500 games')],
  'streak-5': [tk('On Fire'), tk('Win 5 games in a row')],
  'streak-10': [tk('Unstoppable'), tk('Win 10 games in a row')],
  'tier-gold': [tk('Gilded'), ''],
  'tier-platinum': [tk('Platinum Mind'), ''],
  'tier-diamond': [tk('Diamond Mind'), ''],
  'accuracy-90': [tk('Precision'), tk('Play a game with 90% accuracy or more')],
  'quick-mate': [tk('Swift Strike'), tk('Win by checkmate in 20 moves or fewer')],
};

/** An award's name in the player's language. */
export const awardName = (id: string) => (TEXT[id] ? t(TEXT[id][0]) : id);

/**
 * A player's awards: from the server's record when there is one (`earned`), otherwise
 * worked out from what the profile shows (the demo back-end).
 */
export function awardsFor(stats: Stats, rank: RankInfo, history: GameRecord[], earned: EarnedAward[] | null = null): Award[] {
  const counts = { wins: stats.wins, losses: stats.losses, draws: stats.draws, best_streak: stats.bestStreak, mmr: TIERS.find((x) => x.id === rank.tier)!.from };
  const local = new Set(
    earned
      ? []
      : [
          ...awardsMet(counts),
          ...history.flatMap((g) => awardsMet(counts, { outcome: g.outcome, reason: g.reason, plies: g.moves, accuracy: g.accuracy })),
        ],
  );
  return AWARDS.map((a) => {
    const got = earned?.find((e) => e.id === a.id);
    const [name, description] = TEXT[a.id];
    return {
      id: a.id,
      name: t(name),
      description: a.tier ? t('Reach {tier} in ranked', { tier: tierName(a.tier) }) : t(description),
      icon: a.icon,
      earned: earned ? !!got : local.has(a.id),
      earnedAt: got?.earnedAt,
      progress: awardProgress(a, counts) ?? undefined,
    };
  });
}
