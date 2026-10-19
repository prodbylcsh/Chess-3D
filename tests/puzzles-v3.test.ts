// Reviews, the daily puzzle and its streak, "why not?", the stuck offer and the haptic
// patterns (docs/PLATFORM.md §4.2 and §7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_COINS,
  MODULES,
  PUZZLES_PER_MODULE,
  STREAK_TIERS,
  dailyCoins,
  dailyPuzzle,
  dayOf,
  liveStreak,
  nextMilestone,
  nextStreak,
  reviewCounts,
  reviewFrom,
  streakMilestone,
  streakTier,
} from '../supabase/functions/_shared/puzzles.ts';
import { whyNot } from '../src/features/puzzles/whyNot.ts';
import { stuckness } from '../src/features/puzzles/stuck.ts';
import { reviewReady, reviewWaiting, nextOpen } from '../src/features/puzzles/review.ts';
import { FEEL, PIECE_FEEL, captureFeel, lossFeel, moveFeel, streakFeel } from '../src/audio/haptics.ts';

const H = 3600_000;

test('review: stars improve only 20 hours after the last try', () => {
  const tried = '2026-10-20T10:00:00.000Z';
  const at = Date.parse(tried);
  assert.equal(reviewCounts(null), true, 'never tried');
  assert.equal(reviewCounts(tried, at + 1 * H), false, 'right after: practice');
  assert.equal(reviewCounts(tried, at + 19.9 * H), false);
  assert.equal(reviewCounts(tried, at + 20 * H), true);
  assert.equal(reviewFrom(2, tried), '2026-10-21T06:00:00.000Z');
  assert.equal(reviewFrom(3, tried), null, 'nothing to improve');
  assert.equal(reviewFrom(0, null), null);
});

test('review: ready and waiting lists, the next open puzzle skips seen ones', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  const n = PUZZLES_PER_MODULE;
  const stars = Array.from({ length: n }, () => 0);
  const seen = Array.from({ length: n }, () => false);
  const reviewFrom_ = Array.from({ length: n }, (): string | null => null);
  stars[0] = 3;
  stars[1] = 1;
  reviewFrom_[1] = '2026-10-21T06:00:00Z'; // ready
  stars[2] = 2;
  reviewFrom_[2] = '2026-10-22T06:00:00Z'; // waiting
  seen[3] = true;
  reviewFrom_[3] = '2026-10-21T11:00:00Z'; // seen, ready
  const p = { id: 'x', unlocked: true, stars, seen, reviewFrom: reviewFrom_, completedAt: null, reward: null };
  assert.deepEqual(reviewReady(p, now), [1, 3]);
  assert.deepEqual(reviewWaiting(p, now), { count: 1, next: '2026-10-22T06:00:00Z' });
  assert.equal(nextOpen(p), 4, 'the seen puzzle counts as passed');
});

test('daily puzzle: the same for everyone, easier on Monday than on Sunday', () => {
  assert.equal(dayOf(Date.parse('2026-10-19T23:59:00Z')), '2026-10-19');
  const monday = dailyPuzzle('2026-10-19');
  const sunday = dailyPuzzle('2026-10-25');
  assert.deepEqual(dailyPuzzle('2026-10-19'), monday);
  assert.ok(monday.index < 14 && sunday.index >= 84, `${monday.index} ${sunday.index}`);
  const seen = new Set<string>();
  for (let d = 0; d < 28; d++) {
    const p = dailyPuzzle(dayOf(Date.parse('2026-11-02T00:00:00Z') + d * 24 * H));
    assert.ok(MODULES.some((m) => m.id === p.module) && p.index >= 0 && p.index < PUZZLES_PER_MODULE);
    seen.add(p.module);
  }
  assert.equal(seen.size, MODULES.length, 'every module comes up');
});

