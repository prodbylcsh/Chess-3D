// End-to-end test of puzzles against a running local Supabase stack
// (.claude/skills/local-supabase):
//   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { BONUS_COINS, MODULE_PRICE, puzzleCoins } from '../supabase/functions/_shared/puzzles.ts';
import { PUZZLES } from '../supabase/functions/_shared/server/puzzle-data.ts';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY || !SERVICE) throw new Error('Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see `npx supabase status`)');

const run = Date.now().toString(36);
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const clients: SupabaseClient[] = [];
after(() => clients.forEach((c) => c.realtime.disconnect()));

async function player(name: string) {
  const email = `${name}-${run}@example.com`;
  const user = await admin.auth.admin.createUser({ email, password: 'knight42move', email_confirm: true });
  assert.ifError(user.error);
  const client = createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client);
  assert.ifError((await client.auth.signInWithPassword({ email, password: 'knight42move' })).error);
  await call(client, { action: 'update', patch: { username: `${name}_${run}`.slice(0, 20), iconId: 'rook', onboardingStep: 4, onboarded: true } }, 'account');
  return { client, id: user.data.user!.id };
}

async function call(client: SupabaseClient, body: Record<string, unknown>, fn = 'puzzles') {
  const { data, error } = await client.functions.invoke(fn, { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    return { status: res.status, ...(await res.json()) };
  }
  throw error;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const answer = (module: string, index: number) => PUZZLES[module][index].moves.split(' ').filter((_, i) => i % 2 === 1);
const coins = async (id: string) => (await admin.from('players').select('coins').eq('id', id).single()).data!.coins;

/** Open a puzzle, think for the minimum time, send the moves. */
async function solve(p: { client: SupabaseClient }, module: string, index: number, moves = answer(module, index), extra = {}) {
  const started = await call(p.client, { action: 'start', module, index });
  if (!started.ok) return started;
  await wait(2100);
  return call(p.client, { action: 'solve', module, index, moves, mistakes: 0, hints: 0, ...extra });
}

test('progress: the first module is free and open, the others locked', async () => {
  const p = await player('pza');
  const { modules, player: state } = await call(p.client, { action: 'progress' });
  assert.equal(modules.length, 6);
  assert.deepEqual(modules.filter((m: { unlocked: boolean }) => m.unlocked).map((m: { id: string }) => m.id), ['first-steps']);
  assert.equal(modules[0].stars.length, 100);
  assert.equal(state.coins, 500);
  assert.equal((await call(p.client, { action: 'start', module: 'forks', index: 0 })).code, 'locked');
  assert.equal((await call(p.client, { action: 'start', module: 'first-steps', index: 1 })).code, 'locked', 'one after another');
});

test('solving: checked by the server, coins only the first time, stars kept at their best', async () => {
  const p = await player('pzb');
  assert.equal((await call(p.client, { action: 'solve', module: 'first-steps', index: 0, moves: answer('first-steps', 0) })).code, 'not_started');
  await call(p.client, { action: 'start', module: 'first-steps', index: 0 });
  assert.equal((await call(p.client, { action: 'solve', module: 'first-steps', index: 0, moves: answer('first-steps', 0) })).code, 'not_started', 'too fast');
  assert.equal((await solve(p, 'first-steps', 0, ['a1a2'])).code, 'wrong');

  const first = await solve(p, 'first-steps', 0, answer('first-steps', 0), { mistakes: 1 });
  assert.equal(first.first, true, JSON.stringify(first));
  assert.equal(first.stars, 2);
  assert.equal(first.coins, puzzleCoins(PUZZLES['first-steps'][0].rating));
  assert.equal(first.player.coins, 500 + first.coins);

  const again = await solve(p, 'first-steps', 0);
  assert.equal(again.first, false);
  assert.equal(again.coins, 0);
  assert.equal(await coins(p.id), 500 + first.coins, 'no farming');
  const rows = (await p.client.from('puzzle_solves').select('idx, stars')).data;
  assert.deepEqual(rows, [{ idx: 0, stars: 3 }], 'the best stars stay');
  assert.ok((await p.client.from('puzzle_solves').insert({ player_id: p.id, module: 'first-steps', idx: 1, stars: 3 })).error, 'clients cannot write progress');
});

test('every tenth solve pays a bonus; the hundredth gives an item from the shop', async () => {
  const p = await player('pzc');
  const fill = (from: number, to: number) =>
    admin.from('puzzle_solves').insert(Array.from({ length: to - from }, (_, i) => ({ player_id: p.id, module: 'first-steps', idx: from + i, stars: 3 })));
  await call(p.client, { action: 'progress' });
  assert.ifError((await fill(0, 9)).error);
  const tenth = await solve(p, 'first-steps', 9);
  assert.equal(tenth.solved, 10);
  assert.equal(tenth.bonus, BONUS_COINS);
  assert.equal(tenth.player.coins, 500 + tenth.coins + BONUS_COINS);

  assert.ifError((await fill(10, 99)).error);
  const last = await solve(p, 'first-steps', 99);
  assert.equal(last.solved, 100);
  assert.ok(last.reward?.item, JSON.stringify(last.reward));
  const owned = (await admin.from('player_items').select('item_id, source').eq('player_id', p.id)).data;
  assert.deepEqual(owned, [{ item_id: last.reward.item, source: 'puzzle' }]);
  const { modules } = await call(p.client, { action: 'progress' });
  assert.ok(modules[0].completedAt);
  assert.equal(modules[0].reward.item, last.reward.item);
});

test('unlocking a module costs 100,000 coins, once', async () => {
  const p = await player('pzd');
  assert.equal((await call(p.client, { action: 'unlock', module: 'forks' })).code, 'insufficient_coins');
  await call(p.client, { action: 'progress' });
  await admin.from('players').update({ coins: MODULE_PRICE + 1_000 }).eq('id', p.id);
  const unlocked = await call(p.client, { action: 'unlock', module: 'forks' });
  assert.equal(unlocked.player.coins, 1_000);
  assert.ok(unlocked.modules.find((m: { id: string }) => m.id === 'forks').unlocked);
  await call(p.client, { action: 'unlock', module: 'forks' });
  assert.equal(await coins(p.id), 1_000, 'paid once');
  assert.equal((await call(p.client, { action: 'unlock', module: 'first-steps' })).code, 'bad_request', 'the free one');
  assert.equal((await solve(p, 'forks', 0)).first, true);
});
