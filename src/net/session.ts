import type { Move } from 'chess.js';
import type { Game, Seat } from '../game/Game';
import type { Hud, HudAction, Player } from '../ui/Hud';
import type { Lobby } from '../ui/Lobby';
import type { GameRow, Online, Side } from './online';

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');

/**
 * Online play: invite links, joining, and keeping the board in step with the
 * server. The server's row is the truth; local moves are shown immediately and
 * rolled back if the server refuses them.
 */
export class OnlineSession {
  private row: GameRow | null = null;
  private seat: Seat | null = null;
  private stopWatch: (() => void) | null = null;
  private present: Set<string> | null = null;
  /** own moves sent but not yet answered; the board already shows them */
  private pending = 0;
  private dismiss: Record<'offer' | 'rematch' | 'waiting', (() => void) | null> = {
    offer: null,
    rematch: null,
    waiting: null,
  };

  constructor(
    private readonly online: Online,
    private readonly game: Game,
    private readonly hud: Hud,
    private readonly lobby: Lobby,
  ) {
    game.onOnlineAction = (action) => void this.onAction(action).catch((err) => this.fail(err));
    hud.onlineAvailable = true;
    hud.setMode({ online: false });
  }

  /** Open the game in the URL (?game=id), if any. */
  async boot(): Promise<void> {
    const id = new URLSearchParams(location.search).get('game');
    if (!id) return;
    try {
      await this.online.signIn();
      const row = await this.online.fetch(id);
      if (!row) {
        this.setUrl(null);
        this.hud.toast('That game link is not valid any more.');
        return;
      }
      await this.open(row);
    } catch (err) {
      this.fail(err);
    }
  }

  // ---------------------------------------------------------------- entering and leaving

  /** Resume our own game, accept an invitation, or watch a full one. */
  private async open(row: GameRow): Promise<void> {
    if (this.online.sideOf(row) || row.status !== 'waiting') {
      if (!this.online.sideOf(row)) this.hud.toast('This game already has two players. You are watching.');
      return this.enter(row);
    }
    const host = row.white_name ?? row.black_name ?? 'A friend';
    const joined = await this.lobby.askJoin(host, async (name) => {
      row = await this.online.join(row.id, name);
    });
    if (!joined) return this.setUrl(null);
    this.lobby.hide();
    await this.enter(row);
  }

  private async enter(row: GameRow, options: { invite?: boolean } = { invite: true }): Promise<void> {
    this.unwatch();
    this.row = row;
    this.present = null;
    const side = this.online.sideOf(row);
    this.seat = { side, active: row.status === 'active', send: (m) => void this.send(m) };
    this.setUrl(row.id);
    this.refreshHud();
    const entering = this.game.enterOnline(this.seat, row.moves);
    this.stopWatch = this.online.watch(row.id, {
      onRow: (r) => this.onRow(r),
      onPresence: (ids) => this.onPresence(ids),
    });
    if (row.status === 'waiting' && side && options.invite) {
      this.lobby.showInvite(this.inviteUrl(row.id), () => void this.leave());
    }
    this.react(null, row);
    await entering;
  }

  private async leave(): Promise<void> {
    this.unwatch();
    this.row = null;
    this.seat = null;
    this.setUrl(null);
    this.lobby.hide();
    this.hud.setPlayers(null);
    this.hud.setDrawOffered(false);
    this.hud.setMode({ online: false });
    await this.game.enterOnline(null);
  }

  private unwatch(): void {
    this.stopWatch?.();
    this.stopWatch = null;
    for (const key of Object.keys(this.dismiss) as (keyof OnlineSession['dismiss'])[]) {
      this.dismiss[key]?.();
      this.dismiss[key] = null;
    }
  }

  // ---------------------------------------------------------------- actions

  private async onAction(action: HudAction): Promise<void> {
    const row = this.row;
    switch (action) {
      case 'online': {
        let created: GameRow | null = null;
        await this.lobby.askCreate(async (name, color) => {
          await this.online.signIn();
          created = await this.online.create(name, color);
        });
        if (created) await this.enter(created);
        return;
      }
      case 'leave':
        if (row?.status === 'active' && this.seat?.side) {
          if (!confirm('Leave this game? It stays open: use the same link to come back.')) return;
        }
        return this.leave();
      case 'resign':
        if (!row || !confirm('Resign this game?')) return;
        return this.onRow(await this.online.resign(row.id));
      case 'draw':
        if (!row) return;
        this.onRow(await this.online.offerDraw(row.id));
        if (this.row?.status === 'active') this.hud.toast('Draw offered.');
        return;
      case 'new': // the game-over card's button: rematch, or leave when spectating
        return this.seat?.side ? this.rematch() : this.leave();
    }
  }

  private async rematch(): Promise<void> {
    const row = this.row;
    const side = this.seat?.side;
    if (!row || !side) return;
    this.hud.hideGameOver();
    let next = await this.online.rematch(row.id);
    if (!this.online.sideOf(next)) next = await this.online.join(next.id, (side === 'w' ? row.white_name : row.black_name) ?? '');
    const opponent = this.nameOf(row, other(side));
    await this.enter(next, { invite: false });
    if (next.status === 'waiting') {
      this.dismiss.waiting = this.hud.toast(`Waiting for ${opponent} to accept the rematch…`, [
        { label: 'Cancel', run: () => void this.leave() },
      ]);
    }
  }

