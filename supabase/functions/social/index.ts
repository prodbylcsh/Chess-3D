// Every write to friendships and chat. Players read their own rows directly
// (row-level security); this function checks the rules and writes with the service role.
//
// POST { action: 'request' | 'accept' | 'decline' | 'cancel' | 'remove', userId } → { relation }
// POST { action: 'open', userId }                           → { conversationId }
// POST { action: 'send', conversationId, body, gameId? }    → { message }
// POST { action: 'read', conversationId }                   → { ok: true }
//
// Errors: { error, code } with an HTTP error status. Only registered players who have
// finished the first-time setup take part; guests get 403 'guest'. Messages go only
// between friends. The limits live in ../_shared/social.ts.
import { createClient, type User } from '@supabase/supabase-js';
import { AccountError } from '../_shared/accounts.ts';
import { FRIENDS_MAX, MESSAGES_PER_MINUTE, PENDING_MAX, isGameId, messageBody, pairOf } from '../_shared/social.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const fail = (code: string, message: string, status = 400) => new AccountError(code, message, status);

interface Friendship {
  id: string;
  user_a: string;
  user_b: string;
  status: 'pending' | 'accepted';
  requested_by: string;
}

interface ConversationRow {
  id: string;
  user_a: string;
  user_b: string;
}

const UNIQUE_VIOLATION = '23505';

/** Players take part once they have a username (first-time setup done). */
async function requirePlayer(id: string, self: boolean): Promise<void> {
  const { data, error } = await admin.from('profiles').select('onboarded_at').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data?.onboarded_at) {
    throw self ? fail('not_ready', 'Finish setting up your profile first.', 403) : fail('not_found', 'Player not found.', 404);
  }
}

async function friendship(me: string, other: string): Promise<Friendship | null> {
  const [a, b] = pairOf(me, other);
  const { data, error } = await admin.from('friendships').select('*').eq('user_a', a).eq('user_b', b).maybeSingle();
  if (error) throw error;
  return data as Friendship | null;
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

const friendsOf = (me: string) =>
  admin.from('friendships').select('id', { count: 'exact', head: true }).eq('status', 'accepted').or(`user_a.eq.${me},user_b.eq.${me}`);

async function request(me: string, other: string): Promise<string> {
  const row = await friendship(me, other);
  if (row?.status === 'accepted') return 'friend';
  if (row && row.requested_by === me) return 'outgoing';
  if (row) return accept(me, other);

  const pending = await count(
    admin.from('friendships').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('requested_by', me),
  );
  if (pending >= PENDING_MAX) throw fail('too_many_requests', 'You have too many requests waiting for an answer.', 429);
  if ((await count(friendsOf(me))) >= FRIENDS_MAX) throw fail('too_many_friends', 'You have reached the friend limit.', 409);

  const [a, b] = pairOf(me, other);
  const { error } = await admin.from('friendships').insert({ user_a: a, user_b: b, status: 'pending', requested_by: me });
  if (error && error.code !== UNIQUE_VIOLATION) throw error; // a parallel request created it
  return 'outgoing';
}

async function accept(me: string, other: string): Promise<string> {
  const row = await friendship(me, other);
  if (row?.status === 'accepted') return 'friend';
  if (!row || row.requested_by === me) throw fail('no_request', 'That request is no longer there.', 404);
  if ((await count(friendsOf(me))) >= FRIENDS_MAX) throw fail('too_many_friends', 'You have reached the friend limit.', 409);
  const { error } = await admin
    .from('friendships')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) throw error;
  return 'friend';
}

/** Delete the pair's row if it is in the expected state; no row is fine (already gone). */
async function drop(me: string, other: string, allowed: (row: Friendship) => boolean): Promise<string> {
  const row = await friendship(me, other);
  if (row && allowed(row)) {
    const { error } = await admin.from('friendships').delete().eq('id', row.id);
    if (error) throw error;
  }
  return 'none';
}

async function conversationOf(me: string, id: unknown): Promise<ConversationRow> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw fail('not_found', 'Conversation not found.', 404);
  const { data, error } = await admin.from('conversations').select('id, user_a, user_b').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || (data.user_a !== me && data.user_b !== me)) throw fail('not_found', 'Conversation not found.', 404);
  return data as ConversationRow;
}

