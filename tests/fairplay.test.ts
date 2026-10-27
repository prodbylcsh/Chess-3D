import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { BY_MMR, FAIRPLAY, NEUTRAL_MMR, barFor, gameSignals, matchZ, median, review, reviewMmr, type GameSignals, type ReviewedGame } from '../supabase/functions/_shared/fairplay.ts';
import { ANALYSIS, isReport, sameReport } from '../supabase/functions/_shared/analysis.ts';
import { move, type GameRow } from '../supabase/functions/_shared/rules.ts';

/** A legal game of `plies` plies that never ends early, the same every run. */
function longGame(plies: number, seed = 7): string[] {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (;;) {
    const chess = new Chess();
    const moves: string[] = [];
    while (moves.length < plies) {
      const legal = chess.moves({ verbose: true });
      if (!legal.length) break;
      const m = legal[Math.floor(rand() * legal.length)];
      chess.move(m);
      if (chess.isGameOver()) {
        chess.undo();
        break;
      }
      moves.push(m.lan);
    }
    if (moves.length === plies) return moves;
  }
}

/** Another legal move than the one played at each position ('' when there is none). */
function otherChoices(moves: string[]): string[] {
  const chess = new Chess();
  const best: string[] = [];
  for (const uci of moves) {
    best.push(chess.moves({ verbose: true }).find((m) => m.lan !== uci)?.lan ?? '');
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }
  return [...best, ''];
}

const GAME = longGame(60);
const ZEROS = Array(GAME.length + 1).fill(0);

test('only the player\'s moves after the opening, with a choice, in undecided positions are counted', () => {
  const engine = gameSignals({ moves: GAME, scores: ZEROS, best: [...GAME, ''], color: 'w', moveMs: null, away: null });
  const ownAfterOpening = GAME.filter((_, i) => i % 2 === 0 && i >= FAIRPLAY.openingPlies).length;
  assert.ok(engine.counted > 0 && engine.counted <= ownAfterOpening);
  assert.equal(engine.matched, engine.counted, 'every move was the engine\'s choice');
  assert.equal(engine.accuracy, 100);

  const human = gameSignals({ moves: GAME, scores: ZEROS, best: otherChoices(GAME), color: 'w', moveMs: null, away: null });
  assert.equal(human.counted, engine.counted);
  assert.equal(human.matched, 0);

  const decided = gameSignals({ moves: GAME, scores: ZEROS.map(() => 900), best: [...GAME, ''], color: 'b', moveMs: null, away: null });
  assert.equal(decided.counted, 0, 'a decided position says little');

  const old = gameSignals({ moves: GAME, scores: ZEROS, best: null, color: 'w', moveMs: null, away: null });
  assert.equal(old.counted, 0, 'a report without first choices gives no match rate');
});

test('think times come from the server; taking back at once is an obvious move', () => {
  // 1. e4 d5 2. exd5 Qxd5: Black takes back on d5
  const moves = ['e2e4', 'd7d5', 'e4d5', 'd8d5'];
  const s = gameSignals({ moves, scores: [0, 0, 0, 0, 0], best: null, color: 'b', moveMs: [1000, 2000, 3000, 4000], away: null });
  assert.deepEqual(s.times, [4000], 'the first move of each side is not timed');
  assert.deepEqual(s.obvious, [4000]);
  const missing = gameSignals({ moves, scores: [0, 0, 0, 0, 0], best: null, color: 'b', moveMs: [3000, 4000], away: null });
  assert.deepEqual(missing.times, [], 'times that do not cover the game are ignored');
});

test('moves made after leaving the game are counted with their match', () => {
  const away = GAME.map((_, i) => (i % 2 === 0 && i >= 30 ? 10_000 : i % 2 === 0 ? 500 : 0));
  const s = gameSignals({ moves: GAME, scores: ZEROS, best: [...GAME, ''], color: 'w', moveMs: null, away });
  assert.ok(s.away > 0);
  assert.equal(s.away, s.awayMatched);
  assert.ok(s.away < s.counted, 'half a second away does not count');
});

