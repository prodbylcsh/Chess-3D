import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BONUS_COINS,
  MODULES,
  bonusFor,
  completionItem,
  moduleOf,
  playerSide,
  puzzleCoins,
  rightMove,
  solves,
  stars,
  type Puzzle,
} from '../supabase/functions/_shared/puzzles.ts';

// the example in the Lichess puzzle database's documentation: Black's king steps up, White mates in two
const mateIn2: Puzzle = { id: '00sHx', fen: 'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17', moves: 'e8d7 a2e6 d7d8 f7f8', rating: 1760 };

test('modules: six, only the first free, each with its own colour', () => {
  assert.equal(MODULES.length, 6);
  assert.deepEqual(MODULES.filter((m) => m.free).map((m) => m.id), ['first-steps']);
  assert.equal(new Set(MODULES.map((m) => m.color)).size, 6);
  assert.equal(moduleOf('forks')?.name, 'Forks');
  assert.equal(moduleOf('nope'), null);
});

test('coins: 25 to 50 by difficulty, 500 for every tenth solve', () => {
  assert.equal(puzzleCoins(400), 25);
  assert.equal(puzzleCoins(1400), 38);
  assert.equal(puzzleCoins(2400), 50);
  assert.equal(puzzleCoins(3000), 50);
  assert.deepEqual([bonusFor(9), bonusFor(10), bonusFor(11), bonusFor(100)], [0, BONUS_COINS, 0, BONUS_COINS]);
});

test('stars: three for a clean solve, fewer with mistakes or hints', () => {
  assert.equal(stars(0, 0), 3);
  assert.equal(stars(1, 0), 2);
  assert.equal(stars(0, 1), 2);
  assert.equal(stars(2, 0), 1);
  assert.equal(stars(1, 1), 1);
});

test('the player plays the side to move after the opponent\'s first move', () => {
  assert.equal(playerSide(mateIn2), 'w');
});

test('solutions: the right moves, or any checkmate at the end', () => {
  assert.ok(solves(mateIn2, ['a2e6', 'f7f8']));
  assert.ok(!solves(mateIn2, ['a2e6']), 'not finished');
  assert.ok(!solves(mateIn2, ['f7g7', 'a2e6']), 'wrong first move');
  assert.ok(!solves(mateIn2, ['a2e6', 'f7f6']), 'not mate');
  assert.ok(!solves(mateIn2, ['a2e6', 'e1e8']), 'illegal');
  assert.ok(rightMove(mateIn2, [], 'a2e6'));
  assert.ok(!rightMove(mateIn2, [], 'f7g7'));
  assert.ok(rightMove(mateIn2, ['a2e6'], 'f7f8'));
});

test('the finishing reward: one of the items the player lacks, at random', () => {
  assert.equal(completionItem(['a', 'b', 'c'], 0), 'a');
  assert.equal(completionItem(['a', 'b', 'c'], 0.99), 'c');
  assert.equal(completionItem([], 0.5), null, 'owns everything: coins instead');
});

test('every puzzle of every module is solved by its own solution', async () => {
  const { PUZZLES } = await import('../supabase/functions/_shared/server/puzzle-data.ts');
  for (const m of MODULES) {
    const list = PUZZLES[m.id];
    assert.equal(list.length, 100, m.id);
    assert.ok(list.every((p, i) => i === 0 || list[i - 1].rating <= p.rating), `${m.id}: easiest first`);
    for (const p of list) {
      const answers = p.moves.split(' ').filter((_, i) => i % 2 === 1);
      assert.ok(solves(p, answers), `${m.id} ${p.id}`);
    }
  }
});
