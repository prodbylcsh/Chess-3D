import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELAYED_KINDS,
  WATCH_DELAY_PLIES,
  canWatch,
  spectatorMoves,
  watchDelay,
  watcherCount,
  type WatchSeat,
} from '../supabase/functions/_shared/spectate.ts';
import { profileUpdate, type ProfileRow } from '../supabase/functions/_shared/accounts.ts';

const MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'];

test('ranked and coin games are two moves behind while they run', () => {
  assert.equal(WATCH_DELAY_PLIES, 4);
  assert.equal(WATCH_DELAY_PLIES % 2, 0, 'an even delay keeps the side to move the same');
  for (const kind of ['ranked', 'wager']) {
    assert.equal(watchDelay(kind, 'active'), 4);
    assert.deepEqual(spectatorMoves(MOVES, kind, 'active'), ['e2e4', 'e7e5']);
    assert.deepEqual(spectatorMoves(MOVES.slice(0, 3), kind, 'active'), []);
    // over: everything
    assert.deepEqual(spectatorMoves(MOVES, kind, 'finished'), MOVES);
  }
});

test('friend and casual games are live', () => {
  for (const kind of ['friend', 'casual', undefined]) {
    assert.equal(watchDelay(kind, 'active'), 0);
    assert.deepEqual(spectatorMoves(MOVES, kind, 'active'), MOVES);
  }
});

test('every player must allow watching', () => {
  const seat = (over: Partial<WatchSeat> = {}): WatchSeat => ({ policy: 'everyone', friend: false, blocked: false, ...over });
  assert.ok(canWatch([seat(), seat()]));
  assert.ok(canWatch([seat(), seat({ policy: null })]), 'a guest has no setting');
  assert.ok(!canWatch([seat(), seat({ policy: 'nobody', friend: true })]));
  assert.ok(!canWatch([seat({ policy: 'friends' }), seat()]));
  assert.ok(canWatch([seat({ policy: 'friends', friend: true }), seat()]));
  assert.ok(!canWatch([seat({ blocked: true }), seat()]));
});

test('watchers are everyone connected but the players', () => {
  assert.equal(watcherCount(['w', 'b', 'x', 'y'], 'w', 'b'), 2);
  assert.equal(watcherCount(['w'], 'w', null), 0);
  assert.equal(watcherCount([], 'w', 'b'), 0);
});

test('the migration uses the same delay and kinds', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261025090000_spectating.sql', import.meta.url), 'utf8');
  const kinds = DELAYED_KINDS.map((k) => `'${k}'`).join(', ');
  const rule = `when new.status = 'active' and new.kind in (${kinds}) then ${WATCH_DELAY_PLIES} else 0 end`;
  assert.ok(sql.includes(rule), 'trigger');
  assert.ok(sql.includes(`when g.status = 'active' and g.kind in (${kinds}) then ${WATCH_DELAY_PLIES} else 0 end`), 'backfill');
});

test('players choose who may watch their games', () => {
  const row: ProfileRow = {
    id: 'u1',
    username: 'alice',
    icon_id: 'knight',
    onboarding_step: 4,
    onboarded_at: '2026-10-01T00:00:00Z',
    username_changed_at: null,
    created_at: '2026-10-01T00:00:00Z',
    watch: 'everyone',
  };
  assert.deepEqual(profileUpdate(row, { watch: 'friends' }), { watch: 'friends' });
  assert.deepEqual(profileUpdate(row, { watch: 'everyone' }), {});
  assert.throws(() => profileUpdate(row, { watch: 'all' as never }), /Invalid setting/);
});
