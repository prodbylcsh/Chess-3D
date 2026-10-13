// Coins for real money through Paddle (rules: ../_shared/payments.ts).
//
// Signed-in, onboarded players:
// POST { action: 'checkout', pack, waiver: true } → { transactionId } a Paddle transaction the app
//      opens in Paddle's checkout; `waiver`: the player asked for the coins at once and accepted
//      losing the right of withdrawal once they are delivered
// POST { action: 'status', transactionId }       → { status, player } the purchase as it stands
//
// Paddle's webhooks (header Paddle-Signature, no session): transaction.completed credits the
// coins once; an approved refund or a chargeback takes them back.
//
// Secrets (Supabase function secrets): PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_ENV
// ('sandbox' until live). PADDLE_API_URL overrides the API address (local tests).
import { createClient, type User } from '@supabase/supabase-js';
import { AccountError } from '../_shared/accounts.ts';
import { packOf, paddleApi, paymentEvent, transactionBody, verifyWebhook, type PaddleEnv } from '../_shared/payments.ts';
import { ensurePlayer, getPlayer } from '../_shared/server/competitive.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const API_KEY = Deno.env.get('PADDLE_API_KEY') ?? '';
const WEBHOOK_SECRET = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? '';
const API_URL = Deno.env.get('PADDLE_API_URL') ?? paddleApi((Deno.env.get('PADDLE_ENV') ?? 'sandbox') as PaddleEnv);

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (code: string, message: string, status = 400) => new AccountError(code, message, status);

async function checkout(user: User, body: Record<string, unknown>): Promise<unknown> {
  if (!API_KEY) throw fail('unavailable', 'Buying coins is not available yet.', 503);
  const pack = packOf(body.pack);
  if (!pack) throw fail('bad_request', 'Unknown coin pack.');
  if (body.waiver !== true) throw fail('bad_request', 'Please confirm that you want the coins delivered right away.');
  await ensurePlayer(admin, user.id);

  const res = await fetch(`${API_URL}/transactions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(transactionBody(pack, user.id)),
  }).catch((err: Error) => err);
  const json = res instanceof Response ? await res.json().catch(() => null) : null;
  if (!(res instanceof Response) || !res.ok || typeof json?.data?.id !== 'string') {
    console.error('paddle transaction failed', res instanceof Response ? res.status : res.message, JSON.stringify(json?.error ?? json).slice(0, 500));
    throw fail('payment_failed', 'The payment could not be started. Please try again.', 502);
  }
  const { error } = await admin.from('purchases').insert({
    id: json.data.id,
    player_id: user.id,
    pack: pack.id,
    coins: pack.coins,
    amount: pack.price,
    currency: 'EUR',
  });
  if (error) throw error;
  return { transactionId: json.data.id };
}

async function status(user: User, transactionId: unknown): Promise<unknown> {
  if (typeof transactionId !== 'string') throw fail('not_found', 'Purchase not found.', 404);
  const { data, error } = await admin.from('purchases').select('status').eq('id', transactionId).eq('player_id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw fail('not_found', 'Purchase not found.', 404);
  return { status: data.status, player: await getPlayer(admin, user.id) };
}

/** Paddle's notification: verified, then applied once (Paddle retries until we answer 200). */
async function webhook(req: Request): Promise<Response> {
  const raw = await req.text();
  if (!(await verifyWebhook(req.headers.get('Paddle-Signature'), raw, WEBHOOK_SECRET))) {
    return reply({ error: 'Invalid signature.', code: 'unauthorized' }, 401);
  }
  const event = paymentEvent(JSON.parse(raw));
  if (event.kind === 'paid') {
    await ensurePlayer(admin, event.playerId);
    const { error } = await admin.rpc('complete_purchase', {
      p_id: event.transactionId,
      p_player: event.playerId,
      p_pack: event.pack.id,
      p_coins: event.pack.coins,
      p_amount: event.amount,
      p_currency: event.currency,
    });
    if (error) throw error;
  } else if (event.kind === 'reversed') {
    const { error } = await admin.rpc('reverse_purchase', { p_id: event.transactionId });
    if (error) throw error;
  }
  return reply({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed', code: 'bad_request' }, 405);

  try {
    if (req.headers.has('Paddle-Signature')) return await webhook(req);

    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    if (!auth.user) return reply({ error: 'Please sign in again.', code: 'unauthorized' }, 401);
    if (auth.user.is_anonymous) return reply({ error: 'Create an account first.', code: 'guest' }, 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return reply({ error: 'Invalid JSON.', code: 'bad_request' }, 400);

    const { data: profile, error } = await admin.from('profiles').select('onboarded_at').eq('id', auth.user.id).maybeSingle();
    if (error) throw error;
    if (!profile?.onboarded_at) throw fail('not_ready', 'Finish setting up your profile first.', 403);
    switch (body.action) {
      case 'checkout':
        return reply(await checkout(auth.user, body));
      case 'status':
        return reply(await status(auth.user, body.transactionId));
      default:
        throw fail('bad_request', 'Unknown action.');
    }
  } catch (err) {
    if (err instanceof AccountError) return reply({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return reply({ error: 'Server error.', code: 'server_error' }, 500);
  }
});
