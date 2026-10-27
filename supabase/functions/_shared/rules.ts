// Server-side game rules for online play. Pure functions over a game row:
// each returns the columns to update, or throws a RuleError. The Edge Function
// handles auth and persistence; this module decides what is legal.
import { Chess } from 'chess.js';
import { clocksAfterMove, remaining, timeoutEnd, type Clocks, type ControlId } from './play.ts';

export type Side = 'w' | 'b';
export type Status = 'waiting' | 'active' | 'finished';
export type Result = '1-0' | '0-1' | '1/2-1/2';

export interface GameRow {
  id: string;
  white_id: string | null;
  black_id: string | null;
  white_name: string | null;
  black_name: string | null;
  moves: string[];
  fen: string;
  status: Status;
  result: Result | null;
  reason: string | null;
  draw_offer: Side | null;
  rematch_id: string | null;
  version: number;
  /** matchmade games (ranked, casual, coins) have a kind, a time control and clocks */
  kind?: 'friend' | 'ranked' | 'casual' | 'wager';
  control?: ControlId | null;
  /** ms left for each side at the start of its turn */
  clock_w?: number | null;
  clock_b?: number | null;
  /** when the side to move's time started (after the last move's animation) */
  turn_started_at?: string | null;
  stake?: number | null;
  settled_at?: string | null;
  /** games with clocks: how long each move took (ms, from the side's turn starting), for fair play */
  move_ms?: number[] | null;
}

export type Patch = Partial<Omit<GameRow, 'id' | 'version'>>;

/** The clocks of a game with a time control, or null. */
export function clocksOf(row: GameRow): Clocks | null {
  if (!row.control || row.clock_w == null || row.clock_b == null || !row.turn_started_at) return null;
  return { control: row.control, white: row.clock_w, black: row.clock_b, turnStartedAt: Date.parse(row.turn_started_at) };
}

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

export class RuleError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');
const winFor = (s: Side): Result => (s === 'w' ? '1-0' : '0-1');

export function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 24) : '';
  return name || 'Anonymous';
}

export function seatOf(row: GameRow, userId: string): Side | null {
  if (row.white_id === userId) return 'w';
  if (row.black_id === userId) return 'b';
  return null;
}

/** Rebuild the full game (history matters for threefold repetition). */
export function replay(moves: string[]): Chess {
  const chess = new Chess();
  for (const uci of moves) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }
  return chess;
}

/** Final result if the position ends the game, otherwise null. */
export function outcome(chess: Chess): { result: Result; reason: string } | null {
  if (chess.isCheckmate()) return { result: winFor(other(chess.turn())), reason: 'checkmate' };
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient material' };
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'threefold repetition' };
  if (chess.isDraw()) return { result: '1/2-1/2', reason: 'fifty-move rule' };
  return null;
}

export function newGame(userId: string, name: unknown, color: unknown): Patch {
  const side: Side = color === 'w' || color === 'b' ? color : Math.random() < 0.5 ? 'w' : 'b';
  return side === 'w'
    ? { white_id: userId, white_name: cleanName(name) }
    : { black_id: userId, black_name: cleanName(name) };
}

/** Take the empty seat. Returns null when the user is already seated (rejoin). */
export function join(row: GameRow, userId: string, name: unknown): Patch | null {
  if (seatOf(row, userId)) return null;
  if (row.status !== 'waiting') throw new RuleError('game_full', 'This game already has two players.', 409);
  const patch: Patch = row.white_id
    ? { black_id: userId, black_name: cleanName(name) }
    : { white_id: userId, white_name: cleanName(name) };
  return { ...patch, status: 'active' };
}

function requireActive(row: GameRow, userId: string): Side {
  const side = seatOf(row, userId);
  if (!side) throw new RuleError('not_a_player', 'You are not playing in this game.', 403);
  if (row.status === 'waiting') throw new RuleError('not_started', 'Waiting for an opponent to join.', 409);
  if (row.status === 'finished') throw new RuleError('game_over', 'This game is over.', 409);
  return side;
}

