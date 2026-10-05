import type { Chess, Color as Side, PieceSymbol } from 'chess.js';
import { TEAMS } from '../core/layout';

const GLYPH: Record<Side, Record<PieceSymbol, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' },
};
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<PieceSymbol, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn', k: 'King' };

export type HudAction = 'new' | 'undo' | 'flip' | 'autoflip' | 'sound';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

export class Hud {
  private readonly turn = $<HTMLElement>('.turn');
  private readonly turnText = $<HTMLElement>('.turn-text');
  private readonly turnStatus = $<HTMLElement>('.turn-status');
  private readonly moveList = $<HTMLOListElement>('.move-list');
  private readonly promotion = $<HTMLElement>('.modal.promotion');
  private readonly gameOver = $<HTMLElement>('.modal.gameover');
  private readonly hint = $<HTMLElement>('.hint');
  private readonly loader = $<HTMLElement>('.loader');

  onAction: (action: HudAction) => void = () => {};

  constructor() {
    document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action!;
        if (action === 'close') {
          this.gameOver.hidden = true;
          return;
        }
        if (action === 'new') this.gameOver.hidden = true;
        this.onAction(action as HudAction);
      });
    });
  }

  setProgress(fraction: number): void {
    $<HTMLElement>('.loader-bar span').style.width = `${Math.round(fraction * 100)}%`;
  }

  hideLoader(): void {
    this.loader.classList.add('done');
    setTimeout(() => this.loader.remove(), 1000);
  }

  showError(message: string): void {
    $<HTMLElement>('.loader-text').textContent = message;
  }

  setToggle(action: HudAction, on: boolean): void {
    $<HTMLButtonElement>(`button[data-action="${action}"]`).setAttribute('aria-pressed', String(on));
  }

  setBusy(busy: boolean, canUndo: boolean): void {
    $<HTMLButtonElement>('.actions button[data-action="undo"]').disabled = busy || !canUndo;
    $<HTMLButtonElement>('.actions button[data-action="new"]').disabled = busy;
  }

  hideHint(): void {
    this.hint.classList.add('hidden');
  }

  /** Refresh turn banner, captured pieces and move list from the game state. */
  update(chess: Chess, status = ''): void {
    const side = chess.turn();
    this.turn.dataset.side = side;
    this.turnText.textContent = chess.isGameOver() ? 'Game over' : `${TEAMS[side].name} to move`;
    this.turnStatus.textContent = status;
    if (status) {
      this.turn.classList.remove('flash');
      void this.turn.offsetWidth; // restart the CSS animation
      this.turn.classList.add('flash');
    }

    const history = chess.history({ verbose: true });

    // captured material, per capturing side
    const taken: Record<Side, PieceSymbol[]> = { w: [], b: [] };
    for (const m of history) if (m.captured) taken[m.color].push(m.captured);
    const score = (s: Side) => taken[s].reduce((sum, p) => sum + VALUE[p], 0);
    for (const s of ['w', 'b'] as Side[]) {
      const row = $<HTMLElement>(`.cap-row[data-side="${s}"]`);
      const enemy: Side = s === 'w' ? 'b' : 'w';
      const sorted = [...taken[s]].sort((a, b) => VALUE[b] - VALUE[a]);
      row.querySelector('.cap-pieces')!.textContent = sorted.map((p) => GLYPH[enemy][p]).join('');
      const diff = score(s) - score(enemy);
      row.querySelector('.cap-adv')!.textContent = diff > 0 ? `+${diff}` : '';
    }

    // move list
    this.moveList.replaceChildren();
    for (let i = 0; i < history.length; i += 2) {
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = `${i / 2 + 1}.`;
      li.append(num);
      for (const m of [history[i], history[i + 1]]) {
        const cell = document.createElement('span');
        cell.textContent = m?.san ?? '';
        if (m && m === history[history.length - 1]) cell.className = 'latest';
        li.append(cell);
      }
      this.moveList.append(li);
    }
    this.moveList.scrollTop = this.moveList.scrollHeight;
  }

  askPromotion(side: Side): Promise<PieceSymbol> {
    const options = this.promotion.querySelector('.promo-options')!;
    options.replaceChildren();
    return new Promise((resolve) => {
      for (const p of ['q', 'r', 'b', 'n'] as PieceSymbol[]) {
        const btn = document.createElement('button');
        btn.innerHTML = `${GLYPH[side][p]}<small>${NAME[p]}</small>`;
        btn.addEventListener('click', () => {
          this.promotion.hidden = true;
          resolve(p);
        });
        options.append(btn);
      }
      this.promotion.hidden = false;
      (options.firstElementChild as HTMLButtonElement).focus();
    });
  }

  showGameOver(title: string, text: string): void {
    $<HTMLElement>('.go-title').textContent = title;
    $<HTMLElement>('.go-text').textContent = text;
    this.gameOver.hidden = false;
  }

  hideGameOver(): void {
    this.gameOver.hidden = true;
  }
}
