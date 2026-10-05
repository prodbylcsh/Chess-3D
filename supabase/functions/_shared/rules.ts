// Server-side game rules for online play. Pure functions over a game row:
// each returns the columns to update, or throws a RuleError. The Edge Function
// handles auth and persistence; this module decides what is legal.
import { Chess } from 'chess.js';

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
}

export type Patch = Partial<Omit<GameRow, 'id' | 'version'>>;

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

export function move(row: GameRow, userId: string, input: MoveInput): Patch {
  const side = requireActive(row, userId);
  const chess = replay(row.moves);
  if (chess.turn() !== side) throw new RuleError('not_your_turn', 'It is not your turn.', 409);

  let m;
  try {
    m = chess.move({ from: input.from, to: input.to, promotion: input.promotion });
  } catch {
    throw new RuleError('illegal_move', `Illegal move ${input.from}-${input.to}.`);
  }
  const patch: Patch = {
    moves: [...row.moves, m.lan],
    fen: chess.fen(),
    // making a move declines any offer made to you; your own offer stands
    draw_offer: row.draw_offer === side ? side : null,
  };
  const end = outcome(chess);
  if (end) Object.assign(patch, { status: 'finished', draw_offer: null, ...end });
  return patch;
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
  const side = seatOf(row, userId);
  if (!side) throw new RuleError('not_a_player', 'You are not playing in this game.', 403);
  if (row.status !== 'finished') throw new RuleError('not_finished', 'The game is still in progress.', 409);
  const name = side === 'w' ? row.white_name : row.black_name;
  return newGame(userId, name, other(side));
}
