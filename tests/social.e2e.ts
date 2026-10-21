// End-to-end test of friends and chat against a running local Supabase stack
// (.claude/skills/local-supabase):
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
const newClient = () => {
  const client = createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client);
  return client;
};
// open realtime sockets would keep the test process alive
after(() => clients.forEach((c) => c.realtime.disconnect()));

interface Player {
  client: SupabaseClient;
  id: string;
  name: string;
}

/** A confirmed, onboarded player, signed in. */
async function player(name: string, onboard = true): Promise<Player> {
  const email = `${name}-${run}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(created.error);
  const client = newClient();
  assert.ifError((await client.auth.signInWithPassword({ email, password: PASSWORD })).error);
  const username = `${name}_${run}`.slice(0, 20);
  if (onboard) await fn(client, 'account', { action: 'update', patch: { username, iconId: 'rook', onboardingStep: 4, onboarded: true } });
  return { client, id: created.data.user!.id, name: username };
}

/** Call a function; returns the body, or { status, code } on an error status. */
async function fn(client: SupabaseClient, name: string, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke(name, { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    return { status: res.status, ...(await res.json()) };
  }
  throw error;
}
const social = (p: Player, body: Record<string, unknown>) => fn(p.client, 'social', body);

test('friend requests: send, see, accept; only friends can chat', async () => {
  const ann = await player('ann');
  const ben = await player('ben');

  assert.equal((await social(ann, { action: 'open', userId: ben.id })).code, 'not_friends');
  assert.deepEqual(await social(ann, { action: 'request', userId: ben.id }), { relation: 'outgoing' });
  assert.deepEqual(await social(ann, { action: 'request', userId: ben.id }), { relation: 'outgoing' }, 'repeating is harmless');

  const incoming = await ben.client.from('friendships').select('status, requested_by');
  assert.deepEqual(incoming.data, [{ status: 'pending', requested_by: ann.id }]);

  // a request back accepts the pending one
  assert.deepEqual(await social(ben, { action: 'request', userId: ann.id }), { relation: 'friend' });
  const { conversationId } = await social(ann, { action: 'open', userId: ben.id });
  assert.equal((await social(ben, { action: 'open', userId: ann.id })).conversationId, conversationId, 'one conversation per pair');

  const sent = await social(ann, { action: 'send', conversationId, body: '  Hello Ben!  ' });
  assert.equal(sent.message.body, 'Hello Ben!');
  assert.equal((await social(ann, { action: 'send', conversationId, body: '   ' })).code, 'empty');
  assert.equal((await social(ann, { action: 'send', conversationId, body: 'x'.repeat(1001) })).code, 'too_long');
  const invite = await social(ann, { action: 'send', conversationId, body: '', gameId: 'abc23xyz9k' });
  assert.equal(invite.message.kind, 'invite');

  const list = await ben.client.from('conversation_list').select('id, other_id, unread, last_body, last_kind');
  assert.deepEqual(list.data, [{ id: conversationId, other_id: ann.id, unread: 2, last_body: '', last_kind: 'invite' }]);
  await social(ben, { action: 'read', conversationId });
  assert.equal((await ben.client.from('conversation_list').select('unread').single()).data?.unread, 0);
  assert.equal((await ann.client.from('conversation_list').select('unread').single()).data?.unread, 0, 'own messages are never unread');

  // unfriending stops the chat; the history stays readable
  assert.deepEqual(await social(ben, { action: 'remove', userId: ann.id }), { relation: 'none' });
  assert.equal((await social(ann, { action: 'send', conversationId, body: 'still there?' })).code, 'not_friends');
  assert.equal((await ann.client.from('messages').select('id').eq('conversation_id', conversationId)).data?.length, 2);
});

test('decline and cancel; strangers see nothing', async () => {
  const cid = await player('cid');
  const dan = await player('dan');
  const eve = await player('eve');

  await social(cid, { action: 'request', userId: dan.id });
  assert.deepEqual(await social(dan, { action: 'decline', userId: cid.id }), { relation: 'none' });
  assert.equal((await cid.client.from('friendships').select('id')).data?.length, 0);

  await social(cid, { action: 'request', userId: eve.id });
  assert.equal((await dan.client.from('friendships').select('id')).data?.length, 0, 'others cannot see the request');
  assert.equal((await social(eve, { action: 'cancel', userId: cid.id })).relation, 'none', 'only the sender can cancel');
  assert.equal((await eve.client.from('friendships').select('id')).data?.length, 1);
  await social(cid, { action: 'cancel', userId: eve.id });
  assert.equal((await eve.client.from('friendships').select('id')).data?.length, 0);
  assert.equal((await social(eve, { action: 'accept', userId: cid.id })).code, 'no_request');
});

test('only the function writes; players outside a conversation cannot read it', async () => {
  const fay = await player('fay');
  const gus = await player('gus');
  const hal = await player('hal');
  await social(fay, { action: 'request', userId: gus.id });
  await social(gus, { action: 'accept', userId: fay.id });
  const { conversationId } = await social(fay, { action: 'open', userId: gus.id });
  await social(fay, { action: 'send', conversationId, body: 'secret plan: e4' });

  assert.equal((await hal.client.from('messages').select('id').eq('conversation_id', conversationId)).data?.length, 0);
  assert.equal((await hal.client.from('conversation_list').select('id')).data?.length, 0);
  assert.equal((await social(hal, { action: 'send', conversationId, body: 'hi' })).code, 'not_found');
  assert.equal((await social(hal, { action: 'read', conversationId })).code, 'not_found');

  const [a, b] = [fay.id, hal.id].sort();
  assert.ok((await hal.client.from('friendships').insert({ user_a: a, user_b: b, status: 'accepted', requested_by: hal.id })).error);
  assert.ok((await hal.client.from('messages').insert({ conversation_id: conversationId, sender_id: hal.id, body: 'x' })).error);
  const upd = await fay.client.from('messages').update({ body: 'edited' }).eq('conversation_id', conversationId).select();
  assert.ok(upd.error || upd.data?.length === 0);

  const guest = newClient();
  await guest.auth.signInAnonymously();
  const res = await fn(guest, 'social', { action: 'request', userId: fay.id });
  assert.equal(res.status, 403);
  assert.equal(res.code, 'guest');

  const unfinished = await player('ivy', false);
  assert.equal((await social(unfinished, { action: 'request', userId: fay.id })).code, 'not_ready');
  assert.equal((await social(fay, { action: 'request', userId: unfinished.id })).code, 'not_found');
});

test('new messages and requests arrive through realtime, only for the people involved', async () => {
  const jay = await player('jay');
  const kim = await player('kim');
  const lou = await player('lou');

  const heard = (p: Player, table: string) => {
    const events: Record<string, unknown>[] = [];
    let ready!: () => void;
    const subscribed = new Promise<void>((r) => (ready = r));
    const channel = p.client
      .channel(`test-${table}-${p.name}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (e) => events.push(e.new))
      .subscribe((status) => status === 'SUBSCRIBED' && ready());
    return { events, subscribed, stop: () => p.client.removeChannel(channel) };
  };

  const kimRequests = heard(kim, 'friendships');
  const louRequests = heard(lou, 'friendships');
  await Promise.all([kimRequests.subscribed, louRequests.subscribed]);
  await new Promise((r) => setTimeout(r, 1000));
  await social(jay, { action: 'request', userId: kim.id });
  for (let i = 0; i < 50 && kimRequests.events.length === 0; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(kimRequests.events.length, 1, 'kim hears about the request');
  assert.equal(louRequests.events.length, 0, 'lou does not');

  await social(kim, { action: 'accept', userId: jay.id });
  const { conversationId } = await social(jay, { action: 'open', userId: kim.id });
  const kimMessages = heard(kim, 'messages');
  const louMessages = heard(lou, 'messages');
  await Promise.all([kimMessages.subscribed, louMessages.subscribed]);
  await new Promise((r) => setTimeout(r, 1000));
  await social(jay, { action: 'send', conversationId, body: 'your move' });
  for (let i = 0; i < 50 && kimMessages.events.length === 0; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(kimMessages.events.length, 1);
  assert.equal((kimMessages.events[0] as { body: string }).body, 'your move');
  assert.equal(louMessages.events.length, 0);
  for (const h of [kimRequests, louRequests, kimMessages, louMessages]) await h.stop();
});

