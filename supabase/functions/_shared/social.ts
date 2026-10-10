// Friends, chat and the public "showcase" (rank, stats, loadout), shared by the `social`
// and `account` Edge Functions and the app.
import { TIERS } from './rating.ts';
import { DEFAULT_LOADOUT, itemDef } from './shop.ts';

export const MESSAGE_MAX = 1000;
/** Most friends a player can have, and most requests waiting for an answer. */
export const FRIENDS_MAX = 500;
export const PENDING_MAX = 50;
/** Messages a player may send per minute (a guard against spam scripts). */
export const MESSAGES_PER_MINUTE = 20;

/** Store a pair of players in one order, so (a, b) and (b, a) are the same row. */
export function pairOf(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

export type MessageProblem = 'empty' | 'too_long';

/** The text to store, or what is wrong with it. Invites may have no text. */
export function messageBody(body: unknown, invite: boolean): { text: string } | { problem: MessageProblem } {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text && !invite) return { problem: 'empty' };
  if (text.length > MESSAGE_MAX) return { problem: 'too_long' };
  return { text };
}

/** Game ids are the short ids the `game` function creates. */
export function isGameId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9]{6,16}$/.test(id);
}

// ------------------------------------------------------------------ showcase

/**
 * What other players see of someone's rank, stats and look. Until the competitive
 * back-end, rank and stats live on the player's device, which sends this snapshot.
 * MMR itself is never shared: only the rank derived from it.
 */
export interface Showcase {
  rank: { tier: string; division: 1 | 2 | 3 | 4 | null; progress: number };
  stats: { wins: number; losses: number; draws: number; winStreak: number; rankedStreak: number; bestStreak: number };
  loadout: { pieces: string; board: string; background: string; moveAnimation: string; destruction: string };
}

const STAT_KEYS = ['wins', 'losses', 'draws', 'winStreak', 'rankedStreak', 'bestStreak'] as const;
const SLOTS = ['pieces', 'board', 'background', 'moveAnimation', 'destruction'] as const;
const STAT_MAX = 1_000_000;

/** A clean showcase from untrusted input, or null when it is not one. */
export function parseShowcase(input: unknown): Showcase | null {
  if (!input || typeof input !== 'object') return null;
  const x = input as Record<string, unknown>;
  const rank = x.rank as Record<string, unknown> | undefined;
  const stats = x.stats as Record<string, unknown> | undefined;
  const loadout = x.loadout as Record<string, unknown> | undefined;
  if (!rank || !stats || !loadout) return null;

  const tier = TIERS.find((t) => t.id === rank.tier);
  if (!tier) return null;
  const division = tier.divisions ? rank.division : null;
  if (tier.divisions && ![1, 2, 3, 4].includes(division as number)) return null;
  const progress = Number(rank.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) return null;

  const cleanStats = {} as Showcase['stats'];
  for (const key of STAT_KEYS) {
    const n = stats[key];
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > STAT_MAX) return null;
    cleanStats[key] = n as number;
  }

  const cleanLoadout = {} as Showcase['loadout'];
  for (const slot of SLOTS) {
    const def = itemDef(String(loadout[slot] ?? ''));
    cleanLoadout[slot] = def && def.category === slot ? def.id : DEFAULT_LOADOUT[slot];
  }

  return {
    rank: { tier: tier.id, division: division as Showcase['rank']['division'], progress: Math.round(progress * 1000) / 1000 },
    stats: cleanStats,
    loadout: cleanLoadout,
  };
}
