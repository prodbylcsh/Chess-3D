import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRACKETS, NO_REPEAT_SEASONS, bracketOf, pickSeasonRewards, resetAfterSeason, resetShare, rewardHistory, seasonAt, type RewardCandidate } from '../supabase/functions/_shared/seasons.ts';
import { seasonRewardPool } from '../supabase/functions/_shared/shop.ts';

test('reset schedule: 25%, every 4th season 50%, every 12th a full reset', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 8, 11, 12, 16, 24, 36].map(resetShare), [0.25, 0.25, 0.25, 0.5, 0.25, 0.5, 0.25, 1, 0.5, 1, 1]);
  assert.equal(resetAfterSeason(1800, 1), 1600);
  assert.equal(resetAfterSeason(600, 2), 700);
  assert.equal(resetAfterSeason(1800, 4), 1400);
  assert.equal(resetAfterSeason(2600, 12), 1000);
  assert.equal(resetAfterSeason(40, 12), 1000);
});

test('ranks share rewards in brackets', () => {
  assert.equal(bracketOf('bronze').id, bracketOf('silver').id);
  assert.equal(bracketOf('gold').id, bracketOf('platinum').id);
  assert.notEqual(bracketOf('silver').id, bracketOf('gold').id);
  for (let i = 1; i < BRACKETS.length; i++) assert.ok(BRACKETS[i].coins > BRACKETS[i - 1].coins);
});

const POOL: RewardCandidate[] = Array.from({ length: 30 }, (_, i) => ({ id: `item-${i}`, category: ['pieces', 'board', 'destruction'][i % 3], price: 4000 + i * 1300 }));
const price = (id: string | null) => POOL.find((p) => p.id === id)?.price ?? 0;

test('season rewards: higher brackets never get cheaper items, all distinct', () => {
  for (let season = 1; season <= 40; season++) {
    const rewards = pickSeasonRewards(season, POOL, []);
    const items = rewards.map((r) => r.item);
    assert.equal(new Set(items).size, items.length);
    for (let i = 1; i < rewards.length; i++) assert.ok(price(items[i]) >= price(items[i - 1]), `season ${season}`);
    assert.ok(rewards.every((r) => r.badge.startsWith(`season-${season}-`)));
  }
});

test('season rewards never repeat an item from the previous 3 seasons', () => {
  const given: string[][] = [];
  for (let season = 1; season <= 60; season++) {
    const items = pickSeasonRewards(season, POOL, given).map((r) => r.item!);
    const recent = new Set(given.slice(-NO_REPEAT_SEASONS).flat());
    assert.ok(items.every((i) => i && !recent.has(i)), `season ${season}`);
    given.push(items);
  }
});

test('season rewards are deterministic and degrade gracefully with a small pool', () => {
  assert.deepEqual(pickSeasonRewards(7, POOL, []), pickSeasonRewards(7, POOL, []));
  const small = pickSeasonRewards(1, POOL.slice(0, 3), []).map((r) => r.item);
  assert.deepEqual(small, [null, null, null, 'item-0', 'item-1', 'item-2']);
});

test('season calendar: 3-month seasons from July 2026', () => {
  const at = (iso: string) => seasonAt(new Date(iso));
  assert.equal(at('2026-07-01T00:00:00Z').number, 1);
  assert.equal(at('2026-09-30T23:59:59Z').number, 1);
  const s2 = at('2026-10-07T12:00:00Z');
  assert.equal(s2.number, 2);
  assert.equal(s2.start.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(s2.end.toISOString(), '2027-01-01T00:00:00.000Z');
  assert.equal(at('2027-01-01T00:00:00Z').number, 3);
  assert.equal(at('2029-06-30T00:00:00Z').number, 12);
});

test('reward history with the real shop pool keeps every guarantee', () => {
  const pool = seasonRewardPool();
  const history = rewardHistory(24, pool);
  const cost = (id: string | null) => pool.find((p) => p.id === id)?.price ?? 0;
  history.forEach((rewards, i) => {
    const items = rewards.map((r) => r.item).filter((x) => x);
    assert.equal(new Set(items).size, items.length);
    for (let b = 1; b < rewards.length; b++) assert.ok(cost(rewards[b].item) >= cost(rewards[b - 1].item), `season ${i + 1}`);
    const recent = new Set(history.slice(Math.max(0, i - NO_REPEAT_SEASONS), i).flatMap((r) => r.map((x) => x.item)));
    assert.ok(items.every((id) => !recent.has(id)), `season ${i + 1} repeats an item`);
  });
});
