// Spectating rules (docs/PLATFORM.md §4.1 "Spectating"), shared by the app, the mock
// back-end and the tests. The server applies the same rules in SQL (migration
// 20261025090000_spectating.sql: the `game_watch` copy of every game, `can_watch`); keep
// the numbers here and there the same (tests/spectate.test.ts compares them).

/** Who may watch a player's games (the player's setting). */
export type WatchPolicy = 'everyone' | 'friends' | 'nobody';
export const WATCH_POLICIES: readonly WatchPolicy[] = ['everyone', 'friends', 'nobody'];
export const DEFAULT_WATCH: WatchPolicy = 'everyone';

export function isWatchPolicy(value: unknown): value is WatchPolicy {
  return typeof value === 'string' && (WATCH_POLICIES as readonly string[]).includes(value);
}

/** Game kinds whose spectators see the moves late, so nobody watching can feed a player moves. */
export const DELAYED_KINDS: readonly string[] = ['ranked', 'wager'];

/** How far behind spectators of those games are: two moves (four half-moves). */
export const WATCH_DELAY_PLIES = 4;

/** The half-moves spectators are behind in a game right now (0 once it is over). */
export function watchDelay(kind: string | null | undefined, status: string): number {
  return status === 'active' && !!kind && DELAYED_KINDS.includes(kind) ? WATCH_DELAY_PLIES : 0;
}

/**
 * The moves spectators see. The delay is even, so the side to move is the same as on the
 * real board and the live clocks match the position spectators see.
 */
export function spectatorMoves(moves: readonly string[], kind: string | null | undefined, status: string): string[] {
  const delay = watchDelay(kind, status);
  return moves.slice(0, Math.max(0, moves.length - delay));
}

/** One of the two players, as far as the watching rules care. */
export interface WatchSeat {
  /** null: the seat is empty, or a guest without an account (they have no setting) */
  policy: WatchPolicy | null;
  /** the viewer and this player are friends */
  friend: boolean;
  /** either of the two blocked the other */
  blocked: boolean;
}

/** Whether a viewer who is not playing may watch: every player's setting must allow it. */
export function canWatch(seats: readonly WatchSeat[]): boolean {
  return seats.every((s) => !s.blocked && s.policy !== 'nobody' && (s.policy !== 'friends' || s.friend));
}

/** How many people watch: everyone connected to the game except its two players. */
export function watcherCount(present: Iterable<string>, whiteId: string | null, blackId: string | null): number {
  let n = 0;
  for (const id of present) if (id !== whiteId && id !== blackId) n++;
  return n;
}

/** A friend's game shows "Playing now" only if something happened in it recently. */
export const PLAYING_NOW_FRESH_MS = 30 * 60_000;

/**
 * "Live now" on the Play hub (friends' games first, then the best-ranked running games):
 * built, but closed until there are enough games to fill it (the hub says "Soon").
 */
export const LIVE_NOW_OPEN = false;

/** Matchmade games that "Live now" lists, newest activity first. */
export const LIVE_NOW_LIMIT = 12;
