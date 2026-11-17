// What the player's next move is meant to do (docs/PLATFORM.md §4.2), told before they play
// it: "Your opponent attacks your knight: protect it", "Attack two things at once",
// "Develop a piece". Worked out from the position and the solution's move, for every
// puzzle, without naming squares or giving the move away. Pure, so the tests can run it.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

export type Intent =
  | 'mate'
  | 'promote'
  | 'castle'
  | 'escape'
  | 'stopMate'
  | 'defend'
  | 'recapture'
  | 'win'
  | 'trade'
  | 'sacrifice'
  | 'sacrificeCheck'
  | 'check'
  | 'threatMate'
  | 'fork'
  | 'pin'
  | 'threat'
  | 'develop'
  | 'centre'
  | 'improve'
  | 'pawn'
  | 'quiet';

export interface NextGoal {
  intent: Intent;
  /** for 'defend': the piece the opponent attacks */
  piece?: PieceSymbol;
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const toMove = (m: string) => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });

function pieces(chess: Chess, color: Color): { square: Square; type: PieceSymbol }[] {
  return chess.board().flat().flatMap((p) => (p && p.color === color ? [{ square: p.square, type: p.type }] : []));
}

/** The pieces of `owner` the other side could win: attacked and undefended, or attacked by something cheaper. */
function hanging(chess: Chess, owner: Color): { square: Square; type: PieceSymbol }[] {
  const enemy = other(owner);
  return pieces(chess, owner).filter((p) => {
    if (p.type === 'k') return false;
    const attackers = chess.attackers(p.square, enemy);
    if (!attackers.length) return false;
    if (!chess.attackers(p.square, owner).length) return true;
    return Math.min(...attackers.map((s) => VALUE[chess.get(s)!.type])) < VALUE[p.type];
  });
}

/** Whether the side not to move could mate in one if it were its turn. */
function threatensMate(chess: Chess): boolean {
  if (chess.inCheck()) return false;
  const parts = chess.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    const flipped = new Chess(parts.join(' '));
    return flipped.moves({ verbose: true }).some((m) => {
      flipped.move(m);
      const mate = flipped.isCheckmate();
      flipped.undo();
      return mate;
    });
  } catch {
    return false;
  }
}

const DIRS: Record<'b' | 'r', [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
};
const sq = (f: number, r: number) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? (`${'abcdefgh'[f]}${r + 1}` as Square) : null);

/** Whether the line piece on `from` pins (or skewers) an enemy piece to a more valuable one. */
function pins(chess: Chess, from: Square, type: PieceSymbol, me: Color): boolean {
  const dirs = type === 'q' ? [...DIRS.b, ...DIRS.r] : type === 'b' ? DIRS.b : type === 'r' ? DIRS.r : [];
  const f0 = from.charCodeAt(0) - 97;
  const r0 = Number(from[1]) - 1;
  return dirs.some(([df, dr]) => {
    const hit: PieceSymbol[] = [];
    for (let i = 1; i < 8 && hit.length < 2; i++) {
      const s = sq(f0 + df * i, r0 + dr * i);
      if (!s) break;
      const p = chess.get(s);
      if (!p) continue;
      if (p.color === me) break;
      hit.push(p.type);
    }
    if (hit.length < 2) return false;
    // a pin (something more valuable behind) or a skewer (the king in front, a piece behind)
    return hit[0] === 'k' ? VALUE[hit[1]] >= 3 : hit[0] !== 'p' && VALUE[hit[1]] > VALUE[hit[0]];
  });
}

/**
 * The aim of the solution's move `uci` in the position `fen` (the player to move). `last`:
 * the opponent's move just before (to tell a recapture); `opening`: the game has only
 * begun, so development and the centre matter most.
 */
export function nextGoal(fen: string, uci: string, last: Pick<Move, 'to' | 'captured'> | null, opening: boolean): NextGoal {
  const before = new Chess(fen);
  const me = before.turn();
  const them = other(me);
  const after = new Chess(fen);
  let move: Move;
  try {
    move = after.move(toMove(uci));
  } catch {
    return { intent: 'quiet' };
  }
  if (after.isCheckmate()) return { intent: 'mate' };
  if (move.promotion) return { intent: 'promote' };
  if (move.isKingsideCastle() || move.isQueensideCastle()) return { intent: 'castle' };
  if (before.inCheck()) return { intent: 'escape' };

  // defence: the opponent threatens mate, or one of the player's pieces
  if (!move.captured) {
    if (threatensMate(before) && !threatensMate(after)) return { intent: 'stopMate' };
    const threatened = hanging(before, me);
    const still = new Set(hanging(after, me).map((p) => p.type + p.square));
    const saved = threatened
      .filter((p) => !still.has(p.type + (p.square === move.from ? move.to : p.square)))
      .sort((a, b) => VALUE[b.type] - VALUE[a.type])[0];
    if (saved) return { intent: 'defend', piece: saved.type };
  }

  const mover = move.promotion ?? move.piece;
  const exposed = after.attackers(move.to, them).length > 0;
  const covered = after.attackers(move.to, me).length > 0;
  const lost = exposed && (!covered || Math.min(...after.attackers(move.to, them).map((s) => VALUE[after.get(s)!.type])) < VALUE[mover]);

  if (move.captured) {
    if (last?.captured && last.to === move.to) return { intent: 'recapture' };
    const taken = VALUE[move.captured];
    if (!before.attackers(move.to, them).length || taken > VALUE[mover]) return { intent: 'win' };
    if (taken < VALUE[mover] && lost) return { intent: after.inCheck() ? 'sacrificeCheck' : 'sacrifice' };
    return { intent: after.inCheck() ? 'check' : 'trade' };
  }

  // attacks: two targets at once (the king may be one), a pin or skewer, a check, a mate
  // threat, a sacrifice, a new threat
  const targets = pieces(after, them).filter((p) => {
    if (!after.attackers(p.square, me).includes(move.to)) return false;
    return p.type === 'k' || (VALUE[p.type] >= 3 && (VALUE[p.type] > VALUE[mover] || !after.attackers(p.square, them).length));
  });
  if (targets.length >= 2 && !lost) return { intent: 'fork' };
  if (!lost && pins(after, move.to, mover, me)) return { intent: 'pin' };
  if (after.inCheck()) return { intent: lost && mover !== 'p' ? 'sacrificeCheck' : 'check' };
  if (!lost && threatensMate(after)) return { intent: 'threatMate' };
  if (lost && VALUE[mover] >= 3) return { intent: 'sacrifice' };
  const was = new Set(hanging(before, them).map((p) => p.square));
  if ((!lost || mover === 'p') && hanging(after, them).some((p) => !was.has(p.square))) return { intent: 'threat' };

  if (opening) {
    const backRank = me === 'w' ? '1' : '8';
    if ((move.piece === 'n' || move.piece === 'b') && move.from[1] === backRank) return { intent: 'develop' };
    if (move.piece === 'p' && 'cdef'.includes(move.from[0])) return { intent: 'centre' };
    return { intent: 'improve' };
  }
  const material = pieces(after, 'w').length + pieces(after, 'b').length;
  if (move.piece === 'p' && material <= 14) return { intent: 'pawn' };
  return { intent: 'quiet' };
}
