// A small, fast chess board for the AI: 0x88 board, legal move generation,
// make/unmake. chess.js stays the rules authority for the game itself; this is
// only used for searching, where chess.js would be far too slow.

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

/** flags */
const EP = 1;
const CASTLE = 2;
const DOUBLE = 4;

export interface Move {
  from: number;
  to: number;
  /** signed piece code of the mover */
  piece: number;
  /** signed piece code captured (0 if none) */
  captured: number;
  /** unsigned promotion piece (0 if none) */
  promo: number;
  flags: number;
}

interface Undo {
  move: Move;
  castling: number;
  ep: number;
  halfmove: number;
}

const KNIGHT_DIRS = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_DIRS = [17, 15, -17, -15];
const ROOK_DIRS = [16, -16, 1, -1];
const KING_DIRS = [17, 15, -17, -15, 16, -16, 1, -1];

const WK = 1;
const WQ = 2;
const BK = 4;
const BQ = 8;

const PIECE_CHARS = ' pnbrqk';

export const sqName = (sq: number) => 'abcdefgh'[sq & 7] + ((sq >> 4) + 1);
export const sqIndex = (name: string) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);

export class Board {
  readonly sq = new Int8Array(128);
  /** 1 = white to move, -1 = black */
  turn = 1;
  castling = 0;
  /** en-passant target square or -1 */
  ep = -1;
  halfmove = 0;
  private readonly kings = { 1: 4, [-1]: 116 } as Record<number, number>;
  private readonly undos: Undo[] = [];

  constructor(fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
    this.load(fen);
  }

  load(fen: string): void {
    this.sq.fill(0);
    const [placement, turn, castling, ep, half] = fen.split(/\s+/);
    let rank = 7;
    let file = 0;
    for (const c of placement) {
      if (c === '/') {
        rank--;
        file = 0;
      } else if (c >= '1' && c <= '8') {
        file += Number(c);
      } else {
        const code = PIECE_CHARS.indexOf(c.toLowerCase());
        const s = rank * 16 + file;
        this.sq[s] = c === c.toUpperCase() ? code : -code;
        if (code === KING) this.kings[c === c.toUpperCase() ? 1 : -1] = s;
        file++;
      }
    }
    this.turn = turn === 'b' ? -1 : 1;
    this.castling =
      (castling.includes('K') ? WK : 0) | (castling.includes('Q') ? WQ : 0) | (castling.includes('k') ? BK : 0) | (castling.includes('q') ? BQ : 0);
    this.ep = ep && ep !== '-' ? sqIndex(ep) : -1;
    this.halfmove = Number(half) || 0;
    this.undos.length = 0;
  }

  /** Is `s` attacked by the side with sign `by` (1 white, -1 black)? */
  attacked(s: number, by: number): boolean {
    const b = this.sq;
    // pawns: a white pawn attacks up the board, so look one rank down from s
    const p1 = s - 15 * by;
    const p2 = s - 17 * by;
    if (!(p1 & 0x88) && b[p1] === PAWN * by) return true;
    if (!(p2 & 0x88) && b[p2] === PAWN * by) return true;
    for (const d of KNIGHT_DIRS) {
      const t = s + d;
      if (!(t & 0x88) && b[t] === KNIGHT * by) return true;
    }
    for (const d of KING_DIRS) {
      const t = s + d;
      if (!(t & 0x88) && b[t] === KING * by) return true;
    }
    for (const d of BISHOP_DIRS) {
      for (let t = s + d; !(t & 0x88); t += d) {
        const p = b[t];
        if (p) {
          if (p === BISHOP * by || p === QUEEN * by) return true;
          break;
        }
      }
    }
    for (const d of ROOK_DIRS) {
      for (let t = s + d; !(t & 0x88); t += d) {
        const p = b[t];
        if (p) {
          if (p === ROOK * by || p === QUEEN * by) return true;
          break;
        }
      }
    }
    return false;
  }

  inCheck(side = this.turn): boolean {
    return this.attacked(this.kings[side], -side);
  }

  /** Pseudo-legal moves; `capturesOnly` for quiescence search. */
  private pseudo(capturesOnly: boolean): Move[] {
    const b = this.sq;
    const us = this.turn;
    const moves: Move[] = [];
    const add = (from: number, to: number, piece: number, captured: number, flags = 0) => {
      if (Math.abs(piece) === PAWN && (to >> 4 === 7 || to >> 4 === 0)) {
        for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) moves.push({ from, to, piece, captured, promo, flags });
      } else {
        moves.push({ from, to, piece, captured, promo: 0, flags });
      }
    };

    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const piece = b[s];
      if (!piece || Math.sign(piece) !== us) continue;
      const kind = Math.abs(piece);

      if (kind === PAWN) {
        const fwd = s + 16 * us;
        const startRank = us === 1 ? 1 : 6;
        const lastRank = us === 1 ? 7 : 0;
        if (!(fwd & 0x88) && !b[fwd] && (!capturesOnly || fwd >> 4 === lastRank)) {
          add(s, fwd, piece, 0);
          const dbl = fwd + 16 * us;
          if (!capturesOnly && s >> 4 === startRank && !b[dbl]) add(s, dbl, piece, 0, DOUBLE);
        }
        for (const d of [15 * us, 17 * us]) {
          const t = s + d;
          if (t & 0x88) continue;
          if (b[t] && Math.sign(b[t]) === -us) add(s, t, piece, b[t]);
          else if (t === this.ep) add(s, t, piece, -us * PAWN, EP);
        }
        continue;
      }

