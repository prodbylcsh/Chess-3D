// Mock Premium: the subscription in the browser, with the server's rules
// (#shared/subscription.ts). There is no Paddle here: subscribing starts the plan at once
// (Wizard's trial included), and the demo renews it by itself when a period ends, so the
// monthly coins, icons and shields can be seen working.
import { t } from '../../i18n';
import { DEFAULT_LOADOUT, FREE_ITEMS, itemDef } from '#shared/shop.ts';
import { dayOf } from '#shared/puzzles.ts';
import {
  PLANS,
  addMonths,
  canUse,
  grantsDue,
  liveSubscription,
  planLevel,
  premiumView,
  reviewsPerDay,
  type Grant,
  type Period,
  type PlanId,
  type PremiumState,
  type SubscriptionPayment,
  type SubscriptionState,
} from '#shared/subscription.ts';
import { ApiError, type PremiumService, type Profile, type ReviewService } from '../types';
import { db, emit, newId, save, session, wait } from './db';

export interface MockPremium {
  subs: SubscriptionState[];
  payments: SubscriptionPayment[];
  grants: Grant[];
}

const premiumOf = (id: string): MockPremium => (db.premium[id] ??= { subs: [], payments: [], grants: [] });

/** The plan the player has now. */
export function planNow(profile: Profile): PlanId | null {
  return profile.premium?.plan ?? null;
}

const periodEnd = (start: string, period: Period) => addMonths(start, period === 'year' ? 12 : 1);

function pay(p: MockPremium, sub: SubscriptionState, start: string) {
  const end = periodEnd(start, sub.period);
  p.payments.push({ id: newId('txn'), subscriptionId: sub.id, plan: sub.plan, periodStart: start, periodEnd: end, status: 'completed' });
  sub.periodStart = start;
  sub.periodEnd = end;
}

/**
 * Bring the player's subscription up to now, as Paddle and the server would: a trial that
 * ended is paid, a paid period that ended renews (or ends when cancelled), and the months
 * owed are given (coins, the month's icon, shields). Items of the Wardrobe the player may
 * no longer use go back to the standard ones. Returns whether anything changed.
 */
export function refreshPremium(profile: Profile, now = Date.now()): boolean {
  const p = premiumOf(profile.id);
  let changed = false;
  for (const sub of p.subs) {
    for (let guard = 0; guard < 60 && sub.status !== 'canceled' && sub.periodEnd && Date.parse(sub.periodEnd) <= now; guard++) {
      changed = true;
      if (sub.cancelAt && Date.parse(sub.cancelAt) <= now) {
        sub.status = 'canceled';
        break;
      }
      sub.status = 'active';
      pay(p, sub, sub.periodEnd);
    }
  }
  for (const g of grantsDue(p.payments, p.grants, now)) {
    p.grants.push({ paymentId: g.paymentId, subscriptionId: p.payments.find((x) => x.id === g.paymentId)!.subscriptionId, monthStart: g.monthStart, coins: g.coins });
    profile.coins += g.coins;
    if (g.icon && !profile.inventory.includes(g.icon)) profile.inventory.push(g.icon);
    db.shields[profile.id] = Math.max(db.shields[profile.id] ?? 0, g.shields);
    changed = true;
  }
  const premium = premiumView(liveSubscription(p.subs, now), now);
  if (JSON.stringify(premium) !== JSON.stringify(profile.premium ?? null) || profile.trialUsed !== p.subs.length > 0) changed = true;
  profile.premium = premium;
  profile.trialUsed = p.subs.length > 0;
  // the Wardrobe ended with the plan: back to owned or standard items
  const plan = premium?.plan ?? null;
  const usable = (id: string) => {
    const def = itemDef(id);
    return !!def && canUse(def, FREE_ITEMS.includes(id) || profile.inventory.includes(id), plan, now);
  };
  for (const slot of Object.keys(profile.loadout) as (keyof Profile['loadout'])[]) {
    if (!usable(profile.loadout[slot])) {
      profile.loadout[slot] = DEFAULT_LOADOUT[slot];
      changed = true;
    }
  }
  if (profile.iconId && !usable(profile.iconId)) {
    profile.iconId = 'king';
    changed = true;
  }
  return changed;
}

