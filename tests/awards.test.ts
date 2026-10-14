import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AWARDS, awardProgress, awardsMet } from '../supabase/functions/_shared/awards.ts';

const fresh = { wins: 0, losses: 0, draws: 0, best_streak: 0, mmr: 1000 };

test('counted awards: wins, games and streaks', () => {
  assert.deepEqual(awardsMet(fresh), []);
  assert.deepEqual(awardsMet({ ...fresh, wins: 1 }), ['first-win']);
  assert.deepEqual(awardsMet({ ...fresh, wins: 10, best_streak: 5 }).sort(), ['first-win', 'streak-5', 'wins-10']);
  assert.ok(awardsMet({ ...fresh, wins: 100, losses: 300, draws: 100 }).includes('games-500'));
  const wins10 = AWARDS.find((a) => a.id === 'wins-10')!;
  assert.deepEqual(awardProgress(wins10, { ...fresh, wins: 4 }), [4, 10]);
  assert.deepEqual(awardProgress(wins10, { ...fresh, wins: 40 }), [10, 10], 'capped at the goal');
});

test('rank awards: reaching gold, platinum and diamond', () => {
  assert.deepEqual(awardsMet({ ...fresh, mmr: 1199 }), []);
  assert.deepEqual(awardsMet({ ...fresh, mmr: 1200 }), ['tier-gold']);
  assert.deepEqual(awardsMet({ ...fresh, mmr: 2500 }), ['tier-gold', 'tier-platinum', 'tier-diamond']);
});

test('game awards: precision and a quick checkmate', () => {
  assert.ok(awardsMet(fresh, { accuracy: 90 }).includes('accuracy-90'));
  assert.ok(!awardsMet(fresh, { accuracy: 89.9 }).includes('accuracy-90'));
  const mate = { outcome: 'win', reason: 'checkmate', plies: 40, accuracy: null } as const;
  assert.ok(awardsMet(fresh, mate).includes('quick-mate'));
  assert.ok(!awardsMet(fresh, { ...mate, plies: 41 }).includes('quick-mate'), '20 moves = 40 half-moves at most');
  assert.ok(!awardsMet(fresh, { ...mate, outcome: 'loss' }).includes('quick-mate'));
  assert.ok(!awardsMet(fresh, { ...mate, reason: 'resignation' }).includes('quick-mate'));
});