const signals = (o: Partial<GameSignals>): GameSignals => ({
  counted: 25,
  matched: 11,
  quiet: 12,
  quietMatched: 4,
  accuracy: 75,
  times: [4000, 9000, 2000, 15000, 6000, 3000, 20000, 5000, 7000, 1000],
  obvious: [800, 1200],
  found: [6000],
  away: 0,
  awayMatched: 0,
  ...o,
});
const games = (n: number, o: Partial<GameSignals> = {}, source: ReviewedGame['source'] = 'agreed'): ReviewedGame[] =>
  Array.from({ length: n }, () => ({ signals: signals(o), source }));

test('an ordinary player is not flagged', () => {
  const r = review(games(20), null);
  assert.equal(r.level, 0);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.stats.games, 20);
  assert.equal(r.stats.matchRate, 0.44);
});

test('finding the engine\'s choice far above a strong human, over many moves', () => {
  const r = review(games(8, { matched: 22, quietMatched: 10, accuracy: 96 }), null);
  const ids = r.reasons.map((x) => x.id);
  assert.ok(ids.includes('engine_match') && ids.includes('engine_game') && ids.includes('quiet_match') && ids.includes('high_accuracy'));
  assert.ok(r.level >= FAIRPLAY.reviewLevel);
  assert.equal(r.reasons.find((x) => x.id === 'engine_match')!.points, 3);
  // the same rate over too few moves says nothing yet
  assert.ok(!review(games(2, { matched: 21 }), null).reasons.some((x) => x.id === 'engine_match'));
});

