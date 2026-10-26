// Settings → Subscription: the plan, the next payment, what the plan has given so far, and
// changing or cancelling it. Cancelling takes two clicks: one screen that says what stays
// and what closes, then the button (docs/PLATFORM.md §4.9 "Managing and cancelling").
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarClock, CreditCard, Crown, Gift, Undo2, XCircle } from 'lucide-react';
import { PLANS, type PremiumState } from '#shared/subscription.ts';
import { api, ApiError } from '../../api';
import { useSession } from '../../app/session';
import { t, tn } from '../../i18n';
import { shortDate } from '../../ui/format';
import { Button, Coins, Modal, formatNumber, useToast } from '../../ui/kit';
import { PlanBadge } from './PlanBadge';
import './premium.css';
import { euros, usePremiumShown } from './plans';

type RowFn = (props: { icon: ReactNode; title: string; text: ReactNode; action?: ReactNode }) => ReactNode;

export function SubscriptionSettings({ Section, Row }: { Section: (props: { title: string; children: ReactNode }) => ReactNode; Row: RowFn }) {
  const { profile, refresh } = useSession();
  const toast = useToast();
  const shown = usePremiumShown();
  const [state, setState] = useState<PremiumState | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const premium = profile?.premium ?? null;
  useEffect(() => {
    if (premium || profile?.trialUsed) void api.premium.state().then(setState, () => {});
  }, [premium, profile?.trialUsed]);
  if (!shown && !premium) return null;

  async function run(fn: () => Promise<PremiumState>, done: string) {
    setBusy(true);
    try {
      setState(await fn());
      await refresh();
      toast(done, { tone: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'), { tone: 'danger' });
    } finally {
      setBusy(false);
      setCancelling(false);
    }
  }

  async function manage() {
    try {
      window.open(await api.premium.manage(), '_blank', 'noopener');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'), { tone: 'danger' });
    }
  }

  if (!premium) {
    return (
      <Section title={t('Subscription')}>
        <Row
          icon={<Crown size={18} />}
          title={t('Premium')}
          text={t('Every puzzle module and lesson, coins every month and more. From {price} a month.', { price: euros(PLANS.apprentice.price.year / 12) })}
          action={
            <Link to="/premium" className="btn btn-secondary btn-sm">
              {t('See the plans')}
            </Link>
          }
        />
      </Section>
    );
  }

  const p = PLANS[premium.plan];
  const end = premium.periodEnd ? shortDate(new Date(premium.periodEnd)) : null;
  return (
    <Section title={t('Subscription')}>
      <Row
        icon={<Crown size={18} />}
        title={p.name}
        text={
          <span className="premium-current">
            <PlanBadge plan={premium.plan} founder={premium.founder} link={false} />
            {premium.period === 'year' ? t('{price} a year', { price: euros(p.price.year) }) : t('{price} a month', { price: euros(p.price.month) })}
          </span>
        }
        action={
          <Link to="/premium" className="btn btn-secondary btn-sm">
            {t('Change plan')}
          </Link>
        }
      />
      <Row
        icon={<CalendarClock size={18} />}
        title={premium.cancelAt ? t('Ends') : premium.status === 'trialing' ? t('Free until') : t('Next payment')}
        text={
          premium.cancelAt
            ? t('Your plan ends on {date}. Nothing more is charged.', { date: shortDate(new Date(premium.cancelAt)) })
            : premium.status === 'trialing'
              ? t('The first payment of {price} is on {date}.', { price: euros(p.price[premium.period]), date: end ?? '' })
              : end && t('{price} on {date}.', { price: euros(p.price[premium.period]), date: end })
        }
        action={
          premium.cancelAt ? (
            <Button size="sm" variant="secondary" icon={<Undo2 size={15} />} loading={busy} onClick={() => void run(() => api.premium.resume(), t('Your plan goes on.'))}>
              {t('Keep my plan')}
            </Button>
          ) : undefined
        }
      />
      {state && state.given.months > 0 && (
        <Row
          icon={<Gift size={18} />}
          title={t('Your plan so far')}
          text={t('{coins} coins in {months}, every puzzle module and lesson open.', {
            coins: formatNumber(state.given.coins),
            months: tn(state.given.months, '{n} month', '{n} months'),
          })}
        />
      )}
      {api.premium.checkout === 'paddle' && (
        <Row
          icon={<CreditCard size={18} />}
          title={t('Payment method and invoices')}
          text={t('Handled by Paddle.')}
          action={
            <Button size="sm" variant="secondary" onClick={() => void manage()}>
              {t('Open')}
            </Button>
          }
        />
      )}
      {!premium.cancelAt && (
        <Row
          icon={<XCircle size={18} />}
          title={t('Cancel subscription')}
          text={premium.status === 'trialing' ? t('Ends the free days now. Nothing is charged.') : t('Your plan runs until {date}.', { date: end ?? '' })}
          action={
            <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
              {t('Cancel')}
            </Button>
          }
        />
      )}

      <Modal open={cancelling} onClose={busy ? undefined : () => setCancelling(false)} dismissable={!busy} title={t('Cancel {plan}?', { plan: p.name })} width={480}>
        <div className="cancel-plan">
          <p>
            <strong>{t('What stays:')}</strong> {t('your coins, your monthly icons, your stars and all your progress.')}
          </p>
          <p>
            <strong>{t('What closes')}</strong>{' '}
            {premium.status === 'trialing' ? t('now:') : t('on {date}:', { date: end ?? '' })}{' '}
            {p.wardrobe
              ? t('the modules and Learn chapters you did not buy, unlimited Game Review, the Wardrobe’s items.')
              : t('the modules and Learn chapters you did not buy, Game Review beyond one a day.')}
          </p>
          {state && state.given.coins > 0 && (
            <p className="muted">
              {t('So far your plan gave you')} <Coins amount={state.given.coins} size={14} />.
            </p>
          )}
          {premium.period === 'month' && premium.status !== 'trialing' && (
            <Button block variant="secondary" disabled={busy} onClick={() => void run(() => api.premium.change(premium.plan, 'year'), t('You have {plan} now.', { plan: p.name }))}>
              {t('Switch to yearly instead: 4 months free')}
            </Button>
          )}
          <Button block variant="danger" loading={busy} onClick={() => void run(() => api.premium.cancel(), t('Your subscription is cancelled.'))}>
            {t('Cancel subscription')}
          </Button>
        </div>
      </Modal>
    </Section>
  );
}
