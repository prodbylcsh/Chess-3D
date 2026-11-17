// A puzzle attempt played against the server (docs/PLATFORM.md §4.2, audit November 2026):
// the solutions never leave the server. The app sends each move; the server answers whether it
// is right (with the opponent's reply and what the next move is for), as good as the puzzle's
// own (`alternatives`, judged by the engine ahead of time), or a mistake (with the marks the
// board shows). Hints come from the server too. So the mistakes and hints that decide the stars
// and coins are counted here, not reported by the browser.
//
// Pure: the `puzzles` function and the demo back-end (src/api/mock/puzzles.ts) both run it.
import { Chess, type Square } from 'chess.js';
import { answerAt, mates, replyAfter, rightMove, setupMove, solution, type Puzzle } from './puzzles.ts';
import { nextGoal, type NextGoal } from './puzzle-intent.ts';

/** Wrong moves in a row on one move after which the piece to move is shown (it counts as a hint). */
export const MISSES_FOR_HINT = 3;

export interface AttemptState {
  /** the player's right moves so far (UCI) */
  played: string[];
  mistakes: number;
  hints: number;
  /** wrong moves in a row on the current move */
  misses: number;
  /** what the board shows for the current move: the piece to move, the square it goes to */
  piece: boolean;
  square: boolean;
  /** the solution is complete (or the player mated): ready to be solved */
  done: boolean;
}

export const freshAttempt = (): AttemptState => ({ played: [], mistakes: 0, hints: 0, misses: 0, piece: false, square: false, done: false });

/** Read a stored state, tolerating rows from before (or broken JSON). */
export function attemptState(raw: unknown): AttemptState {
  const s = (raw ?? {}) as Partial<AttemptState>;
  const n = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
  return {
    played: Array.isArray(s.played) ? s.played.filter((m): m is string => typeof m === 'string') : [],
    mistakes: n(s.mistakes),
    hints: n(s.hints),
    misses: n(s.misses),
    piece: !!s.piece,
    square: !!s.square,
    done: !!s.done,
  };
}

/** The marks the board shows for the current move: the piece to move and/or the square it goes to. */
export interface Marks {
  from: Square | null;
  to: Square | null;
}

export type MoveOutcome =
  /** the puzzle's move (or a mate): the opponent's reply follows, unless the puzzle is done */
  | { kind: 'right'; reply: string | null; done: boolean; mate: boolean; next: NextGoal | null }
  /** as good as the puzzle's move, but the puzzle goes on with another one: taken back, no mistake */
  | { kind: 'alternative'; marks: Marks }
  /** a mistake: taken back; `autoHint` when three in a row showed the piece (a hint) */
  | { kind: 'wrong'; marks: Marks; autoHint: boolean };

const toMove = (m: string) => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });

/** The position before the player's next move (after the setup move, the right moves and the replies). */
export function positionNow(p: Puzzle, played: readonly string[]): { chess: Chess; last: { to: Square; captured?: string } | null } {
  const chess = new Chess(p.fen);
  let last: { to: Square; captured?: string } | null = null;
  const setup = setupMove(p);
  if (setup) last = chess.move(toMove(setup));
  played.forEach((m, i) => {
    last = chess.move(toMove(m));
    const reply = replyAfter(p, i + 1);
    if (reply && !chess.isGameOver()) last = chess.move(toMove(reply));
  });
  return { chess, last };
}

/** What the player's next move is for (the coach card), or null when the puzzle is done. */
export function nextOf(p: Puzzle, played: readonly string[], opening: boolean): NextGoal | null {
  const answer = answerAt(p, played.length);
  if (!answer) return null;
  const { chess, last } = positionNow(p, played);
  return nextGoal(chess.fen(), answer, last as never, opening || chess.moveNumber() <= 10);
}

function marksOf(p: Puzzle, s: AttemptState): Marks {
  const answer = answerAt(p, s.played.length)!;
  return { from: s.piece ? (answer.slice(0, 2) as Square) : null, to: s.square ? (answer.slice(2, 4) as Square) : null };
}

export class AttemptError extends Error {
  readonly code: 'illegal' | 'done';

  constructor(code: 'illegal' | 'done', message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * The player's move `uci` in an attempt. `alternatives`: the other moves as good as the
 * puzzle's, per player move (scripts/puzzles/alternatives.ts). `opening`: the Openings
 * module (its aims speak of development).
 */
export function playMove(p: Puzzle, alternatives: readonly (readonly string[])[] | undefined, state: AttemptState, uci: string, opening = false): { state: AttemptState; outcome: MoveOutcome } {
  if (state.done) throw new AttemptError('done', 'The puzzle is solved.');
  const answer = answerAt(p, state.played.length);
  if (!answer) throw new AttemptError('done', 'The puzzle is solved.');
  if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new AttemptError('illegal', 'Not a legal move.');
  const { chess } = positionNow(p, state.played);
  let made;
  try {
    made = chess.move(toMove(uci));
  } catch {
    throw new AttemptError('illegal', 'Not a legal move.');
  }
  const lan = made.lan;

  if (rightMove(p, state.played, lan)) {
    const mate = mates(p, state.played, lan);
    const played = [...state.played, lan];
    const reply = replyAfter(p, played.length) ?? null;
    const done = !reply || mate || played.length >= solution(p).length;
    const next: AttemptState = { ...state, played, misses: 0, piece: false, square: false, done };
    return { state: next, outcome: { kind: 'right', reply: done ? null : reply, done, mate, next: done ? null : nextOf(p, played, opening) } };
  }

  if (alternatives?.[state.played.length]?.includes(lan)) {
    const next = { ...state, square: true };
    return { state: next, outcome: { kind: 'alternative', marks: marksOf(p, next) } };
  }

  const misses = state.misses + 1;
  const autoHint = misses >= MISSES_FOR_HINT && !state.piece;
  const next: AttemptState = {
    ...state,
    mistakes: state.mistakes + 1,
    misses,
    hints: state.hints + (autoHint ? 1 : 0),
    piece: state.piece || autoHint,
    square: true,
  };
  return { state: next, outcome: { kind: 'wrong', marks: marksOf(p, next), autoHint } };
}

/** A hint: first the piece to move, then the square it goes to. Null when both are shown already. */
export function takeHint(p: Puzzle, state: AttemptState): { state: AttemptState; marks: Marks } | null {
  if (state.done || !answerAt(p, state.played.length) || (state.piece && state.square)) return null;
  // the piece is known: the square comes next
  const next: AttemptState = { ...state, hints: state.hints + 1, piece: true, square: state.piece ? true : state.square };
  return { state: next, marks: marksOf(p, next) };
}
