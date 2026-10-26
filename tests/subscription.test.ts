import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANS,
  PLAN_IDS,
  SHIELD_PRICE,
  activePlan,
  addMonths,
  canUse,
  grantsDue,
  hintsFree,
  isFounder,
  learnUnlocked,
  liveSubscription,
  moduleOpen,
  monthlyIconOf,
  packBonus,
  perMonth,
  released,
  reviewsPerDay,
  shieldCap,
  subscriptionBody,
  subscriptionEvent,
  twelveMonths,
  yearSaving,
  type Grant,
  type SubscriptionPayment,
  type SubscriptionState,
} from '../supabase/functions/_shared/subscription.ts';
import { COIN_PACKS } from '../supabase/functions/_shared/payments.ts';
import { itemDef, purchaseProblem } from '../supabase/functions/_shared/shop.ts';

test('the decided plans and prices (26 October 2026)', () => {
  assert.deepEqual(
    PLAN_IDS.map((id) => [PLANS[id].name, PLANS[id].price.month, PLANS[id].price.year, PLANS[id].coins]),
    [
      ['Apprentice', 499, 3999, 0],
      ['Wizard', 999, 7999, 35_000],
      ['Archmage', 1999, 15999, 75_000],
    ],
  );
  // a year costs eight months: four months free, a third off
  for (const id of PLAN_IDS) {
    assert.equal(PLANS[id].price.year, PLANS[id].price.month * 8 + 7);
    assert.equal(yearSaving(PLANS[id]), 33);
  }
  assert.deepEqual(PLAN_IDS.map((id) => perMonth(PLANS[id], 'year')), [333, 667, 1333]);
  assert.equal(twelveMonths(PLANS.wizard), 11_988);
});

test('Wizard and Archmage give their price back in coins: the coins of the pack with the same price', () => {
  for (const id of ['wizard', 'archmage'] as const) {
    const pack = COIN_PACKS.find((p) => p.price === PLANS[id].price.month)!;
    assert.equal(PLANS[id].coins, pack.coins, id);
  }
  // each step up returns more in coins than it costs
  assert.ok(PLANS.wizard.coins > COIN_PACKS[0].coins, 'Apprentice → Wizard (+€5) gives more than the €4.99 pack');
  assert.ok(PLANS.archmage.coins - PLANS.wizard.coins > COIN_PACKS[1].coins, 'Wizard → Archmage (+€10) gives more than the €9.99 pack');
});

test('benefits by plan', () => {
  assert.deepEqual([null, ...PLAN_IDS].map((p) => reviewsPerDay(p)), [1, 3, null, null]);
  assert.deepEqual([null, ...PLAN_IDS].map((p) => shieldCap(p)), [2, 2, 2, 4]);
  assert.deepEqual(PLAN_IDS.map((p) => PLANS[p].shields), [1, 2, 4]);
  assert.equal(SHIELD_PRICE, 2_500);
  assert.deepEqual([null, ...PLAN_IDS].map((p) => packBonus(35_000, p)), [0, 0, 3_500, 7_000]);
  assert.ok(moduleOpen(false, false, 'apprentice') && moduleOpen(true, false, null) && moduleOpen(false, true, null) && !moduleOpen(false, false, null));
  assert.ok(learnUnlocked(false, 'apprentice') && !learnUnlocked(false, null));
  assert.ok(hintsFree('apprentice') && !hintsFree(null));
  assert.deepEqual(PLAN_IDS.filter((p) => PLANS[p].trialDays), ['wizard']);
  assert.deepEqual(PLAN_IDS.filter((p) => PLANS[p].wardrobe), ['archmage']);
  assert.deepEqual(PLAN_IDS.filter((p) => PLANS[p].monthlyIcon), ['wizard', 'archmage']);
});

