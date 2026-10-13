import { t } from '../../../i18n';
import type { Color as Side, Move } from 'chess.js';
import { Flag, Handshake } from 'lucide-react';
import { STAKES, type StakeId } from '#shared/economy.ts';
import { CONTROLS, FIRST_MOVE_MS, controlLabel } from '#shared/play.ts';
import { api, type PublicProfile } from '../../../api';
import { analyseGame, analysisOf, onAnalysis, type Analysis } from '../../../ai/analysis';
import { OnlineError, type GameRow } from '../../../net/online';
import { inviteUrl, online } from '../../../net/client';
import { confirmDialog, formatNumber, toast } from '../../../ui/kit';
import type { ClockView, GameState, PlayerView } from '../store';
import type { EndAction, Mode, ModeAction, ModeContext } from './types';
import { dressGame, playerFromProfile } from './types';

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');

/**
 * A game against another person on the server: through an invite link, or matchmade
 * (ranked, casual, for coins) with clocks and results. The server's row is the truth;
 * our own moves are shown at once and rolled back if the server refuses them.
 */
export class OnlineMode implements Mode {
  private row: GameRow | null = null;
  /** the opponent's public profile (matchmade games) */
  private opponent: PublicProfile | null = null;
  private claimTimer: ReturnType<typeof setTimeout> | null = null;
  /** refused timeout claims in a row (our clock runs ahead of the server's) */
  private claimRetries = 0;
  private resultAsked = false;
  private side: Side | null = null;
  private seat = { side: null as Side | null, active: false, send: (m: Move) => void this.send(m) };
  private stopWatch: (() => void) | null = null;
  private present: Set<string> | null = null;
  private pending = 0;
  private disposed = false;
  private dismiss: Record<'offer' | 'rematch', (() => void) | null> = { offer: null, rematch: null };
  private stopAnalysis: (() => void) | null = null;

  constructor(
    private readonly ctx: ModeContext,
    private readonly gameId: string,
  ) {}

  /** Ranked, casual or coin game from matchmaking (not an invite link). */
  private get matchmade(): boolean {
    return !!this.row?.kind && this.row.kind !== 'friend';
  }

  get label(): string {
    const row = this.row;
    if (!row || !this.matchmade) return t('Friend · online');
    const kind = row.kind === 'ranked' ? t('Ranked') : row.kind === 'casual' ? t('Casual') : `${t('For coins')} · ${formatNumber(row.stake ?? 0)}`;
    return row.control ? `${kind} · ${t(CONTROLS[row.control].name)} ${controlLabel(row.control)}` : kind;
  }

  start(): void {
    this.disposed = false; // React may start a mode again after disposing it (StrictMode)
    this.ctx.engine.store.reset();
    void this.open().catch((err) => this.fail(err));
  }

  private async open(): Promise<void> {
    if (!online) throw new Error(t('Online play is not configured in this build.'));
    await online.signIn();
    const row = await online.fetch(this.gameId);
    if (this.disposed) return;
    if (!row) {
      toast(t('That game link is not valid any more.'), { tone: 'danger' });
      return this.ctx.navigate('/play');
    }
    if (!online.sideOf(row) && row.status === 'waiting') return this.ctx.navigate(`/join/${row.id}`);
    if (!online.sideOf(row)) toast(t('This game already has two players. You are watching.'));
    const side = online.sideOf(row);
    if (row.kind && row.kind !== 'friend' && side) {
      const opponentId = side === 'w' ? row.black_id : row.white_id;
      this.opponent = opponentId ? await api.profiles.get(opponentId).catch(() => null) : null;
      if (this.disposed) return;
    }
    this.enter(row);
  }

  private enter(row: GameRow): void {
    const { game } = this.ctx.engine;
    this.row = row;
    this.side = online!.sideOf(row);
    this.seat.side = this.side;
    this.seat.active = row.status === 'active';
    this.refresh();
    // each side in its player's items (invite-link opponents use the standard set)
    if (this.side) {
      dressGame(this.ctx.engine, { [this.side]: this.ctx.profile?.loadout ?? null, [other(this.side)]: this.opponent?.loadout ?? null }, row.id);
    } else dressGame(this.ctx.engine, {}, row.id);
    void game.begin(this.side ? this.seat : { side: null, active: false, send: () => {} }, row.moves);
    this.stopWatch = online!.watch(row.id, { onRow: (r) => this.onRow(r), onPresence: (ids) => this.onPresence(ids) });
    this.react(null, row);
    this.scheduleClaim();
  }