test('showcase: the server publishes rank, stats and look; players cannot write it', async () => {
  const max = await player('max');
  const ned = await player('ned');
  await fn(max.client, 'account', { action: 'me' }); // creates max's competitive state
  const showcase = {
    rank: { tier: 'gold', division: 3, progress: 0.25 },
    stats: { wins: 7, losses: 2, draws: 1, winStreak: 3, rankedStreak: 2, bestStreak: 4 },
    loadout: { pieces: 'marble-set', board: 'marble-board', background: 'candlelit-study', moveAnimation: 'glide', destruction: 'shatter' },
  };
  assert.equal((await fn(max.client, 'account', { action: 'showcase', showcase })).code, 'bad_request');
  await max.client.from('profiles').update({ showcase }).eq('id', max.id);
  const seen = (await ned.client.from('profiles').select('showcase').eq('id', max.id).single()).data?.showcase;
  assert.equal(seen.rank.tier, 'silver');
  assert.equal(seen.stats.wins, 0);
  assert.equal(seen.loadout.pieces, 'marble-set');
});

test('deleting an account removes its friendships and conversations', async () => {
  const oli = await player('oli');
  const pam = await player('pam');
  await social(oli, { action: 'request', userId: pam.id });
  await social(pam, { action: 'accept', userId: oli.id });
  const { conversationId } = await social(oli, { action: 'open', userId: pam.id });
  await social(oli, { action: 'send', conversationId, body: 'bye' });
  // a burst of messages hits the per-minute limit
  let limited = false;
  for (let i = 0; i < 25 && !limited; i++) limited = (await social(oli, { action: 'send', conversationId, body: `m${i}` })).code === 'rate_limited';
  assert.ok(limited, 'too many messages a minute are refused');

  assert.ifError((await admin.auth.admin.deleteUser(oli.id)).error);
  assert.equal((await pam.client.from('friendships').select('id')).data?.length, 0);
  assert.equal((await pam.client.from('conversation_list').select('id')).data?.length, 0);
  assert.equal((await admin.from('messages').select('id').eq('conversation_id', conversationId)).data?.length, 0);
});