export function move(row: GameRow, userId: string, input: MoveInput, now = Date.now()): Patch {
  const side = requireActive(row, userId);
  const chess = replay(row.moves);
  if (chess.turn() !== side) throw new RuleError('not_your_turn', 'It is not your turn.', 409);
  const clocks = clocksOf(row);
  // out of time (or never made the first move): the game ends, whatever the move
  if (clocks && remaining(clocks, side, row.moves.length, now) <= 0) {
    return { status: 'finished', draw_offer: null, ...timeoutEnd(chess, row.moves.length) };
  }

  let m;
  try {
    m = chess.move({ from: input.from, to: input.to, promotion: input.promotion });
  } catch {
    throw new RuleError('illegal_move', `Illegal move ${input.from}-${input.to}.`);
  }
  const next = clocks && clocksAfterMove(clocks, side, row.moves.length, now, m);
  if (next === 'flagged' || next === 'aborted') return { status: 'finished', draw_offer: null, ...timeoutEnd(replay(row.moves), row.moves.length) };
  const patch: Patch = {
    moves: [...row.moves, m.lan],
    fen: chess.fen(),
    // making a move declines any offer made to you; your own offer stands
    draw_offer: row.draw_offer === side ? side : null,
  };
  if (next) {
    Object.assign(patch, { clock_w: next.white, clock_b: next.black, turn_started_at: new Date(next.turnStartedAt).toISOString() });
    patch.move_ms = [...(row.move_ms ?? []), Math.max(0, Math.round(now - clocks!.turnStartedAt))];
  }
  const end = outcome(chess);
  if (end) Object.assign(patch, { status: 'finished', draw_offer: null, ...end });
  return patch;
}

/** Either player may end the game when the side to move is out of time (or never moved). */
export function claim(row: GameRow, userId: string, now = Date.now()): Patch {
  requireActive(row, userId);
  const clocks = clocksOf(row);
  if (!clocks) throw new RuleError('no_clock', 'This game has no clock.', 409);
  const chess = replay(row.moves);
  if (remaining(clocks, chess.turn(), row.moves.length, now) > 0) throw new RuleError('not_yet', 'There is still time left.', 409);
  return { status: 'finished', draw_offer: null, ...timeoutEnd(chess, row.moves.length) };
}

export function resign(row: GameRow, userId: string): Patch {
  const side = requireActive(row, userId);
  return { status: 'finished', result: winFor(other(side)), reason: 'resignation', draw_offer: null };
}

export function offerDraw(row: GameRow, userId: string): Patch {
  const side = requireActive(row, userId);
  if (row.draw_offer === other(side)) return acceptDraw(row, userId);
  return { draw_offer: side };
}

export function acceptDraw(row: GameRow, userId: string): Patch {
  const side = requireActive(row, userId);
  if (row.draw_offer !== other(side)) throw new RuleError('no_offer', 'There is no draw offer to accept.', 409);
  return { status: 'finished', result: '1/2-1/2', reason: 'agreement', draw_offer: null };
}

export function declineDraw(row: GameRow, userId: string): Patch {
  const side = requireActive(row, userId);
  if (row.draw_offer !== other(side)) throw new RuleError('no_offer', 'There is no draw offer to decline.', 409);
  return { draw_offer: null };
}

/** Seat for the requester in a rematch: colours swap. */
export function rematch(row: GameRow, userId: string): Patch {
  if (row.kind && row.kind !== 'friend') throw new RuleError('no_rematch', 'Find a new game through matchmaking.', 409);
  const side = seatOf(row, userId);
  if (!side) throw new RuleError('not_a_player', 'You are not playing in this game.', 403);
  if (row.status !== 'finished') throw new RuleError('not_finished', 'The game is still in progress.', 409);
  const name = side === 'w' ? row.white_name : row.black_name;
  return newGame(userId, name, other(side));
}
