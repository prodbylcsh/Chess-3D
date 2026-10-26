// Wizard Chess Premium, the subscription (docs/PLATFORM.md §4.9, decided with the user on
// 26 October 2026; the design record is docs/SUBSCRIPTION.md). Pure rules shared by the
// `payments`, `puzzles` and `account` Edge Functions, the app and the tests.
//
// Three plans. Every plan opens every puzzle module and Learn chapter; Wizard and Archmage
// pay their price back in coins every month (the coins of the pack with the same price).
// Nothing here changes MMR, matchmaking, clocks, stakes or season rewards.

export type PlanId = 'apprentice' | 'wizard' | 'archmage';
export type Period = 'month' | 'year';

export interface Plan {
  id: PlanId;
  /** the same in every language (like the set names) */
  name: string;
  /** euro cents, VAT included */
  price: Record<Period, number>;
  /** coins every month (yearly plans too, month by month) */
  coins: number;
  /** Game Reviews a UTC day; null: unlimited */
  reviews: number | null;
  /** streak shields the plan refills to every month */
  shields: number;
  /** extra coins on coin packs, as a share of the pack */
  packBonus: number;
  /** a subscriber-only profile icon every month, kept forever */
  monthlyIcon: boolean;
  /** every for-sale shop item can be used while subscribed */
  wardrobe: boolean;
  /** new shop items and puzzle modules this many days before everyone */
  earlyDays: number;
  /** days free before the first payment (one trial per account) */
  trialDays: number;
}

/** Decided 26 October 2026: €4.99 / €9.99 / €19.99 a month, a year costs 8 months. */
export const PLANS: Record<PlanId, Plan> = {
  apprentice: {
    id: 'apprentice',
    name: 'Apprentice',
    price: { month: 499, year: 3999 },
    coins: 0,
    reviews: 3,
    shields: 1,
    packBonus: 0,
    monthlyIcon: false,
    wardrobe: false,
    earlyDays: 0,
    trialDays: 0,
  },
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    price: { month: 999, year: 7999 },
    coins: 35_000,
    reviews: null,
    shields: 2,
    packBonus: 0.1,
    monthlyIcon: true,
    wardrobe: false,
    earlyDays: 0,
    trialDays: 7,
  },
  archmage: {
    id: 'archmage',
    name: 'Archmage',
    price: { month: 1999, year: 15999 },
    coins: 75_000,
    reviews: null,
    shields: 4,
    packBonus: 0.2,
    monthlyIcon: true,
    wardrobe: true,
    earlyDays: 7,
    trialDays: 0,
  },
};

/** Low to high: the order of the plan cards. */
export const PLAN_IDS: readonly PlanId[] = ['apprentice', 'wizard', 'archmage'];
export const PERIODS: readonly Period[] = ['month', 'year'];

/** The recommended plan (highlighted, shown first on phones). */
export const RECOMMENDED: PlanId = 'wizard';

export const planOf = (id: unknown): Plan | null => (typeof id === 'string' && id in PLANS ? PLANS[id as PlanId] : null);
export const isPeriod = (p: unknown): p is Period => p === 'month' || p === 'year';

/** The plan's rank: a higher plan is an upgrade. */
export const planLevel = (id: PlanId | null): number => (id ? PLAN_IDS.indexOf(id) + 1 : 0);

/** A yearly plan's price per month, in cents (rounded the way it is shown: €6.67). */
export const perMonth = (plan: Plan, period: Period): number => (period === 'year' ? Math.round(plan.price.year / 12) : plan.price.month);

/** Twelve monthly payments, for the struck-through comparison next to the yearly price. */
export const twelveMonths = (plan: Plan): number => plan.price.month * 12;

/** How much a year saves against twelve months, in whole percent (33). */
export const yearSaving = (plan: Plan): number => Math.round((1 - plan.price.year / twelveMonths(plan)) * 100);

// ------------------------------------------------------------------ free players

/** Game Reviews a UTC day without a plan. */
export const FREE_REVIEWS = 1;
/** A streak shield costs this for everyone. */
export const SHIELD_PRICE = 2_500;
/** Shields a player may hold without a plan (a plan raises it to its monthly number). */
export const SHIELDS_HELD = 2;