test('blocking ends the friendship, stops requests both ways, and only the blocker sees it', async () => {
  const cara = await player('blka');
  const dan = await player('blkb');
  await social(cara, { action: 'request', userId: dan.id });
  await social(dan, { action: 'accept', userId: cara.id });
  const { conversationId } = await social(dan, { action: 'open', userId: cara.id });
  const message = (await social(dan, { action: 'send', conversationId, body: 'you are terrible' })).message;

  assert.deepEqual(await social(cara, { action: 'block', userId: dan.id }), { blocked: true });
  assert.deepEqual(await social(cara, { action: 'block', userId: dan.id }), { blocked: true }, 'repeating is harmless');
  assert.deepEqual((await cara.client.from('friendships').select('id')).data, [], 'no longer friends');
  assert.equal((await social(dan, { action: 'send', conversationId, body: 'hello?' })).code, 'not_friends');
  assert.equal((await social(dan, { action: 'request', userId: cara.id })).code, 'unavailable');
  assert.equal((await social(cara, { action: 'request', userId: dan.id })).code, 'blocked');
  assert.deepEqual((await cara.client.from('blocks').select('blocked')).data, [{ blocked: dan.id }]);
  assert.deepEqual((await dan.client.from('blocks').select('blocked')).data, [], 'the blocked player is not told');
  assert.ok((await cara.client.from('blocks').insert({ blocker: cara.id, blocked: dan.id })).error, 'clients cannot write blocks');

  // reports: a message from the other player in my conversation, kept as a copy
  assert.deepEqual(await social(cara, { action: 'report', userId: dan.id, reason: 'abuse', messageId: message.id, note: ' rude ' }), { ok: true });
  assert.deepEqual(await social(cara, { action: 'report', userId: dan.id, reason: 'abuse', messageId: message.id }), { ok: true }, 'the same report again adds nothing');
  assert.equal((await social(cara, { action: 'report', userId: dan.id, reason: 'nope' })).code, 'bad_request');
  assert.equal((await social(dan, { action: 'report', userId: cara.id, reason: 'abuse', messageId: message.id })).code, 'not_found', 'only the other player’s messages');
  const reports = (await admin.from('reports').select('reporter, reason, message_body, note, status').eq('reported', dan.id)).data;
  assert.deepEqual(reports, [{ reporter: cara.id, reason: 'abuse', message_body: 'you are terrible', note: 'rude', status: 'open' }]);
  assert.deepEqual((await cara.client.from('reports').select('id')).data ?? [], [], 'players cannot read reports');
  const queue = (await admin.from('report_queue').select('reported_name, reporter_name').eq('reported', dan.id)).data;
  assert.deepEqual(queue, [{ reported_name: dan.name, reporter_name: cara.name }]);

  assert.deepEqual(await social(cara, { action: 'unblock', userId: dan.id }), { blocked: false });
  assert.deepEqual(await social(dan, { action: 'request', userId: cara.id }), { relation: 'outgoing' }, 'requests work again');
});

test('matchmaking never pairs players who blocked each other', async () => {
  const eve = await player('blkc');
  const fay = await player('blkd');
  await social(eve, { action: 'block', userId: fay.id });
  const search = (p: Player) => fn(p.client, 'play', { action: 'search', kind: 'casual', control: 'rapid' });
  await search(eve);
  const second = await search(fay);
  assert.equal(second.gameId, undefined, JSON.stringify(second));
  await fn(eve.client, 'play', { action: 'leave' });
  await fn(fay.client, 'play', { action: 'leave' });
});
