import { t } from '../../../i18n';
import type { Color as Side } from 'chess.js';
import { Share2 } from 'lucide-react';
import { CONTROLS, FIRST_MOVE_MS, controlLabel } from '#shared/play.ts';
import { itemDef } from '#shared/shop.ts';
import { watcherCount } from '#shared/spectate.ts';
import { api, type PublicProfile } from '../../../api';
import type { WatchRow } from '../../../net/online';
import { online } from '../../../net/client';
import { formatNumber, toast } from '../../../ui/kit';
import type { ClockView, GameState, PlayerView } from '../store';
import type { EndAction, Mode, ModeAction, ModeContext } from './types';
import { dressGame } from './types';
import { shareWatchLink } from './share';

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');

/** How long the "following the rematch" toast waits before going to the new game. */
const FOLLOW_MS = 4000;

/**
 * Watching someone else's online game (docs/PLATFORM.md §4.1 "Spectating"): read-only, the
 * players' own items, the moves from the spectators' copy (two moves behind in ranked and
 * coin games while they run), and how many are watching.
 */
export class WatchMode implements Mode {
  private row: WatchRow | null = null;
  private players: Record<Side, PublicProfile | null> = { w: null, b: null };
  private present: Set<string> = new Set();
  private stopWatch: (() => void) | null = null;
  private followTimer: ReturnType<typeof setTimeout> | null = null;
  private dismissFollow: (() => void) | null = null;
  /** board work (moves, the end) in order */
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly ctx: ModeContext,
    private readonly gameId: string,
  ) {}

  get label(): string {
    const row = this.row;
    const kind = !row || row.kind === 'friend' ? t('Friend game') : row.kind === 'ranked' ? t('Ranked') : row.kind === 'casual' ? t('Casual') : `${t('For coins')} · ${formatNumber(row.stake ?? 0)}`;
    const control = row?.control ? ` · ${t(CONTROLS[row.control].name)} ${controlLabel(row.control)}` : '';
    return `${kind}${control}`;
  }

  start(): void {
    this.disposed = false; // React may start a mode again after disposing it (StrictMode)
    this.ctx.engine.store.reset();
    void this.open().catch((err) => this.fail(err));
  }

  private async open(): Promise<void> {
    if (!online) throw new Error(t('Online play is not configured in this build.'));
    await online.signIn();
    const row = await online.fetchWatch(this.gameId);
    if (this.disposed) return;
    if (!row) {
      toast(t('This game cannot be watched: it is private or no longer exists.'), { tone: 'danger' });
      return this.ctx.navigate('/play');
    }
    // a player opening the watch link plays instead
    if (row.white_id === online.userId || row.black_id === online.userId) return this.ctx.navigate(`/game/online/${row.id}`);
    const look = (id: string | null) => (id ? api.profiles.get(id).catch(() => null) : Promise.resolve(null));
    const [w, b] = await Promise.all([look(row.white_id), look(row.black_id)]);
    if (this.disposed) return;
    this.players = { w, b };
    this.row = row;
    this.refresh();
    dressGame(this.ctx.engine, { w: w?.loadout ?? null, b: b?.loadout ?? null }, row.id);
    this.queue = this.ctx.engine.game.begin({ side: null, active: false, send: () => {} }, row.moves);
    this.stopWatch = online.spectate(row.id, { onRow: (r) => this.onRow(r), onPresence: (ids) => this.onPresence(ids) });
    this.react(null, row);
  }

  dispose(): void {
    this.disposed = true;
    this.stopWatch?.();
    this.stopWatch = null;
    if (this.followTimer) clearTimeout(this.followTimer);
    this.followTimer = null;
    this.dismissFollow?.();
    this.dismissFollow = null;
  }

  actions(): ModeAction[] {
    return [{ id: 'share', label: t('Share'), icon: Share2 }];
  }

  endActions(s: GameState): EndAction[] {
    const actions: EndAction[] = [];
    if (s.spectator?.rematch) actions.push({ id: 'rematch', label: t('Watch the rematch'), primary: true });
    if (!this.ctx.profile) actions.push({ id: 'register', label: t('Create a free account'), primary: !actions.length });
    actions.push({ id: 'play', label: t('Play a game'), primary: !actions.length });
    return actions;
  }

  endNote(): string | null {
    return this.ctx.profile ? null : t('With a free account you play online, climb the ranks and earn coins.');
  }

  act(id: string): void {
    const row = this.row;
    if (id === 'exit' || id === 'play') this.ctx.navigate('/play');
    else if (id === 'register') this.ctx.navigate('/auth?signup');
    else if (id === 'share' && row) void shareWatchLink(row.id);
    else if (id === 'rematch' && row?.rematch_id) this.follow(row.rematch_id);
  }

  // ---------------------------------------------------------------- server updates

  private onRow(row: WatchRow): void {
    const prev = this.row;
    if (this.disposed || !prev || row.id !== prev.id || row.version <= prev.version) return;
    this.row = row;
    if (prev.white_id !== row.white_id || prev.black_id !== row.black_id) void this.lookUpPlayers(row);
    this.refresh();
    this.react(prev, row);
  }

  /** The second player took their seat (a game that was waiting). */
  private async lookUpPlayers(row: WatchRow): Promise<void> {
    const look = (id: string | null) => (id ? api.profiles.get(id).catch(() => null) : Promise.resolve(null));
    const [w, b] = await Promise.all([look(row.white_id), look(row.black_id)]);
    if (this.disposed) return;
    this.players = { w, b };
    this.refresh();
  }

  /** Moves (one at a time, so each animates), endings off the board, rematches. */
  private react(prev: WatchRow | null, row: WatchRow): void {
    const { game } = this.ctx.engine;
    const moves = row.moves;
    this.queue = this.queue.then(async () => {
      if (this.disposed) return;
      const shown = game.history;
      const extends_ = moves.length > shown.length && shown.every((m, i) => m === moves[i]);
      if (!extends_) return game.sync(moves);
      // the delay ends with the game: the last moves arrive together and play one by one
      for (let n = shown.length + 1; n <= moves.length && !this.disposed; n++) await game.sync(moves.slice(0, n));
    }).catch((err) => console.error(err)); // a failed step must not stop the ones after it

    if (row.status === 'finished' && prev?.status !== 'finished') {
      this.queue = this.queue.then(() => {
        if (!this.disposed) return this.finish(row);
      });
    }

    if (row.rematch_id && !prev?.rematch_id && prev) this.offerFollow(row.rematch_id);
  }

  /** Endings the board does not show by itself (checkmate and draws by rule it does). */
  private finish(row: WatchRow): Promise<void> | undefined {
    const { game } = this.ctx.engine;
    const loser: Side = row.result === '1-0' ? 'b' : 'w';
    switch (row.reason) {
      case 'resignation':
        return game.finish({ winner: other(loser), reason: 'resignation', title: t('Resignation'), text: `${t('{name} resigned.', { name: this.nameOf(row, loser) })} ${game.winText(other(loser))}` });
      case 'agreement':
        return game.finish({ winner: null, reason: 'agreement', title: t('Draw'), text: t('Agreed by both players') });
      case 'timeout':
        return game.finish({ winner: other(loser), reason: 'timeout', title: t('Time out'), text: `${t('{name} ran out of time.', { name: this.nameOf(row, loser) })} ${game.winText(other(loser))}` });
      case 'timeout vs insufficient material':
        return game.finish({ winner: null, reason: 'timeout', title: t('Draw'), text: t('Time ran out, but checkmate was no longer possible') });
      case 'aborted':
        return game.finish({ winner: null, reason: 'aborted', title: t('Game aborted'), text: t('No first move in time.') });
    }
  }

  /** The players start a rematch: follow them there, unless the spectator stays. */
  private offerFollow(gameId: string): void {
    this.dismissFollow = toast(t('The players start a rematch. Following them…'), {
      duration: FOLLOW_MS / 1000,
      actions: [
        {
          label: t('Stay'),
          run: () => {
            if (this.followTimer) clearTimeout(this.followTimer);
            this.followTimer = null;
          },
        },
        { label: t('Watch now'), primary: true, run: () => this.follow(gameId) },
      ],
    });
    this.followTimer = setTimeout(() => this.follow(gameId), FOLLOW_MS);
  }

  private follow(gameId: string): void {
    if (this.followTimer) clearTimeout(this.followTimer);
    this.followTimer = null;
    this.dismissFollow?.();
    this.dismissFollow = null;
    if (!this.disposed) this.ctx.navigate(`/watch/${gameId}`);
  }

  private onPresence(ids: Set<string>): void {
    this.present = ids;
    this.refresh();
  }

  // ---------------------------------------------------------------- helpers

  /** The server's clocks; they are live (the delay is even, so the side to move matches). */
  private clockView(row: WatchRow): ClockView | null {
    if (!row.control || row.clock_w == null || row.clock_b == null || !row.turn_started_at) return null;
    // the side to move on the real board: the delay keeps it the same as on this one
    const running: Side | null = row.status === 'active' ? ((row.moves.length + row.delay) % 2 === 0 ? 'w' : 'b') : null;
    const firstMove = row.moves.length + row.delay < 2;
    const view: ClockView = { w: row.clock_w, b: row.clock_b, running, since: Date.parse(row.turn_started_at), firstMove: !!running && firstMove };
    if (running && firstMove) view[running] = FIRST_MOVE_MS;
    return view;
  }

  private refresh(): void {
    const row = this.row;
    if (!row) return;
    const player = (side: Side): PlayerView => {
      const id = side === 'w' ? row.white_id : row.black_id;
      if (!id) return { name: t('Waiting…'), iconId: 'guest' };
      const present = this.present.size ? this.present.has(id) : undefined;
      const p = this.players[side];
      if (p) return { name: p.username, iconId: p.iconId, rank: row.kind === 'friend' ? null : p.rank, present };
      return { name: this.nameOf(row, side), iconId: 'guest', tag: t('Guest'), present };
    };
    const items = [this.players.w?.loadout, this.players.b?.loadout]
      .flatMap((l) => (l ? Object.values(l) : []))
      .filter((id, i, all) => all.indexOf(id) === i && !!itemDef(id)?.forSale && itemDef(id)!.category !== 'icon');
    this.ctx.engine.store.set({
      players: { w: player('w'), b: player('b') },
      bottom: 'w',
      mySide: null,
      invite: null,
      clock: this.clockView(row),
      watchers: watcherCount(this.present, row.white_id, row.black_id),
      spectator: { delay: row.delay, items, rematch: row.rematch_id },
      note: row.status === 'waiting' ? t('The game starts when the second player joins.') : null,
    });
  }

  private nameOf(row: WatchRow, side: Side): string {
    return (side === 'w' ? row.white_name : row.black_name) ?? t('A player');
  }

  private fail(err: unknown): void {
    console.error(err);
    toast(t((err as Error).message) || t('Something went wrong.'), { tone: 'danger' });
  }
}
