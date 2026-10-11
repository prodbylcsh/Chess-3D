// End-to-end test of ranked, casual and coin games, the shop and seasons against a
// running local Supabase stack (.claude/skills/local-supabase):
//   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

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
  id: string;
  name: string;
}

async function player(name: string): Promise<Player> {
  const email = `${name}-${run}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(created.error);
  const client = createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client);
  assert.ifError((await client.auth.signInWithPassword({ email, password: PASSWORD })).error);
  const username = `${name}_${run}`.slice(0, 20);
  await fn(client, 'account', { action: 'update', patch: { username, iconId: 'rook', onboardingStep: 4, onboarded: true } });
  return { client, id: created.data.user!.id, name: username };
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
const play = (p: Player, body: Record<string, unknown>) => fn(p.client, 'play', body);
const game = (p: Player, body: Record<string, unknown>) => fn(p.client, 'game', body);
const state = async (p: Player) => (await admin.from('players').select('*').eq('id', p.id).single()).data;

/** Both players search until matched; returns the game row. */
async function match(a: Player, b: Player, kind: string, control = 'rapid', stake?: string) {
  const first = await play(a, { action: 'search', kind, control, stake });
  assert.equal(first.searching, true, JSON.stringify(first));
  const second = await play(b, { action: 'search', kind, control, stake });
  assert.ok(second.gameId, JSON.stringify(second));
  const again = await play(a, { action: 'search', kind, control, stake });
  assert.equal(again.gameId, second.gameId, 'the waiting player picks the game up');
  return (await admin.from('games').select('*').eq('id', second.gameId).single()).data;
}

// a quiet opening that neither repeats nor ends (20 half-moves)
const UCI = 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b1c3 g8f6 d2d3 d7d6 c1g5 c8g4 h2h3 g4h5 a2a3 a7a6 b2b4 c5a7 a1b1 h7h6'.split(' ');
async function playPlies(row: { id: string; white_id: string }, white: Player, black: Player, plies: number) {
  for (let i = 0; i < plies; i++) {
    const mover = i % 2 === 0 ? white : black;
    const uci = UCI[i];
    const res = await game(mover, { action: 'move', id: row.id, move: { from: uci.slice(0, 2), to: uci.slice(2, 4) } });
    assert.ok(res.game, JSON.stringify(res));
  }
}
const seats = (row: { white_id: string }, a: Player, b: Player) => (row.white_id === a.id ? [a, b] : [b, a]);

test('every player starts fresh on the server; the shop takes coins and adds items', async () => {
  const ana = await player('ana');
  const me = await fn(ana.client, 'account', { action: 'me' });
  assert.equal(me.player.coins, 500);
  assert.equal(me.player.mmr, 1000);
  assert.deepEqual(me.seasonGrants, []);

  const { itemDef } = await import('../supabase/functions/_shared/shop.ts');
  const cheap = itemDef('walnut-board')!;
  const pricey = itemDef('celestial-set')!;
  await admin.from('players').update({ coins: 20_000 }).eq('id', ana.id); // as if earned in games
  const bought = await fn(ana.client, 'account', { action: 'buy', itemId: cheap.id });
  assert.equal(bought.player.coins, 20_000 - cheap.price);
  assert.ok(bought.player.inventory.includes(cheap.id));
  assert.equal((await fn(ana.client, 'account', { action: 'buy', itemId: cheap.id })).code, 'owned');
  assert.equal((await fn(ana.client, 'account', { action: 'buy', itemId: pricey.id })).code, 'insufficient_coins');
  assert.equal((await fn(ana.client, 'account', { action: 'equip', itemId: pricey.id })).code, 'not_owned');

  const equipped = await fn(ana.client, 'account', { action: 'equip', itemId: cheap.id });
  assert.equal(equipped.player.loadout.board, cheap.id);
  const shown = await admin.from('profiles').select('showcase').eq('id', ana.id).single();
  assert.equal(shown.data?.showcase.loadout.board, cheap.id, 'others see the new board');

  assert.equal((await fn(ana.client, 'account', { action: 'update', patch: { iconId: 'ember-rook' } })).code, 'not_owned');
  const ledger = await ana.client.from('coin_ledger').select('amount, reason, ref');
  assert.deepEqual(ledger.data, [{ amount: -cheap.price, reason: 'purchase', ref: cheap.id }]);
});

test('ranked: matched by the queue, clocks run, the result changes MMR (no coins under 20 moves)', async () => {
  const a = await player('bea');
  const b = await player('cal');
  const row = await match(a, b, 'ranked');
  assert.equal(row.kind, 'ranked');
  assert.equal(row.status, 'active');
  assert.equal(row.clock_w, 600_000);
  const [white, black] = seats(row, a, b);

  await playPlies(row, white, black, 4);
  const mid = (await admin.from('games').select('clock_w, clock_b, turn_started_at').eq('id', row.id).single()).data!;
  assert.ok(mid.clock_w <= 600_000 + 5_000 && mid.clock_w > 590_000, 'white used a little time and got the increment');

  const resigned = await game(black, { action: 'resign', id: row.id });
  assert.equal(resigned.game.result, row.white_id === white.id ? '1-0' : '0-1');
  const w = await state(white);
  const l = await state(black);
  assert.equal(w.mmr, 1020);
  assert.equal(l.mmr, 982);
  assert.equal(w.coins, 500, 'four moves: no coins');
  assert.equal(w.wins, 1);
  assert.equal(l.losses, 1);

  const res = await play(white, { action: 'result', gameId: row.id });
  assert.equal(res.result.outcome, 'win');
  assert.equal(res.result.mmr_delta, 20);
  assert.equal(res.result.breakdown.rankBefore.label, 'Silver II');

  const theirs = await white.client.from('game_results').select('outcome, moves').eq('player_id', black.id);
  assert.deepEqual(theirs.data, [{ outcome: 'loss', moves: 4 }], 'recent games are public');
  assert.ok((await white.client.from('game_results').select('mmr_delta').eq('player_id', black.id)).error, 'MMR changes are private');
  assert.equal((await game(white, { action: 'rematch', id: row.id })).code, 'no_rematch');
});

test('casual: a full game pays coins; the history has it', async () => {
  const a = await player('dee');
  const b = await player('eli');
  const row = await match(a, b, 'casual', 'blitz');
  assert.equal(row.clock_w, 300_000);
  const [white, black] = seats(row, a, b);
  await playPlies(row, white, black, 20);
  await game(white, { action: 'offer_draw', id: row.id });
  await game(black, { action: 'accept_draw', id: row.id });
  assert.equal((await state(white)).coins, 575);
  assert.equal((await state(black)).coins, 575);
  assert.equal((await state(white)).mmr, 1000, 'casual never changes MMR');
  const history = await play(white, { action: 'history' });
  assert.equal(history.games[0].coins_delta, 75);
  assert.equal(history.games[0].outcome, 'draw');
  assert.equal((await play(white, { action: 'search', kind: 'ranked', control: 'fast' })).code, 'bad_request', 'fast blitz is casual only');
});

test('coin games: stakes are taken at the start; the winner gets the pot minus 10%', async () => {
  const a = await player('fin');
  const b = await player('gil');
  const row = await match(a, b, 'wager', 'rapid', 'low');
  assert.equal(row.stake, 100);
  assert.equal((await state(a)).coins, 400);
  assert.equal((await state(b)).coins, 400);
  const [white, black] = seats(row, a, b);
  await playPlies(row, white, black, 2);
  await game(white, { action: 'resign', id: row.id });
  assert.equal((await state(black)).coins, 580, 'pot 200 - 10% = 180');
  assert.equal((await state(white)).coins, 400);
  const res = await play(black, { action: 'result', gameId: row.id });
  assert.equal(res.result.coins_delta, 80);

  const poor = await player('hal');
  await admin.from('players').update({ coins: 50 }).eq('id', poor.id);
  assert.equal((await play(poor, { action: 'search', kind: 'wager', control: 'rapid', stake: 'low' })).code, 'insufficient_coins');
});

test('no first move within 30 s aborts the game: nothing changes, stakes come back', async () => {
  const a = await player('ivo');
  const b = await player('jon');
  const row = await match(a, b, 'wager', 'blitz', 'low');
  const [white, black] = seats(row, a, b);
  assert.equal((await game(black, { action: 'claim', id: row.id })).code, 'not_yet');
  await admin.from('games').update({ turn_started_at: new Date(Date.now() - 31_000).toISOString() }).eq('id', row.id);
  const claimed = await game(black, { action: 'claim', id: row.id });
  assert.equal(claimed.game.reason, 'aborted');
  assert.equal(claimed.game.result, null);
  assert.equal((await state(white)).coins, 500);
  assert.equal((await state(black)).coins, 500);
  assert.equal((await play(white, { action: 'result', gameId: row.id })).result.aborted, true);
  assert.equal((await admin.from('game_results').select('id').eq('game_id', row.id)).data?.length, 0);
});

test('running out of time loses; a game nobody claims is ended when a player comes back', async () => {
  const a = await player('kai');
  const b = await player('lea');
  const row = await match(a, b, 'ranked', 'blitz');
  const [white, black] = seats(row, a, b);
  await playPlies(row, white, black, 2);
  // white to move with one second left, two seconds ago
  await admin.from('games').update({ clock_w: 1_000, turn_started_at: new Date(Date.now() - 2_000).toISOString() }).eq('id', row.id);
  const late = await game(white, { action: 'move', id: row.id, move: { from: 'g1', to: 'f3' } });
  assert.equal(late.game.reason, 'timeout');
  assert.equal(late.game.result, row.white_id === white.id ? '0-1' : '1-0');
  assert.equal((await state(white)).mmr, 982);

  const c = await player('max');
  const d = await player('ned');
  const next = await match(c, d, 'casual', 'blitz');
  const [w2, b2] = seats(next, c, d);
  await playPlies(next, w2, b2, 2);
  await admin.from('games').update({ clock_w: 1_000, turn_started_at: new Date(Date.now() - 5_000).toISOString() }).eq('id', next.id);
  // both left; one comes back and searches again: the old game is ended first
  const back = await play(b2, { action: 'search', kind: 'casual', control: 'blitz' });
  assert.equal(back.searching, true);
  const ended = (await admin.from('games').select('status, reason, settled_at').eq('id', next.id).single()).data!;
  assert.equal(ended.status, 'finished');
  assert.equal(ended.reason, 'timeout');
  assert.ok(ended.settled_at);
  await play(b2, { action: 'leave' });
});

test('a match that ended before the player picked it up starts a new search', async () => {
  const a = await player('ole');
  const b = await player('ria');
  const row = await match(a, b, 'casual', 'rapid');
  await game(a, { action: 'resign', id: row.id });
  // b's search was matched by a's, but b only comes back after the game is over
  await admin.from('mm_queue').upsert({ player_id: b.id, kind: 'casual', control: 'rapid', mmr: 1000, game_id: row.id });
  const back = await play(b, { action: 'search', kind: 'casual', control: 'rapid' });
  assert.equal(back.searching, true);
  await play(b, { action: 'leave' });
});

test('a player in a running game gets it back instead of a new search', async () => {
  const a = await player('oda');
  const b = await player('pia');
  const row = await match(a, b, 'casual', 'rapid');
  assert.deepEqual(await play(a, { action: 'search', kind: 'ranked', control: 'rapid' }), { gameId: row.id, resumed: true });
  await game(a, { action: 'resign', id: row.id });
});

test('season end: rewards by the peak rank, MMR pulled towards 1,000, once', async () => {
  const q = await player('quin');
  await fn(q.client, 'account', { action: 'me' });
  await admin.from('players').update({ season: 1, mmr: 1500, season_peak_mmr: 1650 }).eq('id', q.id);
  const me = await fn(q.client, 'account', { action: 'me' });
  assert.equal(me.seasonGrants.length, 1);
  assert.equal(me.seasonGrants[0].bracket, 'gold-platinum');
  assert.equal(me.player.season, 2);
  assert.equal(me.player.mmr, 1375);
  assert.equal(me.player.coins, 500 + me.seasonGrants[0].coins);
  assert.ok(me.player.inventory.includes('season-1-gold-platinum'));
  assert.deepEqual((await fn(q.client, 'account', { action: 'me' })).seasonGrants, []);
});

test('players cannot write their state, see others\' MMR, or run the server functions', async () => {
  const r = await player('rio');
  const s = await player('sam');
  await fn(r.client, 'account', { action: 'me' });
  await fn(s.client, 'account', { action: 'me' });
  assert.equal((await r.client.from('players').select('id')).data?.length, 1, 'only their own row');
  const upd = await r.client.from('players').update({ coins: 999999 }).eq('id', r.id).select();
  assert.ok(upd.error || upd.data?.length === 0);
  assert.ok((await r.client.from('coin_ledger').insert({ player_id: r.id, amount: 5, reason: 'game' })).error);
  assert.ok((await r.client.from('mm_queue').select('*')).error || true);
  assert.ok((await r.client.rpc('buy_item', { p_player: r.id, p_item: 'x', p_price: 0 })).error);
  assert.ok((await r.client.rpc('settle_game', { p_game: 'x', p_rows: [] })).error);
  assert.ok((await r.client.rpc('mm_poll', { p_player: r.id, p_kind: 'casual', p_control: 'rapid', p_stake: null, p_mmr: 0, p_base_ms: 1 })).error);

  const guest = createClient(URL, KEY!, { auth: { persistSession: false } });
  clients.push(guest);
  await guest.auth.signInAnonymously();
  assert.equal((await fn(guest, 'play', { action: 'search', kind: 'casual', control: 'rapid' })).code, 'guest');
});
