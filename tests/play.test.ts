import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  CONTROLS,
  FIRST_MOVE_MS,
  MIN_PAID_PLIES,
  canMate,
  clocksAfterMove,
  isControl,
  newPlayer,
  remaining,
  rollSeasons,
  settle,
  timeoutEnd,
  type Clocks,
  type PlayerState,
} from '../supabase/functions/_shared/play.ts';
import { claim, move, type GameRow } from '../supabase/functions/_shared/rules.ts';
import { showcaseOf } from '../supabase/functions/_shared/social.ts';

const T0 = Date.UTC(2026, 9, 11, 12);
const quiet = { flags: 'n' };
const rapid = (white = 600_000, black = 600_000, at = T0): Clocks => ({ control: 'rapid', white, black, turnStartedAt: at });
const player = (id: string, over: Partial<PlayerState> = {}): PlayerState => ({ ...newPlayer(id, new Date(T0)), ...over });

test('time controls per game kind', () => {
  assert.ok(isControl('casual', 'fast'));
  assert.ok(!isControl('ranked', 'fast'), 'fast blitz is casual only');
  assert.ok(isControl('wager', 'classical'));
  assert.ok(!isControl('ranked', 'bullet'));
  assert.equal(CONTROLS.rapid.baseMs, 600_000);
  assert.equal(CONTROLS.rapid.incrementMs, 5_000);
});

test('first moves: 30 s each, no clock, no increment; later moves use the clock', () => {
  const c = rapid();
  assert.equal(remaining(c, 'w', 0, T0 + 10_000), FIRST_MOVE_MS - 10_000);
  const afterWhite = clocksAfterMove(c, 'w', 0, T0 + 10_000, quiet) as Clocks;
  assert.equal(afterWhite.white, 600_000, 'first move costs nothing');
  assert.equal(afterWhite.turnStartedAt, T0 + 10_000 + 1_500, 'the reply waits for the animation');
  assert.equal(clocksAfterMove(c, 'w', 0, T0 + FIRST_MOVE_MS + 1, quiet), 'aborted');

  const later = rapid(600_000, 600_000, T0);
  const next = clocksAfterMove(later, 'w', 4, T0 + 20_000, { flags: 'c' }) as Clocks;
  assert.equal(next.white, 600_000 - 20_000 + 5_000, 'time used, increment added');
  assert.equal(next.turnStartedAt, T0 + 20_000 + 3_000, 'captures animate longest');
  assert.equal(clocksAfterMove(rapid(5_000), 'w', 4, T0 + 6_000, quiet), 'flagged');
});

test('timeouts: a loss, a draw when the opponent cannot mate, aborted before the first moves', () => {
  const chess = new Chess();
  assert.deepEqual(timeoutEnd(chess, 1), { result: null, reason: 'aborted' });
  assert.deepEqual(timeoutEnd(chess, 10), { result: '0-1', reason: 'timeout' }, 'white to move ran out');
  const bare = new Chess('8/8/8/4k3/8/8/8/4K2N w - - 0 1'); // white: king + knight, black: bare king
  assert.ok(!canMate(bare, 'b'));
  assert.ok(!canMate(bare, 'w'), 'a lone knight cannot mate');
  assert.equal(timeoutEnd(new Chess('8/8/8/4k3/8/8/8/4K2N b - - 0 1'), 10).result, '1/2-1/2');
  assert.equal(timeoutEnd(new Chess('8/8/8/4k3/8/8/8/R3K3 b - - 0 1'), 10).result, '1-0');
});

test('server game rules: moves update the clocks; claims end a game only when time is up', () => {
  const row: GameRow = {
    id: 'g', white_id: 'w', black_id: 'b', white_name: 'W', black_name: 'B', moves: ['e2e4', 'e7e5'], fen: '', status: 'active',
    result: null, reason: null, draw_offer: null, rematch_id: null, version: 3, kind: 'ranked', control: 'rapid',
    clock_w: 600_000, clock_b: 600_000, turn_started_at: new Date(T0).toISOString(), stake: null,
  };
  const p = move(row, 'w', { from: 'g1', to: 'f3' }, T0 + 12_000);
  assert.equal(p.clock_w, 600_000 - 12_000 + 5_000);
  assert.throws(() => claim(row, 'b', T0 + 60_000), /still time/);
  const ended = claim(row, 'b', T0 + 600_001);
  assert.equal(ended.result, '0-1');
  assert.equal(ended.reason, 'timeout');
  const late = move(row, 'w', { from: 'g1', to: 'f3' }, T0 + 700_000);
  assert.equal(late.status, 'finished', 'a move after the flag ends the game instead');
});

