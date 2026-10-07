import { t } from '../../../i18n';
import { api, ApiError, type MatchFound } from '../../../api';
import { STAKES } from '#shared/economy.ts';
import { ai } from '../../../ai/client';
import { confirmDialog } from '../../../ui/kit';
import type { GameEnd } from '../../../game/ui';
import type { GameState } from '../store';
import { BotGame } from './bot';
import type { ModeContext } from './types';

/** Engine level that roughly matches an opponent's rating. */
function levelFor(mmr: number): number {
  if (mmr < 800) return 2;
  if (mmr < 1300) return 3;
  if (mmr < 2000) return 4;
  return 5;
}

/**
 * Casual, ranked and coin games found through matchmaking. On the mock back-end
 * the opponent's moves come from the engine (marked "Demo"); results go through
 * the real MMR and coin rules.
 */
export class MatchMode extends BotGame {
  readonly label: string;
  private reported = false;

  constructor(
    ctx: ModeContext,
    private readonly match: MatchFound,
  ) {
    super(ctx, match.color, levelFor(match.opponentMmr), {
      name: match.opponent.username,
      iconId: match.opponent.iconId,
      rank: match.opponent.rank,
      tag: match.demo ? t('Demo') : undefined,
      present: true,
    }, match.opponent.loadout, match.matchId);
    this.label =
      match.kind === 'ranked' ? t('Ranked') : match.kind === 'casual' ? t('Casual') : `${t('For coins')} · ${STAKES[match.stake ?? 'low'].amount}`;
  }

  protected onGameOver(end: GameEnd): void {
    void this.report(end);
  }

  private async report(end: GameEnd): Promise<void> {
    if (this.reported) return;
    this.reported = true;
    const { store, game } = this.ctx.engine;
    store.set({ result: { loading: true, data: null, accuracy: null, error: null } });
    try {
      const accuracy = await ai.accuracy(game.history, this.human).catch(() => null);
      const data = await api.matchmaking.report(this.match.matchId, {
        outcome: this.outcomeOf(end),
        reason: end.reason,
        accuracy,
        moves: game.history.length,
      });
      if (this.disposed) return;
      store.set({ result: { loading: false, data, accuracy, error: null } });
      await this.ctx.refreshProfile();
    } catch (err) {
      if (!this.disposed) {
        store.set({ result: { loading: false, data: null, accuracy: null, error: err instanceof ApiError ? t(err.message) : t('Could not save the result.') } });
      }
    }
  }

  actions(s: GameState) {
    return this.baseActions(s, { takeback: false });
  }

  endActions() {
    return [
      { id: 'again', label: t('Find another game'), primary: true },
      { id: 'exit', label: t('Back to Play') },
    ];
  }

  act(id: string): void {
    if (id === 'draw') this.offerDraw();
    else if (id === 'resign') void this.resign();
    else if (id === 'again') this.ctx.navigate(`/play?queue=${this.match.kind}${this.match.stake ? `&stake=${this.match.stake}` : ''}`);
    else if (id === 'exit') void this.leave();
  }

  private async leave(): Promise<void> {
    const { game } = this.ctx.engine;
    if (!game.isOver && game.history.length > 0) {
      const ok = await confirmDialog({ title: t('Leave this game?'), text: t('Leaving a running game counts as a loss.'), confirmLabel: t('Leave'), tone: 'danger' });
      if (!ok) return;
      void this.report({ winner: this.bot, reason: 'abandoned', title: t('Abandoned'), text: t('You left the game') });
    }
    this.ctx.navigate('/play');
  }
}
