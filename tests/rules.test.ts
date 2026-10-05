import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../supabase/functions/_shared/rules.ts';
import type { GameRow, Patch } from '../supabase/functions/_shared/rules.ts';

const W = 'user-white';
const B = 'user-black';

function game(over: Partial<GameRow> = {}): GameRow {
  return {
    id: 'g', white_id: W, black_id: B, white_name: 'W', black_name: 'B', moves: [],
    fen: rules.replay([]).fen(), status: 'active', result: null, reason: null,
    draw_offer: null, rematch_id: null, version: 0, ...over,
  };
}
const apply = (row: GameRow, patch: Patch): GameRow => ({ ...row, ...patch, version: row.version + 1 });
function play(row: GameRow, ...uci: string[]): GameRow {
  for (const m of uci) {
    const user = rules.replay(row.moves).turn() === 'w' ? W : B;
    row = apply(row, rules.move(row, user, { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }));
  }
  return row;
}
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as rules.RuleError).code; }
  return 'no error';
};

test('legal moves are recorded in UCI with the new FEN', () => {
  const row = play(game(), 'e2e4', 'e7e5');
  assert.deepEqual(row.moves, ['e2e4', 'e7e5']);
  assert.equal(row.fen, 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
});

test('rejects illegal moves, wrong turn, outsiders', () => {
  assert.equal(code(() => rules.move(game(), W, { from: 'e2', to: 'e5' })), 'illegal_move');
  assert.equal(code(() => rules.move(game(), B, { from: 'e7', to: 'e5' })), 'not_your_turn');
  assert.equal(code(() => rules.move(game(), 'stranger', { from: 'e2', to: 'e4' })), 'not_a_player');
  assert.equal(code(() => rules.move(game({ status: 'waiting', black_id: null }), W, { from: 'e2', to: 'e4' })), 'not_started');
});

test("fool's mate finishes the game", () => {
  const row = play(game(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.equal(row.status, 'finished');
  assert.equal(row.result, '0-1');
  assert.equal(row.reason, 'checkmate');
  assert.equal(code(() => rules.move(row, W, { from: 'a2', to: 'a3' })), 'game_over');
});

test('promotion and castling', () => {
  let row = play(game(), 'a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'b8c6', 'b7a8n');
  assert.equal(row.moves.at(-1), 'b7a8n');
  assert.equal(rules.replay(row.moves).get('a8')?.type, 'n');
  row = play(game(), 'e2e4', 'e7e5', 'g1f3', 'g8f6', 'f1c4', 'f8c5', 'e1g1');
  assert.equal(row.moves.at(-1), 'e1g1');
  assert.equal(rules.replay(row.moves).get('f1')?.type, 'r');
});

test('threefold repetition is detected from the move history', () => {
  const row = play(game(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  assert.equal(row.status, 'finished');
  assert.equal(row.reason, 'threefold repetition');
});

test('draw offers', () => {
  let row = apply(game(), rules.offerDraw(game(), W));
  assert.equal(row.draw_offer, 'w');
  assert.equal(code(() => rules.acceptDraw(row, W)), 'no_offer');
  // moving keeps your own offer, replying with a move declines theirs
  row = play(row, 'e2e4');
  assert.equal(row.draw_offer, 'w');
  row = play(row, 'e7e5');
  assert.equal(row.draw_offer, null);
  row = apply(row, rules.offerDraw(row, B));
  row = apply(row, rules.declineDraw(row, W));
  assert.equal(row.draw_offer, null);
  row = apply(row, rules.offerDraw(row, B));
  row = apply(row, rules.offerDraw(row, W)); // counter-offer = accept
  assert.equal(row.result, '1/2-1/2');
  assert.equal(row.reason, 'agreement');
});

test('resignation', () => {
  const row = apply(game(), rules.resign(game(), W));
  assert.equal(row.result, '0-1');
  assert.equal(row.reason, 'resignation');
});

test('joining', () => {
  const waiting = game({ black_id: null, black_name: null, status: 'waiting' });
  assert.equal(rules.join(waiting, W, 'x'), null); // creator re-opening their link
  const joined = apply(waiting, rules.join(waiting, B, '  Bob   the  Rook ')!);
  assert.equal(joined.status, 'active');
  assert.equal(joined.black_name, 'Bob the Rook');
  assert.equal(code(() => rules.join(joined, 'third', 'x')), 'game_full');
  assert.equal(rules.cleanName('   '), 'Anonymous');
  assert.equal(rules.cleanName('x'.repeat(50)).length, 24);
});

test('rematch swaps colours', () => {
  assert.equal(code(() => rules.rematch(game(), W)), 'not_finished');
  const over = apply(game(), rules.resign(game(), B));
  assert.deepEqual(rules.rematch(over, W), { black_id: W, black_name: 'W' });
  assert.equal(code(() => rules.rematch(over, 'stranger')), 'not_a_player');
});