test('streak: days in a row, a gap starts again, best is kept', () => {
  let s = nextStreak(null, '2026-10-19');
  assert.deepEqual(s, { current: 1, best: 1, lastDay: '2026-10-19' });
  s = nextStreak(s, '2026-10-19');
  assert.equal(s.current, 1, 'once a day');
  s = nextStreak(s, '2026-10-20');
  s = nextStreak(s, '2026-10-21');
  assert.equal(s.current, 3);
  assert.equal(liveStreak(s, '2026-10-22'), 3, 'today not solved yet: still alive');
  assert.equal(liveStreak(s, '2026-10-23'), 0, 'a day missed: broken');
  s = nextStreak(s, '2026-10-24');
  assert.deepEqual(s, { current: 1, best: 3, lastDay: '2026-10-24' });
  // across a month and a year
  assert.equal(nextStreak({ current: 5, best: 5, lastDay: '2026-12-31' }, '2027-01-01').current, 6);
});

test('streak tiers, milestones and daily coins', () => {
  assert.equal(streakTier(0), -1);
  assert.equal(streakTier(1), 0);
  assert.equal(streakTier(6), 0);
  assert.equal(streakTier(7), 1);
  assert.equal(streakTier(365), 4);
  assert.equal(streakTier(5000), STREAK_TIERS.length - 1);
  assert.equal(streakMilestone(2), null);
  assert.deepEqual(streakMilestone(7), { days: 7, coins: 300 });
  assert.equal(streakMilestone(365)!.item, true);
  assert.deepEqual(streakMilestone(1300), { days: 1300, coins: 10_000 });
  assert.equal(streakMilestone(1350), null);
  assert.equal(nextMilestone(0).days, 3);
  assert.equal(nextMilestone(7).days, 14);
  assert.equal(nextMilestone(1000).days, 1100);
  assert.equal(dailyCoins(0, 2), DAILY_COINS);
  assert.equal(dailyCoins(4, 2), DAILY_COINS - 10, 'every hint used');
});

test('why not: a refuted move, an alternative and a weaker one', () => {
  // Italian Game, White to move after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5: 4.Nxe5? Nxe5 wins a piece
  const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  assert.deepEqual(whyNot(fen, 'f3e5', 40, -250, 'c6e5'), { kind: 'takes', reply: 'c6e5', piece: 'n' });
  assert.deepEqual(whyNot(fen, 'd2d3', 40, 20, 'g8f6'), { kind: 'alternative' });
  assert.deepEqual(whyNot(fen, 'a2a3', 40, -40, 'g8f6'), { kind: 'weaker' });
  // a big advantage either way is a different idea; but where there is a mate, say so
  assert.deepEqual(whyNot(fen, 'd2d3', 1_500, 1_000, 'g8f6'), { kind: 'alternative' });
  assert.deepEqual(whyNot(fen, 'd2d3', 9_997, 1_200, 'g8f6'), { kind: 'missedMate' });
  // the wrong move lets the opponent mate: Fool's Mate, White plays g4 instead of something safe
  const fool = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
  assert.deepEqual(whyNot(fool, 'g2g4', 0, -9_999, 'd8h4'), { kind: 'mate', reply: 'd8h4' });
});

test('stuck: never in the first minute; mistakes, hints and time add up', () => {
  assert.equal(stuckness(9, 9, 50_000, 50_000), false, 'the first minute');
  assert.equal(stuckness(3, 1, 70_000, 30_000), false, '4 points');
  assert.equal(stuckness(3, 1, 70_000, 45_000), true, '4 + one 40 s step');
  assert.equal(stuckness(0, 0, 200_000, 200_000), true, '5 steps of 40 s');
  assert.equal(stuckness(0, 0, 150_000, 150_000), false, 'thinking is fine');
});

