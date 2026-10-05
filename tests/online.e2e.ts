// End-to-end test against a running Supabase stack:
//   npx supabase start && npx supabase functions serve
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Online, OnlineError, type GameRow } from '../src/net/online.ts';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_ANON_KEY;
if (!KEY) throw new Error('Set SUPABASE_ANON_KEY (see `npx supabase status`)');

async function player(): Promise<Online> {
  const p = new Online(URL, KEY!);
  await p.signIn();
  return p;
}

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (e: OnlineError) => e.code === code || assert.fail(`${e.code}: ${e.message}`));
}

/** Resolves with the first watched row matching `pred`. */
function waitFor(p: Online, id: string, pred: (r: GameRow) => boolean, ms = 8000) {
  return new Promise<GameRow>((resolve, reject) => {
    const timer = setTimeout(() => (stop(), reject(new Error('timed out waiting for realtime update'))), ms);
    const stop = p.watch(id, {
      onRow: (r) => {
        if (pred(r)) (clearTimeout(timer), stop(), resolve(r));
      },
    });
  });
}

test('two players play a game to checkmate over the network', async () => {
  const alice = await player();
  const bob = await player();
  const eve = await player();

  const created = await alice.create('Alice', 'w');
  assert.equal(created.status, 'waiting');
  assert.equal(alice.sideOf(created), 'w');
  const id = created.id;

  await rejects(alice.move(id, { from: 'e2', to: 'e4' }), 'not_started');

  // Alice hears about Bob joining through realtime
  const joinedSeen = waitFor(alice, id, (r) => r.status === 'active');
  await new Promise((r) => setTimeout(r, 500)); // let the subscription settle
  const joined = await bob.join(id, 'Bob');
  assert.equal(joined.black_name, 'Bob');
  assert.equal((await joinedSeen).black_id, bob.userId);

  await rejects(eve.join(id, 'Eve'), 'game_full');
  await rejects(eve.move(id, { from: 'e2', to: 'e4' }), 'not_a_player');
  await rejects(bob.move(id, { from: 'e7', to: 'e5' }), 'not_your_turn');
  await rejects(alice.move(id, { from: 'e2', to: 'e5' }), 'illegal_move');

  // spectators can read
  assert.equal((await eve.fetch(id))?.id, id);

  const seq: [Online, string, string][] = [
    [alice, 'f2', 'f3'],
    [bob, 'e7', 'e5'],
    [alice, 'g2', 'g4'],
  ];
  for (const [p, from, to] of seq) await p.move(id, { from, to });

  const mateSeen = waitFor(alice, id, (r) => r.status === 'finished');
  await new Promise((r) => setTimeout(r, 500));
  const mate = await bob.move(id, { from: 'd8', to: 'h4' });
  assert.equal(mate.result, '0-1');
  assert.equal(mate.reason, 'checkmate');
  assert.deepEqual((await mateSeen).moves, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);

  // rematch: both requests land in the same new game, colours swapped
  const next = await alice.rematch(id);
  assert.equal(next.black_id, alice.userId);
  const same = await bob.rematch(id);
  assert.equal(same.id, next.id);
  const started = await bob.join(next.id, 'Bob');
  assert.equal(started.status, 'active');
  assert.equal(started.white_id, bob.userId);
});

test('concurrent moves: only one applies', async () => {
  const a = await player();
  const b = await player();
  const { id } = await a.create('A', 'w');
  await b.join(id, 'B');
  const results = await Promise.allSettled([a.move(id, { from: 'e2', to: 'e4' }), a.move(id, { from: 'd2', to: 'd4' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await a.fetch(id))!.moves.length, 1);
});

test('draw offers and resignation', async () => {
  const a = await player();
  const b = await player();
  const { id } = await a.create('A', 'b');
  await b.join(id, 'B');
  assert.equal((await a.offerDraw(id)).draw_offer, 'b');
  await rejects(a.acceptDraw(id), 'no_offer');
  assert.equal((await b.declineDraw(id)).draw_offer, null);
  await a.offerDraw(id);
  const drawn = await b.acceptDraw(id);
  assert.equal(drawn.result, '1/2-1/2');
  assert.equal(drawn.reason, 'agreement');
  await rejects(a.resign(id), 'game_over');

  const g2 = await a.create('A', 'w');
  await b.join(g2.id, 'B');
  const resigned = await b.resign(g2.id);
  assert.equal(resigned.result, '1-0');
});

test('clients cannot write the table directly', async () => {
  const a = await player();
  const { id } = await a.create('A', 'w');
  const upd = await a.client.from('games').update({ status: 'finished', result: '1-0' }).eq('id', id).select();
  assert.ok(upd.error || upd.data?.length === 0, 'update must be refused');
  const ins = await a.client.from('games').insert({ id: 'hack', white_id: a.userId });
  assert.ok(ins.error, 'insert must be refused');
  const del = await a.client.from('games').delete().eq('id', id).select();
  assert.ok(del.error || del.data?.length === 0, 'delete must be refused');
  assert.equal((await a.fetch(id))?.status, 'waiting');
});

test('requests without a session are refused', async () => {
  const res = await fetch(`${URL}/functions/v1/game`, {
    method: 'POST',
    headers: { apikey: KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', name: 'x' }),
  });
  assert.equal(res.status, 401);
});
