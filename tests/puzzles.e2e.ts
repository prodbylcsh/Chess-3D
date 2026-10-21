// End-to-end test of puzzles against a running local Supabase stack
// (.claude/skills/local-supabase):
//   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { BONUS_COINS, DAILY_COINS, GUEST_PUZZLES, MODULE_PRICE, dailyPuzzle, dayOf, puzzleCoins, solution } from '../supabase/functions/_shared/puzzles.ts';
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
const answer = (module: string, index: number) => solution(PUZZLES[module][index]);
const coins = async (id: string) => (await admin.from('players').select('coins').eq('id', id).single()).data!.coins;

/** Open a puzzle, think for the minimum time, send the moves. */
async function solve(p: { client: SupabaseClient }, module: string, index: number, moves = answer(module, index), extra = {}) {
  const started = await call(p.client, { action: 'start', module, index });
  if (!started.ok) return started;
  await wait(2100);
  return call(p.client, { action: 'solve', module, index, moves, mistakes: 0, hints: 0, ...extra });
}

test('progress: Openings is free and open, the others locked', async () => {
  const p = await player('pza');
  const { modules, player: state } = await call(p.client, { action: 'progress' });
  assert.equal(modules.length, 7);
  assert.deepEqual(modules.filter((m: { unlocked: boolean }) => m.unlocked).map((m: { id: string }) => m.id), ['openings']);
  assert.equal(modules[0].stars.length, 100);
  assert.equal(state.coins, 500);
  assert.equal((await call(p.client, { action: 'start', module: 'forks', index: 0 })).code, 'locked');
  assert.equal((await call(p.client, { action: 'start', module: 'openings', index: 1 })).code, 'locked', 'one after another');
});

test('solving: checked by the server, coins only the first time, stars kept at their best', async () => {
  const p = await player('pzb');
  assert.equal((await call(p.client, { action: 'solve', module: 'openings', index: 0, moves: answer('openings', 0) })).code, 'not_started');
  await call(p.client, { action: 'start', module: 'openings', index: 0 });
  assert.equal((await call(p.client, { action: 'solve', module: 'openings', index: 0, moves: answer('openings', 0) })).code, 'not_started', 'too fast');
  assert.equal((await solve(p, 'openings', 0, ['a1a2'])).code, 'wrong');

  const first = await solve(p, 'openings', 0, answer('openings', 0), { mistakes: 1 });
  assert.equal(first.first, true, JSON.stringify(first));
  assert.equal(first.stars, 2);
  assert.equal(first.coins, puzzleCoins(PUZZLES['openings'][0].rating));
  assert.equal(first.player.coins, 500 + first.coins);

  assert.equal(first.hintCost, 0);

  // right after: practice, the stars stay (the moves are fresh in mind)
  const again = await solve(p, 'openings', 0);
  assert.equal(again.first, false);
  assert.equal(again.coins, 0);
  assert.equal(again.counted, false);
  assert.equal(again.best, 2);
  assert.ok(Date.parse(again.reviewFrom) > Date.now() + 19 * 3600_000, again.reviewFrom);
  assert.equal(await coins(p.id), 500 + first.coins, 'no farming');
  assert.deepEqual((await p.client.from('puzzle_solves').select('idx, stars')).data, [{ idx: 0, stars: 2 }]);
  // a day later: a review, the stars improve (still no coins)
  await admin.from('puzzle_solves').update({ tried_at: new Date(Date.now() - 21 * 3600_000).toISOString() }).eq('player_id', p.id);
  const review = await solve(p, 'openings', 0);
  assert.equal(review.counted, true);
  assert.equal(review.coins, 0);
  assert.equal(review.reviewFrom, null, 'three stars: nothing to review');
  const rows = (await p.client.from('puzzle_solves').select('idx, stars')).data;
  assert.deepEqual(rows, [{ idx: 0, stars: 3 }], 'the best stars stay');
  // a weaker solve later never lowers them
  await admin.from('puzzle_solves').update({ tried_at: new Date(Date.now() - 21 * 3600_000).toISOString() }).eq('player_id', p.id);
  await solve(p, 'openings', 0, answer('openings', 0), { mistakes: 3 });
  assert.deepEqual((await p.client.from('puzzle_solves').select('idx, stars')).data, [{ idx: 0, stars: 3 }]);
  assert.ok((await p.client.from('puzzle_solves').insert({ player_id: p.id, module: 'openings', idx: 1, stars: 3 })).error, 'clients cannot write progress');
});