test('the bar falls as the evidence grows', () => {
  assert.ok(matchZ(40, 60, 0.5)! < matchZ(400, 600, 0.5)!);
  assert.ok(matchZ(30, 60, 0.5)! === 0);
  assert.equal(matchZ(0, 0, 0.5), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('relaying moves to another device: obvious moves as slow as the rest', () => {
  const relay = review(games(5, { times: [12000, 14000, 11000, 13000, 12500], obvious: [11000, 12000] }), null);
  assert.ok(relay.reasons.some((x) => x.id === 'steady_timing'));
  assert.equal(relay.stats.obviousMs, 11500);
  assert.ok(!review(games(5), null).reasons.some((x) => x.id === 'steady_timing'), 'quick obvious moves are human');
});

test('leaving the game and coming back with the engine\'s move', () => {
  const left = review(games(5, { away: 6, awayMatched: 6 }), null);
  assert.deepEqual(left.reasons.find((x) => x.id === 'left_game'), { id: 'left_game', points: 2 });
  const wandering = review(games(5, { away: 6, awayMatched: 2 }), null);
  assert.deepEqual(wandering.reasons.find((x) => x.id === 'left_game'), { id: 'left_game', points: 1 });
});

test('a sudden jump in accuracy', () => {
  const r = review([...games(5, { accuracy: 93 }), ...games(10, { accuracy: 70 })], null);
  assert.ok(r.reasons.some((x) => x.id === 'accuracy_jump'));
  assert.equal(r.stats.recentAccuracy, 93);
  assert.equal(r.stats.earlierAccuracy, 70);
});

test('the bar follows MMR: fewer engine moves expected low, more at the top', () => {
  assert.deepEqual(barFor(null), barFor(NEUTRAL_MMR));
  assert.equal(barFor(1000).humanMatch, 0.36);
  assert.equal(barFor(800).humanMatch, 0.34, 'interpolated between the anchors');
  assert.equal(barFor(0).humanMatch, BY_MMR.humanMatch[0]);
  assert.equal(barFor(9000).humanMatch, BY_MMR.humanMatch.at(-1));
  for (const key of ['humanMatch', 'gameMatch', 'gameAccuracy', 'quietMatch', 'highAccuracy'] as const) {
    assert.ok(barFor(600)[key] < barFor(3200)[key], `${key} rises with MMR`);
  }
  // obvious moves and hard moves: the stronger the player, the quicker they are expected to be
  assert.ok(barFor(600).obviousMs > barFor(3200).obviousMs);
  assert.ok(barFor(600).foundRatio > barFor(3200).foundRatio);

  // the same games: suspicious for a Bronze player, normal for a Grandmaster
  const same = games(20, { matched: 12 });
  assert.equal(review(same, 3200).level, 0);
  const low = review(same, 700);
  assert.ok(low.reasons.some((x) => x.id === 'engine_match'));
  assert.equal(low.stats.mmr, 700);
  assert.equal(low.stats.humanMatch, 0.33);
});

test('MMR counts once ranked runs and the player has played enough of it', () => {
  assert.equal(reviewMmr(1800, false, 50), null, 'ranked closed: everyone is near 1,000, MMR says nothing');
  assert.equal(reviewMmr(1800, true, FAIRPLAY.rankedGames - 1), null);
  assert.equal(reviewMmr(1800, true, FAIRPLAY.rankedGames), 1800);
});

test('timing by MMR: a relay, and hard moves found too fast for the rank', () => {
  const slowObvious = games(5, { obvious: [2800, 2800], times: [4300, 4300, 4300] });
  assert.ok(review(slowObvious, 3200).reasons.some((x) => x.id === 'steady_timing'), 'a top player takes back at once');
  assert.ok(!review(slowObvious, 600).reasons.some((x) => x.id === 'steady_timing'), 'a beginner may well think it over');

  const quick = games(5, { quietMatched: 8, found: [3000, 3500] });
  const low = review(quick, 1000);
  assert.ok(low.reasons.some((x) => x.id === 'fast_precision'));
  assert.equal(low.stats.foundMs, 3250);
  assert.ok(!review(quick, 3200).reasons.some((x) => x.id === 'fast_precision'), 'top players find hard moves quickly');
});

test('games judged only by the opponent\'s report are counted for the operator', () => {
  const r = review([...games(3), ...games(2, {}, 'opponent')], null);
  assert.equal(r.stats.fromOpponent, 2);
});

test('reports may carry the engine\'s choices and the player\'s away times', () => {
  const scores = [0, 10, 20];
  const base = { engine: ANALYSIS.engine, scores };
  assert.ok(isReport(base, 2), 'an older app sends scores only');
  assert.ok(isReport({ ...base, best: ['e2e4', 'e7e5', ''], away: [0, 0] }, 2));
  assert.ok(!isReport({ ...base, best: ['e2e4', 'e7e5'] }, 2), 'one choice per position');
  assert.ok(!isReport({ ...base, best: ['e2e4', 'hello', ''] }, 2));
  assert.ok(!isReport({ ...base, away: [0, -1] }, 2));
  assert.ok(sameReport({ ...base, best: ['e2e4', 'e7e5', ''], away: [0, 900] }, { ...base, best: ['e2e4', 'e7e5', ''], away: [700, 0] }), 'away times are each player\'s own');
  assert.ok(!sameReport({ ...base, best: ['e2e4', 'e7e5', ''] }, { ...base, best: ['d2d4', 'e7e5', ''] }));
  assert.ok(sameReport(base, { ...base, best: ['e2e4', 'e7e5', ''] }));
});

test('the server keeps each move\'s think time in games with clocks', () => {
  const start = Date.parse('2026-10-27T10:00:00Z');
  const row: GameRow = {
    id: 'g', white_id: 'a', black_id: 'b', white_name: 'A', black_name: 'B', moves: [], fen: new Chess().fen(),
    status: 'active', result: null, reason: null, draw_offer: null, rematch_id: null, version: 1,
    kind: 'ranked', control: 'blitz', clock_w: 300_000, clock_b: 300_000, turn_started_at: new Date(start).toISOString(),
  };
  const first = move(row, 'a', { from: 'e2', to: 'e4' }, start + 4_200);
  assert.deepEqual(first.move_ms, [4200]);
  const second = move({ ...row, ...first, moves: first.moves! }, 'b', { from: 'e7', to: 'e5' }, Date.parse(first.turn_started_at!) + 7_000);
  assert.deepEqual(second.move_ms, [4200, 7000]);
  const friend = move({ ...row, kind: 'friend', control: null, clock_w: null, clock_b: null, turn_started_at: null }, 'a', { from: 'e2', to: 'e4' });
  assert.equal(friend.move_ms, undefined);
});
