import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import type { GameRow, MoveInput, Side } from '../../supabase/functions/_shared/rules';
import { guestSession } from './guest.ts';

export type { GameRow, Side };

/**
 * A game as spectators see it (the `game_watch` table): the moves `delay` half-moves behind
 * while a ranked or coin game runs, all of them once it is over (docs/PLATFORM.md §4.1).
 */
export type WatchRow = Omit<GameRow, 'fen' | 'draw_offer' | 'settled_at'> & { delay: number; created_at: string; updated_at: string };

export class OnlineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** How often a watched game is re-read in case realtime missed an update. */
const WATCH_POLL_MS = 4000;

export interface Watcher<R = GameRow> {
  /** Every newer version of the game row, in order (also sent once on (re)connect). */
  onRow(row: R): void;
  /** Ids of the users currently connected to this game. */
  onPresence?(userIds: Set<string>): void;
}

/**
 * Client for online games. Reads go straight to the `games` table (RLS allows
 * select); every write goes through the `game` Edge Function, which validates it.
 */
export class Online {
  readonly client: SupabaseClient;
  private uid: string | null = null;

  /** Use the app's client (shared session with accounts), or connect on your own (tests). */
  constructor(client: SupabaseClient);
  constructor(url: string, key: string, options?: { storageKey?: string });
  constructor(clientOrUrl: SupabaseClient | string, key?: string, options: { storageKey?: string } = {}) {
    this.client =
      typeof clientOrUrl === 'string'
        ? createClient(clientOrUrl, key!, { auth: { storageKey: options.storageKey, persistSession: true, autoRefreshToken: true } })
        : clientOrUrl;
  }

  get userId(): string {
    if (!this.uid) throw new Error('Not signed in');
    return this.uid;
  }

  /** Reuse the stored session (a registered player's or a guest's) or sign in anonymously. */
  async signIn(): Promise<string> {
    try {
      this.uid = await guestSession(this.client);
    } catch (err) {
      throw new OnlineError('auth', `Could not sign in: ${(err as Error).message}`);
    }
    return this.uid;
  }

  sideOf(row: GameRow): Side | null {
    if (row.white_id === this.uid) return 'w';
    if (row.black_id === this.uid) return 'b';
    return null;
  }

  async fetch(id: string): Promise<GameRow | null> {
    const { data, error } = await this.client.from('games').select('*').eq('id', id).maybeSingle();
    if (error) throw new OnlineError('network', error.message);
    return data as GameRow | null;
  }

  /** A game as spectators see it, or null when it does not exist or may not be watched. */
  async fetchWatch(id: string): Promise<WatchRow | null> {
    const { data, error } = await this.client.from('game_watch').select('*').eq('id', id).maybeSingle();
    if (error) throw new OnlineError('network', error.message);
    return data as WatchRow | null;
  }

  create(name: string, color: Side | 'random') {
    return this.call({ action: 'create', name, color });
  }
  join(id: string, name: string) {
    return this.call({ action: 'join', id, name });
  }
  move(id: string, move: MoveInput) {
    return this.call({ action: 'move', id, move });
  }
  resign(id: string) {
    return this.call({ action: 'resign', id });
  }
  /** End a timed game whose side to move is out of time (or never made its first move). */
  claim(id: string) {
    return this.call({ action: 'claim', id });
  }
  offerDraw(id: string) {
    return this.call({ action: 'offer_draw', id });
  }
  acceptDraw(id: string) {
    return this.call({ action: 'accept_draw', id });
  }
  declineDraw(id: string) {
    return this.call({ action: 'decline_draw', id });
  }
  /** Returns the follow-up game (created on the first request, joined on the second). */
  rematch(id: string) {
    return this.call({ action: 'rematch', id });
  }

  private async call(body: Record<string, unknown>): Promise<GameRow> {
    const { data, error } = await this.client.functions.invoke<{ game: GameRow }>('game', { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const payload = await (error.context as Response).json().catch(() => null);
        if (payload?.error) throw new OnlineError(payload.code ?? 'error', payload.error);
      }
      throw new OnlineError('network', 'Could not reach the game server.');
    }
    return data!.game;
  }

  /** Follow a game: row updates and who is connected. Returns an unsubscribe function. */
  watch(id: string, watcher: Watcher): () => void {
    return this.follow('games', id, () => this.fetch(id), watcher);
  }

  /** Follow a game as a spectator (the delayed copy); spectators count in its presence too. */
  spectate(id: string, watcher: Watcher<WatchRow>): () => void {
    return this.follow('game_watch', id, () => this.fetchWatch(id), watcher);
  }

  private follow<R extends { version: number }>(table: string, id: string, read: () => Promise<R | null>, watcher: Watcher<R>): () => void {
    let version = -1;
    const push = (row: R) => {
      if (row.version <= version) return;
      version = row.version;
      watcher.onRow(row);
    };
    const channel = this.client
      .channel(`game:${id}`, { config: { presence: { key: this.userId } } })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `id=eq.${id}` }, (p) => push(p.new as R))
      .on('presence', { event: 'sync' }, () => {
        watcher.onPresence?.(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        void channel.track({ at: Date.now() });
        // catch up on anything that happened before (or while) we were disconnected
        void read().then((row) => row && push(row)).catch(() => {});
      });
    // Safety net: realtime can miss updates, e.g. while Supabase restarts it for a project
    // that was idle (the first game after a quiet spell). Re-read the row now and then;
    // `push` ignores versions we already have.
    const poll = setInterval(() => void read().then((row) => row && push(row)).catch(() => {}), WATCH_POLL_MS);
    return () => {
      clearInterval(poll);
      void this.client.removeChannel(channel);
    };
  }
}
