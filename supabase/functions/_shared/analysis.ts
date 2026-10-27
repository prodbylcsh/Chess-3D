// Engine analysis of finished ranked and casual games. Each player's browser runs the same
// Stockfish build over the game with a fixed search per position and reports a score for
// every position; Stockfish is deterministic with one thread and a fixed node count, so two
// honest reports are identical. Only when both reports agree does the server turn them into
// each player's accuracy, which adds the performance part to MMR and coins
// (docs/PLATFORM.md §5.2, §8.2). Pure functions shared by the app and the server.
import { gameAccuracy } from './rating.ts';
import { replay } from './rules.ts';

export const ANALYSIS = {
  /** the engine build (public/engine/<engine>.js); both reports must name the same one */
  engine: 'stockfish-19-lite-single',
  /** search per position: same build + same settings = the same score on every device */
  nodes: 30_000,
  hashMb: 16,
  /** scores at or beyond this are mates: ±(mate − moves to mate) */
  mate: 10_000,
  /** a report counts only this long after the game */
  windowMs: 24 * 60 * 60 * 1000,
} as const;

export interface AnalysisReport {
  engine: string;
  /** one score per position, from the start to the end of the game, from White's point of view */
  scores: number[];
  /** the engine's first choice per position (UCI, '' where there is none), for fair play (_shared/fairplay.ts) */
  best?: string[];
  /** how long the reporting player was away from the game during each ply (ms, 0 for the opponent's), for fair play */
  away?: number[];
}

/** How the analysis of a game ended up (the app shows it on the result card). */
export type AnalysisStatus = 'waiting' | 'applied' | 'mismatch' | 'expired' | 'none';

/**
 * A UCI engine score (from the side to move) in the report's encoding: centipawns from
 * White's point of view, mates as ±(10,000 − moves to mate).
 */
export function encodeScore(kind: 'cp' | 'mate', value: number, whiteToMove: boolean): number {
  const sign = whiteToMove ? 1 : -1;
  if (kind === 'cp') return sign * Math.max(-(ANALYSIS.mate - 1000), Math.min(ANALYSIS.mate - 1000, value));
  return sign * Math.sign(value || -1) * (ANALYSIS.mate - Math.min(Math.abs(value), 999));
}

/**
 * The positions of a game (UCI moves from the start position) to analyse, as FEN. The last
 * one is scored by the rules when the game ended on the board: a mate, or 0 for a draw
 * (repetition and the 50-move rule need the history the engine does not see).
 */
export function positions(moves: string[]): { fens: string[]; final: number | null } {
  const chess = replay([]);
  const fens = [chess.fen()];
  for (const uci of moves) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    fens.push(chess.fen());
  }
  let final: number | null = null;
  if (chess.isCheckmate()) final = chess.turn() === 'w' ? -ANALYSIS.mate : ANALYSIS.mate;
  else if (chess.isDraw()) final = 0;
  return { fens, final };
}

/** A player's away times as they report them: whole ms per ply, 0 for the opponent's. */
export function isAway(value: unknown, plies: number): value is number[] {
  return Array.isArray(value) && value.length === plies && value.every((v) => Number.isInteger(v) && v >= 0 && v <= 24 * 60 * 60 * 1000);
}

/** The engine's first choice per position as a report gives it: UCI, or '' where there is none. */
export function isBest(value: unknown, plies: number): value is string[] {
  return Array.isArray(value) && value.length === plies + 1 && value.every((v) => typeof v === 'string' && (v === '' || /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(v)));
}

/** A report the server can use: the right engine and one whole-number score per position. */
export function isReport(value: unknown, plies: number): value is AnalysisReport {
  const r = value as AnalysisReport;
  return (
    !!r &&
    r.engine === ANALYSIS.engine &&
    Array.isArray(r.scores) &&
    r.scores.length === plies + 1 &&
    r.scores.every((s) => Number.isInteger(s) && Math.abs(s) <= ANALYSIS.mate) &&
    (r.best === undefined || isBest(r.best, plies)) &&
    (r.away === undefined || isAway(r.away, plies))
  );
}

/** The same analysis (the away times are each player's own; a report from an older app has no first choices). */
export const sameReport = (a: AnalysisReport, b: AnalysisReport) =>
  a.engine === b.engine &&
  a.scores.length === b.scores.length &&
  a.scores.every((s, i) => s === b.scores[i]) &&
  (!a.best || !b.best || a.best.every((m, i) => m === b.best![i]));

/** Each side's accuracy (0-100) from a report: how much each move lowered the mover's chances. */
export function accuracies(scores: number[]): { w: number | null; b: number | null } {
  const samples = { w: [] as Array<{ before: number; after: number }>, b: [] as Array<{ before: number; after: number }> };
  for (let i = 0; i + 1 < scores.length; i++) {
    const mover = i % 2 === 0 ? 'w' : 'b';
    const sign = mover === 'w' ? 1 : -1;
    samples[mover].push({ before: sign * scores[i], after: sign * scores[i + 1] });
  }
  return { w: gameAccuracy(samples.w), b: gameAccuracy(samples.b) };
}