test('haptics: own moves stronger than the opponent\'s, a capture rewards, a loss is one flat buzz', () => {
  const total = (p: number[]) => p.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  const quiet = { piece: 'n' as const, flags: 'n', captured: undefined, promotion: undefined };
  assert.deepEqual(moveFeel(quiet, true), PIECE_FEEL.n);
  assert.ok(total(moveFeel(quiet, false)) < total(moveFeel(quiet, true)));
  // each piece feels different
  assert.equal(new Set(Object.values(PIECE_FEEL).map((p) => p.join())).size, 6);
  // bigger captures hit harder; losses are single buzzes, longer for bigger pieces
  assert.ok(total(captureFeel('q')) > total(captureFeel('p')));
  assert.equal(lossFeel('q').length, 1);
  assert.ok(lossFeel('q')[0] > lossFeel('p')[0]);
  assert.deepEqual(moveFeel({ ...quiet, captured: 'r' }, true), captureFeel('r'));
  assert.deepEqual(moveFeel({ ...quiet, captured: 'r' }, false), lossFeel('r'));
  // good news rises, bad news is flat
  assert.ok(FEEL.right[2] > FEEL.right[0]);
  assert.equal(FEEL.wrong.length, 1);
  // a longer streak celebrates longer
  for (let tier = 1; tier < 6; tier++) assert.ok(total(streakFeel(tier)) > total(streakFeel(tier - 1)));
});

test('the next move\'s aim: told before the move, from the position', async () => {
  const { nextGoal } = await import('../src/features/puzzles/intent.ts');
  const { Chess } = await import('chess.js');
  const at = (moves: string) => {
    const c = new Chess();
    let last = null;
    for (const san of moves.split(' ').filter(Boolean)) last = c.move(san);
    return { fen: c.fen(), last };
  };
  const goal = (moves: string, uci: string, opening = true) => {
    const p = at(moves);
    return nextGoal(p.fen, uci, p.last, opening);
  };
  assert.deepEqual(goal('', 'e2e4'), { intent: 'centre' });
  assert.deepEqual(goal('e4 e5', 'g1f3'), { intent: 'threat' }, 'the knight attacks the undefended pawn');
  assert.deepEqual(goal('e4 e5 Nf3', 'b8c6'), { intent: 'defend', piece: 'p' });
  assert.deepEqual(goal('e4 e5 Nf3 Nc6', 'f1c4'), { intent: 'develop' });
  assert.deepEqual(goal('e4 e5 Bc4 Nc6', 'd1h5'), { intent: 'threatMate' });
  assert.deepEqual(goal('e4 e5 Bc4 Nc6 Qh5', 'g7g6'), { intent: 'stopMate' });
  assert.deepEqual(goal('e4 e5 Bc4 Nc6 Qh5 Nf6', 'h5f7'), { intent: 'mate' });
  assert.deepEqual(goal('e4 e5 Nf3 Nc6 d4 exd4', 'f3d4'), { intent: 'recapture' });
  assert.deepEqual(goal('e4 e5 Nf3 Nc6 Bc4 Nf6 Nc3', 'f6e4'), { intent: 'sacrifice' });
  assert.deepEqual(goal('e4 e5 Nf3 Nc6 Bc4 Nf6 Nc3 Nxe4 Nxe4', 'd7d5'), { intent: 'fork' });
  assert.deepEqual(goal('e4 e5 Nf3 Nc6 Bc4 Nf6 O-O Bc5 d3', 'e8g8'), { intent: 'castle' });
  // a check, and a skewer through the king (counted with pins)
  assert.deepEqual(nextGoal('4k3/8/8/8/8/8/8/4K2R w - - 0 1', 'h1h8', null, false), { intent: 'check' });
  assert.deepEqual(nextGoal('8/8/8/q2k4/8/8/8/6KR w - - 0 1', 'h1h5', null, false), { intent: 'pin' });
  // the forks module: its first moves are told as forks
  const { PUZZLES } = await import('../supabase/functions/_shared/server/puzzle-data.ts');
  let fork = 0;
  for (const p of PUZZLES.forks) {
    const c = new Chess(p.fen);
    const line = p.moves.split(' ');
    let last = null;
    if (!p.playerFirst) last = c.move({ from: line[0].slice(0, 2), to: line[0].slice(2, 4), promotion: line[0][4] });
    const first = line[p.playerFirst ? 0 : 1];
    const g = nextGoal(c.fen(), first, last, false);
    if (g.intent === 'fork') fork++;
  }
  assert.ok(fork >= 40, `forks named as forks: ${fork}`);
});
