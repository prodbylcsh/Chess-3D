// Game Review (docs/PLATFORM.md §4.9): every move of a finished game judged by Stockfish,
// the key moments, and the better move where there was one. Pure, so the tests can run it;
// the engine's search is in modes/review.ts.
import { Chess, type Color as Side, type PieceSymbol } from 'chess.js';
import { winPercent } from '#shared/rating.ts';

/** How good a move was, from the drop in the mover's winning chance (the accuracy model). */
export type MoveKind = 'best' | 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** Drops in the mover's winning chance (percentage points) that make a move worse. */
export const LOSS = { good: 2, inaccuracy: 6, mistake: 12, blunder: 22 } as const;
/** A best move after the opponent's mistake or blunder is a great one (it punishes it). */
const PUNISHES: readonly MoveKind[] = ['mistake', 'blunder'];
/** At most this many key moments. */
export const KEY_MOMENTS = 5;

/** The engine's view of one position: its best move and the score, from White's side. */
export interface EnginePosition {
  /** UCI, empty when the game is over in this position */
  best: string;
  /** centipawns from White's point of view; mates as ±(10,000 − n) */
  score: number;
}

export interface ReviewedMove {
  /** half-move number, from 0 */
  ply: number;
  side: Side;
  uci: string;
  san: string;
  kind: MoveKind;
  /** drop in the mover's winning chance, in percentage points */
  loss: number;
  /** the engine's move in the position before, when it was clearly better (UCI and how to say it) */
  better: { uci: string; san: string; piece: PieceSymbol; captured: PieceSymbol | null; check: boolean; castle: boolean; promotion: boolean } | null;
}

export interface GameReview {
  moves: ReviewedMove[];
  /** the moves worth looking at, in game order */
  keys: number[];
  /** each side's count of the worse kinds */
  counts: Record<Side, Partial<Record<MoveKind, number>>>;
}

/** The mover's winning chance (0-100) for a White-side score. */
const chance = (score: number, side: Side) => winPercent(side === 'w' ? score : -score);

export function kindOf(loss: number): MoveKind {
  if (loss >= LOSS.blunder) return 'blunder';
  if (loss >= LOSS.mistake) return 'mistake';
  if (loss >= LOSS.inaccuracy) return 'inaccuracy';
  return loss >= LOSS.good ? 'good' : 'best';
}

/**
 * Review a game: `moves` (UCI from the start position) and the engine's view of every
 * position, the start and the end included (`positions.length === moves.length + 1`).
 */
export function reviewGame(moves: string[], positions: EnginePosition[]): GameReview {
  const chess = new Chess();
  const reviewed: ReviewedMove[] = [];
  for (let ply = 0; ply < moves.length; ply++) {
    const before = positions[ply];
    const after = positions[ply + 1];
    const side = chess.turn();
    const uci = moves[ply];
    const fen = chess.fen();
    const made = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    const loss = Math.max(0, Math.round((chance(before.score, side) - chance(after.score, side)) * 10) / 10);
    const engineMove = before.best === uci;
    let kind = engineMove ? 'best' : kindOf(loss);
    if ((kind === 'best' || kind === 'good') && engineMove && reviewed.length && PUNISHES.includes(reviewed[reviewed.length - 1].kind)) kind = 'great';
    const better = !engineMove && loss >= LOSS.inaccuracy && before.best ? describe(fen, before.best) : null;
    reviewed.push({ ply, side, uci, san: made.san, kind, loss, better });
  }

  // the biggest swings, both sides', and every great move, in game order
  const worst = reviewed
    .filter((m) => m.kind === 'mistake' || m.kind === 'blunder')
    .sort((a, b) => b.loss - a.loss)
    .slice(0, KEY_MOMENTS);
  const great = reviewed.filter((m) => m.kind === 'great');
  const keys = [...new Set([...worst, ...great].map((m) => m.ply))]
    .sort((a, b) => a - b)
    .slice(0, KEY_MOMENTS + 2);

  const counts: GameReview['counts'] = { w: {}, b: {} };
  for (const m of reviewed) counts[m.side][m.kind] = (counts[m.side][m.kind] ?? 0) + 1;
  return { moves: reviewed, keys, counts };
}

/** The engine's move described by its piece (the texts speak of pieces, not squares). */
function describe(fen: string, uci: string): ReviewedMove['better'] {
  const chess = new Chess(fen);
  try {
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
    return { uci: m.lan, san: m.san, piece: m.piece, captured: m.captured ?? null, check: chess.inCheck(), castle: m.isKingsideCastle() || m.isQueensideCastle(), promotion: !!m.promotion };
  } catch {
    return null;
  }
}

/** A side's accuracy-style summary for the panel: how many moves of each worse kind. */
export const worse = (counts: Partial<Record<MoveKind, number>>) => ({
  inaccuracies: counts.inaccuracy ?? 0,
  mistakes: counts.mistake ?? 0,
  blunders: counts.blunder ?? 0,
  great: counts.great ?? 0,
});
