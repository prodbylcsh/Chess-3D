import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MMR,
  gameAccuracy,
  mmrChange,
  performanceFactor,
  rankMove,
  rankOf,
  streakShare,
} from '../supabase/functions/_shared/rating.ts';
import { coinReward, paysCoins, wagerNet } from '../supabase/functions/_shared/economy.ts';

const even = { mmr: 1000, opponentMmr: 1000, accuracy: 70, winStreak: 0 };

test('baseline: +20 for a win, -18 for a loss against an equal opponent', () => {
  assert.equal(mmrChange({ ...even, outcome: 'win' }).total, 20);
  assert.equal(mmrChange({ ...even, outcome: 'loss' }).total, -18);
  assert.equal(mmrChange({ ...even, outcome: 'draw' }).total, 0);
});

test("the spec's example: 0 MMR beats 100 MMR → 20 + 10", () => {
  const c = mmrChange({ outcome: 'win', mmr: 0, opponentMmr: 100, accuracy: 70, winStreak: 0 });
  assert.equal(c.difference, 10);
  assert.equal(c.total, 30);
});

test('rating difference: upsets move more, expected results less, within caps', () => {
  const win = (opp: number) => mmrChange({ ...even, opponentMmr: opp, outcome: 'win' }).total;
  const loss = (opp: number) => mmrChange({ ...even, opponentMmr: opp, outcome: 'loss' }).total;
  assert.equal(win(1100), 30); // beat a stronger player
  assert.equal(win(900), 10); // beat a weaker player
  assert.equal(loss(1100), -8); // lose to a stronger player
  assert.equal(loss(900), -28); // lose to a weaker player
  assert.equal(win(3000), 50); // upset bonus capped at +30
  assert.equal(win(0), 5); // expected win reduced by at most 15
  assert.equal(loss(3000), -3); // expected loss reduced by at most 15
  assert.equal(loss(0), -48); // upset loss capped at -30 extra
});

test('a win never loses MMR and a loss never gains', () => {
  const w = mmrChange({ outcome: 'win', mmr: 2000, opponentMmr: 0, accuracy: 0, winStreak: 0 });
  assert.equal(w.total, MMR.minWin);
  const l = mmrChange({ outcome: 'loss', mmr: 0 + 500, opponentMmr: 5000, accuracy: 100, winStreak: 0 });
  assert.equal(l.total, -MMR.minLoss);
});

test('performance: up to ±20% of the baseline, scaled by accuracy', () => {
  assert.equal(performanceFactor(100), 1);
  assert.equal(performanceFactor(70), 0);
  assert.equal(performanceFactor(0), -1);
  assert.equal(performanceFactor(85), 0.5);
  assert.equal(performanceFactor(null), 0);
  assert.equal(mmrChange({ ...even, outcome: 'win', accuracy: 100 }).performance, 4);
  assert.equal(mmrChange({ ...even, outcome: 'win', accuracy: 0 }).performance, -4);
  // playing well softens a loss, playing badly deepens it
  assert.equal(mmrChange({ ...even, outcome: 'loss', accuracy: 100 }).total, -14);
  assert.equal(mmrChange({ ...even, outcome: 'loss', accuracy: 0 }).total, -22);
});

test('win streak: +10% from the 3rd win, +2% per further win, capped at 30%', () => {
  assert.equal(streakShare(2), 0);
  assert.equal(streakShare(3), 0.1);
  assert.equal(streakShare(4), 0.12);
  assert.equal(streakShare(10), 0.24);
  assert.equal(streakShare(50), 0.3);
  const third = mmrChange({ ...even, outcome: 'win', winStreak: 2 });
  assert.equal(third.streak, 2);
  assert.equal(third.total, 22);
  assert.equal(third.winStreakAfter, 3);
  assert.equal(mmrChange({ ...even, outcome: 'loss', winStreak: 7 }).winStreakAfter, 0);
  assert.equal(mmrChange({ ...even, outcome: 'draw', winStreak: 7 }).winStreakAfter, 7);
});

