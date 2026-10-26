import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, reviewGame, worse, type EnginePosition } from '../src/features/review/review.ts';

// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
const MOVES = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];
const POSITIONS: EnginePosition[] = [
  { best: 'e2e4', score: 30 },
  { best: 'e7e5', score: 30 },
  { best: 'g1f3', score: 35 },
  { best: 'b8c6', score: -40 },
  { best: 'f1c4', score: -30 },
  { best: 'g7g6', score: 20 }, // Black must stop the mate
  { best: 'h5f7', score: 9_999 }, // mate in one for White
  { best: '', score: 10_000 },
];

test('Game Review: each move judged by the drop in the mover’s winning chance', () => {
  const review = reviewGame(MOVES, POSITIONS);
  assert.deepEqual(
    review.moves.map((m) => [m.san, m.kind]),
    [
      ['e4', 'best'],
      ['e5', 'best'],
      ['Qh5', 'inaccuracy'],
      ['Nc6', 'best'],
      ['Bc4', 'best'],
      ['Nf6', 'blunder'],
      ['Qxf7#', 'great'],
    ],
  );
  // the better move is said by its piece: the pawn, not a square
  const nf6 = review.moves[5];
  assert.equal(nf6.better?.uci, 'g7g6');
  assert.equal(nf6.better?.piece, 'p');
  assert.equal(nf6.side, 'b');
  assert.ok(nf6.loss > 40);
  assert.deepEqual(review.keys, [5, 6], 'the blunder and the move that punished it');
  assert.deepEqual(worse(review.counts.b), { inaccuracies: 0, mistakes: 0, blunders: 1, great: 0 });
  assert.deepEqual(worse(review.counts.w), { inaccuracies: 1, mistakes: 0, blunders: 0, great: 1 });
});

test('Game Review: the kinds by loss', () => {
  assert.deepEqual([0, 3, 7, 15, 30].map(kindOf), ['best', 'good', 'inaccuracy', 'mistake', 'blunder']);
});