test('every tenth solve pays a bonus; the hundredth gives an item from the shop', async () => {
  const p = await player('pzc');
  const fill = (from: number, to: number) =>
    admin.from('puzzle_solves').insert(Array.from({ length: to - from }, (_, i) => ({ player_id: p.id, module: 'openings', idx: from + i, stars: 3 })));
  await call(p.client, { action: 'progress' });
  assert.ifError((await fill(0, 9)).error);
  // every hint and more: the coins lose 10 at most
  const tenth = await solve(p, 'openings', 9, answer('openings', 9), { hints: 99 });
  assert.equal(tenth.hintCost, 10);
  assert.equal(tenth.coins, puzzleCoins(PUZZLES.openings[9].rating) - 10);
  assert.equal(tenth.stars, 1);
  assert.equal(tenth.solved, 10);
  assert.equal(tenth.bonus, BONUS_COINS);
  assert.equal(tenth.player.coins, 500 + tenth.coins + BONUS_COINS);

  assert.ifError((await fill(10, 99)).error);
  const last = await solve(p, 'openings', 99);
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
  assert.equal((await call(p.client, { action: 'unlock', module: 'openings' })).code, 'bad_request', 'the free one');
  assert.equal((await solve(p, 'forks', 0)).first, true);
});

test('openings: hand-made lines where the player moves first are checked too', async () => {
  const p = await player('pze');
  await call(p.client, { action: 'progress' });
  const list = PUZZLES.openings;
  const first = list.findIndex((x) => x.playerFirst);
  await admin.from('puzzle_solves').insert(Array.from({ length: first }, (_, i) => ({ player_id: p.id, module: 'openings', idx: i, stars: 3 })));
  const wrong = [...answer('openings', first)];
  wrong[0] = wrong[0] === 'd2d4' ? 'e2e4' : 'd2d4';
  assert.equal((await solve(p, 'openings', first, wrong)).code, 'wrong');
  assert.equal((await solve(p, 'openings', first)).first, true);
});

test('showing the solution: seen, the next one opens, no coins; a review later pays them', async () => {
  const p = await player('pzf');
  await call(p.client, { action: 'progress' });
  await call(p.client, { action: 'start', module: 'openings', index: 0 });
  assert.equal((await call(p.client, { action: 'reveal', module: 'openings', index: 0 })).code, 'not_started', 'not before 20 s');
  await admin.from('puzzle_attempts').update({ started_at: new Date(Date.now() - 30_000).toISOString() }).eq('player_id', p.id);
  const { modules } = await call(p.client, { action: 'reveal', module: 'openings', index: 0 });
  assert.equal(modules[0].stars[0], 0);
  assert.equal(modules[0].seen[0], true);
  assert.ok(modules[0].reviewFrom[0]);
  assert.equal(await coins(p.id), 500);
  assert.equal((await call(p.client, { action: 'start', module: 'openings', index: 1 })).ok, true, 'the next one is open');
  // solved right away from memory: nothing
  const fresh = await solve(p, 'openings', 0);
  assert.equal(fresh.counted, false);
  assert.equal(fresh.coins, 0);
  assert.equal(await coins(p.id), 500);
  // in a review a day later: the stars and the coins of a first solve
  await admin.from('puzzle_solves').update({ tried_at: new Date(Date.now() - 21 * 3600_000).toISOString() }).eq('player_id', p.id);
  const later = await solve(p, 'openings', 0);
  assert.equal(later.first, true);
  assert.equal(later.counted, true);
  assert.equal(later.coins, puzzleCoins(PUZZLES.openings[0].rating));
  assert.equal(later.solved, 1);
  const after = (await call(p.client, { action: 'progress' })).modules[0];
  assert.equal(after.seen[0], false);
  assert.equal(after.stars[0], 3);
});

