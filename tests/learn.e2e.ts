// End-to-end test of Learn against a running local Supabase stack
// (.claude/skills/local-supabase):
//   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { CHAPTER_REWARD, LEARN_PRICE, chapterOf } from '../supabase/functions/_shared/learn.ts';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY || !SERVICE) throw new Error('Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see `npx supabase status`)');

const run = Date.now().toString(36);
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const clients: SupabaseClient[] = [];
after(() => clients.forEach((c) => c.realtime.disconnect()));
const newClient = () => {
  const c = createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(c);
  return c;
};

async function call(client: SupabaseClient, body: Record<string, unknown>, fn = 'puzzles') {
  const { data, error } = await client.functions.invoke(fn, { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    return { status: res.status, ...(await res.json()) };
  }
  throw error;
}

async function player(name: string) {
  const email = `${name}-${run}@example.com`;
  const user = await admin.auth.admin.createUser({ email, password: 'knight42move', email_confirm: true });
  assert.ifError(user.error);
  const client = newClient();
  assert.ifError((await client.auth.signInWithPassword({ email, password: 'knight42move' })).error);
  await call(client, { action: 'update', patch: { username: `${name}_${run}`.slice(0, 20), iconId: 'rook', onboardingStep: 4, onboarded: true } }, 'account');
  return { client, id: user.data.user!.id };
}

const coins = async (id: string) => (await admin.from('players').select('coins').eq('id', id).single()).data!.coins;

/** Mark lessons as done long ago (the tests skip the minimum time between lessons). */
async function doneBefore(id: string, lessons: readonly string[]) {
  const at = new Date(Date.now() - 3_600_000).toISOString();
  assert.ifError((await admin.from('learn_lessons').insert(lessons.map((lesson) => ({ player_id: id, lesson, done_at: at })))).error);
}

test('lessons go in order, not too fast, and a finished chapter pays once', async () => {
  const p = await player('lrna');
  const start = await call(p.client, { action: 'learn' });
  assert.deepEqual({ lessons: start.lessons, unlocked: start.unlocked, rewarded: start.rewarded }, { lessons: [], unlocked: false, rewarded: [] });
  assert.equal((await call(p.client, { action: 'learn_done', lesson: 'rook' })).code, 'locked', 'in order');
  assert.equal((await call(p.client, { action: 'learn_done', lesson: 'nope' })).code, 'bad_request');
  const board = await call(p.client, { action: 'learn_done', lesson: 'board' });
  assert.equal(board.first, true, JSON.stringify(board));
  assert.equal(board.reward, 0);
  assert.equal((await call(p.client, { action: 'learn_done', lesson: 'board' })).first, false, 'a replay records nothing');
  assert.equal((await call(p.client, { action: 'learn_done', lesson: 'rook' })).code, 'too_fast');

  const pieces = chapterOf('pieces')!.lessons;
  await admin.from('learn_lessons').delete().eq('player_id', p.id);
  await doneBefore(p.id, pieces.slice(0, -1));
  const before = await coins(p.id);
  const last = await call(p.client, { action: 'learn_done', lesson: pieces.at(-1) });
  assert.deepEqual([last.chapterDone, last.reward, last.rewarded], [true, CHAPTER_REWARD, ['pieces']], JSON.stringify(last));
  assert.equal(last.player.coins, before + CHAPTER_REWARD);
  const ledger = (await admin.from('coin_ledger').select('amount, reason, ref').eq('player_id', p.id).eq('reason', 'learn_reward')).data;
  assert.deepEqual(ledger, [{ amount: CHAPTER_REWARD, reason: 'learn_reward', ref: 'pieces' }]);
  assert.ok((await p.client.from('learn_lessons').insert({ player_id: p.id, lesson: 'check' })).error, 'clients cannot write lessons');
  assert.equal((await p.client.from('learn_lessons').select('lesson')).data!.length, pieces.length, 'players read their own');
});

test('the paid chapters open together for the price, once', async () => {
  const p = await player('lrnb');
  await call(p.client, { action: 'learn' });
  assert.equal((await call(p.client, { action: 'learn_done', lesson: 'stalemate' })).code, 'locked');
  assert.equal((await call(p.client, { action: 'learn_unlock' })).code, 'insufficient_coins');
  await admin.from('players').update({ coins: LEARN_PRICE + 100 }).eq('id', p.id);
  const open = await call(p.client, { action: 'learn_unlock' });
  assert.equal(open.unlocked, true, JSON.stringify(open));
  assert.equal(open.player.coins, 100);
  assert.equal((await call(p.client, { action: 'learn_unlock' })).player.coins, 100, 'only once');
  assert.equal((await call(p.client, { action: 'learn_done', lesson: 'stalemate' })).first, true);
});

test('guests take the free chapters; the account they sign in to keeps the lessons and the reward', async () => {
  const guest = newClient();
  const anon = await guest.auth.signInAnonymously();
  assert.ifError(anon.error);
  const gid = anon.data.user!.id;
  const state = await call(guest, { action: 'learn' });
  assert.deepEqual(state.guest, { coins: 0 });
  assert.equal((await call(guest, { action: 'learn_unlock' })).code, 'guest');
  const pieces = chapterOf('pieces')!.lessons;
  await doneBefore(gid, pieces.slice(0, -1));
  const last = await call(guest, { action: 'learn_done', lesson: pieces.at(-1) });
  assert.equal(last.reward, CHAPTER_REWARD, JSON.stringify(last));
  assert.deepEqual(last.guest, { coins: CHAPTER_REWARD }, 'waits in the ledger');
  await doneBefore(gid, ['check']);
  assert.equal((await call(guest, { action: 'learn_done', lesson: 'stalemate' })).code, 'guest_limit');

  const p = await player('lrnc');
  const before = await coins(p.id);
  const token = (await guest.auth.getSession()).data.session!.access_token;
  const claim = await call(p.client, { action: 'claim', guest: token });
  assert.deepEqual(claim.claimed, { puzzles: 0, days: 0, lessons: pieces.length + 1, coins: CHAPTER_REWARD }, JSON.stringify(claim));
  assert.equal(await coins(p.id), before + CHAPTER_REWARD);
  const mine = await call(p.client, { action: 'learn' });
  assert.equal(mine.lessons.length, pieces.length + 1);
  assert.deepEqual(mine.rewarded, ['pieces']);
  assert.deepEqual((await admin.from('learn_lessons').select('lesson').eq('player_id', gid)).data, [], 'the guest rows are gone');
  assert.equal((await call(p.client, { action: 'claim', guest: token })).claimed, null, 'once');
});