  private async send(move: Move): Promise<void> {
    const row = this.row;
    if (!row) return;
    this.pending++;
    try {
      this.onRow(await this.online.move(row.id, { from: move.from, to: move.to, promotion: move.promotion }));
    } catch (err) {
      this.fail(err);
      // the board shows a move the server refused: go back to what the server has
      const fresh = await this.online.fetch(row.id).catch(() => null);
      if (fresh && this.row?.id === fresh.id && fresh.version >= this.row.version) {
        const prev = this.row;
        this.row = fresh;
        this.apply(prev, fresh);
      }
    } finally {
      this.pending--;
      if (!this.pending && this.row?.id === row.id) void this.game.sync(this.row.moves);
    }
  }

  // ---------------------------------------------------------------- server updates

  private onRow(row: GameRow): void {
    const prev = this.row;
    if (!prev || row.id !== prev.id || row.version <= prev.version) return;
    this.row = row;
    this.apply(prev, row);
  }

  private apply(prev: GameRow, row: GameRow): void {
    if (this.seat) this.seat.active = row.status === 'active';
    this.refreshHud();
    if (prev.status === 'waiting' && row.status === 'active') {
      this.lobby.hide();
      this.dismiss.waiting?.();
      const side = this.seat?.side;
      if (side) this.hud.toast(`${this.nameOf(row, other(side))} joined. You play ${side === 'w' ? 'White' : 'Black'}.`);
    }
    // while our own move is in flight, an older row would undo it on screen; send() syncs afterwards
    if (!this.pending) void this.game.sync(row.moves);
    this.react(prev, row);
  }

  /** Draw offers, rematch requests and endings that happen off the board. */
  private react(prev: GameRow | null, row: GameRow): void {
    const me = this.seat?.side ?? null;

    const offerToMe = !!me && row.status === 'active' && row.draw_offer === other(me);
    if (offerToMe && prev?.draw_offer !== row.draw_offer) {
      this.dismiss.offer = this.hud.toast(`${this.nameOf(row, other(me))} offers a draw.`, [
        { label: 'Decline', run: () => void this.online.declineDraw(row.id).then((r) => this.onRow(r), (e) => this.fail(e)) },
        { label: 'Accept', primary: true, run: () => void this.online.acceptDraw(row.id).then((r) => this.onRow(r), (e) => this.fail(e)) },
      ]);
    } else if (!offerToMe) {
      this.dismiss.offer?.();
      this.dismiss.offer = null;
    }
    if (me && prev?.draw_offer === me && !row.draw_offer && row.status === 'active' && row.moves.length === prev.moves.length) {
      this.hud.toast('Draw offer declined.');
    }
    this.hud.setDrawOffered(!!me && row.draw_offer === me);

    if (row.status === 'finished' && prev?.status !== 'finished') {
      if (row.reason === 'resignation') {
        const loser: Side = row.result === '1-0' ? 'b' : 'w';
        const text = loser === me ? 'You resigned' : `${this.nameOf(row, loser)} resigned. ${this.game.winText(other(loser))}`;
        void this.game.finish('Resignation', text);
      } else if (row.reason === 'agreement') {
        void this.game.finish('Draw', 'Agreed by both players');
      }
    }

    if (me && row.rematch_id && !prev?.rematch_id) {
      this.dismiss.rematch = this.hud.toast(`${this.nameOf(row, other(me))} wants a rematch.`, [
        { label: 'Not now', run: () => {} },
        { label: 'Play', primary: true, run: () => void this.rematch().catch((e) => this.fail(e)) },
      ]);
    }
  }

  private onPresence(ids: Set<string>): void {
    const row = this.row;
    const me = this.seat?.side;
    if (!row) return;
    const opponent = me ? (me === 'w' ? row.black_id : row.white_id) : null;
    if (opponent && this.present && row.status === 'active') {
      const was = this.present.has(opponent);
      const is = ids.has(opponent);
      if (was && !is) this.hud.toast(`${this.nameOf(row, other(me!))} disconnected.`);
      if (!was && is) this.hud.toast(`${this.nameOf(row, other(me!))} is back.`);
    }
    this.present = ids;
    this.refreshHud();
  }

  // ---------------------------------------------------------------- helpers

  private refreshHud(): void {
    const row = this.row;
    if (!row) return;
    const player = (side: Side): Player | null => {
      const id = side === 'w' ? row.white_id : row.black_id;
      if (!id) return null;
      const you = id === this.online.userId;
      return { name: this.nameOf(row, side), you, present: you || !this.present ? undefined : this.present.has(id) };
    };
    this.hud.setPlayers({ w: player('w'), b: player('b'), waiting: row.status === 'waiting' });
    this.hud.setMode({ online: true, seated: !!this.seat?.side, active: row.status === 'active' });
  }

  private nameOf(row: GameRow, side: Side): string {
    return (side === 'w' ? row.white_name : row.black_name) ?? 'Your opponent';
  }

  private inviteUrl(id: string): string {
    return `${location.origin}${location.pathname}?game=${id}`;
  }

  private setUrl(id: string | null): void {
    const url = new URL(location.href);
    if (id) url.searchParams.set('game', id);
    else url.searchParams.delete('game');
    history.replaceState(null, '', url);
  }

  private fail(err: unknown): void {
    console.error(err);
    this.hud.toast((err as Error).message || 'Something went wrong.');
  }
}
