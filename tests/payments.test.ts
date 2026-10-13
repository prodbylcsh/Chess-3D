import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COIN_PACKS,
  REFUND_DAYS,
  bonusPercent,
  packOf,
  paymentEvent,
  refundable,
  signWebhook,
  transactionBody,
  verifyWebhook,
} from '../supabase/functions/_shared/payments.ts';

test('coin packs: the decided prices, more coins per euro in bigger packs', () => {
  assert.deepEqual(
    COIN_PACKS.map((p) => [p.coins, p.price]),
    [
      [15_000, 499],
      [35_000, 999],
      [75_000, 1999],
      [200_000, 4999],
    ],
  );
  assert.deepEqual(COIN_PACKS.map(bonusPercent), [0, 16, 24, 33]);
  assert.equal(packOf('coins-35k')?.coins, 35_000);
  assert.equal(packOf('coins-1m'), null);
});

test('refunds: within 14 days and only while the coins are still there', () => {
  const day = 86_400_000;
  const bought = { coins: 15_000, completedAt: new Date(0).toISOString() };
  assert.ok(refundable(bought, 15_000, REFUND_DAYS * day));
  assert.ok(!refundable(bought, 15_000, REFUND_DAYS * day + 1), 'too late');
  assert.ok(!refundable(bought, 14_999, day), 'some of the coins were spent');
});

test('a Paddle transaction for a pack carries the price and whose coins they are', () => {
  const body = transactionBody(COIN_PACKS[1], 'player-1');
  assert.deepEqual(body.custom_data, { player_id: 'player-1', pack: 'coins-35k' });
  assert.deepEqual(body.items[0].price.unit_price, { amount: '999', currency_code: 'EUR' });
  assert.equal(body.items[0].quantity, 1);
});

test('webhooks: only Paddle\'s signature on this exact body, and only recent ones', async () => {
  const body = JSON.stringify({ event_type: 'transaction.completed' });
  const now = Date.UTC(2026, 9, 13, 12);
  const header = await signWebhook(body, 'secret', now / 1000);
  assert.ok(await verifyWebhook(header, body, 'secret', now));
  assert.ok(!(await verifyWebhook(header, body + ' ', 'secret', now)), 'changed body');
  assert.ok(!(await verifyWebhook(header, body, 'other', now)), 'other secret');
  assert.ok(!(await verifyWebhook(header, body, 'secret', now + 10 * 60_000)), 'replayed later');
  assert.ok(!(await verifyWebhook(null, body, 'secret', now)));
  assert.ok(!(await verifyWebhook(header, body, '', now)), 'no secret configured');
});

test('webhook events: paid purchases, refunds and chargebacks', () => {
  const paid = paymentEvent({
    event_type: 'transaction.completed',
    data: { id: 'txn_1', status: 'completed', currency_code: 'CZK', custom_data: { player_id: 'p', pack: 'coins-15k' }, details: { totals: { grand_total: '12900' } } },
  });
  assert.deepEqual(paid, { kind: 'paid', transactionId: 'txn_1', playerId: 'p', pack: COIN_PACKS[0], amount: 12900, currency: 'CZK' });
  assert.equal(paymentEvent({ event_type: 'transaction.completed', data: { id: 'txn_2', custom_data: { pack: 'nope', player_id: 'p' } } }).kind, 'ignored');
  assert.deepEqual(paymentEvent({ event_type: 'adjustment.updated', data: { action: 'refund', status: 'approved', transaction_id: 'txn_1' } }), {
    kind: 'reversed',
    transactionId: 'txn_1',
  });
  assert.equal(paymentEvent({ event_type: 'adjustment.created', data: { action: 'refund', status: 'pending_approval', transaction_id: 'txn_1' } }).kind, 'ignored');
  assert.equal(paymentEvent({ event_type: 'adjustment.created', data: { action: 'chargeback', status: 'approved', transaction_id: 'txn_1' } }).kind, 'reversed');
  assert.equal(paymentEvent({ event_type: 'customer.created', data: {} }).kind, 'ignored');
});
