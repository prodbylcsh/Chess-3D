// Why a wrong move in a puzzle is wrong (docs/PLATFORM.md §4.2): the engine's scores of the
// right and the wrong move and its answer to the wrong one, turned into what the player is
// told. Pure, so the tests can run it; the search is in modes/puzzle.ts.
import { Chess, type PieceSymbol } from 'chess.js';

export type WhyNot =
  /** about as good as the puzzle's move: a different idea, not a mistake */
  | { kind: 'alternative' }
  /** a little weaker, nothing concrete to show */
  | { kind: 'weaker' }
  /** still winning, but the puzzle has a mate */
  | { kind: 'missedMate' }
  /** the opponent's answer shows it: a mate, a capture, a check, or simply a worse game */
  | { kind: 'mate' | 'check' | 'worse' | 'slip'; reply: string }
  | { kind: 'takes'; reply: string; piece: PieceSymbol };

/** Below this loss (centipawns) the wrong move is as good as the right one. */
const SAME = 40;
/** Below this it is only a little weaker. */
const CLOSE = 120;

/**
 * `fen`: the position before the wrong move (the player to move). Scores are the player's,
 * for each move searched alone (a mate as ±(10,000 − n)); `reply` is the engine's answer to
 * the wrong move.
 */
export function whyNot(fen: string, wrong: string, rightScore: number, wrongScore: number, reply: string | undefined): WhyNot {
  const loss = rightScore - wrongScore;
  // a different way to win (a slower mate, or a big advantage either way)
  if (loss < SAME || (wrongScore >= 900 && rightScore < 9_000)) return { kind: 'alternative' };
  if (rightScore >= 9_000 && wrongScore >= 300 && wrongScore < 9_000) return { kind: 'missedMate' };
  const chess = new Chess(fen);
  try {
    chess.move({ from: wrong.slice(0, 2), to: wrong.slice(2, 4), promotion: wrong[4] ?? 'q' });
  } catch {
    return { kind: 'weaker' };
  }
  if (!reply) return { kind: 'weaker' };
  let made;
  try {
    made = chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
  } catch {
    return { kind: 'weaker' };
  }
  if (chess.isCheckmate()) return { kind: 'mate', reply };
  if (loss < CLOSE) return { kind: 'weaker' };
  if (made.captured) return { kind: 'takes', reply, piece: made.captured };
  if (chess.inCheck()) return { kind: 'check', reply };
  return { kind: wrongScore <= -150 ? 'worse' : 'slip', reply };
}
