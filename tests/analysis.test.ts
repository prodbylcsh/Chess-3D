import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANALYSIS, accuracies, encodeScore, isReport, positions, sameReport } from '../supabase/functions/_shared/analysis.ts';
import { MIN_PAID_PLIES, newPlayer, performanceAdjustment, settle, type FinishedGame } from '../supabase/functions/_shared/play.ts';

const T0 = new Date(Date.UTC(2026, 9, 13, 12));

test('engine scores are stored from White\'s point of view, mates beyond every centipawn score', () => {
  assert.equal(encodeScore('cp', 35, true), 35);
  assert.equal(encodeScore('cp', 35, false), -35, 'Black to move and better: White is worse');
  assert.equal(encodeScore('mate', 3, true), ANALYSIS.mate - 3);
  assert.equal(encodeScore('mate', -2, true), -(ANALYSIS.mate - 2));
  assert.equal(encodeScore('mate', 1, false), -(ANALYSIS.mate - 1), 'Black mates in one');
  assert.ok(encodeScore('cp', 50_000, true) < encodeScore('mate', 99, true), 'a huge score is still less than a mate');
});

test('positions of a game, with the end scored by the rules', () => {
  const fools = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  const mate = positions(fools);
  assert.equal(mate.fens.length, 5);
  assert.equal(mate.fens[0], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(mate.final, -ANALYSIS.mate, 'White is mated');

  const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
  assert.equal(positions(shuffle).final, 0, 'threefold repetition is a draw the engine cannot see');
  assert.equal(positions(['e2e4']).final, null, 'an open position is up to the engine');
});

test('reports must fit the game and come from the agreed engine', () => {
  const report = { engine: ANALYSIS.engine, scores: [20, 30, 25] };
  assert.ok(isReport(report, 2));
  assert.ok(!isReport(report, 3), 'one score per position');
  assert.ok(!isReport({ ...report, engine: 'other' }, 2));
  assert.ok(!isReport({ ...report, scores: [20, 30.5, 25] }, 2), 'whole numbers only');
  assert.ok(!isReport({ ...report, scores: [20, 30, ANALYSIS.mate + 1] }, 2));
  assert.ok(!isReport(null, 2));
  assert.ok(sameReport(report, { engine: ANALYSIS.engine, scores: [20, 30, 25] }));
  assert.ok(!sameReport(report, { engine: ANALYSIS.engine, scores: [20, 30, 26] }));
});

test('accuracy per side from the scores', () => {
  // White keeps the balance; Black blunders the queen on its second move
  const scores = [20, 25, 20, 30, 900, 880, 890];
  const acc = accuracies(scores);
  assert.ok(acc.w! > 90, `white ${acc.w}`);
  assert.ok(acc.b! < 60, `black ${acc.b}`);
  assert.deepEqual(accuracies([20]), { w: null, b: null }, 'no moves, no accuracy');
});

const finished = (over: Partial<FinishedGame> = {}): FinishedGame => ({
  kind: 'ranked',
  stake: null,
  result: '1-0',
  plies: 60,
  white: { ...newPlayer('white', T0), mmr: 1000 },
  black: { ...newPlayer('black', T0), mmr: 1000 },
  ...over,
});

test('the analysis adds only the performance part of a settled game', () => {
  const game = finished();
  const [w, b] = performanceAdjustment(game, { w: 100, b: 35 });
  assert.equal(w.mmrDelta, 4, 'perfect play: +20% of the 20-point baseline');
  assert.equal(w.coinsDelta, 20, '+20% of the 100-coin win');
  assert.equal(w.mmr!.total, 24);
  assert.equal(b.mmrDelta, -2, 'poor play loses a little more');
  assert.equal(b.coinsDelta, -5);

  const neutral = performanceAdjustment(game, { w: 70, b: null });
  assert.deepEqual([neutral[0].mmrDelta, neutral[0].coinsDelta, neutral[1].mmrDelta, neutral[1].coinsDelta], [0, 0, 0, 0]);

  // the settlement with accuracy equals the neutral one plus the adjustment
  const full = settle({ ...game, accuracy: { w: 100, b: 35 } });
  const plain = settle(game);
  assert.equal(full[0].mmr!.total, plain[0].mmr!.total + w.mmrDelta);
  assert.equal(full[0].after.win_streak, plain[0].after.win_streak, 'streaks do not change');
});

test('casual games adjust coins only; short games pay nothing either way', () => {
  const [w] = performanceAdjustment(finished({ kind: 'casual' }), { w: 100, b: 70 });
  assert.equal(w.mmrDelta, 0);
  assert.equal(w.mmr, null);
  assert.equal(w.coinsDelta, 20);
  const [short] = performanceAdjustment(finished({ plies: MIN_PAID_PLIES - 1 }), { w: 100, b: 70 });
  assert.equal(short.coinsDelta, 0);
  assert.equal(short.mmrDelta, 4, 'MMR counts for short games too');
});
