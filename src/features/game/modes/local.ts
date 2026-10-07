import { t } from '../../../i18n';
import { RefreshCw, RotateCcw, Undo2 } from 'lucide-react';
import { getPrefs } from '../../../app/prefs';
import { dressGame, randomSeed, type Mode, type ModeContext } from './types';

/** Two players sharing one device. */
export class LocalMode implements Mode {
  readonly label = t('Same device');
  private autoFlip = getPrefs().autoRotate;

  constructor(private readonly ctx: ModeContext) {}

  start(): void {
    const { store, game } = this.ctx.engine;
    store.reset();
    // both sides wear your items (each in its own colour)
    const mine = this.ctx.profile?.loadout ?? null;
    dressGame(this.ctx.engine, { w: mine, b: mine }, randomSeed());
    void game.begin(null).then(() => game.setAutoFlip(this.autoFlip));
  }

  dispose(): void {
    this.ctx.engine.game.setAutoFlip(false);
  }

  actions(s: Parameters<Mode['actions']>[0]) {
    return [
      { id: 'undo', label: t('Undo'), icon: Undo2, disabled: s.busy || !s.canUndo },
      { id: 'new', label: t('New game'), icon: RotateCcw, disabled: s.busy },
      { id: 'autoflip', label: t('Auto-turn'), icon: RefreshCw, pressed: this.autoFlip },
    ];
  }

  endActions() {
    return [
      { id: 'new', label: t('Play again'), primary: true },
      { id: 'exit', label: t('Back to Play') },
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
