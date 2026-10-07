import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOADOUT, FREE_ITEMS, ITEMS, PRICE_RANGES, itemDef, purchaseProblem } from '../supabase/functions/_shared/shop.ts';

test('item ids are unique', () => {
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
});

test('prices stay inside the agreed range of their category', () => {
  for (const i of ITEMS.filter((x) => x.forSale)) {
    const [min, max] = PRICE_RANGES[i.category];
    assert.ok(i.price >= min && i.price <= max, `${i.id}: ${i.price}`);
  }
});

test('the default loadout is free and in the right categories', () => {
  for (const [category, id] of Object.entries(DEFAULT_LOADOUT)) {
    assert.equal(itemDef(id)?.category, category);
    assert.ok(FREE_ITEMS.includes(id));
  }
  // every category has exactly one free item, except icons (the six starters)
  for (const category of ['pieces', 'board', 'background', 'moveAnimation', 'destruction']) {
    assert.equal(ITEMS.filter((i) => i.category === category && i.price === 0).length, 1);
  }
  assert.equal(ITEMS.filter((i) => i.category === 'icon' && i.price === 0).length, 6);
});

test('purchase rules', () => {
  assert.equal(purchaseProblem('frost-set', [], 21_999), 'coins');
  assert.equal(purchaseProblem('frost-set', [], 22_000), null);
  assert.equal(purchaseProblem('frost-set', ['frost-set'], 99_999), 'owned');
  assert.equal(purchaseProblem('marble-set', [], 99_999), 'owned');
  assert.equal(purchaseProblem('season-2-iron', [], 99_999), 'not-for-sale');
  assert.equal(purchaseProblem('nope', [], 99_999), 'unknown');
});
