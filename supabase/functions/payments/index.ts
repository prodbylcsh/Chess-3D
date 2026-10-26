// Coins for real money through Paddle (rules: ../_shared/payments.ts).
//
// Signed-in, onboarded players:
// POST { action: 'checkout', pack, waiver: true } → { transactionId } a Paddle transaction the app
//      opens in Paddle's checkout; `waiver`: the player asked for the coins at once and accepted
//      losing the right of withdrawal once they are delivered
// POST { action: 'status', transactionId }       → { status, player } the purchase as it stands
//
// Premium, the subscription (rules: ../_shared/subscription.ts, docs/PLATFORM.md §4.9):
// POST { action: 'subscribe', plan, period, waiver: true } → { transactionId } a Paddle transaction with
//      the plan's recurring price (Wizard's 7-day trial once per account), opened in the same checkout
// POST { action: 'subscription' }                    → { premium, trialUsed, given, player } the player's plan
//      (the app asks until the webhook has created it), after giving the monthly coins owed
// POST { action: 'change', plan, period }            → { premium, player } another plan: an upgrade is
//      charged at once (the difference) and tops this month's coins up; a downgrade is credited to
//      the next payment
// POST { action: 'cancel' } / { action: 'resume' }   → { premium } cancel at the end of the paid period,
//      or take the cancellation back
// POST { action: 'manage' }                          → { url } Paddle's customer portal (payment method, invoices)
//
// Paddle's webhooks (header Paddle-Signature, no session): transaction.completed credits a coin
// pack once (with the subscriber's bonus, decided at checkout) or records a paid subscription
// period; subscription.* keep the subscription in step; an approved refund or a chargeback takes
// the coins back.
//
// Secrets (Supabase function secrets): PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_ENV
// ('sandbox' until live). PADDLE_API_URL overrides the API address (local tests).
import { createClient, type User } from '@supabase/supabase-js';
import { AccountError } from '../_shared/accounts.ts';
import { packOf, paddleApi, paymentEvent, transactionBody, verifyWebhook, type PaddleEnv } from '../_shared/payments.ts';
import { isFounder, isPeriod, packBonus, planLevel, planOf, priceOf, subscriptionBody, subscriptionEvent } from '../_shared/subscription.ts';
import { ensurePlayer, getPlayer } from '../_shared/server/competitive.ts';
import { applyPremium, paddle, subscriptionsOf } from '../_shared/server/premium.ts';

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
  const { player } = await ensurePlayer(admin, user.id);
  // a subscriber gets extra coins on packs: decided now, carried in Paddle's signed custom_data
  const bonus = packBonus(pack.coins, player.premium?.plan ?? null);
  const order = transactionBody(pack, user.id);

  const res = await fetch(`${API_URL}/transactions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(bonus ? { ...order, custom_data: { ...order.custom_data, bonus } } : order),
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
    coins: pack.coins + bonus,
    amount: pack.price,
    currency: 'EUR',
  });
  if (error) throw error;
  return { transactionId: json.data.id };
}

// ---------------------------------------------------------------- Premium

async function subscribe(user: User, body: Record<string, unknown>): Promise<unknown> {
  if (!API_KEY) throw fail('unavailable', 'Premium is not available yet.', 503);
  const plan = planOf(body.plan);
  if (!plan || !isPeriod(body.period)) throw fail('bad_request', 'Unknown plan.');
  if (body.waiver !== true) throw fail('bad_request', 'Please confirm that you want the plan to start right away.');
  const { player } = await ensurePlayer(admin, user.id);
  if (player.premium) throw fail('subscribed', 'You already have Premium. Change your plan in Settings.', 409);
  const data = await paddle<{ id: string }>('POST', '/transactions', subscriptionBody(plan, body.period, user.id, !player.trial_used)).catch(() => {
    throw fail('payment_failed', 'The payment could not be started. Please try again.', 502);
  });
  return { transactionId: data.id };
}

async function subscription(user: User): Promise<unknown> {
  const { player } = await ensurePlayer(admin, user.id);
  const { premium, trialUsed, given } = await applyPremium(admin, user.id);
  return { premium, trialUsed, given, player };
}

/** The player's live subscription, or a 404. */
async function liveOf(user: User) {
  const { live } = await subscriptionsOf(admin, user.id);
  if (!live) throw fail('not_subscribed', 'You have no Premium plan.', 404);
  return live;
}

async function change(user: User, body: Record<string, unknown>): Promise<unknown> {
  const plan = planOf(body.plan);
  if (!plan || !isPeriod(body.period)) throw fail('bad_request', 'Unknown plan.');
  const live = await liveOf(user);
  if (live.plan === plan.id && live.period === body.period) throw fail('bad_request', 'That is your plan already.');
  const up = planLevel(plan.id) > planLevel(live.plan) || (plan.id === live.plan && body.period === 'year');
  await paddle('PATCH', `/subscriptions/${live.id}`, {
    items: [{ quantity: 1, price: priceOf(plan, body.period) }],
    custom_data: { player_id: user.id, plan: plan.id, period: body.period },
    // an upgrade is charged now (its webhook tops the month's coins up); a downgrade is credited later
    proration_billing_mode: up ? 'prorated_immediately' : 'prorated_next_billing_period',
    ...(up ? { on_payment_failure: 'prevent_change' } : {}),
  }).catch(() => {
    throw fail('payment_failed', 'The plan could not be changed. Please try again.', 502);
  });
  return subscription(user);
}

async function cancel(user: User, resume: boolean): Promise<unknown> {
  const live = await liveOf(user);
  if (resume) {
    await paddle('PATCH', `/subscriptions/${live.id}`, { scheduled_change: null });
  } else {
    // a trial ends at once; a paid plan runs until the end of the period already paid
    await paddle('POST', `/subscriptions/${live.id}/cancel`, { effective_from: live.status === 'trialing' ? 'immediately' : 'next_billing_period' });
  }
  // the webhook follows; meanwhile the row says what was asked
  const { error } = await admin
    .from('subscriptions')
    .update(resume ? { cancel_at: null } : live.status === 'trialing' ? { status: 'canceled', cancel_at: new Date().toISOString() } : { cancel_at: live.periodEnd })
    .eq('id', live.id);
  if (error) throw error;
  return subscription(user);
}

async function manage(user: User): Promise<unknown> {
  const { all } = await subscriptionsOf(admin, user.id);
  const sub = all.find((s) => s.customerId);
  if (!sub?.customerId) throw fail('not_subscribed', 'You have no Premium plan.', 404);
  const data = await paddle<{ urls: { general: { overview: string } } }>('POST', `/customers/${sub.customerId}/portal-sessions`, { subscription_ids: [sub.id] });
  return { url: data.urls.general.overview };
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
  const json = JSON.parse(raw);
  const event = paymentEvent(json);
  if (event.kind === 'paid') {
    await ensurePlayer(admin, event.playerId);
    // the subscriber's bonus decided at checkout (at most the biggest plan's share)
    const bonus = Math.max(0, Math.min(Math.round(event.pack.coins * 0.2), Math.floor(Number(json.data?.custom_data?.bonus) || 0)));
    const { error } = await admin.rpc('complete_purchase', {
      p_id: event.transactionId,
      p_player: event.playerId,
      p_pack: event.pack.id,
      p_coins: event.pack.coins + bonus,
      p_amount: event.amount,
      p_currency: event.currency,
    });
    if (error) throw error;
  } else if (event.kind === 'reversed') {
    const { error } = await admin.rpc('reverse_purchase', { p_id: event.transactionId });
    if (error) throw error;
    const { error: e2 } = await admin.rpc('reverse_subscription_payment', { p_id: event.transactionId });
    if (e2) throw e2;
  }
  const sub = subscriptionEvent(json);
  if (sub.kind === 'subscription') {
    const { error } = await admin.rpc('sync_subscription', {
      p_id: sub.id,
      p_player: sub.playerId,
      p_plan: sub.plan,
      p_period: sub.period,
      p_status: sub.status,
      p_customer: sub.customerId,
      p_start: sub.periodStart,
      p_end: sub.periodEnd,
      p_cancel: sub.cancelAt,
      p_founder: isFounder(sub.createdAt),
      p_created: sub.createdAt,
      p_at: sub.at,
    });
    if (error) throw error;
  } else if (sub.kind === 'payment') {
    const { error } = await admin.rpc('record_subscription_payment', {
      p_id: sub.transactionId,
      p_sub: sub.subscriptionId,
      p_player: sub.playerId,
      p_plan: sub.plan,
      p_start: sub.periodStart,
      p_end: sub.periodEnd,
      p_amount: Math.round(sub.amount),
      p_currency: sub.currency,
    });
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
      case 'subscribe':
        return reply(await subscribe(auth.user, body));
      case 'subscription':
        return reply(await subscription(auth.user));
      case 'change':
        return reply(await change(auth.user, body));
      case 'cancel':
        return reply(await cancel(auth.user, false));
      case 'resume':
        return reply(await cancel(auth.user, true));
      case 'manage':
        return reply(await manage(auth.user));
      default:
        throw fail('bad_request', 'Unknown action.');
    }
  } catch (err) {
    if (err instanceof AccountError) return reply({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return reply({ error: 'Server error.', code: 'server_error' }, 500);
  }
});
