// Subscribing: one dialog with the plan, the price and what renews when, the withdrawal
// waiver, then Paddle's checkout (the demo subscribes at once). When the server has the
// plan, a celebration shows the coins arriving (docs/PLATFORM.md §4.9 "After subscribing").
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, GraduationCap, Puzzle, Shirt, Store } from 'lucide-react';
import { PLANS, perMonth, type Period, type PlanId, type PremiumState } from '#shared/subscription.ts';
import { api, ApiError } from '../../api';
import { legalUrl } from '../../app/legal';
import { useSession } from '../../app/session';
import { t, withNodes } from '../../i18n';
import { openCheckout, paddleSandbox } from '../../net/paddle';
import { Button, CoinIcon, Modal, Spinner, formatNumber, useToast } from '../../ui/kit';
import { PLAN_ICON, euros } from './plans';
import './premium.css';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The text that says what will be charged and when. */
export function billingLine(plan: PlanId, period: Period, trial: boolean): string {
  const total = euros(PLANS[plan].price[period]);
  if (trial) {
    return period === 'year'
      ? t('{days} days free, then {price} a year. Cancel anytime.', { days: PLANS[plan].trialDays, price: total })
      : t('{days} days free, then {price} a month. Cancel anytime.', { days: PLANS[plan].trialDays, price: total });
  }
  return period === 'year' ? t('{price} today, then every year. Cancel anytime.', { price: total }) : t('{price} today, then every month. Cancel anytime.', { price: total });
}

export function SubscribeDialog({ plan, period, onClose }: { plan: PlanId | null; period: Period; onClose: () => void }) {
  const { account, profile, refresh } = useSession();
  const toast = useToast();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<'paying' | 'confirming' | null>(null);
  const [done, setDone] = useState<PremiumState | null>(null);
  useEffect(() => setAgreed(false), [plan]);
  if (!plan && !done) return null;

  const trial = !!plan && PLANS[plan].trialDays > 0 && !profile?.trialUsed;

  /** Paddle tells our server separately: ask until the plan is there (about a minute at most). */
  async function confirm(): Promise<PremiumState | null> {
    for (let i = 0; i < 30; i++) {
      const state = await api.premium.state().catch(() => null);
      if (state?.premium) return state;
      await wait(2000);
    }
    return null;
  }

  async function subscribe() {
    if (!plan) return;
    setBusy('paying');
    try {
      const transactionId = await api.premium.subscribe(plan, period);
      if (transactionId) {
        const paid = await openCheckout(transactionId, account?.email);
        if (!paid) return;
      }
      setBusy('confirming');
      const state = await confirm();
      await refresh();
      if (state) setDone(state);
      else {
        toast(t('Your payment went through; Premium starts in a moment.'), { tone: 'success' });
        onClose();
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('The payment could not be started. Please try again.'), { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  if (done) return <Celebration state={done} onClose={() => (setDone(null), onClose())} />;
  const Icon = PLAN_ICON[plan!];
  const p = PLANS[plan!];

  return (
    <Modal open onClose={busy ? undefined : onClose} dismissable={!busy} width={480}>
      <div className={`subscribe plan-${plan}`}>
        <span className="subscribe-emblem">
          <Icon size={30} strokeWidth={1.6} />
        </span>
        <h2 className="subscribe-name">{p.name}</h2>
        <p className="subscribe-price">
          <strong>{euros(perMonth(p, period))}</strong> <span className="muted">{t('/ month')}</span>
        </p>
        <p className="subscribe-billing">{billingLine(plan!, period, trial)}</p>
        {p.coins > 0 && (
          <p className="subscribe-coins">
            <CoinIcon size={16} />
            {trial ? t('{coins} coins every month, from the first payment', { coins: formatNumber(p.coins) }) : t('{coins} coins in your balance right after paying', { coins: formatNumber(p.coins) })}
          </p>
        )}

        <label className="coin-waiver">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={!!busy} />
          <span>
            {t('I want Premium to start right away and understand that I lose my right of withdrawal once it starts. It renews until I cancel.')}{' '}
            {withNodes(t('I agree to the {terms}.'), {
              terms: (
                <a href={legalUrl('terms')} target="_blank" rel="noreferrer">
                  {t('Terms of Service')}
                </a>
              ),
            })}
          </span>
        </label>

        {paddleSandbox && api.premium.checkout === 'paddle' && (
          <p className="coin-test">{t('Test mode: no real money. Pay with the card 4242 4242 4242 4242, any future date and any CVC.')}</p>
        )}
        {api.premium.checkout === 'demo' && <p className="coin-test">{t('Demo: no payment. The plan starts at once.')}</p>}

        <Button variant="primary" size="lg" block disabled={!agreed || !!busy} onClick={() => void subscribe()}>
          {busy === 'confirming' ? (
            <>
              <Spinner size={16} /> {t('Starting your plan…')}
            </>
          ) : trial ? (
            t('Start {days} days free', { days: p.trialDays })
          ) : (
            t('Pay {price}', { price: euros(p.price[period]) })
          )}
        </Button>
        <p className="faint subscribe-note">{t('Paddle.com handles the payment as our reseller and sends the receipt. Prices include VAT. Under 18? Ask a parent first.')}</p>
      </div>
    </Modal>
  );
}

/** Right after subscribing: the plan's emblem, the coins counting up, where to go next. */
export function Celebration({ state, onClose }: { state: PremiumState; onClose: () => void }) {
  const plan = state.premium!.plan;
  const p = PLANS[plan];
  const Icon = PLAN_ICON[plan];
  const coins = state.premium!.status === 'trialing' ? 0 : state.given.coins;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!coins) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1400);
      setShown(Math.round(coins * (1 - Math.pow(1 - k, 3))));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [coins]);

  const tiles = [
    { to: '/puzzles', icon: Puzzle, label: t('Open a puzzle module') },
    { to: '/learn', icon: GraduationCap, label: t('Continue Learn') },
    p.wardrobe ? { to: '/shop', icon: Shirt, label: t('Try on the Wardrobe') } : coins ? { to: '/shop', icon: Store, label: t('Spend your coins') } : { to: '/play', icon: BookOpen, label: t('Review a game') },
  ];

  return (
    <Modal open onClose={onClose} width={480}>
      <div className={`celebrate plan-${plan}`}>
        <span className="celebrate-burst" aria-hidden />
        <span className="subscribe-emblem is-big">
          <Icon size={42} strokeWidth={1.5} />
        </span>
        <h2 className="celebrate-title">{t('Welcome, {plan}!', { plan: p.name })}</h2>
        {coins > 0 ? (
          <p className="celebrate-coins">
            <CoinIcon size={22} /> +{formatNumber(shown)}
          </p>
        ) : (
          p.coins > 0 && <p className="muted">{t('Your monthly coins arrive with the first payment, after the free days.')}</p>
        )}
        <p className="celebrate-text">{t('Every puzzle module and every lesson is open.')}</p>
        <div className="celebrate-tiles">
          {tiles.map((tile) => (
            <Link key={tile.label} to={tile.to} className="celebrate-tile" onClick={onClose}>
              <tile.icon size={20} />
              <span>{tile.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </Modal>
  );
}
