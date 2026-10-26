// End-to-end test of Premium, the subscription, against a running local Supabase stack
// (.claude/skills/local-supabase). Like tests/payments.e2e.ts this test plays Paddle: a fake
// API on :4875 and webhooks signed with the local secret.
//   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { signWebhook } from '../supabase/functions/_shared/payments.ts';
import { PLANS, SHIELD_PRICE, monthlyIconOf, type PlanId } from '../supabase/functions/_shared/subscription.ts';
import { dayOf, puzzleCoins, solution } from '../supabase/functions/_shared/puzzles.ts';
import { PUZZLES } from '../supabase/functions/_shared/server/puzzle-data.ts';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY || !SERVICE) throw new Error('Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see `npx supabase status`)');
const SECRET = 'local-test-webhook-secret';
const PASSWORD = 'knight42move';
const run = Date.now().toString(36);
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const clients: SupabaseClient[] = [];

// ------------------------------------------------------------------ a fake Paddle API

const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
let paddle: Server;
let next = 0;
before(async () => {
  paddle = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ method: req.method!, path: req.url!, body });
      const ok = (data: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data }));
      };
      if (req.method === 'POST' && req.url === '/transactions') return ok({ id: `txn_${run}_${next++}`, status: 'draft' });
      if (req.method === 'POST' && /^\/customers\/[^/]+\/portal-sessions$/.test(req.url!)) return ok({ urls: { general: { overview: 'https://portal.example/overview' } } });
      if (/^\/subscriptions\/[^/]+(\/cancel)?$/.test(req.url!)) return ok({ id: req.url!.split('/')[2], status: 'active' });
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => paddle.listen(4875, '0.0.0.0', r));
});
after(() => {
  paddle.close();
  clients.forEach((c) => c.realtime.disconnect());
});

async function player(name: string) {
  const email = `${name}-${run}@example.com`;
  const user = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(user.error);
  const client = createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client);
  assert.ifError((await client.auth.signInWithPassword({ email, password: PASSWORD })).error);
  await call(client, { action: 'update', patch: { username: `${name}_${run}`.slice(0, 20), iconId: 'rook', onboardingStep: 4, onboarded: true } }, 'account');
  return { client, id: user.data.user!.id };
}