test('the daily puzzle: once a day, a streak and its milestones', async () => {
  const p = await player('pzg');
  await call(p.client, { action: 'progress' });
  const today = dayOf();
  const { module, index } = dailyPuzzle(today);
  const state = await call(p.client, { action: 'daily' });
  assert.deepEqual({ day: state.day, module: state.module, index: state.index, solved: state.solved }, { day: today, module, index, solved: null });
  assert.deepEqual(state.streak, { current: 0, best: 0, lastDay: null });
  const moves = answer(module, index);
  assert.equal((await call(p.client, { action: 'daily_solve', moves })).code, 'not_started');
  const dailySolve = async (extra = {}) => {
    await call(p.client, { action: 'daily_start' });
    await wait(2100);
    return call(p.client, { action: 'daily_solve', moves, mistakes: 0, hints: 0, ...extra });
  };
  assert.equal((await dailySolve({ moves: ['a1a2'] })).code, 'wrong');
  const first = await dailySolve();
  assert.equal(first.already, false, JSON.stringify(first));
  assert.equal(first.coins, DAILY_COINS);
  assert.deepEqual(first.streak, { current: 1, best: 1, lastDay: today });
  assert.equal(first.milestone, null);
  assert.equal(first.player.coins, 500 + DAILY_COINS);
  const again = await dailySolve();
  assert.equal(again.already, true);
  assert.equal(await coins(p.id), 500 + DAILY_COINS, 'once a day');
  // yesterday was day 6: today is the 7th and pays the milestone
  const yesterday = dayOf(Date.now() - 86_400_000);
  await admin.from('puzzle_daily').delete().eq('player_id', p.id);
  await admin.from('puzzle_streaks').update({ current: 6, best: 6, last_day: yesterday }).eq('player_id', p.id);
  const seventh = await dailySolve({ hints: 99 });
  assert.deepEqual(seventh.streak, { current: 7, best: 7, lastDay: today });
  assert.deepEqual(seventh.milestone, { days: 7, coins: 300, item: null });
  assert.equal(seventh.coins, DAILY_COINS - 10, 'hints cost here too');
  assert.equal(await coins(p.id), 500 + DAILY_COINS + DAILY_COINS - 10 + 300);
  // a missed day breaks it; the best stays
  await admin.from('puzzle_daily').delete().eq('player_id', p.id);
  await admin.from('puzzle_streaks').update({ last_day: dayOf(Date.now() - 3 * 86_400_000) }).eq('player_id', p.id);
  assert.equal((await call(p.client, { action: 'daily' })).streak.current, 0);
  const restart = await dailySolve();
  assert.deepEqual(restart.streak, { current: 1, best: 7, lastDay: today });
  // a year in a row: an item from the shop as well
  await admin.from('puzzle_daily').delete().eq('player_id', p.id);
  await admin.from('puzzle_streaks').update({ current: 364, last_day: yesterday }).eq('player_id', p.id);
  const year = await dailySolve();
  assert.equal(year.milestone.days, 365);
  assert.ok(year.milestone.item);
  const owned = (await admin.from('player_items').select('item_id, source').eq('player_id', p.id)).data;
  assert.deepEqual(owned, [{ item_id: year.milestone.item, source: 'streak' }]);
  assert.ok((await p.client.from('puzzle_daily').insert({ player_id: p.id, day: '2020-01-01', module, idx: 0, stars: 3, coins: 0 })).error, 'clients cannot write it');
});

test('guests: the first puzzles of Openings and the daily puzzle, then the account keeps them', async () => {
  const guest = createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(guest);
  const anon = await guest.auth.signInAnonymously();
  assert.ifError(anon.error);
  const g = { client: guest, id: anon.data.user!.id };

  const start = await call(guest, { action: 'progress' });
  assert.deepEqual(start.guest, { coins: 0 });
  assert.equal(start.player, undefined, 'a guest has no player state');
  const first = await solve(g, 'openings', 0);
  assert.equal(first.first, true, JSON.stringify(first));
  assert.deepEqual(first.guest, { coins: first.coins });
  const second = await solve(g, 'openings', 1);
  assert.equal(second.first, true);
  assert.equal((await call(guest, { action: 'start', module: 'openings', index: GUEST_PUZZLES })).code, 'guest_limit');
  assert.equal((await call(guest, { action: 'start', module: 'forks', index: 0 })).code, 'guest_limit');
  assert.equal((await call(guest, { action: 'unlock', module: 'forks' })).code, 'guest');
  assert.equal((await call(guest, { action: 'me' }, 'account')).code, 'guest', 'still no account');
  const { module, index } = dailyPuzzle(dayOf());
  await call(guest, { action: 'daily_start' });
  await wait(2100);
  const daily = await call(guest, { action: 'daily_solve', moves: answer(module, index), mistakes: 0, hints: 0 });
  assert.equal(daily.already, false, JSON.stringify(daily));
  const earned = first.coins + second.coins + DAILY_COINS;
  assert.deepEqual(daily.guest, { coins: earned });

  // the account solved puzzle 0 already: only puzzle 1 and the daily puzzle are new to it
  const p = await player('pzguest');
  await solve(p, 'openings', 0);
  const before = await coins(p.id);
  const token = (await guest.auth.getSession()).data.session!.access_token;
  assert.equal((await call(p.client, { action: 'claim', guest: 'not-a-token' })).claimed, null);
  const claim = await call(p.client, { action: 'claim', guest: token });
  assert.deepEqual(claim.claimed, { puzzles: 1, days: 1, lessons: 0, coins: second.coins + DAILY_COINS }, JSON.stringify(claim));
  assert.equal(await coins(p.id), before + second.coins + DAILY_COINS);
  const solved = (await admin.from('puzzle_solves').select('idx').eq('player_id', p.id).order('idx')).data!.map((r) => r.idx);
  assert.deepEqual(solved, [0, 1]);
  assert.equal((await call(p.client, { action: 'daily' })).streak.current, 1);
  assert.deepEqual((await admin.from('puzzle_solves').select('idx').eq('player_id', g.id)).data, [], 'the guest rows are gone');
  assert.equal((await call(p.client, { action: 'claim', guest: token })).claimed, null, 'once');
  const other = await player('pzguest2');
  assert.equal((await call(other.client, { action: 'claim', guest: (await p.client.auth.getSession()).data.session!.access_token })).claimed, null, 'only guests');
});