      if (kind === KNIGHT || kind === KING) {
        for (const d of kind === KNIGHT ? KNIGHT_DIRS : KING_DIRS) {
          const t = s + d;
          if (t & 0x88) continue;
          if (!b[t]) {
            if (!capturesOnly) add(s, t, piece, 0);
          } else if (Math.sign(b[t]) === -us) add(s, t, piece, b[t]);
        }
      } else {
        const dirs = kind === BISHOP ? BISHOP_DIRS : kind === ROOK ? ROOK_DIRS : KING_DIRS;
        for (const d of dirs) {
          for (let t = s + d; !(t & 0x88); t += d) {
            if (!b[t]) {
              if (!capturesOnly) add(s, t, piece, 0);
              continue;
            }
            if (Math.sign(b[t]) === -us) add(s, t, piece, b[t]);
            break;
          }
        }
      }

      if (kind === KING && !capturesOnly) {
        const home = us === 1 ? 4 : 116;
        if (s === home && !this.attacked(home, -us)) {
          const [kRight, qRight] = us === 1 ? [WK, WQ] : [BK, BQ];
          if (this.castling & kRight && !b[home + 1] && !b[home + 2] && b[home + 3] === ROOK * us) {
            if (!this.attacked(home + 1, -us) && !this.attacked(home + 2, -us)) add(home, home + 2, piece, 0, CASTLE);
          }
          if (this.castling & qRight && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === ROOK * us) {
            if (!this.attacked(home - 1, -us) && !this.attacked(home - 2, -us)) add(home, home - 2, piece, 0, CASTLE);
          }
        }
      }
    }
    return moves;
  }

  /** Legal moves for the side to move. */
  moves(capturesOnly = false): Move[] {
    const legal: Move[] = [];
    const us = this.turn;
    for (const m of this.pseudo(capturesOnly)) {
      this.make(m);
      if (!this.attacked(this.kings[us], -us)) legal.push(m);
      this.unmake();
    }
    return legal;
  }

  make(m: Move): void {
    const b = this.sq;
    const us = this.turn;
    this.undos.push({ move: m, castling: this.castling, ep: this.ep, halfmove: this.halfmove });

    b[m.to] = m.promo ? m.promo * us : m.piece;
    b[m.from] = 0;
    if (m.flags & EP) b[m.to - 16 * us] = 0;
    if (m.flags & CASTLE) {
      if (m.to > m.from) {
        b[m.from + 1] = b[m.from + 3];
        b[m.from + 3] = 0;
      } else {
        b[m.from - 1] = b[m.from - 4];
        b[m.from - 4] = 0;
      }
    }
    if (Math.abs(m.piece) === KING) {
      this.kings[us] = m.to;
      this.castling &= us === 1 ? ~(WK | WQ) : ~(BK | BQ);
    }
    // a rook leaving or being captured on its corner removes that right
    for (const s of [m.from, m.to]) {
      if (s === 0) this.castling &= ~WQ;
      else if (s === 7) this.castling &= ~WK;
      else if (s === 112) this.castling &= ~BQ;
      else if (s === 119) this.castling &= ~BK;
    }
    this.ep = m.flags & DOUBLE ? m.from + 16 * us : -1;
    this.halfmove = Math.abs(m.piece) === PAWN || m.captured ? 0 : this.halfmove + 1;
    this.turn = -us;
  }

  unmake(): void {
    const u = this.undos.pop()!;
    const m = u.move;
    const b = this.sq;
    const us = -this.turn;
    this.turn = us;
    this.castling = u.castling;
    this.ep = u.ep;
    this.halfmove = u.halfmove;

    b[m.from] = m.piece;
    if (m.flags & EP) {
      b[m.to] = 0;
      b[m.to - 16 * us] = m.captured;
    } else {
      b[m.to] = m.captured;
    }
    if (m.flags & CASTLE) {
      if (m.to > m.from) {
        b[m.from + 3] = b[m.from + 1];
        b[m.from + 1] = 0;
      } else {
        b[m.from - 4] = b[m.from - 1];
        b[m.from - 1] = 0;
      }
    }
    if (Math.abs(m.piece) === KING) this.kings[us] = m.from;
  }

  /** Number of moves made on this board (for rewinding after an aborted search). */
  get ply(): number {
    return this.undos.length;
  }

  rewindTo(ply: number): void {
    while (this.undos.length > ply) this.unmake();
  }

  /** Find a legal move from UCI notation ("e2e4", "e7e8q"). */
  parse(uci: string): Move | null {
    const from = sqIndex(uci.slice(0, 2));
    const to = sqIndex(uci.slice(2, 4));
    const promo = uci[4] ? PIECE_CHARS.indexOf(uci[4]) : 0;
    return this.moves().find((m) => m.from === from && m.to === to && m.promo === promo) ?? null;
  }

  static uci(m: Move): string {
    return sqName(m.from) + sqName(m.to) + (m.promo ? PIECE_CHARS[m.promo] : '');
  }

  perft(depth: number): number {
    if (depth === 0) return 1;
    const moves = this.moves();
    if (depth === 1) return moves.length;
    let n = 0;
    for (const m of moves) {
      this.make(m);
      n += this.perft(depth - 1);
      this.unmake();
    }
    return n;
  }
}
