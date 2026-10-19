// Hand-made puzzles that modules start with (`select.curated` in _shared/puzzles.ts);
// scripts/puzzles/build.ts fills the rest of the module from Lichess (none, when a module
// has all 100 here).
//
// Each one is written in SAN: `before` are the moves already on the board, `line` the moves
// to play from there (the opponent's setup move first when it is the opponent's turn, then
// the player's moves and the replies). The `goal` is shown to the player; its Czech is in
// src/i18n/cs.ts (registered in src/features/puzzles/modules.ts).
import { Chess } from 'chess.js';
import type { Puzzle } from '../../supabase/functions/_shared/puzzles.ts';

interface Line {
  goal: string;
  side: 'w' | 'b';
  before?: string;
  line: string;
}

// Openings, the whole module (docs/PLATFORM.md §4.2): real games from the first move, half
// for White and half for Black, in chapters of ten. The main lines and the right answer to
// each of them, the fastest mates, punishing weak first moves, gambits and the classic
// traps. Each line has been checked with Stockfish. Ratings rise with the order (ratingAt).
const OPENINGS: Line[] = [
  // The first moves and the quickest mates
  { goal: "Fool's Mate", side: 'b', before: 'f3 e5', line: 'g4 Qh4#' },
  { goal: "Fool's Mate for White", side: 'w', before: 'e4 f6 d4', line: 'g5 Qh5#' },
  { goal: "Scholar's Mate", side: 'w', line: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#' },
  { goal: "Stop the Scholar's Mate", side: 'b', before: 'e4 e5 Bc4 Nc6', line: 'Qh5 g6 Qf3 Nf6' },
  { goal: 'Punish the Wayward Queen', side: 'b', line: 'e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6 g4 Nd4' },
  { goal: 'Italian Game', side: 'w', line: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4' },
  { goal: 'Italian Game as Black', side: 'b', line: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+' },
  { goal: 'Smothered Mate in the Caro-Kann', side: 'w', before: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2', line: 'Ngf6 Nd6#' },
  { goal: 'Four Knights Game', side: 'w', line: 'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3' },
  { goal: 'Punish the Damiano Defence', side: 'w', before: 'e4 e5 Nf3', line: 'f6 Nxe5 fxe5 Qh5+ g6 Qxe5+' },
  // Classical main lines, from both sides
  { goal: 'Scotch Game', side: 'w', line: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5' },
  { goal: 'Scotch Game as Black', side: 'b', line: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7' },
  { goal: "Queen's Gambit", side: 'w', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3' },
  { goal: "Queen's Gambit Declined", side: 'b', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O' },
  { goal: 'London System', side: 'w', line: 'd4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2' },
  { goal: 'Answer the London System', side: 'b', line: 'd4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4' },
  { goal: 'Petrov Trap', side: 'w', before: 'e4 e5 Nf3 Nf6 Nxe5', line: 'Nxe4 Qe2 Nf6 Nc6+' },
  { goal: "Petrov's Defence", side: 'b', line: 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5' },
  { goal: 'Ruy Lopez', side: 'w', line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1' },
  { goal: 'Closed Ruy Lopez', side: 'b', line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O' },
  // Black's answers to 1.e4, and how White meets them
  { goal: 'Sicilian Defence: Najdorf', side: 'b', line: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6' },
  { goal: 'Open Sicilian', side: 'w', line: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5' },
  { goal: 'French Defence', side: 'b', line: 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7' },
  { goal: 'French Advance Variation', side: 'w', line: 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3' },
  { goal: 'French Advance as Black', side: 'b', line: 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6' },
  { goal: 'Caro-Kann Defence', side: 'b', line: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6' },
  { goal: 'Caro-Kann Advance Variation', side: 'w', line: 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3' },
  { goal: 'Caro-Kann Advance as Black', side: 'b', line: 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5' },
  { goal: 'Scandinavian Defence', side: 'b', line: 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6' },
  { goal: 'Scandinavian Defence as White', side: 'w', line: 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4' },
  // Attacks on the weak pawn beside the king, and how to meet them
  { goal: "Légal's Mate", side: 'w', before: 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3', line: 'g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#' },
  { goal: "From's Gambit Mate", side: 'b', before: 'f4 e5 fxe5 d6 exd6 Bxd6 Nf3 g5', line: 'h3 Bg3#' },
  { goal: "Owen's Defence Trap", side: 'w', before: 'e4 b6 d4 Bb7 Bd3 f5', line: 'exf5 Bxg2 Qh5+ g6 fxg6 Nf6 gxh7+ Nxh5 Bg6#' },
  { goal: 'Blackburne Shilling Trap', side: 'b', before: 'e4 e5 Nf3 Nc6 Bc4 Nd4', line: 'Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#' },
  { goal: 'Answer the Shilling Gambit', side: 'w', before: 'e4 e5 Nf3 Nc6 Bc4', line: 'Nd4 Nxd4 exd4 c3' },
  { goal: 'Two Knights Defence', side: 'b', line: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5' },
  { goal: 'Two Knights Defence as White', side: 'w', line: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2' },
  { goal: 'Fried Liver Attack', side: 'w', before: 'e4 e5 Nf3 Nc6 Bc4', line: 'Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3' },
  { goal: 'The Fork Trick', side: 'b', before: 'e4 e5 Nf3 Nc6 Bc4 Nf6', line: 'Nc3 Nxe4 Nxe4 d5' },
  { goal: 'Punish the Early Bishop Pin', side: 'w', before: 'e4 e5 Nf3 d6 d4', line: 'Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3' },
  // Queen's pawn openings, from both sides
  { goal: "King's Indian Defence", side: 'b', line: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O' },
  { goal: "Classical Line against the King's Indian", side: 'w', line: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O' },
  { goal: 'Nimzo-Indian Defence', side: 'b', line: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O' },
  { goal: 'Classical Line against the Nimzo-Indian', side: 'w', line: 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3' },
  { goal: 'Slav Defence', side: 'b', line: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4' },
  { goal: 'Main Line against the Slav', side: 'w', line: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4' },
  { goal: 'Grünfeld Defence', side: 'b', line: 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7' },
  { goal: "Queen's Gambit Exchange Variation", side: 'w', line: 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3' },
  { goal: "Queen's Gambit Accepted", side: 'b', line: 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5' },
  { goal: 'Punish the Greedy Pawn Grab', side: 'w', before: 'd4 d5 c4 dxc4 e3', line: 'b5 a4 c6 axb5 cxb5 Qf3' },
  // Flank openings and systems
  { goal: 'English Opening', side: 'w', line: 'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2' },
  { goal: 'Answer the English Opening', side: 'b', line: 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5' },
  { goal: 'Catalan Opening', side: 'w', line: 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O' },
  { goal: 'Réti Opening', side: 'w', line: 'Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O b3' },
  { goal: 'Colle System', side: 'w', line: 'd4 d5 Nf3 Nf6 e3 e6 Bd3 c5 c3 Nc6 Nbd2 Bd6 O-O' },
  { goal: 'Dutch Defence', side: 'b', line: 'd4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O' },
  { goal: 'Dutch Defence Trap', side: 'w', before: 'd4 f5 Bg5 h6 Bh4 g5 Bg3 f4 e3', line: 'h5 Bd3 Rh6 Qxh5+ Rxh5 Bg6#' },
  { goal: 'Answer the Trompowsky', side: 'b', line: 'd4 Nf6 Bg5 Ne4 Bf4 c5' },
  { goal: 'Kieninger Trap', side: 'b', before: 'd4 Nf6 c4 e5 dxe5 Ng4 Nf3 Nc6 Bf4 Bb4+ Nbd2 Qe7', line: 'a3 Ngxe5 axb4 Nd3#' },
  { goal: 'Budapest Gambit', side: 'b', line: 'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+' },
  // The Sicilian world
  { goal: 'Sicilian Dragon', side: 'b', line: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O' },
  { goal: 'Magnus Smith Trap', side: 'w', before: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bc4 g6', line: 'Nxc6 bxc6 e5 dxe5 Bxf7+ Kxf7 Qxd8' },
  { goal: 'Rossolimo Attack', side: 'w', line: 'e4 c5 Nf3 Nc6 Bb5 g6 Bxc6 dxc6 d3 Bg7 h3' },
  { goal: 'Alapin Sicilian', side: 'w', line: 'e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3' },
  { goal: 'Answer the Alapin', side: 'b', line: 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6' },
  { goal: 'Grand Prix Attack', side: 'w', line: 'e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bb5' },
  { goal: 'Answer the Grand Prix Attack', side: 'b', line: 'e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bb5 Nd4' },
  { goal: 'Smith-Morra Gambit', side: 'w', line: 'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4' },
  { goal: 'Decline the Smith-Morra Gambit', side: 'b', line: 'e4 c5 d4 cxd4 c3 Nf6 e5 Nd5' },
  { goal: 'Siberian Trap', side: 'b', before: 'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 e6 Bc4 Qc7 O-O Nf6 Qe2 Ng4', line: 'h3 Nd4 Nxd4 Qh2#' },
  // Gambits, and how to answer them
  { goal: "King's Gambit", side: 'w', line: 'e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5' },
  { goal: "Decline the King's Gambit", side: 'b', line: 'e4 e5 f4 Bc5 Nf3 d6 c3 Nf6' },
  { goal: 'Danish Gambit', side: 'w', line: 'e4 e5 d4 exd4 c3 dxc3 Bc4 cxb2 Bxb2' },
  { goal: 'Decline the Danish Gambit', side: 'b', line: 'e4 e5 d4 exd4 c3 d5 exd5 Qxd5 cxd4 Nc6 Nf3 Bg4' },
  { goal: 'Evans Gambit', side: 'w', line: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4' },
  { goal: 'Evans Gambit Accepted', side: 'b', line: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 d6' },
  { goal: 'Scotch Gambit', side: 'w', line: 'e4 e5 Nf3 Nc6 d4 exd4 Bc4 Nf6 e5 d5 Bb5 Ne4 Nxd4' },
  { goal: 'Centre Game', side: 'w', line: 'e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6 Nc3' },
  { goal: 'Answer the Centre Game', side: 'b', line: 'e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6 Nc3 Bb4 Bd2 O-O' },
  { goal: 'Vienna Game', side: 'w', line: 'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3' },
  // More systems and the right replies
  { goal: 'Pirc Defence', side: 'b', line: 'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O' },
  { goal: 'Austrian Attack against the Pirc', side: 'w', line: 'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3' },
  { goal: "Alekhine's Defence", side: 'b', line: 'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6' },
  { goal: "Alekhine's Defence as White", side: 'w', line: 'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O' },
  { goal: "Bishop's Opening", side: 'w', line: 'e4 e5 Bc4 Nf6 d3 c6 Nf3 d5 Bb3' },
  { goal: 'Answer the Ponziani', side: 'b', line: 'e4 e5 Nf3 Nc6 c3 d5' },
  { goal: 'Ruy Lopez Exchange Variation', side: 'w', line: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4' },
  { goal: 'Win the Pawn Back in the Exchange Ruy Lopez', side: 'b', before: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6', line: 'Nxe5 Qd4 Nf3 Qxe4+' },
  { goal: 'Berlin Defence', side: 'b', line: 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5' },
  { goal: 'Answer the Steinitz Variation', side: 'w', before: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', line: 'Qh4 Nb5 Bb4+ Bd2 Qxe4+ Be2 Kd8 O-O' },
  // Traps the masters set
  { goal: 'Advance French Queen Trap', side: 'w', before: 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Bd3 cxd4 cxd4', line: 'Nxd4 Nxd4 Qxd4 Bb5+' },
  { goal: 'Tarrasch Trap', side: 'w', before: 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O d6 d4 Bd7 Nc3 Be7 Re1', line: 'O-O Bxc6 Bxc6 dxe5 dxe5 Qxd8 Raxd8 Nxe5' },
  { goal: 'Monticelli Trap', side: 'w', before: 'd4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Bb4+ Bd2 Bxd2+ Qxd2 O-O Nc3 Ne4 Qc2', line: 'Nxc3 Ng5 Ne4 Bxe4 Bxe4 Qxe4 Qxg5 Qxa8' },
  { goal: 'Fishing Pole Trap', side: 'b', before: 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Ng4 h3 h5', line: 'hxg4 hxg4 Ne1 Qh4 f3 g3' },
  { goal: 'Englund Gambit Trap', side: 'b', before: 'd4 e5 dxe5 Nc6 Nf3 Qe7', line: 'Bf4 Qb4+ Bd2 Qxb2 Bc3 Bb4 Qd2 Bxc3 Qxc3 Qc1#' },
  { goal: 'Elephant Trap', side: 'b', before: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5', line: 'Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Bxd2+ Kxd2 Kxd8' },
  { goal: 'Benko Gambit', side: 'b', line: 'd4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6' },
  { goal: 'Stafford Gambit Trap', side: 'b', before: 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6', line: 'd3 Bc5 Bg5 Nxe4 Bxd8 Bxf2+ Ke2 Bg4#' },
  { goal: "Noah's Ark Trap", side: 'b', before: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 d4 b5 Bb3 Nxd4 Nxd4 exd4', line: 'Qxd4 c5 Qd5 Be6 Qc6+ Bd7 Qd5 c4' },
  { goal: 'Lasker Trap', side: 'b', before: 'd4 d5 c4 e5 dxe5 d4', line: 'e3 Bb4+ Bd2 dxe3 Bxb4 exf2+ Ke2 fxg1=N+' },
];

export const CURATED: Record<string, Line[]> = { openings: OPENINGS };

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A hand-made line as a stored puzzle (UCI moves); throws on an illegal or unfinished line. */
export function toPuzzle(module: string, l: Line, rating: number): Puzzle {
  const chess = new Chess();
  for (const san of (l.before ?? '').split(' ').filter(Boolean)) chess.move(san);
  const fen = chess.fen();
  const playerFirst = chess.turn() === l.side;
  const moves = l.line.split(' ').map((san) => {
    const m = chess.move(san);
    return `${m.from}${m.to}${m.promotion ?? ''}`;
  });
  // the line ends with the player's move
  if (moves.length % 2 !== (playerFirst ? 1 : 0)) throw new Error(`${l.goal}: the line must end with the player's move`);
  return { id: `${module}-${slug(l.goal)}`, fen, moves: moves.join(' '), rating, ...(playerFirst ? { playerFirst } : {}), goal: l.goal };
}

// the order is the difficulty: 400 for the first line, 12 more for each next one
const ratingAt = (i: number) => 400 + i * 12;

export const curatedPuzzles = (module: string): Puzzle[] => (CURATED[module] ?? []).map((l, i) => toPuzzle(module, l, ratingAt(i)));