const sub = (patch: Partial<SubscriptionState> = {}): SubscriptionState => ({
  id: 'sub_1',
  plan: 'wizard',
  period: 'month',
  status: 'active',
  periodStart: '2026-11-01T00:00:00.000Z',
  periodEnd: '2026-12-01T00:00:00.000Z',
  cancelAt: null,
  founder: false,
  ...patch,
});
const at = (iso: string) => Date.parse(iso);

test('a subscription gives its plan while trialing, active or past due, never after the period and a grace', () => {
  assert.equal(activePlan(sub(), at('2026-11-20T00:00:00Z')), 'wizard');
  assert.equal(activePlan(sub({ status: 'trialing' }), at('2026-11-02T00:00:00Z')), 'wizard');
  assert.equal(activePlan(sub({ status: 'past_due' }), at('2026-12-02T00:00:00Z')), 'wizard', 'Paddle retries the payment');
  assert.equal(activePlan(sub({ status: 'canceled' }), at('2026-11-20T00:00:00Z')), null);
  assert.equal(activePlan(sub({ status: 'paused' }), at('2026-11-20T00:00:00Z')), null);
  assert.equal(activePlan(sub(), at('2026-12-05T00:00:00Z')), null, 'no word from Paddle for days after the end');
  assert.equal(activePlan(null), null);
  // a cancelled plan runs until the end of the paid period (Paddle keeps it active until then)
  assert.equal(activePlan(sub({ cancelAt: '2026-12-01T00:00:00.000Z' }), at('2026-11-30T00:00:00Z')), 'wizard');
  const live = liveSubscription([sub({ id: 'a', status: 'canceled' }), sub({ id: 'b', plan: 'apprentice' })], at('2026-11-20T00:00:00Z'));
  assert.equal(live?.id, 'b');
});

test('months: the day is kept, or the month’s last day', () => {
  assert.equal(addMonths('2026-01-31T10:00:00.000Z', 1), '2026-02-28T10:00:00.000Z');
  assert.equal(addMonths('2026-11-15T00:00:00.000Z', 2), '2027-01-15T00:00:00.000Z');
  assert.equal(addMonths('2027-12-31T00:00:00.000Z', 2), '2028-02-29T00:00:00.000Z');
  assert.equal(monthlyIconOf('2026-11-15T00:00:00.000Z'), 'premium-2026-11');
});

const pay = (id: string, plan: SubscriptionPayment['plan'], start: string, end: string, patch: Partial<SubscriptionPayment> = {}): SubscriptionPayment => ({
  id,
  subscriptionId: 'sub_1',
  plan,
  periodStart: start,
  periodEnd: end,
  status: 'completed',
  ...patch,
});
const asGrants = (due: ReturnType<typeof grantsDue>): Grant[] => due.map((d) => ({ paymentId: d.paymentId, subscriptionId: 'sub_1', monthStart: d.monthStart, coins: d.coins }));