test('settlement: ranked changes MMR and pays coins; short games pay no coins', () => {
  const [w, b] = settle({ kind: 'ranked', stake: null, result: '1-0', plies: 40, white: player('w'), black: player('b') });
  assert.equal(w.outcome, 'win');
  assert.equal(w.mmr?.total, 20);
  assert.equal(w.after.mmr, 1020);
  assert.equal(w.coins?.total, 100);
  assert.equal(w.after.coins, 600);
  assert.equal(w.after.wins, 1);
  assert.equal(b.mmr?.total, -18);
  assert.equal(b.coins?.total, 50);
  assert.equal(b.after.win_streak, 0);

  const [sw, sb] = settle({ kind: 'ranked', stake: null, result: '0-1', plies: MIN_PAID_PLIES - 1, white: player('w'), black: player('b') });
  assert.equal(sw.after.mmr, 982, 'MMR still counts');
  assert.equal(sb.coinsDelta, 0, 'no coins under the limit');
  assert.equal(sb.after.coins, 500);
});

test('settlement: casual pays coins only; coin games move the pot; aborted games change nothing', () => {
  const [w] = settle({ kind: 'casual', stake: null, result: '1/2-1/2', plies: 30, white: player('w'), black: player('b') });
  assert.equal(w.mmr, null);
  assert.equal(w.coins?.total, 75);

  // stakes of 500 were taken when the game started
  const [ww, wb] = settle({ kind: 'wager', stake: 500, result: '1-0', plies: 8, white: player('w', { coins: 0 }), black: player('b', { coins: 0 }) });
  assert.equal(ww.wager, 400);
  assert.equal(ww.after.coins, 900, 'pot of 1,000 minus the 10% fee');
  assert.equal(wb.wager, -500);
  assert.equal(wb.after.coins, 0);
  const [dw] = settle({ kind: 'wager', stake: 500, result: '1/2-1/2', plies: 30, white: player('w', { coins: 0 }), black: player('b', { coins: 0 }) });
  assert.equal(dw.after.coins, 500, 'a draw refunds');

  const [aw] = settle({ kind: 'wager', stake: 100, result: null, plies: 1, white: player('w', { coins: 0 }), black: player('b') });
  assert.equal(aw.outcome, null);
  assert.equal(aw.after.coins, 100, 'aborted: stake back');
  assert.equal(aw.after.wins + aw.after.losses + aw.after.draws, 0);
});

test('seasons roll over lazily: reward by peak, MMR pulled to 1,000, streaks reset', () => {
  const p = player('x', { season: 1, mmr: 1500, season_peak_mmr: 1650, win_streak: 4, ranked_streak: 2 });
  const { after, grants } = rollSeasons(p, [], new Date(Date.UTC(2026, 9, 11)));
  assert.equal(after.season, 2);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].bracket, 'gold-platinum', 'peak 1,650 is Platinum');
  assert.ok(grants[0].coins >= 2000);
  assert.equal(after.mmr, 1500 - Math.round(500 * 0.25));
  assert.equal(after.win_streak, 0);
  assert.equal(after.coins, p.coins + grants[0].coins);
  assert.ok(grants[0].items.includes('season-1-gold-platinum'));
  assert.deepEqual(rollSeasons(after, [], new Date(Date.UTC(2026, 9, 11))).grants, [], 'only once');
});

test('the public showcase comes from the real state', () => {
  const s = showcaseOf({ mmr: 1250, wins: 3, losses: 1, draws: 0, win_streak: 2, ranked_streak: 2, best_streak: 2 }, { pieces: 'nope' });
  assert.deepEqual(s.rank, { tier: 'gold', division: 4, progress: 0.5 });
  assert.equal(s.loadout.pieces, 'marble-set');
  assert.equal(s.stats.winStreak, 2);
});