  dispose(): void {
    this.disposed = true;
    this.stopWatch?.();
    this.stopWatch = null;
    if (this.claimTimer) clearTimeout(this.claimTimer);
    this.dismiss.offer?.();
    this.dismiss.rematch?.();
    this.stopAnalysis?.();
    this.stopAnalysis = null;
  }

  // ---------------------------------------------------------------- actions

  actions(s: GameState): ModeAction[] {
    if (!this.side) return [];
    const live = this.row?.status === 'active' && !s.end;
    return [
      { id: 'draw', label: s.drawOffered ? t('Offered') : t('Draw'), icon: Handshake, disabled: !live || s.drawOffered },
      { id: 'resign', label: t('Resign'), icon: Flag, tone: 'danger', disabled: !live },
    ];
  }

  endActions() {
    if (this.matchmade) {
      return [
        { id: 'again', label: t('Find another game'), primary: true },
        { id: 'exit', label: t('Back to Play') },
      ];
    }
    const guest = !this.ctx.profile;
    const actions: EndAction[] = this.side
      ? [
          { id: 'rematch', label: t('Rematch'), primary: true },
          guest ? { id: 'register', label: t('Create a free account') } : { id: 'exit', label: t('Back to Play') },
        ]
      : [guest ? { id: 'register', label: t('Create a free account'), primary: true } : { id: 'exit', label: t('Back to Play'), primary: true }];
    return actions;
  }

  endNote(): string | null {
    return this.ctx.profile ? null : t('You played as a guest. With a free account you climb the ranks, earn coins and keep your games.');
  }

  act(id: string): void {
    const row = this.row;
    const run = (p: Promise<GameRow>) => void p.then((r) => this.onRow(r), (e) => this.fail(e));
    if (id === 'register') {
      this.ctx.navigate('/auth?signup');
    } else if (id === 'again' && row) {
      const stake = (Object.keys(STAKES) as StakeId[]).find((k) => STAKES[k].amount === row.stake);
      this.ctx.navigate(`/play?queue=${row.kind}${stake ? `&stake=${stake}` : ''}`);
    } else if (id === 'exit' && this.matchmade && row?.status === 'active' && this.side) {
      void (async () => {
        const ok = await confirmDialog({ title: t('Leave this game?'), text: t('Leaving a running game counts as a loss.'), confirmLabel: t('Leave'), tone: 'danger' });
        if (!ok) return;
        await online!.resign(row.id).catch(() => null);
        this.ctx.navigate('/play');
      })();
    } else if (id === 'exit') {
      void (async () => {
        if (row?.status === 'active' && this.side) {
          const ok = await confirmDialog({ title: t('Leave this game?'), text: t('The game stays open: use the same link to come back.'), confirmLabel: t('Leave') });
          if (!ok) return;
        }
        this.ctx.navigate('/play');
      })();
    } else if (!row || !online) {
      return;
    } else if (id === 'resign') {
      void confirmDialog({ title: t('Resign this game?'), text: t('Your opponent will be awarded the win.'), confirmLabel: t('Resign'), tone: 'danger' }).then(
        (ok) => ok && run(online!.resign(row.id)),
      );
    } else if (id === 'draw') {
      run(online.offerDraw(row.id));
      toast(t('Draw offered.'));
    } else if (id === 'rematch') {
      void this.rematch().catch((e) => this.fail(e));
    }
  }

  private async rematch(): Promise<void> {
    const row = this.row;
    if (!row || !this.side || !online) return;
    let next = await online.rematch(row.id);
    if (!online.sideOf(next)) next = await online.join(next.id, this.nameOf(row, this.side));
    this.ctx.navigate(`/game/online/${next.id}`);
  }

  private async send(move: Move): Promise<void> {
    const row = this.row;
    if (!row || !online) return;
    this.pending++;
    try {
      this.onRow(await online.move(row.id, { from: move.from, to: move.to, promotion: move.promotion }));
    } catch (err) {
      this.fail(err);
      const fresh = await online.fetch(row.id).catch(() => null);
      if (fresh && this.row?.id === fresh.id && fresh.version >= this.row.version) {
        const prev = this.row;
        this.row = fresh;
        this.apply(prev, fresh);
      }
    } finally {
      this.pending--;
      if (!this.pending && this.row?.id === row.id && !this.disposed) void this.ctx.engine.game.sync(this.row.moves);
    }
  }

  // ---------------------------------------------------------------- server updates