async function open(me: string, other: string): Promise<string> {
  const [a, b] = pairOf(me, other);
  const { data: existing, error } = await admin.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;
  if ((await friendship(me, other))?.status !== 'accepted') throw fail('not_friends', 'You can only message your friends.', 403);
  const inserted = await admin.from('conversations').insert({ user_a: a, user_b: b }).select('id').single();
  if (inserted.error?.code === UNIQUE_VIOLATION) return open(me, other);
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

async function send(me: string, body: Record<string, unknown>): Promise<unknown> {
  const conversation = await conversationOf(me, body.conversationId);
  const other = conversation.user_a === me ? conversation.user_b : conversation.user_a;
  if ((await friendship(me, other))?.status !== 'accepted') throw fail('not_friends', 'You can only message your friends.', 403);

  const invite = body.gameId !== undefined && body.gameId !== null;
  if (invite && !isGameId(body.gameId)) throw fail('bad_request', 'Unknown game.');
  const parsed = messageBody(body.body, invite);
  if ('problem' in parsed) {
    throw parsed.problem === 'empty' ? fail('empty', 'Write a message first.') : fail('too_long', 'That message is too long.');
  }

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const recent = await count(
    admin.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', me).gte('created_at', minuteAgo),
  );
  if (recent >= MESSAGES_PER_MINUTE) throw fail('rate_limited', 'You are sending messages too fast.', 429);

  const { data: message, error } = await admin
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_id: me,
      body: parsed.text,
      kind: invite ? 'invite' : 'text',
      game_id: invite ? body.gameId : null,
    })
    .select()
    .single();
  if (error) throw error;
  const readColumn = conversation.user_a === me ? 'a_read_at' : 'b_read_at';
  const update = await admin
    .from('conversations')
    .update({ last_message_at: message.created_at, [readColumn]: message.created_at })
    .eq('id', conversation.id);
  if (update.error) throw update.error;
  return { message };
}

async function read(me: string, id: unknown): Promise<unknown> {
  const conversation = await conversationOf(me, id);
  const readColumn = conversation.user_a === me ? 'a_read_at' : 'b_read_at';
  const { error } = await admin.from('conversations').update({ [readColumn]: new Date().toISOString() }).eq('id', conversation.id);
  if (error) throw error;
  return { ok: true };
}

async function otherPlayer(me: string, body: Record<string, unknown>): Promise<string> {
  const other = body.userId;
  if (typeof other !== 'string' || !/^[0-9a-f-]{36}$/.test(other)) throw fail('not_found', 'Player not found.', 404);
  if (other === me) throw fail('self', 'That is you.');
  await requirePlayer(other, false);
  return other;
}

async function handle(user: User, body: Record<string, unknown>): Promise<unknown> {
  const me = user.id;
  await requirePlayer(me, true);
  switch (body.action) {
    case 'request':
      return { relation: await request(me, await otherPlayer(me, body)) };
    case 'accept':
      return { relation: await accept(me, await otherPlayer(me, body)) };
    case 'decline':
      return { relation: await drop(me, await otherPlayer(me, body), (r) => r.status === 'pending' && r.requested_by !== me) };
    case 'cancel':
      return { relation: await drop(me, await otherPlayer(me, body), (r) => r.status === 'pending' && r.requested_by === me) };
    case 'remove':
      return { relation: await drop(me, await otherPlayer(me, body), (r) => r.status === 'accepted') };
    case 'open':
      return { conversationId: await open(me, await otherPlayer(me, body)) };
    case 'send':
      return send(me, body);
    case 'read':
      return read(me, body.conversationId);
    default:
      throw fail('bad_request', 'Unknown action.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed', code: 'bad_request' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return reply({ error: 'Please sign in again.', code: 'unauthorized' }, 401);
  if (auth.user.is_anonymous) return reply({ error: 'Create an account first.', code: 'guest' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid JSON.', code: 'bad_request' }, 400);
  }

  try {
    return reply(await handle(auth.user, body));
  } catch (err) {
    if (err instanceof AccountError) return reply({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return reply({ error: 'Server error.', code: 'server_error' }, 500);
  }
});
