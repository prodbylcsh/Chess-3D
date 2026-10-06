// Alpha-beta search with quiescence, piece-square evaluation and difficulty
// levels, plus a quick accuracy estimate for finished games.
import { gameAccuracy } from '#shared/rating.ts';
import { BISHOP, Board, KING, KNIGHT, PAWN, QUEEN, ROOK, type Move } from './board.ts';

const VALUE = [0, 100, 320, 330, 500, 900, 0];

// Piece-square tables (from White's side, rank 8 first): the "simplified evaluation function".
// prettier-ignore
const PST: Record<number, number[]> = {
  [PAWN]: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  [KNIGHT]: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  [BISHOP]: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  [ROOK]: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  [QUEEN]: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  [KING]: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

// prettier-ignore
const KING_END = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
];

const MATE = 100000;

/** Static evaluation in centipawns from the side to move's point of view. */
export function evaluate(board: Board): number {
  const b = board.sq;
  let score = 0;
  let nonPawn = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const p = b[s];
    if (p && Math.abs(p) !== KING && Math.abs(p) !== PAWN) nonPawn += VALUE[Math.abs(p)];
  }
  const endgame = nonPawn <= 1600;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const p = b[s];
    if (!p) continue;
    const kind = Math.abs(p);
    const rank = s >> 4;
    const file = s & 7;
    const idx = p > 0 ? (7 - rank) * 8 + file : rank * 8 + file;
    const table = kind === KING && endgame ? KING_END : PST[kind];
    const v = VALUE[kind] + table[idx];
    score += p > 0 ? v : -v;
  }
  return score * board.turn;
}

class Timeout extends Error {}

interface SearchState {
  nodes: number;
  deadline: number;
}

function order(moves: Move[]): Move[] {
  // captures first, most valuable victim / least valuable attacker; then promotions
  const key = (m: Move) => (m.captured ? 10 * VALUE[Math.abs(m.captured)] - VALUE[Math.abs(m.piece)] + 10000 : 0) + (m.promo ? 9000 : 0);
  return moves.sort((a, b) => key(b) - key(a));
}

