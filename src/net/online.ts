import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import type { GameRow, MoveInput, Side } from '../../supabase/functions/_shared/rules';

export type { GameRow, Side };

export class OnlineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface Watcher {
  /** Every newer version of the game row, in order (also sent once on (re)connect). */
  onRow(row: GameRow): void;
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

  constructor(url: string, key: string, options: { storageKey?: string } = {}) {
    this.client = createClient(url, key, {
      auth: { storageKey: options.storageKey, persistSession: true, autoRefreshToken: true },
    });
  }

  get userId(): string {
    if (!this.uid) throw new Error('Not signed in');
    return this.uid;
  }

  /** Reuse the stored session or sign in anonymously. */
  async signIn(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    let user = data.session?.user ?? null;
    if (!user) {
      const res = await this.client.auth.signInAnonymously();
      if (res.error) throw new OnlineError('auth', `Could not sign in: ${res.error.message}`);
      user = res.data.user!;
    }
    this.uid = user.id;
    return user.id;
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
    let version = -1;
    const push = (row: GameRow) => {
      if (row.version <= version) return;
      version = row.version;
      watcher.onRow(row);
    };
    const channel = this.client
      .channel(`game:${id}`, { config: { presence: { key: this.userId } } })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` }, (p) =>
        push(p.new as GameRow),
      )
      .on('presence', { event: 'sync' }, () => {
        watcher.onPresence?.(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        void channel.track({ at: Date.now() });
        // catch up on anything that happened before (or while) we were disconnected
        void this.fetch(id).then((row) => row && push(row)).catch(() => {});
      });
    return () => void this.client.removeChannel(channel);
  }
}

/** The configured client, or null when this build has no Supabase settings. */
export function onlineFromEnv(): Online | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? new Online(url, key) : null;
}