test('MMR stays within 0 … 1,000,000', () => {
  assert.equal(mmrChange({ outcome: 'loss', mmr: 5, opponentMmr: 5, winStreak: 0 }).mmrAfter, 0);
  assert.equal(mmrChange({ outcome: 'loss', mmr: 5, opponentMmr: 5, winStreak: 0 }).total, -5);
  assert.equal(mmrChange({ outcome: 'win', mmr: 999_990, opponentMmr: 999_990, winStreak: 0 }).mmrAfter, 1_000_000);
});

test('ranks', () => {
  assert.equal(rankOf(0).label, 'Iron IV');
  assert.equal(rankOf(399).label, 'Iron I');
  assert.equal(rankOf(1000).label, 'Silver II');
  assert.equal(rankOf(1050).progress, 0.5);
  assert.equal(rankOf(2799).label, 'Diamond I');
  assert.equal(rankOf(2800).label, 'Master');
  assert.equal(rankOf(3650).label, 'Challenger');
  assert.equal(rankOf(1_000_000).label, 'Challenger');
  assert.equal(rankMove(1095, 1115), 1);
  assert.equal(rankMove(1105, 1090), -1);
  assert.equal(rankMove(1010, 1030), 0);
});

test('accuracy model', () => {
  assert.equal(gameAccuracy([]), null);
  assert.equal(gameAccuracy([{ before: 30, after: 30 }, { before: 0, after: 10 }]), 100);
  const blunder = gameAccuracy([{ before: 30, after: 30 }, { before: 50, after: -600 }])!;
  assert.ok(blunder < 60, `blunder accuracy ${blunder}`);
});

test('coins', () => {
  assert.equal(coinReward({ kind: 'casual', outcome: 'win', accuracy: 70 }).total, 100);
  assert.equal(coinReward({ kind: 'casual', outcome: 'loss', accuracy: 70 }).total, 50);
  assert.equal(coinReward({ kind: 'casual', outcome: 'win', accuracy: 100 }).total, 120);
  // ranked adds the rating difference: +10% per 100 MMR, capped
  assert.equal(coinReward({ kind: 'ranked', outcome: 'win', accuracy: 70, mmr: 1000, opponentMmr: 1200 }).total, 120);
  assert.equal(coinReward({ kind: 'ranked', outcome: 'win', accuracy: 70, mmr: 1000, opponentMmr: 3000 }).difference, 50);
  // casual ignores ratings; streaks use the same percentages as MMR
  assert.equal(coinReward({ kind: 'casual', outcome: 'win', accuracy: 70, mmr: 1000, opponentMmr: 3000 }).difference, 0);
  assert.equal(coinReward({ kind: 'casual', outcome: 'win', accuracy: 70, winStreak: 3 }).streak, 12);
  // worst case: 50 - 10 (performance) - 12 (difference) = 28; never below half the baseline
  assert.equal(coinReward({ kind: 'ranked', outcome: 'loss', accuracy: 0, mmr: 3000, opponentMmr: 0 }).total, 28);
  assert.ok(coinReward({ kind: 'ranked', outcome: 'loss', accuracy: 0, mmr: 3000, opponentMmr: 0 }).total >= 25);
  assert.equal(paysCoins('ai'), false);
  assert.equal(coinReward({ kind: 'friend', outcome: 'win' }).total, 0);
  assert.equal(wagerNet(500, 'win'), 400);
  assert.equal(wagerNet(500, 'loss'), -500);
  assert.equal(wagerNet(500, 'draw'), 0);
});

import { seasonReset } from '../supabase/functions/_shared/rating.ts';

test('season reset pulls MMR 25% of the way back to 1,000', () => {
  assert.equal(seasonReset(1800), 1600);
  assert.equal(seasonReset(600), 700);
  assert.equal(seasonReset(1000), 1000);
});
