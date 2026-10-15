// Hand-made puzzles that modules start with (`select.curated` in _shared/puzzles.ts);
// scripts/puzzles/build.ts adds them to the module's Lichess puzzles by rating.
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
  rating: number;
}

// Openings: the main lines for White from the first move and Black's best answers, the
// fastest mates, gambits and the traps every player falls into once.
const OPENINGS: Line[] = [
  { goal: "Fool's Mate", side: 'b', before: 'f3 e5', line: 'g4 Qh4#', rating: 400 },
  { goal: "Scholar's Mate", side: 'w', line: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#', rating: 450 },
  { goal: "Stop the Scholar's Mate", side: 'b', before: 'e4 e5 Bc4 Nc6', line: 'Qh5 g6 Qf3 Nf6', rating: 500 },
  { goal: 'Smothered Mate in the Caro-Kann', side: 'w', before: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2', line: 'Ngf6 Nd6#', rating: 520 },
  { goal: 'Italian Game', side: 'w', line: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4', rating: 550 },
  { goal: 'Two Knights Defence', side: 'b', line: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5', rating: 580 },
  { goal: 'Scotch Game', side: 'w', line: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5', rating: 600 },
  { goal: "Queen's Gambit", side: 'w', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3', rating: 620 },
  { goal: 'Sicilian Defence: Najdorf', side: 'b', line: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', rating: 650 },
  { goal: 'London System', side: 'w', line: 'd4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2', rating: 680 },
  { goal: 'French Defence', side: 'b', line: 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7', rating: 700 },
  { goal: 'Petrov Trap', side: 'w', before: 'e4 e5 Nf3 Nf6 Nxe5', line: 'Nxe4 Qe2 Nf6 Nc6+', rating: 720 },
  { goal: 'Caro-Kann Defence', side: 'b', line: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6', rating: 750 },
  { goal: 'Ruy Lopez', side: 'w', line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1', rating: 780 },
  { goal: 'Scandinavian Defence', side: 'b', line: 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6', rating: 800 },
  { goal: 'Punish the Damiano Defence', side: 'w', before: 'e4 e5 Nf3', line: 'f6 Nxe5 fxe5 Qh5+ g6 Qxe5+', rating: 820 },
  { goal: "King's Indian Defence", side: 'b', line: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O', rating: 850 },
  { goal: 'English Opening', side: 'w', line: 'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2', rating: 870 },
  { goal: "Queen's Gambit Declined", side: 'b', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O', rating: 900 },
  { goal: "Légal's Mate", side: 'w', before: 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3', line: 'g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#', rating: 920 },
  { goal: 'Slav Defence', side: 'b', line: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4', rating: 950 },
  { goal: "King's Gambit", side: 'w', line: 'e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5', rating: 980 },
  { goal: 'Nimzo-Indian Defence', side: 'b', line: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O', rating: 1000 },
  { goal: 'Blackburne Shilling Trap', side: 'b', before: 'e4 e5 Nf3 Nc6 Bc4 Nd4', line: 'Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#', rating: 1020 },
  { goal: 'Vienna Game', side: 'w', line: 'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3', rating: 1050 },
  { goal: "Petrov's Defence", side: 'b', line: 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5', rating: 1080 },
  { goal: 'Fried Liver Attack', side: 'w', before: 'e4 e5 Nf3 Nc6 Bc4', line: 'Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3', rating: 1100 },
  { goal: 'Danish Gambit', side: 'w', line: 'e4 e5 d4 exd4 c3 dxc3 Bc4 cxb2 Bxb2', rating: 1120 },
  { goal: 'Dutch Defence', side: 'b', line: 'd4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O', rating: 1150 },
  { goal: 'Kieninger Trap', side: 'b', before: 'd4 Nf6 c4 e5 dxe5 Ng4 Nf3 Nc6 Bf4 Bb4+ Nbd2 Qe7', line: 'a3 Ngxe5 axb4 Nd3#', rating: 1180 },
  { goal: 'Berlin Defence', side: 'b', line: 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5', rating: 1200 },
  { goal: 'Evans Gambit', side: 'w', line: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4', rating: 1230 },
  { goal: 'Budapest Gambit', side: 'b', line: 'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+', rating: 1260 },
  { goal: 'Englund Gambit Trap', side: 'b', before: 'd4 e5 dxe5 Nc6 Nf3 Qe7', line: 'Bf4 Qb4+ Bd2 Qxb2 Bc3 Bb4 Qd2 Bxc3 Qxc3 Qc1#', rating: 1300 },
  { goal: 'Elephant Trap', side: 'b', before: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5', line: 'Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Bxd2+ Kxd2 Kxd8', rating: 1330 },
  { goal: 'Benko Gambit', side: 'b', line: 'd4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6', rating: 1360 },
  { goal: 'Stafford Gambit Trap', side: 'b', before: 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6', line: 'd3 Bc5 Bg5 Nxe4 Bxd8 Bxf2+ Ke2 Bg4#', rating: 1400 },
  { goal: 'Siberian Trap', side: 'b', before: 'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 e6 Bc4 Qc7 O-O Nf6 Qe2 Ng4', line: 'h3 Nd4 Nxd4 Qh2#', rating: 1450 },
  { goal: "Noah's Ark Trap", side: 'b', before: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 d4 b5 Bb3 Nxd4 Nxd4 exd4', line: 'Qxd4 c5 Qd5 Be6 Qc6+ Bd7 Qd5 c4', rating: 1500 },
  { goal: 'Lasker Trap', side: 'b', before: 'd4 d5 c4 e5 dxe5 d4', line: 'e3 Bb4+ Bd2 dxe3 Bxb4 exf2+ Ke2 fxg1=N+', rating: 1550 },
];

export const CURATED: Record<string, Line[]> = { openings: OPENINGS };

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A hand-made line as a stored puzzle (UCI moves); throws on an illegal or unfinished line. */
export function toPuzzle(module: string, l: Line): Puzzle {
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
  return { id: `${module}-${slug(l.goal)}`, fen, moves: moves.join(' '), rating: l.rating, ...(playerFirst ? { playerFirst } : {}), goal: l.goal };
}

export const curatedPuzzles = (module: string): Puzzle[] => (CURATED[module] ?? []).map((l) => toPuzzle(module, l));