  private onRow(row: GameRow): void {
    const prev = this.row;
    if (this.disposed || !prev || row.id !== prev.id || row.version <= prev.version) return;
    this.row = row;
    this.apply(prev, row);
  }

  private apply(prev: GameRow, row: GameRow): void {
    this.seat.active = row.status === 'active';
    this.refresh();
    if (prev.status === 'waiting' && row.status === 'active' && this.side) {
      toast(t('{name} joined. You play {color}.', { name: this.nameOf(row, other(this.side)), color: this.side === 'w' ? t('White') : t('Black') }), { tone: 'success' });
    }
    if (!this.pending) void this.ctx.engine.game.sync(row.moves);
    this.react(prev, row);
    this.scheduleClaim();
  }

  /** Draw offers, rematch requests and endings that happen off the board. */
  private react(prev: GameRow | null, row: GameRow): void {
    const me = this.side;
    const { game, store } = this.ctx.engine;

    const offerToMe = !!me && row.status === 'active' && row.draw_offer === other(me);
    if (offerToMe && prev?.draw_offer !== row.draw_offer) {
      this.dismiss.offer = toast(t('{name} offers a draw.', { name: this.nameOf(row, other(me!)) }), {
        actions: [
          { label: t('Decline'), run: () => void online!.declineDraw(row.id).then((r) => this.onRow(r), (e) => this.fail(e)) },
          { label: t('Accept'), primary: true, run: () => void online!.acceptDraw(row.id).then((r) => this.onRow(r), (e) => this.fail(e)) },
        ],
      });
    } else if (!offerToMe) {
      this.dismiss.offer?.();
      this.dismiss.offer = null;
    }
    if (me && prev?.draw_offer === me && !row.draw_offer && row.status === 'active' && row.moves.length === prev.moves.length) {
      toast(t('Draw offer declined.'));
    }
    store.set({ drawOffered: !!me && row.draw_offer === me });

    if (row.status === 'finished' && prev?.status !== 'finished') {
      if (row.reason === 'resignation') {
        const loser: Side = row.result === '1-0' ? 'b' : 'w';
        const text = loser === me ? t('You resigned') : `${t('{name} resigned.', { name: this.nameOf(row, loser) })} ${game.winText(other(loser))}`;
        void game.finish({ winner: other(loser), reason: 'resignation', title: t('Resignation'), text });
      } else if (row.reason === 'agreement') {
        void game.finish({ winner: null, reason: 'agreement', title: t('Draw'), text: t('Agreed by both players') });
      } else if (row.reason === 'timeout') {
        const loser: Side = row.result === '1-0' ? 'b' : 'w';
        const text = loser === me ? t('You ran out of time') : `${t('{name} ran out of time.', { name: this.nameOf(row, loser) })} ${game.winText(other(loser))}`;
        void game.finish({ winner: other(loser), reason: 'timeout', title: t('Time out'), text });
      } else if (row.reason === 'timeout vs insufficient material') {
        void game.finish({ winner: null, reason: 'timeout', title: t('Draw'), text: t('Time ran out, but checkmate was no longer possible') });
      } else if (row.reason === 'aborted') {
        void game.finish({ winner: null, reason: 'aborted', title: t('Game aborted'), text: t('No first move in time. Nothing changes.') });
      }
    }
    if (row.status === 'finished' && this.matchmade && me) void this.fetchResult(row);

    if (me && row.rematch_id && !prev?.rematch_id) {
      this.dismiss.rematch = toast(t('{name} wants a rematch.', { name: this.nameOf(row, other(me)) }), {
        actions: [
          { label: t('Not now'), run: () => {} },
          { label: t('Play'), primary: true, run: () => void this.rematch().catch((e) => this.fail(e)) },
        ],
      });
    }
  }

  private onPresence(ids: Set<string>): void {
    const row = this.row;
    const me = this.side;
    if (!row) return;
    const opponent = me ? (me === 'w' ? row.black_id : row.white_id) : null;
    if (opponent && this.present && row.status === 'active') {
      const was = this.present.has(opponent);
      const is = ids.has(opponent);
      if (was && !is) toast(t('{name} disconnected.', { name: this.nameOf(row, other(me!)) }));
      if (!was && is) toast(t('{name} is back.', { name: this.nameOf(row, other(me!)) }));
    }
    this.present = ids;
    this.refresh();
  }

  // ---------------------------------------------------------------- helpers

  // ---------------------------------------------------------------- clocks and results

