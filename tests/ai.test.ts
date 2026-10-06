import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/ai/board.ts';

// Standard perft positions (chessprogramming.org/Perft_Results)
const PERFT: Array<[string, string, number[]]> = [
  ['start', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];

for (const [name, fen, counts] of PERFT) {
  test(`perft: ${name}`, () => {
    const board = new Board(fen);
    counts.forEach((expected, i) => assert.equal(board.perft(i + 1), expected, `depth ${i + 1}`));
  });
}

import { Chess } from 'chess.js';
import { chooseMove, estimateAccuracy } from '../src/ai/search.ts';

test('AI finds mate in one and takes a free queen', () => {
  // Scholar's mate pattern: Qxf7#
  assert.equal(chooseMove('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1', 4), 'f3f7');
  // black queen hangs on d4 to the knight on f3? (Nxd4 wins it)
  assert.equal(chooseMove('rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1', 3), 'f3d4');
});

test('AI only plays legal moves, at every level, through a whole game', () => {
  const game = new Chess();
  let level = 1;
  while (!game.isGameOver() && game.history().length < 60) {
    const uci = chooseMove(game.fen(), level);
    assert.ok(uci, 'a move');
    game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); // throws if illegal
    level = (level % 3) + 1;
  }
});

test('accuracy estimate: solid play scores higher than blunders', () => {
  const solid = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5', 'e1g1', 'd7d6'];
  const blunders = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  const good = estimateAccuracy(solid, 'w')!;
  const bad = estimateAccuracy(blunders, 'w')!;
  assert.ok(good > bad, `solid ${good} vs blunders ${bad}`);
  assert.ok(bad < 70, `blunders ${bad}`);
});
