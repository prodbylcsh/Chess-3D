// Smoke test of the live back-end (the project in .env.production). The deploy workflow
// (.github/workflows/supabase.yml) runs it last; it also runs anywhere that can reach the
// project:  node --test tests/live.smoke.ts
// (SUPABASE_URL and SUPABASE_ANON_KEY point it elsewhere, e.g. at the local stack).
//
// It uses only the public anon key. It signs in three anonymous guests and plays a
// short online game, so it leaves three guest users and one finished game behind.
// It sends no emails (a fake sign-up would bounce and hurt the sender's reputation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import { Online, type GameRow } from '../src/net/online.ts';

const env = Object.fromEntries(
  readFileSync('.env.production', 'utf8')
    .split('\n')
    .filter((line) => /^\w+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
);
const URL: string = process.env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const KEY: string = process.env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;

test('auth: email sign-up with confirmation, guests allowed', async () => {
  const settings = await (await fetch(`${URL}/auth/v1/settings`, { headers: { apikey: KEY } })).json();
  assert.equal(settings.external.email, true, 'email sign-in');
  assert.equal(settings.external.anonymous_users, true, 'anonymous sign-ins (guests)');
  assert.equal(settings.mailer_autoconfirm, false, 'email confirmation required');
  assert.equal(settings.disable_signup, false, 'sign-ups open');
  console.log(`providers: google ${settings.external.google ? 'on' : 'off'}, apple ${settings.external.apple ? 'on' : 'off'}`);
});

test('functions refuse requests without a session', async () => {
  for (const name of ['game', 'account']) {
    const res = await fetch(`${URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'me' }),
    });
    assert.equal(res.status, 401, name);
  }
});

test('guests have no profile, can read profiles and cannot write them', async () => {
  const client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInAnonymously();
  assert.ifError(signIn.error);
  const me = await client.functions.invoke('account', { body: { action: 'me' } });
  assert.ok(me.error instanceof FunctionsHttpError, 'guests are refused');
  assert.equal((me.error.context as Response).status, 403);
  assert.ifError((await client.from('profiles').select('username').limit(1)).error);
  const write = await client.from('profiles').insert({ id: signIn.data.user!.id, username: 'smoke_test' });
  assert.ok(write.error, 'clients cannot write profiles');
  await client.auth.signOut({ scope: 'local' });
});

/** Resolves like `promise`, or fails after `ms` naming what did not happen. */
function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not happen within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

test('two guests play an online game, with realtime', async () => {
  const host = new Online(URL, KEY, { storageKey: 'smoke-host' });
  const guest = new Online(URL, KEY, { storageKey: 'smoke-guest' });
  await host.signIn();
  await guest.signIn();

  const game = await host.create('Smoke host', 'w');
  assert.equal(game.status, 'waiting');

  // The first row arrives once the subscription is live (the watcher catches up on
  // connect). A project's very first realtime connection can take a while: realtime
  // sets itself up for the project then.
  let connected!: () => void;
  let joined!: (row: GameRow) => void;
  const live = new Promise<void>((resolve) => (connected = resolve));
  const active = new Promise<GameRow>((resolve) => (joined = resolve));
  const stop = host.watch(game.id, {
    onRow: (row) => {
      connected();
      if (row.status === 'active') joined(row);
    },
  });
  try {
    await within(live, 30_000, 'the realtime subscription');
    await guest.join(game.id, 'Smoke guest');
    const seen = await within(active, 10_000, 'the realtime update for the join');
    assert.equal(seen.black_id, guest.userId, 'the host hears about the join');
  } finally {
    stop();
  }

  await host.move(game.id, { from: 'e2', to: 'e4' });
  const over = await guest.resign(game.id);
  assert.equal(over.status, 'finished');
  assert.equal(over.result, '1-0');
  assert.deepEqual(over.moves, ['e2e4']);
});
