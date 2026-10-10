import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_MAX, isGameId, messageBody, pairOf, parseShowcase } from '../supabase/functions/_shared/social.ts';

const showcase = {
  rank: { tier: 'silver', division: 2, progress: 0.4 },
  stats: { wins: 3, losses: 1, draws: 0, winStreak: 2, rankedStreak: 1, bestStreak: 2 },
  loadout: { pieces: 'marble-set', board: 'marble-board', background: 'candlelit-study', moveAnimation: 'glide', destruction: 'shatter' },
};

test('pairs are stored in one order', () => {
  assert.deepEqual(pairOf('b', 'a'), ['a', 'b']);
  assert.deepEqual(pairOf('a', 'b'), ['a', 'b']);
});

test('messages: trimmed, not empty (unless an invite), not too long', () => {
  assert.deepEqual(messageBody('  hi  ', false), { text: 'hi' });
  assert.deepEqual(messageBody('   ', false), { problem: 'empty' });
  assert.deepEqual(messageBody('', true), { text: '' });
  assert.deepEqual(messageBody(42, false), { problem: 'empty' });
  assert.deepEqual(messageBody('x'.repeat(MESSAGE_MAX + 1), false), { problem: 'too_long' });
  assert.ok(isGameId('abc23xyz9k'));
  assert.ok(!isGameId('../etc') && !isGameId('ABC123') && !isGameId(null));
});

test('showcase: a valid snapshot passes, rounded', () => {
  const parsed = parseShowcase({ ...showcase, rank: { tier: 'silver', division: 2, progress: 0.123456 } });
  assert.equal(parsed?.rank.progress, 0.123);
  assert.deepEqual(parsed?.stats, showcase.stats);
});

test('showcase: apex tiers have no division; bad values are refused', () => {
  assert.equal(parseShowcase({ ...showcase, rank: { tier: 'master', division: 3, progress: 0.5 } })?.rank.division, null);
  assert.equal(parseShowcase({ ...showcase, rank: { tier: 'wizard', division: 1, progress: 0 } }), null);
  assert.equal(parseShowcase({ ...showcase, rank: { tier: 'gold', division: 5, progress: 0 } }), null);
  assert.equal(parseShowcase({ ...showcase, rank: { tier: 'gold', division: 1, progress: 2 } }), null);
  assert.equal(parseShowcase({ ...showcase, stats: { ...showcase.stats, wins: -1 } }), null);
  assert.equal(parseShowcase({ ...showcase, stats: { ...showcase.stats, wins: 1.5 } }), null);
  assert.equal(parseShowcase(null), null);
  assert.equal(parseShowcase('x'), null);
});

test('showcase: unknown or wrong-slot items fall back to the defaults', () => {
  const parsed = parseShowcase({ ...showcase, loadout: { ...showcase.loadout, pieces: 'nope', board: 'marble-set' } });
  assert.equal(parsed?.loadout.pieces, 'marble-set');
  assert.equal(parsed?.loadout.board, 'marble-board');
});