/** Reviews a day: null is unlimited. */
export const reviewsPerDay = (plan: PlanId | null): number | null => (plan ? PLANS[plan].reviews : FREE_REVIEWS);

/** The most shields a player may hold (buying stops there; the monthly refill fills to the plan's number). */
export const shieldCap = (plan: PlanId | null): number => Math.max(SHIELDS_HELD, plan ? PLANS[plan].shields : 0);

/** Extra coins a subscriber gets on a coin pack. */
export const packBonus = (coins: number, plan: PlanId | null): number => (plan ? Math.round(coins * PLANS[plan].packBonus) : 0);

/** Every plan opens every module (free or bought ones are open anyway). */
export const moduleOpen = (free: boolean, bought: boolean, plan: PlanId | null): boolean => free || bought || !!plan;

/** Every plan opens the paid Learn chapters. */
export const learnUnlocked = (bought: boolean, plan: PlanId | null): boolean => bought || !!plan;

/** Hints cost no coins with a plan (the stars still count them). */
export const hintsFree = (plan: PlanId | null): boolean => !!plan;

// ------------------------------------------------------------------ the subscription's state

/** Paddle's subscription statuses. */
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';

export interface SubscriptionState {
  id: string;
  plan: PlanId;
  period: Period;
  status: SubStatus;
  /** the current billing period (the trial while trialing) */
  periodStart: string | null;
  periodEnd: string | null;
  /** cancelled: the plan ends then */
  cancelAt: string | null;
  founder: boolean;
}

/** What the app knows about a player's subscription (`player.premium`, `Profile.premium`). */
export interface PremiumView {
  /** the plan it gives now */
  plan: PlanId;
  period: Period;
  status: SubStatus;
  periodEnd: string | null;
  cancelAt: string | null;
  founder: boolean;
  /** the subscription's id at Paddle */
  id: string;
}

export interface PremiumState {
  premium: PremiumView | null;
  /** the player had a subscription before (one free trial per account) */
  trialUsed: boolean;
  /** coins and months given since joining (the value counter in Settings) */
  given: { coins: number; months: number };
}

/** Access continues this long past the period's end while Paddle's last word is missing. */
export const GRACE_MS = 3 * 86_400_000;

/** The plan a subscription gives now, or null (cancelled, paused, ended). */
export function activePlan(sub: SubscriptionState | null | undefined, now = Date.now()): PlanId | null {
  if (!sub || !planOf(sub.plan)) return null;
  if (sub.status !== 'trialing' && sub.status !== 'active' && sub.status !== 'past_due') return null;
  if (sub.periodEnd && now > Date.parse(sub.periodEnd) + GRACE_MS) return null;
  return sub.plan;
}

/** What the app sees of the live subscription (null without a plan now). */
export function premiumView(live: SubscriptionState | null | undefined, now = Date.now()): PremiumView | null {
  const plan = activePlan(live, now);
  if (!live || !plan) return null;
  return { plan, period: live.period, status: live.status, periodEnd: live.periodEnd, cancelAt: live.cancelAt, founder: live.founder, id: live.id };
}

/** The live one of a player's subscriptions (the newest that gives a plan). */
export function liveSubscription<T extends SubscriptionState>(subs: readonly T[], now = Date.now()): T | null {
  return subs.filter((s) => activePlan(s, now)).sort((a, b) => planLevel(b.plan) - planLevel(a.plan))[0] ?? null;
}

// ------------------------------------------------------------------ monthly coins and icons

/** `iso` plus `n` calendar months, the day kept (or the month's last day: 31 Jan + 1 = 28/29 Feb). */
export function addMonths(iso: string, n: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString();
}

/** A paid billing period (one Paddle transaction of the subscription). */
export interface SubscriptionPayment {
  /** Paddle's transaction id */
  id: string;
  subscriptionId: string;
  plan: PlanId;
  periodStart: string;
  periodEnd: string;
  status: 'completed' | 'refunded';
}

/** Coins (and an icon) already given for a month of a payment. */
export interface Grant {
  paymentId: string;
  subscriptionId: string;
  /** the start of the coin month */
  monthStart: string;
  coins: number;
}

export interface DueGrant {
  paymentId: string;
  plan: PlanId;
  monthStart: string;
  coins: number;
  /** the month's subscriber icon (Wizard, Archmage), or null */
  icon: string | null;
  /** the plan's shields to refill to */
  shields: number;
}