function quiesce(board: Board, alpha: number, beta: number, ply: number, st: SearchState, qdepth = 0): number {
  if ((++st.nodes & 1023) === 0 && performance.now() > st.deadline) throw new Timeout();
  // in check there is no "stand pat": every evasion is searched, and none means mate
  const check = qdepth < 4 && board.inCheck();
  let moves: Move[];
  if (check) {
    moves = board.moves();
    if (!moves.length) return -MATE + ply;
  } else {
    const stand = evaluate(board);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qdepth > 6) return alpha;
    moves = board.moves(true);
  }
  for (const m of order(moves)) {
    board.make(m);
    const score = -quiesce(board, -beta, -alpha, ply + 1, st, qdepth + 1);
    board.unmake();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(board: Board, depth: number, alpha: number, beta: number, ply: number, st: SearchState): number {
  if (depth <= 0) return quiesce(board, alpha, beta, ply, st);
  if ((++st.nodes & 1023) === 0 && performance.now() > st.deadline) throw new Timeout();
  if (board.halfmove >= 100) return 0;
  const moves = board.moves();
  if (!moves.length) return board.inCheck() ? -MATE + ply : 0;
  for (const m of order(moves)) {
    board.make(m);
    const score = -negamax(board, depth - 1, -beta, -alpha, ply + 1, st);
    board.unmake();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/**
 * Score every root move (from the mover's view) at `depth`. Moves within `slack`
 * of the best get exact scores; worse ones only an upper bound below that range.
 */
function scoreRoot(board: Board, depth: number, st: SearchState, first?: Move, slack = 0): Array<{ move: Move; score: number }> {
  const moves = order(board.moves());
  if (first) {
    const i = moves.findIndex((m) => m.from === first.from && m.to === first.to && m.promo === first.promo);
    if (i > 0) moves.unshift(...moves.splice(i, 1));
  }
  const out: Array<{ move: Move; score: number }> = [];
  let alpha = -MATE - 1;
  for (const m of moves) {
    board.make(m);
    // full window for the first few so near-equal alternatives get real scores
    const lo = out.length < 6 ? -MATE - 1 : alpha - slack - 1;
    const score = -negamax(board, depth - 1, -MATE - 1, -lo, 1, st);
    board.unmake();
    out.push({ move: m, score });
    if (score > alpha) alpha = score;
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface Level {
  id: number;
  name: string;
  description: string;
  maxDepth: number;
  /** milliseconds to think */
  time: number;
  /** pick randomly among moves within this many centipawns of the best */
  slack: number;
  /** chance of picking a random legal move instead */
  blunder: number;
}

export const LEVELS: Level[] = [
  { id: 1, name: 'Novice', description: 'Learning the moves', maxDepth: 1, time: 300, slack: 150, blunder: 0.25 },
  { id: 2, name: 'Casual', description: 'Plays for fun', maxDepth: 2, time: 500, slack: 70, blunder: 0.08 },
  { id: 3, name: 'Club', description: 'A solid opponent', maxDepth: 3, time: 900, slack: 25, blunder: 0.02 },
  { id: 4, name: 'Expert', description: 'Punishes mistakes', maxDepth: 4, time: 1600, slack: 8, blunder: 0 },
  { id: 5, name: 'Master', description: 'Thinks deep', maxDepth: 6, time: 3000, slack: 0, blunder: 0 },
];

/** Choose a move for the side to move in `fen` at a difficulty level. Returns UCI. */
export function chooseMove(fen: string, levelId: number): string | null {
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[2];
  const board = new Board(fen);
  const legal = board.moves();
  if (!legal.length) return null;
  if (Math.random() < level.blunder) return Board.uci(legal[Math.floor(Math.random() * legal.length)]);

  const st: SearchState = { nodes: 0, deadline: performance.now() + level.time };
  let best: Array<{ move: Move; score: number }> = legal.map((move) => ({ move, score: 0 }));
  for (let depth = 1; depth <= level.maxDepth; depth++) {
    try {
      best = scoreRoot(board, depth, st, best[0]?.move, level.slack);
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      break; // keep the last completed depth (the board is not used again)
    }
    if (Math.abs(best[0].score) > MATE - 100) break; // found a mate
  }
  const top = best[0].score;
  const candidates = best.filter((c) => c.score >= top - level.slack);
  return Board.uci(candidates[Math.floor(Math.random() * candidates.length)].move);
}

const clampCp = (s: number) => Math.max(-1500, Math.min(1500, s));

/**
 * Estimate a player's accuracy (0-100) for a finished game by comparing each of
 * their moves with the engine's choice. A rough stand-in until server-side
 * Stockfish analysis exists; same accuracy model either way.
 */
export function estimateAccuracy(moves: string[], side: 'w' | 'b', timePerMove = 120): number | null {
  const board = new Board();
  const samples: Array<{ before: number; after: number }> = [];
  for (const uci of moves) {
    const mover = board.turn === 1 ? 'w' : 'b';
    const move = board.parse(uci);
    if (!move) break;
    if (mover === side) {
      const st: SearchState = { nodes: 0, deadline: performance.now() + timePerMove };
      const ply = board.ply;
      try {
        const before = clampCp(scoreRoot(board, 2, st)[0]?.score ?? 0);
        board.make(move);
        const after = clampCp(-negamax(board, 1, -MATE - 1, MATE + 1, 1, { nodes: 0, deadline: Infinity }));
        board.unmake();
        samples.push({ before, after });
      } catch (e) {
        if (!(e instanceof Timeout)) throw e;
        board.rewindTo(ply);
      }
    }
    board.make(move);
  }
  return gameAccuracy(samples);
}
