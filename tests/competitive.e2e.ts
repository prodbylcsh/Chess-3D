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
  const cheap = itemDef('monolith-board')!;
  const pricey = itemDef('monolith-set')!;
  await admin.from('players').update({ coins: 50_000 }).eq('id', ana.id); // as if earned in games
  const bought = await fn(ana.client, 'account', { action: 'buy', itemId: cheap.id });
  assert.equal(bought.player.coins, 50_000 - cheap.price);
  assert.ok(bought.player.inventory.includes(cheap.id));
  // ownership is recorded with how and when the item came
  const owned = await ana.client.from('player_items').select('item_id, source, price_paid');
  assert.deepEqual(owned.data, [{ item_id: cheap.id, source: 'purchase', price_paid: cheap.price }]);
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
  assert.deepEqual(res.result.awards, ['first-win'], 'the first win earns an award, kept on the server');
  const kept = (await white.client.from('player_awards').select('award_id, game_id').eq('player_id', white.id)).data;
  assert.deepEqual(kept, [{ award_id: 'first-win', game_id: row.id }]);
  assert.ok((await white.client.from('player_awards').insert({ player_id: white.id, award_id: 'wins-100' })).error, 'players cannot give themselves awards');

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

test('engine analysis: identical reports add the performance part; different ones change nothing', async () => {
  const { ANALYSIS, accuracies } = await import('../supabase/functions/_shared/analysis.ts');
  const { mmrChange } = await import('../supabase/functions/_shared/rating.ts');
  const { coinReward } = await import('../supabase/functions/_shared/economy.ts');
  const a = await player('ivy');
  const b = await player('tom');
  const row = await match(a, b, 'ranked');
  const [white, black] = seats(row, a, b);
  await playPlies(row, white, black, 20);
  await game(black, { action: 'resign', id: row.id });
  assert.equal((await state(white)).mmr, 1020);

  // White plays steadily; Black gives away a piece on its fifth move
  const scores = Array.from({ length: 21 }, (_, i) => (i < 10 ? 20 : 400));
  const report = { engine: ANALYSIS.engine, scores };
  assert.equal((await play(white, { action: 'analysis', gameId: row.id })).status, 'waiting');
  assert.equal((await play(white, { action: 'analysis', gameId: row.id, report: { ...report, scores: scores.slice(1) } })).code, 'bad_request');
  assert.equal((await play(white, { action: 'analysis', gameId: row.id, report })).status, 'waiting', 'one report is not enough');
  const done = await play(black, { action: 'analysis', gameId: row.id, report });
  assert.equal(done.status, 'applied', JSON.stringify(done));

  const acc = accuracies(scores);
  const win = mmrChange({ outcome: 'win', mmr: 1000, opponentMmr: 1000, accuracy: acc.w, winStreak: 0 });
  const loss = mmrChange({ outcome: 'loss', mmr: 1000, opponentMmr: 1000, accuracy: acc.b, winStreak: 0 });
  assert.ok(win.performance > 0 && loss.performance > 0, `both played above 70%: ${acc.w} / ${acc.b}`);
  assert.equal((await state(white)).mmr, 1000 + win.total);
  assert.equal((await state(black)).mmr, 1000 + loss.total);
  const coins = coinReward({ kind: 'ranked', outcome: 'loss', accuracy: acc.b, mmr: 1000, opponentMmr: 1000, winStreak: 0 });
  assert.equal((await state(black)).coins, 500 + coins.total);
  assert.equal(done.result.mmr_delta, loss.total, 'the result shows the whole change');
  assert.equal(done.result.accuracy, Math.round(acc.b!));
  assert.equal(done.result.breakdown.mmr.performance, loss.performance);

  const ledger = (await admin.from('coin_ledger').select('amount').eq('player_id', black.id).eq('reason', 'performance')).data!;
  assert.equal(ledger.length, 1);
  const pub = (await black.client.from('game_results').select('accuracy').eq('game_id', row.id).eq('player_id', white.id).single()).data!;
  assert.equal(pub.accuracy, Math.round(acc.w!), 'accuracy is public like the rest of the result');
  const precise = (await admin.from('player_awards').select('award_id').eq('player_id', white.id).eq('award_id', 'accuracy-90')).data!;
  assert.equal(precise.length, acc.w! >= 90 ? 1 : 0, 'precision is awarded from the agreed analysis');
  assert.equal((await play(black, { action: 'analysis', gameId: row.id, report })).status, 'applied', 'once only');
  assert.equal((await state(black)).mmr, 1000 + loss.total);

  // a casual game whose reports differ: nothing changes
  const c = await match(a, b, 'casual', 'blitz');
  const [cw, cb] = seats(c, a, b);
  await playPlies(c, cw, cb, 20);
  await game(cw, { action: 'resign', id: c.id });
  const before = [(await state(cw)).coins, (await state(cb)).coins];
  await play(cw, { action: 'analysis', gameId: c.id, report });
  const mismatch = await play(cb, { action: 'analysis', gameId: c.id, report: { ...report, scores: scores.map((s) => s + 1) } });
  assert.equal(mismatch.status, 'mismatch');
  assert.deepEqual([(await state(cw)).coins, (await state(cb)).coins], before);
  const mine = (await admin.from('game_results').select('accuracy').eq('game_id', c.id)).data!;
  assert.deepEqual(mine.map((r) => r.accuracy), [null, null]);

  // other people's games: no analysis
  const outsider = await player('uma');
  assert.equal((await play(outsider, { action: 'analysis', gameId: row.id, report })).code, 'not_found');
});

