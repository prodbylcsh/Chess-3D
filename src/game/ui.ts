import type { Chess, Color as Side, PieceSymbol } from 'chess.js';

/** How a game ended. `reason` is a stable code, `title`/`text` are for display. */
export interface GameEnd {
  winner: Side | null;
  reason: string;
  title: string;
  text: string;
}

/**
 * Everything the game controller needs from the interface around the board.
 * The React game screen implements it; the controller never touches the DOM.
 */
export interface GameUi {
  update(chess: Chess, status?: string): void;
  setBusy(busy: boolean, canUndo: boolean): void;
  askPromotion(side: Side): Promise<PieceSymbol>;
  gameOver(end: GameEnd): void;
  hideGameOver(): void;
  /** "You", a player's name, or "White"/"Black" */
  sideName(side: Side): string;
}