test('monthly coins: once per paid month, with the month’s icon and shields', () => {
  const p = pay('txn_1', 'wizard', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z');
  const due = grantsDue([p], [], at('2026-11-01T00:00:01Z'));
  assert.deepEqual(due, [{ paymentId: 'txn_1', plan: 'wizard', monthStart: '2026-11-01T00:00:00.000Z', coins: 35_000, icon: 'premium-2026-11', shields: 2 }]);
  assert.deepEqual(grantsDue([p], asGrants(due), at('2026-11-20T00:00:00Z')), [], 'given once');
  assert.equal(grantsDue([pay('txn_a', 'apprentice', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')], [], at('2026-11-02T00:00:00Z'))[0].icon, null, 'no icon with Apprentice');
  assert.deepEqual(grantsDue([{ ...p, status: 'refunded' }], []), [], 'a refunded payment owes nothing');
});

test('a yearly plan pays its coins month by month', () => {
  const p = pay('txn_y', 'archmage', '2026-11-10T00:00:00.000Z', '2027-11-10T00:00:00.000Z');
  assert.equal(grantsDue([p], [], at('2026-11-10T00:00:00Z')).length, 1);
  const march = grantsDue([p], [], at('2027-03-09T00:00:00Z'));
  assert.deepEqual(
    march.map((d) => d.monthStart.slice(0, 10)),
    ['2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10'],
  );
  assert.equal(grantsDue([p], [], at('2030-01-01T00:00:00Z')).length, 12, 'twelve months, never more');
  assert.equal(grantsDue([p], [], at('2030-01-01T00:00:00Z')).reduce((s, d) => s + d.coins, 0), 900_000);
});

test('an upgrade tops the month up and ends the old plan’s months; a renewal pays in full', () => {
  const wizard = pay('txn_1', 'wizard', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z');
  const given = asGrants(grantsDue([wizard], [], at('2026-11-02T00:00:00Z')));
  const upgrade = pay('txn_2', 'archmage', '2026-11-15T00:00:00.000Z', '2026-12-01T00:00:00.000Z');
  const due = grantsDue([wizard, upgrade], given, at('2026-11-15T12:00:00Z'));
  assert.deepEqual(
    due.map((d) => [d.paymentId, d.coins]),
    [['txn_2', 40_000]],
    '75,000 less the 35,000 already given this month',
  );
  const renewal = pay('txn_3', 'archmage', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
  const later = grantsDue([wizard, upgrade, renewal], [...given, ...asGrants(due)], at('2026-12-01T01:00:00Z'));
  assert.deepEqual(later.map((d) => [d.paymentId, d.coins]), [['txn_3', 75_000]]);

  // a yearly Wizard upgraded in March: the Wizard months stop, Archmage takes over
  const yearly = pay('txn_y', 'wizard', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
  const yUp = pay('txn_u', 'archmage', '2026-03-10T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
  const all = grantsDue([yearly, yUp], [], at('2026-05-20T00:00:00Z'));
  assert.deepEqual(
    all.map((d) => [d.paymentId, d.monthStart.slice(0, 10), d.coins]),
    [
      ['txn_y', '2026-01-01', 35_000],
      ['txn_y', '2026-02-01', 35_000],
      ['txn_y', '2026-03-01', 35_000],
      ['txn_u', '2026-03-10', 40_000],
      ['txn_u', '2026-04-10', 75_000],
      ['txn_u', '2026-05-10', 75_000],
    ],
  );
});

test('the Wardrobe and early access', () => {
  const now = at('2027-01-01T00:00:00Z');
  const set = { id: 'monolith-set', forSale: true };
  assert.ok(canUse(set, true, null, now), 'owned');
  assert.ok(!canUse(set, false, 'wizard', now));
  assert.ok(canUse(set, false, 'archmage', now), 'Archmage uses every for-sale item');
  assert.ok(!canUse({ id: 'season-2-gold-platinum', forSale: false }, false, 'archmage', now), 'season rewards stay earned');
  const soon = { id: 'new-set', forSale: true, releaseAt: '2027-01-05T00:00:00Z' };
  assert.ok(canUse(soon, false, 'archmage', now), '7 days early');
  assert.ok(!canUse({ ...soon, releaseAt: '2027-01-09T00:00:00Z' }, false, 'archmage', now));
  assert.ok(!released(soon.releaseAt, null, now) && released(soon.releaseAt, 'archmage', now) && released(null, null, now));
  // not on sale before its release date, even for coins
  assert.equal(purchaseProblem('monolith-set', [], 1e6, now), null);
});

test('subscriber icons are items that cannot be bought', () => {
  assert.deepEqual(itemDef('premium-2026-11'), { id: 'premium-2026-11', category: 'icon', price: 0, rarity: 'epic', forSale: false });
  assert.equal(itemDef('premium-2026-13'), undefined);
  assert.equal(purchaseProblem('premium-2026-11', [], 1e6), 'not-for-sale');
});

test('Founders: subscribed in the month after the launch', () => {
  assert.ok(!isFounder('2027-01-02T00:00:00Z', null), 'no launch yet');
  assert.ok(isFounder('2027-01-02T00:00:00Z', '2027-01-01T00:00:00Z'));
  assert.ok(!isFounder('2027-02-01T00:00:00Z', '2027-01-01T00:00:00Z'));
  assert.ok(!isFounder('2026-12-31T00:00:00Z', '2027-01-01T00:00:00Z'));
});

test('a Paddle transaction starts a subscription with a recurring price; only Wizard has a trial', () => {
  const body = subscriptionBody(PLANS.wizard, 'year', 'player-1', true);
  assert.deepEqual(body.custom_data, { player_id: 'player-1', plan: 'wizard', period: 'year' });
  const price = body.items[0].price;
  assert.deepEqual(price.unit_price, { amount: '7999', currency_code: 'EUR' });
  assert.deepEqual(price.billing_cycle, { interval: 'year', frequency: 1 });
  assert.deepEqual((price as { trial_period?: unknown }).trial_period, { interval: 'day', frequency: 7 });
  assert.equal('trial_period' in subscriptionBody(PLANS.wizard, 'month', 'p', false).items[0].price, false, 'one trial per account');
  assert.equal('trial_period' in subscriptionBody(PLANS.archmage, 'month', 'p', true).items[0].price, false);
});

test('subscription webhooks: the subscription and its paid periods', () => {
  const custom = { player_id: 'p1', plan: 'archmage', period: 'month' };
  const s = subscriptionEvent({
    event_type: 'subscription.updated',
    occurred_at: '2026-11-03T00:00:00Z',
    data: {
      id: 'sub_9',
      status: 'active',
      customer_id: 'ctm_1',
      custom_data: custom,
      created_at: '2026-11-01T00:00:00Z',
      items: [{ price: { billing_cycle: { interval: 'month', frequency: 1 } } }],
      current_billing_period: { starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z' },
      scheduled_change: { action: 'cancel', effective_at: '2026-12-01T00:00:00Z' },
    },
  });
  assert.deepEqual(s, {
    kind: 'subscription',
    at: '2026-11-03T00:00:00Z',
    id: 'sub_9',
    playerId: 'p1',
    customerId: 'ctm_1',
    plan: 'archmage',
    period: 'month',
    status: 'active',
    periodStart: '2026-11-01T00:00:00Z',
    periodEnd: '2026-12-01T00:00:00Z',
    cancelAt: '2026-12-01T00:00:00Z',
    createdAt: '2026-11-01T00:00:00Z',
  });
  const paid = subscriptionEvent({
    event_type: 'transaction.completed',
    data: {
      id: 'txn_9',
      subscription_id: 'sub_9',
      custom_data: custom,
      currency_code: 'EUR',
      billing_period: { starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z' },
      details: { totals: { grand_total: '1999' } },
    },
  });
  assert.equal(paid.kind, 'payment');
  assert.equal(paid.kind === 'payment' && paid.amount, 1999);
  const trial = subscriptionEvent({
    event_type: 'transaction.completed',
    data: { id: 'txn_0', subscription_id: 'sub_9', custom_data: custom, billing_period: { starts_at: 'a', ends_at: 'b' }, details: { totals: { grand_total: '0' } } },
  });
  assert.equal(trial.kind, 'ignored', 'the trial’s zero transaction pays no coins');
  assert.equal(subscriptionEvent({ event_type: 'subscription.updated', data: { id: 'sub_x', status: 'active', custom_data: { player_id: 'p', plan: 'gold' } } }).kind, 'ignored');
  assert.equal(subscriptionEvent({ event_type: 'transaction.completed', data: { id: 'txn', custom_data: { player_id: 'p', pack: 'coins-15k' } } }).kind, 'ignored', 'coin packs are not ours');
});