  /** The clocks as the server keeps them (the running side's time counts from `since`). */
  private clockView(row: GameRow): ClockView | null {
    if (!row.control || row.clock_w == null || row.clock_b == null || !row.turn_started_at) return null;
    const running: Side | null = row.status === 'active' ? (row.moves.length % 2 === 0 ? 'w' : 'b') : null;
    const firstMove = row.moves.length < 2;
    const view: ClockView = { w: row.clock_w, b: row.clock_b, running, since: Date.parse(row.turn_started_at), firstMove: !!running && firstMove };
    if (running && firstMove) view[running] = FIRST_MOVE_MS;
    return view;
  }

  /** When the side to move runs out of time, tell the server (either player may). */
  private scheduleClaim(retry = false): void {
    if (this.claimTimer) clearTimeout(this.claimTimer);
    this.claimTimer = null;
    this.claimRetries = retry ? this.claimRetries + 1 : 0;
    const row = this.row;
    const clock = row && this.clockView(row);
    if (!row || !clock?.running || !this.side || this.disposed) return;
    const left = (clock.running === 'w' ? clock.w : clock.b) - Math.max(0, Date.now() - clock.since);
    // the server's clock still showed time (computer clocks differ): ask again, less often each time
    const delay = retry ? Math.min(1500 * 2 ** (this.claimRetries - 1), 30_000) : Math.max(0, left) + 800;
    this.claimTimer = setTimeout(() => {
      void online!.claim(row.id).then(
        (r) => this.onRow(r),
        (err) => {
          if (err instanceof OnlineError && err.code === 'not_yet' && this.row?.version === row.version) this.scheduleClaim(true);
        },
      );
    }, delay);
  }

  /** The MMR and coins of a finished matchmade game, from the server. */
  private async fetchResult(row: GameRow): Promise<void> {
    if (this.resultAsked || !api.matchmaking.result) return;
    this.resultAsked = true;
    const { store } = this.ctx.engine;
    store.set({ result: { loading: true, data: null, accuracy: null, error: null } });
    try {
      const data = await api.matchmaking.result(row.id);
      if (this.disposed) return;
      store.set({ result: { loading: false, data, accuracy: null, error: null } });
      // ranked and casual games: Stockfish analyses the game here and the opponent's
      // browser; the performance part follows when both agree
      if (data && this.side && (row.kind === 'ranked' || row.kind === 'casual')) {
        this.followAnalysis(row.id);
        analyseGame(row.id, row.moves, this.side);
      }
      await this.ctx.refreshProfile();
    } catch (err) {
      if (!this.disposed) store.set({ result: { loading: false, data: null, accuracy: null, error: t((err as Error).message) } });
    }
  }

  /** Show the analysis of this game on the result card as it goes. */
  private followAnalysis(gameId: string): void {
    const { store } = this.ctx.engine;
    const show = (state: Analysis) => {
      const result = store.get().result;
      if (this.disposed || !result) return;
      store.set({
        result: { ...result, accuracy: state.accuracy, data: state.result ?? result.data, analysis: { status: state.status, progress: state.progress } },
      });
    };
    const now = analysisOf(gameId);
    if (now) show(now);
    this.stopAnalysis?.();
    this.stopAnalysis = onAnalysis((id, state) => id === gameId && show(state));
  }

  private refresh(): void {
    const row = this.row;
    if (!row || !online) return;
    const player = (side: Side): PlayerView => {
      const id = side === 'w' ? row.white_id : row.black_id;
      if (!id) return { name: t('Waiting…'), iconId: 'guest' };
      if (id === online!.userId) return { ...playerFromProfile(this.ctx.profile, this.nameOf(row, side)), name: this.nameOf(row, side) };
      const present = this.present ? this.present.has(id) : undefined;
      if (this.opponent?.id === id) return { name: this.opponent.username, iconId: this.opponent.iconId, rank: this.opponent.rank, present };
      return { name: this.nameOf(row, side), iconId: 'guest', present };
    };
    this.ctx.engine.store.set({
      players: { w: player('w'), b: player('b') },
      bottom: this.side ?? 'w',
      mySide: this.side,
      invite: row.status === 'waiting' && this.side ? inviteUrl(row.id) : null,
      clock: this.clockView(row),
    });
  }

  private nameOf(row: GameRow, side: Side): string {
    return (side === 'w' ? row.white_name : row.black_name) ?? t('Your opponent');
  }

  private fail(err: unknown): void {
    console.error(err);
    toast(t((err as Error).message) || t('Something went wrong.'), { tone: 'danger' });
  }
}
