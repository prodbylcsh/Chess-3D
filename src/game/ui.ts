import type { Chess, Color as Side, Move, PieceSymbol } from 'chess.js';

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
  /** the position and the moves played to reach it (kept by the controller, not rebuilt by chess.js) */
  update(chess: Chess, moves: readonly Move[], status?: string): void;
  setBusy(busy: boolean, canUndo: boolean): void;
  /** the piece a pawn becomes; null when the choice was cancelled (the game was left) */
  askPromotion(side: Side): Promise<PieceSymbol | null>;
  /** close an open promotion choice: its promise resolves with null */
  cancelPromotion(): void;
  gameOver(end: GameEnd): void;
  hideGameOver(): void;
  /** "You", a player's name, or "White"/"Black" */
  sideName(side: Side): string;
}
