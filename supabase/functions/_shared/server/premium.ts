// Server-only helpers for Premium, the subscription (Deno; the app never imports this):
// a player's subscription as the app sees it, the monthly coins owed (given lazily), and
// Paddle's subscription API. Rules: ../subscription.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  premiumView,
  grantsDue,
  liveSubscription,
  type Grant,
  type Period,
  type PlanId,
  type SubStatus,
  type SubscriptionPayment,
  type SubscriptionState,
  type PremiumState,
  type PremiumView,
} from '../subscription.ts';

export type { PremiumView };
import { paddleApi, type PaddleEnv } from '../payments.ts';

interface SubRow {
  id: string;
  plan: PlanId;
  period: Period;
  status: SubStatus;
  period_start: string | null;
  period_end: string | null;
  cancel_at: string | null;
  founder: boolean;
  customer_id: string | null;
}

const stateOf = (r: SubRow): SubscriptionState & { customerId: string | null } => ({
  id: r.id,
  plan: r.plan,
  period: r.period,
  status: r.status,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  cancelAt: r.cancel_at,
  founder: r.founder,
  customerId: r.customer_id,
});

/** A player's subscriptions, the live one first. */
export async function subscriptionsOf(admin: SupabaseClient, playerId: string) {
  const { data, error } = await admin.from('subscriptions').select('*').eq('player_id', playerId).order('created_at', { ascending: false });
  if (error) throw error;
  const all = (data as SubRow[]).map(stateOf);
  return { all, live: liveSubscription(all) };
}

export const viewOf = premiumView;

/**
 * The player's subscription, after giving what the paid periods owe now (coins, the month's
 * icon, shields). Returns the coins given now too.
 */
export async function applyPremium(admin: SupabaseClient, playerId: string, now = Date.now()): Promise<PremiumState & { granted: number }> {
  const [{ all, live }, payments_] = await Promise.all([
    subscriptionsOf(admin, playerId),
    admin.from('subscription_payments').select('id, subscription_id, plan, period_start, period_end, status, subscription_grants(month_start, coins)').eq('player_id', playerId),
  ]);
  if (payments_.error) throw payments_.error;
  const rows = payments_.data as Array<{
    id: string;
    subscription_id: string;
    plan: PlanId;
    period_start: string;
    period_end: string;
    status: 'completed' | 'refunded';
    subscription_grants: Array<{ month_start: string; coins: number }>;
  }>;
  const payments: SubscriptionPayment[] = rows.map((r) => ({
    id: r.id,
    subscriptionId: r.subscription_id,
    plan: r.plan,
    periodStart: new Date(r.period_start).toISOString(),
    periodEnd: new Date(r.period_end).toISOString(),
    status: r.status,
  }));
  const grants: Grant[] = rows.flatMap((r) =>
    r.subscription_grants.map((g) => ({ paymentId: r.id, subscriptionId: r.subscription_id, monthStart: new Date(g.month_start).toISOString(), coins: g.coins })),
  );
  const due = grantsDue(payments, grants, now);
  let granted = 0;
  if (due.length) {
    const { data, error } = await admin.rpc('grant_subscription', {
      p_player: playerId,
      p_grants: due.map((d) => ({
        payment_id: d.paymentId,
        subscription_id: payments.find((p) => p.id === d.paymentId)!.subscriptionId,
        month_start: d.monthStart,
        plan: d.plan,
        coins: d.coins,
        icon: d.icon,
        shields: d.shields,
      })),
    });
    if (error) throw error;
    granted = data as number;
  }
  const paidGrants = [...grants, ...due.map((d) => ({ ...d, subscriptionId: '' }))].filter((g) => payments.find((p) => p.id === g.paymentId)?.status === 'completed');
  return {
    premium: viewOf(live),
    trialUsed: all.length > 0,
    given: { coins: paidGrants.reduce((s, g) => s + g.coins, 0), months: paidGrants.length },
    granted,
  };
}

// ------------------------------------------------------------------ Paddle's API

const API_KEY = Deno.env.get('PADDLE_API_KEY') ?? '';
const API_URL = Deno.env.get('PADDLE_API_URL') ?? paddleApi((Deno.env.get('PADDLE_ENV') ?? 'sandbox') as PaddleEnv);

export const paddleReady = () => !!API_KEY;

/** A call to Paddle's API: its `data`, or an error (logged without secrets). */
export async function paddle<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch((err: Error) => err);
  const json = res instanceof Response ? await res.json().catch(() => null) : null;
  if (!(res instanceof Response) || !res.ok || !json?.data) {
    console.error('paddle', method, path, res instanceof Response ? res.status : res.message, JSON.stringify(json?.error ?? json).slice(0, 500));
    throw new Error('paddle_failed');
  }
  return json.data as T;
}
