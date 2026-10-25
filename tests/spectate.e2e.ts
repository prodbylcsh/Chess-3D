// End-to-end test of spectating (docs/PLATFORM.md §4.1 "Spectating") against a running
// local Supabase stack (.claude/skills/local-supabase):
//   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { Online, type WatchRow } from '../src/net/online.ts';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY || !SERVICE) throw new Error('Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see `npx supabase status`)');

const PASSWORD = 'knight42move';
const run = Date.now().toString(36);
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const clients: SupabaseClient[] = [];
after(() => clients.forEach((c) => c.realtime.disconnect()));

interface Player {
  client: SupabaseClient;
  online: Online;
  id: string;
}

/** A confirmed, onboarded player, signed in (also as an online-game client). */
async function player(name: string): Promise<Player> {
  const email = `${name}-${run}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(created.error);
  const client = createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client);
  assert.ifError((await client.auth.signInWithPassword({ email, password: PASSWORD })).error);
  await fn(client, 'account', { action: 'update', patch: { username: `${name}_${run}`.slice(0, 20), iconId: 'rook', onboardingStep: 4, onboarded: true } });
  const online = new Online(client);
  await online.signIn();
  return { client, online, id: created.data.user!.id };
}

/** A guest from an invite link (anonymous session). */
async function guest(): Promise<Online> {
  const online = new Online(URL, KEY!, { storageKey: `guest-${Math.random()}` });
  clients.push(online.client);
  await online.signIn();
  return online;
}

async function fn(client: SupabaseClient, name: string, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke(name, { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    return { status: res.status, ...(await res.json()) };
  }
  throw error;
}
const setWatch = (p: Player, watch: string) => fn(p.client, 'account', { action: 'update', patch: { watch } });
const social = (p: Player, body: Record<string, unknown>) => fn(p.client, 'social', body);

const UCI = 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b1c3 g8f6'.split(' ');
async function playPlies(id: string, white: Online, black: Online, plies: number, from = 0) {
  for (let i = from; i < from + plies; i++) {
    const uci = UCI[i];
    await (i % 2 === 0 ? white : black).move(id, { from: uci.slice(0, 2), to: uci.slice(2, 4) });
  }
}

/** Resolves with the first spectated row matching `pred`. */
function waitFor(p: Online, id: string, pred: (r: WatchRow) => boolean, ms = 8000) {
  return new Promise<WatchRow>((resolve, reject) => {
    const timer = setTimeout(() => (stop(), reject(new Error('timed out waiting for the spectators’ update'))), ms);
    const stop = p.spectate(id, {
      onRow: (r) => {
        if (pred(r)) (clearTimeout(timer), stop(), resolve(r));
      },
    });
  });
}

test('a friend game is live for spectators; the game itself is for its players', async () => {
  const alice = await player('sa');
  const bob = await guest();
  const eve = await player('se');

  const created = await alice.online.create('Alice', 'w');
  // anyone holding the invite link reads a waiting game
  assert.equal((await eve.online.fetch(created.id))?.status, 'waiting');
  await bob.join(created.id, 'Bob');
  assert.equal(await eve.online.fetch(created.id), null, 'a running game is for its players');
  assert.equal((await alice.online.fetch(created.id))?.status, 'active');

  const seen = waitFor(eve.online, created.id, (r) => r.moves.length === 2);
  await new Promise((r) => setTimeout(r, 500)); // let the subscription settle
  await playPlies(created.id, alice.online, bob, 2);
  const row = await seen;
  assert.deepEqual(row.moves, ['e2e4', 'e7e5']);
  assert.equal(row.delay, 0);
  assert.equal(row.kind, 'friend');
  assert.equal((await bob.fetchWatch(created.id))?.id, created.id, 'players may read the copy too');

  // spectators cannot write
  const upd = await eve.client.from('game_watch').update({ moves: [] }).eq('id', created.id).select();
  assert.equal(upd.data?.length ?? 0, 0);
  const ins = await eve.client.from('game_watch').insert({ id: 'hack', status: 'active', version: 0, kind: 'friend', created_at: 'now()', updated_at: 'now()' });
  assert.ok(ins.error);
  await alice.online.resign(created.id);
});

test('ranked games are two moves behind while they run, complete once over', async () => {
  const white = await player('rw');
  const black = await player('rb');
  const eve = await player('re');
  const search = (p: Player) => fn(p.client, 'play', { action: 'search', kind: 'ranked', control: 'rapid' });
  assert.equal((await search(white)).searching, true);
  const { gameId } = await search(black);
  assert.ok(gameId);
  await search(white);
  const row = (await admin.from('games').select('*').eq('id', gameId).single()).data!;
  const [w, b] = row.white_id === white.id ? [white, black] : [black, white];

  await playPlies(gameId, w.online, b.online, 6);
  const watched = (await eve.online.fetchWatch(gameId))!;
  assert.equal(watched.delay, 4);
  assert.deepEqual(watched.moves, UCI.slice(0, 2));
  assert.equal(watched.kind, 'ranked');
  assert.equal((watched.moves.length + watched.delay) % 2, 0, 'the same side to move as on the real board');
  assert.equal((await w.online.fetch(gameId))!.moves.length, 6, 'the players see every move');

  const over = waitFor(eve.online, gameId, (r) => r.status === 'finished');
  await new Promise((r) => setTimeout(r, 500));
  await b.online.resign(gameId);
  const done = await over;
  assert.deepEqual(done.moves, UCI.slice(0, 6));
  assert.equal(done.delay, 0);
  assert.equal(done.reason, 'resignation');
});

test('who may watch: everyone, friends, nobody; blocked players never', async () => {
  const alice = await player('wa');
  const bob = await guest();
  const eve = await player('we');
  const created = await alice.online.create('Alice', 'w');
  await bob.join(created.id, 'Bob');
  const sees = async (p: Player) => !!(await p.online.fetchWatch(created.id));

  assert.ok(await sees(eve));
  assert.equal((await setWatch(alice, 'friends')).profile.watch, 'friends');
  assert.ok(!(await sees(eve)), 'friends only');
  await social(alice, { action: 'request', userId: eve.id });
  await social(eve, { action: 'request', userId: alice.id });
  assert.ok(await sees(eve), 'a friend may');

  // "Playing now": friends' running games
  const playing = await eve.client.from('game_watch').select('id').eq('status', 'active').or(`white_id.in.(${alice.id}),black_id.in.(${alice.id})`);
  assert.deepEqual(playing.data, [{ id: created.id }]);

  await setWatch(alice, 'nobody');
  assert.ok(!(await sees(eve)), 'nobody: not even friends');
  assert.ok(await alice.online.fetchWatch(created.id), 'the player still reads it');
  assert.equal((await setWatch(alice, 'all')).code, 'bad_request');

  await setWatch(alice, 'everyone');
  assert.ok(await sees(eve));
  await social(alice, { action: 'block', userId: eve.id });
  assert.ok(!(await sees(eve)), 'a blocked player cannot watch');
  await social(alice, { action: 'unblock', userId: eve.id });
  assert.ok(await sees(eve));
  await social(eve, { action: 'block', userId: alice.id });
  assert.ok(!(await sees(eve)), 'nor can one who blocked a player');
  await alice.online.resign(created.id);
});