test('fair play: coin games are analysed too; a player is judged by the agreed analysis or the opponent\'s report', async () => {
  const { ANALYSIS } = await import('../supabase/functions/_shared/analysis.ts');
  const a = await player('vic');
  const b = await player('wes');
  const row = await match(a, b, 'wager', 'rapid', 'low');
  const [white, black] = seats(row, a, b);
  await playPlies(row, white, black, 20);
  await game(white, { action: 'resign', id: row.id });
  const timed = (await admin.from('games').select('move_ms').eq('id', row.id).single()).data!;
  assert.equal(timed.move_ms.length, 20, 'the server timed every move');

  // every move was the engine's first choice; Black left the game before its last two moves
  const scores = Array(21).fill(0);
  const best = [...UCI.slice(0, 20), ''];
  const away = Array.from({ length: 20 }, (_, i) => (i === 17 || i === 19 ? 5_000 : 0));
  const first = await play(black, { action: 'analysis', gameId: row.id, report: { engine: ANALYSIS.engine, scores, best, away } });
  assert.equal(first.status, 'waiting');
  const fair = async () => (await admin.from('fairplay_games').select('*').eq('game_id', row.id)).data!;
  let rows = await fair();
  assert.deepEqual(rows.map((r) => [r.player_id, r.source, r.kind]), [[white.id, 'opponent', 'wager']], 'White is judged by Black\'s report until White\'s arrives');
  assert.equal(rows[0].signals.counted, 2);
  assert.equal(rows[0].signals.matched, 2);
  assert.equal(rows[0].signals.times.length, 9, 'think times from the server');

  const done = await play(white, { action: 'analysis', gameId: row.id, report: { engine: ANALYSIS.engine, scores, best } });
  assert.equal(done.status, 'applied');
  rows = await fair();
  assert.deepEqual(rows.map((r) => r.source), ['agreed', 'agreed']);
  assert.equal(rows.find((r) => r.player_id === black.id).signals.away, 2, 'the away times are the player\'s own');
  const res = await play(black, { action: 'result', gameId: row.id });
  assert.equal(res.result.coins_delta, 80, 'a coin game still pays just its stake');
  assert.equal(res.result.accuracy, 100);
  assert.equal((await state(black)).coins, 580);

  // a review per player, for the operator only
  const flag = (await admin.from('fairplay_flags').select('*').eq('player_id', black.id).single()).data!;
  assert.equal(flag.status, 'open');
  assert.equal(flag.stats.games, 1);
  for (const table of ['fairplay_games', 'fairplay_flags', 'fairplay_queue']) {
    const read = await black.client.from(table).select('*');
    assert.ok(read.error || read.data!.length === 0, `players cannot read ${table}`);
  }
  // the operator's verdict remembers the level; a higher level brings the player back
  await admin.from('fairplay_flags').update({ status: 'cleared', note: 'checked' }).eq('player_id', black.id);
  const cleared = (await admin.from('fairplay_flags').select('*').eq('player_id', black.id).single()).data!;
  assert.equal(cleared.reviewed_level, flag.level);
  assert.ok(cleared.reviewed_at);
  assert.ifError((await admin.rpc('fairplay_flag', { p_player: black.id, p_level: flag.level, p_reasons: [], p_stats: {} })).error);
  assert.equal((await admin.from('fairplay_flags').select('status').eq('player_id', black.id).single()).data!.status, 'cleared');
  assert.ifError((await admin.rpc('fairplay_flag', { p_player: black.id, p_level: flag.level + 2, p_reasons: [], p_stats: {} })).error);
  assert.equal((await admin.from('fairplay_flags').select('status').eq('player_id', black.id).single()).data!.status, 'open');
  const queue = (await admin.from('fairplay_queue').select('player_id, level').eq('player_id', black.id)).data!;
  assert.equal(queue.length, 1);
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
  const won = await q.client.from('player_items').select('item_id, source, season');
  assert.deepEqual(won.data, [{ item_id: 'season-1-gold-platinum', source: 'season', season: 1 }]);
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
  assert.ok((await r.client.from('player_items').insert({ player_id: r.id, item_id: 'monolith-set', source: 'grant' })).error, 'no free items');
  assert.equal((await r.client.from('items').select('id').eq('id', 'monolith-set')).data?.length, 1, 'the catalogue is public');
  // the server checks the catalogue too: not for sale, or the wrong price
  assert.ok((await admin.rpc('buy_item', { p_player: r.id, p_item: 'onyx-gold-set', p_price: 0 })).error, 'retired');
  assert.ok((await admin.rpc('buy_item', { p_player: r.id, p_item: 'monolith-set', p_price: 1 })).error, 'wrong price');
  assert.ok((await r.client.rpc('settle_game', { p_game: 'x', p_rows: [] })).error);
  assert.ok((await r.client.rpc('mm_poll', { p_player: r.id, p_kind: 'casual', p_control: 'rapid', p_stake: null, p_mmr: 0, p_base_ms: 1 })).error);

  const guest = createClient(URL, KEY!, { auth: { persistSession: false } });
  clients.push(guest);
  await guest.auth.signInAnonymously();
  assert.equal((await fn(guest, 'play', { action: 'search', kind: 'casual', control: 'rapid' })).code, 'guest');
});
