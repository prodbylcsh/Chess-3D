// End-to-end test of buying coins against a running local Supabase stack
// (.claude/skills/local-supabase). The functions use the local test secrets the start
// script writes (supabase/functions/.env); this test plays Paddle: a fake API on :4875
// for new transactions, and webhooks signed with the local secret.
//   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { COIN_PACKS, signWebhook } from '../supabase/functions/_shared/payments.ts';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY || !SERVICE) throw new Error('Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see `npx supabase status`)');
const SECRET = 'local-test-webhook-secret';

const PASSWORD = 'knight42move';
const run = Date.now().toString(36);
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// ------------------------------------------------------------------ a fake Paddle API

const created: Array<{ auth: string | undefined; body: { items: Array<{ price: { unit_price: unknown } }>; custom_data: Record<string, string> } }> = [];
let paddle: Server;
let next = 0;
before(async () => {
  paddle = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/transactions') return res.writeHead(404).end();
      created.push({ auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { id: `txn_${run}_${next++}`, status: 'draft' } }));
    });
  });
  await new Promise<void>((r) => paddle.listen(4875, '0.0.0.0', r));
});
after(() => paddle.close());

async function player(name: string) {
  const email = `${name}-${run}@example.com`;
  const user = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(user.error);
  const client = createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
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

/** Send Paddle's webhook for an event, signed like Paddle does (or with a bad signature). */
async function webhook(event: unknown, secret = SECRET) {
  const body = JSON.stringify(event);
  const res = await fetch(`${URL}/functions/v1/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Paddle-Signature': await signWebhook(body, secret) },
    body,
  });
  return res.status;
}

const completed = (id: string, playerId: string, pack: string) => ({
  event_type: 'transaction.completed',
  data: { id, status: 'completed', currency_code: 'EUR', custom_data: { player_id: playerId, pack }, details: { totals: { grand_total: '999' } } },
});
const coins = async (id: string) => (await admin.from('players').select('coins').eq('id', id).single()).data!.coins;

test('buying coins: checkout, the paid webhook credits them once, a refund takes them back', async () => {
  const ana = await player('pay');
  const start = await coins(ana.id);

  assert.equal((await call(ana.client, { action: 'checkout', pack: 'coins-35k' })).code, 'bad_request', 'the withdrawal waiver is required');
  assert.equal((await call(ana.client, { action: 'checkout', pack: 'coins-1m', waiver: true })).code, 'bad_request');
  const { transactionId } = await call(ana.client, { action: 'checkout', pack: 'coins-35k', waiver: true });
  assert.match(transactionId, /^txn_/);
  const sent = created.at(-1)!;
  assert.equal(sent.auth, 'Bearer local-test-key');
  assert.deepEqual(sent.body.custom_data, { player_id: ana.id, pack: 'coins-35k' });
  assert.deepEqual(sent.body.items[0].price.unit_price, { amount: '999', currency_code: 'EUR' });
  assert.equal((await call(ana.client, { action: 'status', transactionId })).status, 'created');

  assert.equal(await webhook(completed(transactionId, ana.id, 'coins-35k'), 'wrong-secret'), 401, 'forged webhooks are refused');
  assert.equal(await coins(ana.id), start);

  assert.equal(await webhook(completed(transactionId, ana.id, 'coins-35k')), 200);
  assert.equal(await webhook(completed(transactionId, ana.id, 'coins-35k')), 200, 'Paddle may send it twice');
  assert.equal(await coins(ana.id), start + 35_000);
  const status = await call(ana.client, { action: 'status', transactionId });
  assert.equal(status.status, 'completed');
  assert.equal(status.player.coins, start + 35_000);
  const ledger = (await admin.from('coin_ledger').select('amount, reason').eq('player_id', ana.id).eq('ref', transactionId)).data;
  assert.deepEqual(ledger, [{ amount: 35_000, reason: 'coins_bought' }]);

  // the player sees their own purchases, nobody else's
  const mine = await ana.client.from('purchases').select('pack, coins, status');
  assert.deepEqual(mine.data, [{ pack: 'coins-35k', coins: 35_000, status: 'completed' }]);

  // spend some, then a refund: the coins go back, never below zero
  await admin.from('players').update({ coins: 10_000 }).eq('id', ana.id);
  assert.equal(await webhook({ event_type: 'adjustment.updated', data: { action: 'refund', status: 'approved', transaction_id: transactionId } }), 200);
  assert.equal(await coins(ana.id), 0);
  assert.equal((await call(ana.client, { action: 'status', transactionId })).status, 'refunded');
  assert.equal(await webhook(completed(transactionId, ana.id, 'coins-35k')), 200);
  assert.equal(await coins(ana.id), 0, 'a refunded purchase is not credited again');
});

test('a paid webhook that arrives for a transaction the app never saw still credits the player', async () => {
  const bo = await player('pby');
  const start = await coins(bo.id);
  assert.equal(await webhook(completed(`txn_${run}_direct`, bo.id, COIN_PACKS[0].id)), 200);
  assert.equal(await coins(bo.id), start + COIN_PACKS[0].coins);
});

test('only signed-in, onboarded players can buy; others cannot read purchases', async () => {
  const anon = createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal((await call(anon, { action: 'checkout', pack: 'coins-15k', waiver: true })).code, 'unauthorized');
  await anon.auth.signInAnonymously();
  assert.equal((await call(anon, { action: 'checkout', pack: 'coins-15k', waiver: true })).code, 'guest');
  const others = await anon.from('purchases').select('id');
  assert.deepEqual(others.data ?? [], []);
  anon.realtime.disconnect();
});
