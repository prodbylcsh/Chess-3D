import type { Color as Side } from 'chess.js';
import { LEVELS } from '../../../ai/client';
import type { GameEnd } from '../../../game/ui';
import { ai } from '../../../ai/client';
import type { GameState } from '../store';
import { BotGame } from './bot';
import type { ModeContext } from './types';

/** Play vs AI: no MMR, no coins; the result card shows your accuracy. */
export class AiMode extends BotGame {
  readonly label: string;

  constructor(ctx: ModeContext, human: Side, level: number) {
    const def = LEVELS.find((l) => l.id === level) ?? LEVELS[2];
    super(ctx, human, def.id, { name: 'Wizard Bot', iconId: 'bot', tag: def.name });
    this.label = `vs AI · ${def.name}`;
  }

  protected onGameOver(_end: GameEnd): void {
    const { store, game } = this.ctx.engine;
    store.set({ result: { loading: true, data: null, accuracy: null, error: null } });
    void ai.accuracy(game.history, this.human).then(
      (accuracy) => !this.disposed && store.set({ result: { loading: false, data: null, accuracy, error: null } }),
      () => !this.disposed && store.set({ result: null }),
    );
  }

  actions(s: GameState) {
    return this.baseActions(s, { takeback: true });
  }

  endActions() {
    return [
      { id: 'rematch', label: 'Rematch', primary: true },
      { id: 'swap', label: 'Rematch with other colour' },
      { id: 'exit', label: 'Back to Play' },
    ];
  }

  act(id: string): void {
    if (id === 'takeback') this.takeback();
    else if (id === 'draw') this.offerDraw();
    else if (id === 'resign') void this.resign();
    else if (id === 'rematch') this.start();
    else if (id === 'swap') this.ctx.navigate(`/game/ai?level=${this.level}&color=${this.bot}`);
    else if (id === 'exit') this.ctx.navigate('/play');
  }
}