/**
 * What a player is owed now: for every paid period, one grant per month that has begun
 * (a monthly payment has one, a yearly one twelve, paid month by month). A refunded payment
 * owes nothing. An upgrade is a payment that starts inside the period paid before: the old
 * payment's months stop there, and the new one's first month is topped up (the new plan's
 * coins less what the month already given for that time paid).
 */
export function grantsDue(payments: readonly SubscriptionPayment[], grants: readonly Grant[], now = Date.now()): DueGrant[] {
  const due: DueGrant[] = [];
  const given = [...grants];
  const paid = payments.filter((p) => p.status === 'completed' && planOf(p.plan)).sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const ms = Date.parse;
  for (const p of paid) {
    const plan = PLANS[p.plan];
    const same = paid.filter((o) => o.subscriptionId === p.subscriptionId && o.id !== p.id);
    // a later payment of the subscription (a renewal or an upgrade) ends this one's months
    const end = Math.min(ms(p.periodEnd), ...same.filter((o) => ms(o.periodStart) > ms(p.periodStart)).map((o) => ms(o.periodStart)));
    const upgrade = same.some((o) => ms(o.periodStart) < ms(p.periodStart) && ms(p.periodStart) < ms(o.periodEnd));
    for (let i = 0; i < 12; i++) {
      const monthStart = addMonths(p.periodStart, i);
      const at = ms(monthStart);
      if (at >= end || at > now) break;
      if (given.some((g) => g.paymentId === p.id && g.monthStart === monthStart)) continue;
      const covered =
        upgrade && i === 0
          ? given
              .filter((g) => g.subscriptionId === p.subscriptionId && g.paymentId !== p.id && ms(g.monthStart) <= at && at < ms(addMonths(g.monthStart, 1)))
              .reduce((sum, g) => sum + g.coins, 0)
          : 0;
      const coins = Math.max(0, plan.coins - covered);
      due.push({ paymentId: p.id, plan: plan.id, monthStart, coins, icon: plan.monthlyIcon ? monthlyIconOf(monthStart) : null, shields: plan.shields });
      given.push({ paymentId: p.id, subscriptionId: p.subscriptionId, monthStart, coins });
    }
  }
  return due;
}

/** The subscriber icon of a month: `premium-2026-11`. */
export const monthlyIconOf = (iso: string): string => `premium-${iso.slice(0, 7)}`;

// ------------------------------------------------------------------ the Wardrobe and early access

/** Released for everyone at `releaseAt` (none: always); a plan with early access sees it `earlyDays` sooner. */
export function released(releaseAt: string | null | undefined, plan: PlanId | null, now = Date.now()): boolean {
  if (!releaseAt) return true;
  const early = plan ? PLANS[plan].earlyDays * 86_400_000 : 0;
  return now >= Date.parse(releaseAt) - early;
}

/** Whether an item can be used: owned (bought, won, free), or for sale and in the Archmage's Wardrobe. */
export function canUse(item: { id: string; forSale: boolean; releaseAt?: string | null }, owned: boolean, plan: PlanId | null, now = Date.now()): boolean {
  if (owned) return true;
  return !!plan && PLANS[plan].wardrobe && item.forSale && released(item.releaseAt, plan, now);
}

// ------------------------------------------------------------------ Founders

/**
 * When Premium opens with live payments (set at launch; null while it runs in Paddle's
 * sandbox). Everyone who subscribes in the month after it keeps a Founder badge and their
 * price as long as the subscription runs (decided 26 October 2026).
 */
export const PREMIUM_LAUNCH: string | null = null;

export function isFounder(subscribedAt: string, launch: string | null = PREMIUM_LAUNCH): boolean {
  if (!launch) return false;
  const at = Date.parse(subscribedAt);
  return at >= Date.parse(launch) && at < Date.parse(addMonths(launch, 1));
}

// ------------------------------------------------------------------ Paddle

/**
 * The body of a Paddle transaction that starts a subscription (POST /transactions): a
 * recurring non-catalog price, so nothing has to be set up in Paddle's catalogue. Paddle
 * copies `custom_data` to the subscription it creates; the webhooks tell whose it is.
 */
