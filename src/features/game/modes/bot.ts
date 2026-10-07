import { t } from '../../../i18n';
import type { Color as Side, Move } from 'chess.js';
import { Flag, Handshake, Undo2 } from 'lucide-react';
import { ai } from '../../../ai/client';
import type { GameEnd } from '../../../game/ui';
import { confirmDialog, toast } from '../../../ui/kit';
import type { GameState, PlayerView } from '../store';
import { playerFromProfile, sleep, type EndAction, type Mode, type ModeAction, type ModeContext } from './types';

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');

/**
 * A game against the in-browser engine. `AiMode` (Play vs AI) and `MatchMode`
 * (demo matchmaking) build on this.
 */
export abstract class BotGame implements Mode {
  abstract readonly label: string;
  protected disposed = false;
  /** bumps on takeback/restart so stale engine replies are ignored */
  private token = 0;
  private thinking = false;

  constructor(
    protected readonly ctx: ModeContext,
    protected readonly human: Side,
    protected readonly level: number,
    protected readonly opponent: PlayerView,
  ) {}

  protected get bot(): Side {
    return other(this.human);
  }

  start(): void {
    const { store, game } = this.ctx.engine;
    this.disposed = false; // React may start a mode again after disposing it (StrictMode)
    this.token++;
    store.reset({
      players: { [this.human]: playerFromProfile(this.ctx.profile), [this.bot]: this.opponent } as Record<Side, PlayerView>,
      bottom: this.human,
      mySide: this.human,
    });
    store.onGameOver = (end) => this.onGameOver(end);
    void game.begin({ side: this.human, active: true, send: (m) => this.onHumanMove(m) }).then(() => {
      if (game.fen.split(' ')[1] === this.bot) void this.think();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.token++;
  }

  private onHumanMove(_move: Move): void {
    void this.think();
  }

  private async think(): Promise<void> {
    const { game, store } = this.ctx.engine;
    const token = this.token;
    this.thinking = true;
    try {
      await game.idle(); // let the human's move finish animating
      if (token !== this.token || game.isOver) return;
      store.set({ note: t('{name} is thinking…', { name: this.opponent.name }) });
      const started = performance.now();
      const uci = await ai.move(game.fen, this.level);
      await sleep(Math.max(0, 550 + Math.random() * 500 - (performance.now() - started)));
      if (token !== this.token || this.disposed || !uci || game.isOver) return;
      void game.sync([...game.history, uci]);
    } finally {
      if (token === this.token) {
        this.thinking = false;
        store.set({ note: null });
      }
    }
  }

  protected async resign(): Promise<void> {
    const ok = await confirmDialog({ title: t('Resign this game?'), text: t('Your opponent will be awarded the win.'), confirmLabel: t('Resign'), tone: 'danger' });
    if (!ok || this.ctx.engine.game.isOver) return;
    this.token++;
    void this.ctx.engine.game.finish({
      winner: this.bot,
      reason: 'resignation',
      title: t('Resignation'),
      text: `You resigned. ${this.opponent.name} wins`,
    });
  }

  protected offerDraw(): void {
    const { store, game } = this.ctx.engine;
    const s = store.get();
    // the engine accepts when it is behind on material, or in a long balanced game
    const behind = s.advantage[this.human] >= 2;
    const longEven = s.moves.length >= 60 && s.advantage[this.human] === s.advantage[this.bot];
    if (behind || longEven) {
      this.token++;
      void game.finish({ winner: null, reason: 'agreement', title: t('Draw'), text: t('Draw agreed') });
    } else {
      toast(t('{name} declined the draw.', { name: this.opponent.name }));
    }
  }

  protected takeback(): void {
    const { game } = this.ctx.engine;
    const moves = game.history;
    if (this.thinking || !moves.length) return;
    const back = moves.length >= 2 && game.fen.split(' ')[1] === this.human ? 2 : 1;
    this.token++;
    void game.sync(moves.slice(0, -back)).then(() => {
      if (game.fen.split(' ')[1] === this.bot) void this.think();
    });
  }

  protected abstract onGameOver(end: GameEnd): void;

  abstract actions(state: GameState): ModeAction[];
  abstract endActions(state: GameState): EndAction[];
  abstract act(id: string): void;

  protected baseActions(s: GameState, opts: { takeback: boolean }): ModeAction[] {
    const live = !s.end;
    const list: ModeAction[] = [];
    if (opts.takeback) list.push({ id: 'takeback', label: t('Takeback'), icon: Undo2, disabled: !live || s.busy || !s.moves.length });
    list.push(
      { id: 'draw', label: t('Draw'), icon: Handshake, disabled: !live || s.moves.length < 2 },
      { id: 'resign', label: t('Resign'), icon: Flag, tone: 'danger', disabled: !live },
    );
    return list;
  }

  protected outcomeOf(end: GameEnd): 'win' | 'loss' | 'draw' {
    return end.winner === null ? 'draw' : end.winner === this.human ? 'win' : 'loss';
  }
}