async function call(client: SupabaseClient, body: Record<string, unknown>, fn = 'payments') {
  const { data, error } = await client.functions.invoke(fn, { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    return { status: res.status, ...(await res.json()) };
  }
  throw error;
}

async function webhook(event: unknown) {
  const body = JSON.stringify(event);
  const res = await fetch(`${URL}/functions/v1/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Paddle-Signature': await signWebhook(body, SECRET) },
    body,
  });
  return res.status;
}

const iso = (ms: number) => new Date(ms).toISOString();
const MONTH = 30 * 86_400_000;

/** Paddle's subscription webhook for a player's plan. */
function subEvent(id: string, playerId: string, plan: PlanId, status: string, patch: Record<string, unknown> = {}, at = Date.now()) {
  return {
    event_type: 'subscription.updated',
    occurred_at: iso(at),
    data: {
      id,
      status,
      customer_id: `ctm_${id}`,
      created_at: iso(Date.now() - 60_000),
      custom_data: { player_id: playerId, plan, period: 'month' },
      items: [{ price: { billing_cycle: { interval: 'month', frequency: 1 } } }],
      current_billing_period: { starts_at: iso(Date.now() - 60_000), ends_at: iso(Date.now() + MONTH) },
      scheduled_change: null,
      ...patch,
    },
  };
}

/** Paddle's paid transaction of a subscription period. */
function paidEvent(txn: string, sub: string, playerId: string, plan: PlanId, start = Date.now() - 60_000, end = start + MONTH) {
  return {
    event_type: 'transaction.completed',
    data: {
      id: txn,
      status: 'completed',
      subscription_id: sub,
      currency_code: 'EUR',
      custom_data: { player_id: playerId, plan, period: 'month' },
      billing_period: { starts_at: iso(start), ends_at: iso(end) },
      details: { totals: { grand_total: String(PLANS[plan].price.month) } },
    },
  };
}

const coins = async (id: string) => (await admin.from('players').select('coins').eq('id', id).single()).data!.coins;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Subscribe a player to a plan as Paddle would: the subscription, then its first payment. */
async function subscribed(p: { client: SupabaseClient; id: string }, plan: PlanId, sub = `sub_${run}_${plan}_${p.id.slice(0, 6)}`) {
  assert.equal(await webhook(subEvent(sub, p.id, plan, 'active')), 200);
  assert.equal(await webhook(paidEvent(`txn_${sub}`, sub, p.id, plan)), 200);
  return sub;
}

test('subscribing: the checkout, the trial once, the plan from the webhooks', async () => {
  const ana = await player('sba');
  assert.equal((await call(ana.client, { action: 'subscribe', plan: 'wizard', period: 'month' })).code, 'bad_request', 'the withdrawal waiver is required');
  assert.equal((await call(ana.client, { action: 'subscribe', plan: 'gold', period: 'month', waiver: true })).code, 'bad_request');
  const { transactionId } = await call(ana.client, { action: 'subscribe', plan: 'wizard', period: 'year', waiver: true });
  assert.match(transactionId, /^txn_/);
  const sent = calls.at(-1)!.body as { items: Array<{ price: Record<string, unknown> }>; custom_data: unknown };
  assert.deepEqual(sent.custom_data, { player_id: ana.id, plan: 'wizard', period: 'year' });
  assert.deepEqual(sent.items[0].price.billing_cycle, { interval: 'year', frequency: 1 });
  assert.deepEqual(sent.items[0].price.trial_period, { interval: 'day', frequency: 7 }, 'the first Wizard gets 7 days free');

  // before the webhook: no plan yet
  const before = await call(ana.client, { action: 'subscription' });
  assert.equal(before.premium, null);
  const start = before.player.coins;

  // the trial: everything but the coins
  const sub = `sub_${run}_trial`;
  assert.equal(await webhook(subEvent(sub, ana.id, 'wizard', 'trialing')), 200);
  assert.equal(
    await webhook({ event_type: 'transaction.completed', data: { id: `txn_${run}_zero`, subscription_id: sub, custom_data: { player_id: ana.id, plan: 'wizard' }, billing_period: { starts_at: iso(Date.now()), ends_at: iso(Date.now() + 7 * 86_400_000) }, details: { totals: { grand_total: '0' } } } }),
    200,
  );
  const trial = await call(ana.client, { action: 'subscription' });
  assert.equal(trial.premium.plan, 'wizard');
  assert.equal(trial.premium.status, 'trialing');
  assert.equal(trial.player.coins, start, 'no coins during the trial');
  assert.equal(trial.trialUsed, true);
  assert.equal((await call(ana.client, { action: 'subscribe', plan: 'archmage', period: 'month', waiver: true })).code, 'subscribed');

  // modules and Learn open with the plan
  const { modules } = await call(ana.client, { action: 'progress' }, 'puzzles');
  assert.ok(modules.every((m: { unlocked: boolean }) => m.unlocked), 'every module is open');
  assert.ok(!modules.find((m: { id: string }) => m.id === 'forks').bought);
  assert.equal((await call(ana.client, { action: 'learn' }, 'puzzles')).unlocked, true);

  // the trial ends with the first payment: 35,000 coins, the month's icon, shields
  assert.equal(await webhook(subEvent(sub, ana.id, 'wizard', 'active')), 200);
  assert.equal(await webhook(paidEvent(`txn_${run}_first`, sub, ana.id, 'wizard')), 200);
  assert.equal(await webhook(paidEvent(`txn_${run}_first`, sub, ana.id, 'wizard')), 200, 'Paddle may send it twice');
  const paid = await call(ana.client, { action: 'subscription' });
  assert.equal(paid.player.coins, start + 35_000);
  assert.ok(paid.player.inventory.includes(monthlyIconOf(iso(Date.now() - 60_000))), 'the month’s subscriber icon');
  assert.deepEqual(paid.given, { coins: 35_000, months: 1 });
  assert.equal((await call(ana.client, { action: 'subscription' })).player.coins, start + 35_000, 'given once');
  const streak = (await admin.from('puzzle_streaks').select('shields').eq('player_id', ana.id).single()).data!;
  assert.equal(streak.shields, 2);

  // everyone sees the badge
  const { data: profile } = await admin.from('profiles').select('showcase').eq('id', ana.id).single();
  assert.deepEqual(profile!.showcase.premium, { plan: 'wizard', founder: false });

  // the player reads their own subscription, cannot write it
  const mine = await ana.client.from('subscriptions').select('plan, status');
  assert.deepEqual(mine.data, [{ plan: 'wizard', status: 'active' }]);
  const forged = await ana.client.from('subscriptions').update({ plan: 'archmage' }).eq('id', sub).select();
  assert.deepEqual(forged.data ?? [], []);

  // an older webhook than the stored one changes nothing
  assert.equal(await webhook(subEvent(sub, ana.id, 'wizard', 'canceled', {}, Date.now() - 3_600_000)), 200);
  assert.equal((await call(ana.client, { action: 'subscription' })).premium.status, 'active');

  // a refund takes the month's coins and icon back
  await admin.from('players').update({ coins: 10_000 }).eq('id', ana.id);
  assert.equal(await webhook({ event_type: 'adjustment.updated', data: { action: 'refund', status: 'approved', transaction_id: `txn_${run}_first` } }), 200);
  const refunded = await call(ana.client, { action: 'subscription' });
  assert.equal(refunded.player.coins, 0);
  assert.ok(!refunded.player.inventory.some((i: string) => i.startsWith('premium-')));
});

test('a second account’s first subscription gets the trial, a returning player doesn’t', async () => {
  const bo = await player('sbb');
  await subscribed(bo, 'apprentice');
  assert.equal(await webhook(subEvent(`sub_${run}_apprentice_${bo.id.slice(0, 6)}`, bo.id, 'apprentice', 'canceled')), 200);
  assert.equal((await call(bo.client, { action: 'subscription' })).premium, null);
  await call(bo.client, { action: 'subscribe', plan: 'wizard', period: 'month', waiver: true });
  assert.equal('trial_period' in (calls.at(-1)!.body as { items: Array<{ price: object }> }).items[0].price, false);
});

test('with a plan hints cost no coins; without one they do', async () => {
  const cy = await player('sbc');
  await subscribed(cy, 'apprentice');
  const module = 'first-steps';
  const moves = solution(PUZZLES[module][0]);
  assert.ok((await call(cy.client, { action: 'start', module, index: 0 }, 'puzzles')).ok);
  await wait(2100);
  const solved = await call(cy.client, { action: 'solve', module, index: 0, moves, mistakes: 0, hints: 4 }, 'puzzles');
  assert.equal(solved.first, true, JSON.stringify(solved));
  assert.equal(solved.coins, puzzleCoins(PUZZLES[module][0].rating));
  assert.equal(solved.hintCost, 0);
  assert.equal(solved.stars, 1, 'the stars still count the hints');
});

test('Game Review: one a day free, a game already reviewed opens again, unlimited with Wizard', async () => {
  const dee = await player('sbd');
  assert.deepEqual(await call(dee.client, { action: 'reviews' }, 'puzzles'), { used: 0, limit: 1 });
  assert.deepEqual(await call(dee.client, { action: 'review_start', game: 'game-a' }, 'puzzles'), { allowed: true, used: 1, limit: 1 });
  assert.equal((await call(dee.client, { action: 'review_start', game: 'game-a' }, 'puzzles')).allowed, true);
  assert.equal((await call(dee.client, { action: 'review_start', game: 'game-b' }, 'puzzles')).allowed, false);
  await subscribed(dee, 'wizard');
  for (const g of ['game-b', 'game-c', 'game-d']) assert.equal((await call(dee.client, { action: 'review_start', game: g }, 'puzzles')).allowed, true);
  assert.deepEqual(await call(dee.client, { action: 'reviews' }, 'puzzles'), { used: 4, limit: null });
});

test('streak shields: bought for coins up to the cap, used on missed days', async () => {
  const eve = await player('sbe');
  assert.equal((await call(eve.client, { action: 'shield_buy' }, 'puzzles')).code, 'insufficient_coins');
  await admin.from('players').update({ coins: SHIELD_PRICE * 3 }).eq('id', eve.id);
  assert.equal((await call(eve.client, { action: 'shield_buy' }, 'puzzles')).shields, 1);
  assert.equal((await call(eve.client, { action: 'shield_buy' }, 'puzzles')).shields, 2);
  assert.equal((await call(eve.client, { action: 'shield_buy' }, 'puzzles')).code, 'shields_full');
  assert.equal(await coins(eve.id), SHIELD_PRICE);

  // two missed days, two shields: the streak goes on
  const day = (n: number) => new Date(Date.parse(`${dayOf()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  await admin.from('puzzle_streaks').update({ current: 9, best: 9, last_day: day(3) }).eq('player_id', eve.id);
  const daily = await call(eve.client, { action: 'daily' }, 'puzzles');
  assert.equal(daily.streak.current, 9);
  assert.equal(daily.streak.shielded, 2);
  assert.equal(daily.streak.shields, 0);
  // three missed days with one shield: it ends (and the shield is kept)
  await admin.from('puzzle_streaks').update({ current: 9, last_day: day(4), shields: 1 }).eq('player_id', eve.id);
  const broken = await call(eve.client, { action: 'daily' }, 'puzzles');
  assert.equal(broken.streak.current, 0);
  assert.equal(broken.streak.shields, 1);
});

test('the Wardrobe: Archmage uses every item, and loses the ones not bought when the plan ends', async () => {
  const fay = await player('sbf');
  assert.equal((await call(fay.client, { action: 'equip', itemId: 'monolith-set' }, 'account')).code, 'not_owned');
  const sub = await subscribed(fay, 'archmage');
  const equipped = await call(fay.client, { action: 'equip', itemId: 'monolith-set' }, 'account');
  assert.equal(equipped.player.loadout.pieces, 'monolith-set', JSON.stringify(equipped));
  assert.equal((await call(fay.client, { action: 'update', patch: { iconId: 'sun-king' } }, 'account')).profile.icon_id, 'sun-king');
  assert.equal((await call(fay.client, { action: 'subscription' })).player.coins, 500 + 75_000);

  // a subscriber's pack bonus: +20% with Archmage
  await call(fay.client, { action: 'checkout', pack: 'coins-35k', waiver: true });
  const order = calls.at(-1)!.body as { custom_data: Record<string, unknown> };
  assert.equal(order.custom_data.bonus, 7_000);

  assert.equal(await webhook(subEvent(sub, fay.id, 'archmage', 'canceled')), 200);
  const after = await call(fay.client, { action: 'me' }, 'account');
  assert.equal(after.player.premium, null);
  assert.equal(after.player.loadout.pieces, 'marble-set', 'back to the standard set');
  assert.equal(after.profile.icon_id, 'king');
  const { data: profile } = await admin.from('profiles').select('showcase').eq('id', fay.id).single();
  assert.equal(profile!.showcase.premium, undefined);
});

test('an upgrade tops the month up; cancel, resume and the portal go to Paddle', async () => {
  const gus = await player('sbg');
  const sub = await subscribed(gus, 'wizard');
  const base = (await call(gus.client, { action: 'subscription' })).player.coins;

  const changed = await call(gus.client, { action: 'change', plan: 'archmage', period: 'month' });
  assert.ok(!changed.code, JSON.stringify(changed));
  const patch = calls.at(-1)!;
  assert.equal(patch.method, 'PATCH');
  assert.equal(patch.body.proration_billing_mode, 'prorated_immediately');
  // Paddle charges the difference and changes the subscription
  assert.equal(await webhook(subEvent(sub, gus.id, 'archmage', 'active')), 200);
  assert.equal(await webhook(paidEvent(`txn_${sub}_up`, sub, gus.id, 'archmage', Date.now() - 30_000)), 200);
  assert.equal((await call(gus.client, { action: 'subscription' })).player.coins, base + 40_000, '75,000 less the 35,000 of this month');

  const cancelled = await call(gus.client, { action: 'cancel' });
  assert.ok(cancelled.premium.cancelAt, 'runs until the end of the period');
  assert.equal(calls.at(-1)!.path, `/subscriptions/${sub}/cancel`);
  assert.equal((await call(gus.client, { action: 'resume' })).premium.cancelAt, null);
  assert.equal((await call(gus.client, { action: 'manage' })).url, 'https://portal.example/overview');
});