function stateOf(profile: Profile): PremiumState {
  const p = premiumOf(profile.id);
  const paid = p.grants.filter((g) => p.payments.find((x) => x.id === g.paymentId)?.status === 'completed');
  return { premium: profile.premium ?? null, trialUsed: p.subs.length > 0, given: { coins: paid.reduce((s, g) => s + g.coins, 0), months: paid.length } };
}

/** The signed-in player, brought up to date. */
function current(): Profile {
  const { profile } = session();
  if (refreshPremium(profile)) {
    save();
    emit({ type: 'profile' });
  }
  return profile;
}

function live(profile: Profile): SubscriptionState {
  const sub = liveSubscription(premiumOf(profile.id).subs);
  if (!sub) throw new ApiError('not_subscribed', t('You have no Premium plan.'));
  return sub;
}

export const premium: PremiumService = {
  available: true,
  checkout: 'demo',

  async state() {
    await wait(100, 250);
    return stateOf(current());
  },

  async subscribe(plan, period) {
    await wait(500, 900);
    const profile = current();
    if (profile.premium) throw new ApiError('subscribed', t('You already have Premium. Change your plan in Settings.'));
    const p = premiumOf(profile.id);
    const now = new Date().toISOString();
    const trial = PLANS[plan].trialDays > 0 && p.subs.length === 0;
    const sub: SubscriptionState = { id: newId('sub'), plan, period, status: trial ? 'trialing' : 'active', periodStart: now, periodEnd: null, cancelAt: null, founder: false };
    p.subs.push(sub);
    if (trial) sub.periodEnd = new Date(Date.now() + PLANS[plan].trialDays * 86_400_000).toISOString();
    else pay(p, sub, now);
    refreshPremium(profile);
    save();
    emit({ type: 'profile' });
    return null;
  },

  async change(plan, period) {
    await wait(400, 700);
    const profile = current();
    const sub = live(profile);
    if (sub.plan === plan && sub.period === period) throw new ApiError('bad_request', t('That is your plan already.'));
    const up = planLevel(plan) > planLevel(sub.plan) || (plan === sub.plan && period === 'year');
    const samePeriod = period === sub.period;
    sub.plan = plan;
    sub.period = period;
    // an upgrade is paid at once (the month is topped up); a downgrade is credited to the next payment
    if (up && sub.status === 'active') {
      const p = premiumOf(profile.id);
      const now = new Date().toISOString();
      if (samePeriod && sub.periodEnd) p.payments.push({ id: newId('txn'), subscriptionId: sub.id, plan, periodStart: now, periodEnd: sub.periodEnd, status: 'completed' });
      else pay(p, sub, now);
    }
    refreshPremium(profile);
    save();
    emit({ type: 'profile' });
    return stateOf(profile);
  },

  async cancel() {
    await wait(300, 600);
    const profile = current();
    const sub = live(profile);
    if (sub.status === 'trialing') {
      sub.status = 'canceled';
      sub.cancelAt = new Date().toISOString();
    } else sub.cancelAt = sub.periodEnd;
    refreshPremium(profile);
    save();
    emit({ type: 'profile' });
    return stateOf(profile);
  },

  async resume() {
    await wait(300, 600);
    const profile = current();
    live(profile).cancelAt = null;
    refreshPremium(profile);
    save();
    emit({ type: 'profile' });
    return stateOf(profile);
  },

  manage: () => Promise.reject(new ApiError('unavailable', t('Payments are handled by Paddle on the real site.'))),
};

export const reviews: ReviewService = {
  async today() {
    await wait(50, 120);
    const profile = current();
    const r = db.reviews[profile.id];
    return { used: r?.day === dayOf() ? r.games.length : 0, limit: reviewsPerDay(planNow(profile)) };
  },

  async start(gameId) {
    await wait(80, 160);
    const profile = current();
    const day = dayOf();
    const r = (db.reviews[profile.id] = db.reviews[profile.id]?.day === day ? db.reviews[profile.id] : { day, games: [] });
    const limit = reviewsPerDay(planNow(profile));
    if (!r.games.includes(gameId)) {
      if (limit !== null && r.games.length >= limit) return { allowed: false, used: r.games.length, limit };
      r.games.push(gameId);
      save();
    }
    return { allowed: true, used: r.games.length, limit };
  },
};
