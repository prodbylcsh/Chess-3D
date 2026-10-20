// Seasons: MMR resets and end-of-season rewards. Pure functions shared by the
// server (which applies them) and the app (which shows what each rank earns).
import { MMR, type TierId } from './rating.ts';

export const SEASON_MONTHS = 3;

export interface Month {
  year: number;
  /** 1 = January */
  month: number;
}

/**
 * Ranked games and season 1 start on the 1st of this month (UTC); seasons follow back to
 * back. `null` while ranked is closed (decided October 2026: ranked opens once the
 * platform has enough players). Until then no season runs: no rewards, no MMR resets.
 * To open ranked, set the month (the current one opens it at once) and deploy.
 */
export const SEASON_ONE: Month | null = null;

export interface SeasonDates {
  number: number;
  start: Date;
  end: Date;
}

/** The first moment of season 1, or null while ranked is closed. */
export function seasonOneStart(first: Month | null = SEASON_ONE): Date | null {
  return first ? new Date(Date.UTC(first.year, first.month - 1, 1)) : null;
}

/** Whether ranked games are open at `now`: from the start of season 1 on. */
export function rankedOpen(now: Date = new Date(), first: Month | null = SEASON_ONE): boolean {
  const start = seasonOneStart(first);
  return !!start && now >= start;
}

/**
 * Which season `date` falls in, with its first and last moment (end is exclusive), or
 * null before season 1 (ranked closed). The number of "no season yet" is 0 where a
 * number is stored (`players.season`).
 */
export function seasonAt(date: Date, first: Month | null = SEASON_ONE): SeasonDates | null {
  if (!first || !rankedOpen(date, first)) return null;
  const months = (date.getUTCFullYear() - first.year) * 12 + date.getUTCMonth() + 1 - first.month;
  const number = Math.floor(months / SEASON_MONTHS) + 1;
  const firstMonth = (number - 1) * SEASON_MONTHS + first.month - 1;
  return {
    number,
    start: new Date(Date.UTC(first.year, firstMonth, 1)),
    end: new Date(Date.UTC(first.year, firstMonth + SEASON_MONTHS, 1)),
  };
}

/** "2026-07" → { year: 2026, month: 7 } (the server's SEASON_ONE override); else null. */
export function parseMonth(value: string | undefined | null): Month | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  return m && +m[2] >= 1 && +m[2] <= 12 ? { year: +m[1], month: +m[2] } : null;
}

/**
 * Share of the distance to 1,000 MMR removed when `season` ends (seasons are
 * numbered from 1): every 12th season resets everyone to 1,000, every 4th
 * pulls 50%, all others 25%.
 */
export function resetShare(season: number): number {
  if (season % 12 === 0) return 1;
  if (season % 4 === 0) return 0.5;
  return 0.25;
}

/** MMR at the start of the next season. */
export function resetAfterSeason(mmr: number, season: number): number {
  return Math.round(mmr - (mmr - MMR.start) * resetShare(season));
}

// ------------------------------------------------------------------ reward brackets

/** Ranks are grouped into brackets that share the same rewards, cheapest first. */
export interface Bracket {
  id: string;
  name: string;
  tiers: TierId[];
  coins: number;
}

export const BRACKETS: readonly Bracket[] = [
  { id: 'iron', name: 'Iron', tiers: ['iron'], coins: 500 },
  { id: 'bronze-silver', name: 'Bronze & Silver', tiers: ['bronze', 'silver'], coins: 1_000 },
  { id: 'gold-platinum', name: 'Gold & Platinum', tiers: ['gold', 'platinum'], coins: 2_000 },
  { id: 'emerald-diamond', name: 'Emerald & Diamond', tiers: ['emerald', 'diamond'], coins: 4_000 },
  { id: 'master-grandmaster', name: 'Master & Grandmaster', tiers: ['master', 'grandmaster'], coins: 7_500 },
  { id: 'challenger', name: 'Challenger', tiers: ['challenger'], coins: 12_000 },
];

export function bracketOf(tier: TierId): Bracket {
  return BRACKETS.find((b) => b.tiers.includes(tier)) ?? BRACKETS[0];
}

// ------------------------------------------------------------------ rewards

/** Shop items that can be season rewards (piece sets, boards, effects). */
export interface RewardCandidate {
  id: string;
  category: string;
  price: number;
}

export interface SeasonReward {
  bracket: string;
  /** a badge unique to this season and bracket */
  badge: string;
  /** a profile icon unique to this season and bracket */
  icon: string;
  coins: number;
  /** id of the shop item given, or null when the pool ran out */
  item: string | null;
}

/** Item ids handed out in the last few seasons may not be handed out again. */
export const NO_REPEAT_SEASONS = 3;

/** Small deterministic RNG so a season's rewards can be recomputed and checked. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick the rewards for `season`. Items are random but:
 *  - nothing given in the previous NO_REPEAT_SEASONS seasons is given again,
 *  - every bracket gets a different item,
 *  - a higher bracket never gets a cheaper item than a lower one.
 * The eligible items are sorted by price and split into one price band per
 * bracket, cheapest band for the lowest bracket; each bracket draws from its band.
 * If there are fewer items than brackets, the highest brackets get them first.
 *
 * `previous` lists the item ids given in earlier seasons, most recent season last.
 */
export function pickSeasonRewards(season: number, pool: RewardCandidate[], previous: string[][]): SeasonReward[] {
  const recent = new Set(previous.slice(-NO_REPEAT_SEASONS).flat());
  const eligible = pool.filter((i) => !recent.has(i.id)).sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  const random = rng(season * 7919);
  const n = BRACKETS.length;
  const picks: Array<string | null> = new Array(n).fill(null);

  if (eligible.length >= n) {
    for (let b = 0; b < n; b++) {
      const from = Math.floor((b * eligible.length) / n);
      const to = Math.floor(((b + 1) * eligible.length) / n);
      picks[b] = eligible[from + Math.floor(random() * (to - from))].id;
    }
  } else {
    // not enough for everyone: the most expensive items go to the highest brackets
    eligible.forEach((item, i) => (picks[n - eligible.length + i] = item.id));
  }

  return BRACKETS.map((b, i) => ({
    bracket: b.id,
    badge: `season-${season}-${b.id}`,
    icon: `season-${season}-${b.id}`,
    coins: b.coins,
    item: picks[i],
  }));
}

/**
 * Rewards of seasons 1..`season`, each picked with the earlier ones as history.
 * The server will store them once picked; recomputing gives the same result
 * as long as the pool does not change.
 */
export function rewardHistory(season: number, pool: RewardCandidate[]): SeasonReward[][] {
  const all: SeasonReward[][] = [];
  for (let s = 1; s <= season; s++) {
    all.push(pickSeasonRewards(s, pool, all.map((r) => r.map((x) => x.item).filter((x): x is string => !!x))));
  }
  return all;
}