export function subscriptionBody(plan: Plan, period: Period, playerId: string, trial: boolean) {
  return {
    items: [{ quantity: 1, price: priceOf(plan, period, trial) }],
    custom_data: { player_id: playerId, plan: plan.id, period },
  };
}

/** The recurring price of a plan, for a new subscription or a change (PATCH /subscriptions). */
export function priceOf(plan: Plan, period: Period, trial = false) {
  return {
    name: `${plan.name} · ${period === 'year' ? 'yearly' : 'monthly'}`,
    description: `Wizard Chess Premium ${plan.name}, billed ${period === 'year' ? 'yearly' : 'monthly'}`,
    unit_price: { amount: String(plan.price[period]), currency_code: 'EUR' },
    billing_cycle: { interval: period, frequency: 1 },
    ...(trial && plan.trialDays ? { trial_period: { interval: 'day', frequency: plan.trialDays } } : {}),
    product: { name: `Wizard Chess Premium · ${plan.name}`, tax_category: 'standard' },
  };
}

/** What a subscription webhook means for us. */
export type SubscriptionEvent =
  | {
      kind: 'subscription';
      /** when Paddle saw the change (older events than the stored one are ignored) */
      at: string;
      id: string;
      playerId: string;
      customerId: string | null;
      plan: PlanId;
      period: Period;
      status: SubStatus;
      periodStart: string | null;
      periodEnd: string | null;
      cancelAt: string | null;
      createdAt: string;
    }
  | {
      kind: 'payment';
      transactionId: string;
      subscriptionId: string;
      playerId: string;
      plan: PlanId;
      periodStart: string;
      periodEnd: string;
      amount: number;
      currency: string;
    }
  | { kind: 'ignored' };

const STATUSES: readonly SubStatus[] = ['trialing', 'active', 'past_due', 'paused', 'canceled'];

// deno-lint-ignore no-explicit-any
export function subscriptionEvent(event: any): SubscriptionEvent {
  const type = String(event?.event_type ?? '');
  const data = event?.data ?? {};
  const custom = data.custom_data ?? {};
  const plan = planOf(custom.plan);
  const playerId = typeof custom.player_id === 'string' ? custom.player_id : null;
  if (!plan || !playerId) return { kind: 'ignored' };

  if (type.startsWith('subscription.') && typeof data.id === 'string') {
    const status = STATUSES.includes(data.status) ? (data.status as SubStatus) : null;
    const interval = data.items?.[0]?.price?.billing_cycle?.interval ?? data.billing_cycle?.interval ?? custom.period;
    if (!status || !isPeriod(interval)) return { kind: 'ignored' };
    const change = data.scheduled_change;
    return {
      kind: 'subscription',
      at: String(event.occurred_at ?? data.updated_at ?? new Date().toISOString()),
      id: data.id,
      playerId,
      customerId: typeof data.customer_id === 'string' ? data.customer_id : null,
      plan: plan.id,
      period: interval,
      status,
      periodStart: data.current_billing_period?.starts_at ?? null,
      periodEnd: data.current_billing_period?.ends_at ?? null,
      cancelAt: change?.action === 'cancel' ? (change.effective_at ?? null) : status === 'canceled' ? (data.canceled_at ?? null) : null,
      createdAt: String(data.created_at ?? event.occurred_at ?? new Date().toISOString()),
    };
  }

  if (
    (type === 'transaction.completed' || (type === 'transaction.paid' && data.status === 'paid')) &&
    typeof data.id === 'string' &&
    typeof data.subscription_id === 'string' &&
    data.billing_period?.starts_at &&
    data.billing_period?.ends_at
  ) {
    const total = Number(data.details?.totals?.grand_total ?? data.details?.totals?.total ?? 0);
    // the free trial starts with a transaction of zero: it pays no coins
    if (!(total > 0)) return { kind: 'ignored' };
    return {
      kind: 'payment',
      transactionId: data.id,
      subscriptionId: data.subscription_id,
      playerId,
      plan: plan.id,
      periodStart: data.billing_period.starts_at,
      periodEnd: data.billing_period.ends_at,
      amount: Number.isFinite(total) ? total : 0,
      currency: data.currency_code ?? 'EUR',
    };
  }
  return { kind: 'ignored' };
}

