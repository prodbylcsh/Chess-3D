import { RefreshCw, RotateCcw, Undo2 } from 'lucide-react';
import type { Mode, ModeContext } from './types';

/** Two players sharing one device. */
export class LocalMode implements Mode {
  readonly label = 'Same device';
  private autoFlip = false;

  constructor(private readonly ctx: ModeContext) {}

  start(): void {
    const { store, game } = this.ctx.engine;
    store.reset();
    void game.begin(null);
  }

  dispose(): void {
    this.ctx.engine.game.setAutoFlip(false);
  }

  actions(s: Parameters<Mode['actions']>[0]) {
    return [
      { id: 'undo', label: 'Undo', icon: Undo2, disabled: s.busy || !s.canUndo },
      { id: 'new', label: 'New game', icon: RotateCcw, disabled: s.busy },
      { id: 'autoflip', label: 'Auto-turn', icon: RefreshCw, pressed: this.autoFlip },
    ];
  }

  endActions() {
    return [
      { id: 'new', label: 'Play again', primary: true },
      { id: 'exit', label: 'Back to Play' },
    ];
  }

  act(id: string): void {
    const { game } = this.ctx.engine;
    if (id === 'undo') game.undo();
    else if (id === 'new') void game.newGame();
    else if (id === 'autoflip') {
      this.autoFlip = !this.autoFlip;
      game.setAutoFlip(this.autoFlip);
      this.ctx.engine.store.set({}); // re-render the toggle
    } else if (id === 'exit') this.ctx.navigate('/play');
  }
}
