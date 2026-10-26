// The Premium page (docs/PLATFORM.md §4.9; the design record is docs/SUBSCRIPTION.md §5):
// what you get first, then the three plans with Wizard in the middle, what every plan
// includes in coins, the comparison, the questions, and the button again.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { PLANS, PLAN_IDS, RECOMMENDED, planLevel, perMonth, twelveMonths, type Period, type PlanId } from '#shared/subscription.ts';
import { api, ApiError } from '../../api';
import { useSession } from '../../app/session';
import { t } from '../../i18n';
import { shortDate } from '../../ui/format';
import { Button, CoinIcon, confirmDialog, cx, formatNumber, useToast } from '../../ui/kit';
import { billingLine, SubscribeDialog } from './Subscribe';
import { LEARN_COINS, MODULES_COINS, PAID_MODULES, PLAN_ICON, PLAN_PROMISE, PLUS_LINE, benefitsOf, priceParts, comparison, euros, samePack, say } from './plans';
import { PlanBadge } from './PlanBadge';
import './premium.css';

export function PremiumPage() {
  const { profile, refresh } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('year');
  const [buying, setBuying] = useState<PlanId | null>(null);
  const [compare, setCompare] = useState(false);
  const mine = profile?.premium ?? null;

  async function choose(plan: PlanId) {
    if (!profile) return navigate('/auth?signup', { state: { from: '/premium' } });
    if (!mine) return setBuying(plan);
    if (mine.plan === plan && mine.period === period) return;
    const up = planLevel(plan) > planLevel(mine.plan) || (plan === mine.plan && period === 'year');
    const ok = await confirmDialog({
      title: t('Switch to {plan}?', { plan: PLANS[plan].name }),
      text: up
        ? t('You pay the difference for the rest of this period now, and get the new plan’s coins for this month at once.')
        : t('The new plan starts now; what you paid for the old one counts towards your next payment.'),
      confirmLabel: t('Switch to {plan}', { plan: PLANS[plan].name }),
      tone: 'primary',
    });
    if (!ok) return;
    try {
      await api.premium.change(plan, period);
      await refresh();
      toast(t('You have {plan} now.', { plan: PLANS[plan].name }), { tone: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'), { tone: 'danger' });
    }
  }

  const trialOpen = !profile?.trialUsed && !mine;
  // phones see the recommended plan first (only the first card is in view)
  const order = PLAN_IDS;

  return (
    <div className="premium">
      <header className="premium-hero">
        <span className="premium-eyebrow">{t('WIZARD CHESS PREMIUM')}</span>
        <h1 className="premium-title">{t('Every puzzle. Every lesson. Coins every month.')}</h1>
        <p className="premium-sub">{t('Pick a plan. Cancel anytime.')}</p>
        {mine && (
          <p className="premium-current">
            <PlanBadge plan={mine.plan} founder={mine.founder} size="md" link={false} />
            {mine.cancelAt
              ? t('Your plan ends on {date}.', { date: shortDate(new Date(mine.cancelAt)) })
              : mine.status === 'trialing'
                ? t('Free until {date}.', { date: shortDate(new Date(mine.periodEnd ?? Date.now())) })
                : mine.periodEnd && t('Renews on {date}.', { date: shortDate(new Date(mine.periodEnd)) })}
          </p>
        )}
        <div className="premium-period" role="radiogroup" aria-label={t('Billing period')}>
          <button type="button" role="radio" aria-checked={period === 'month'} className={cx(period === 'month' && 'is-active')} onClick={() => setPeriod('month')}>
            {t('Monthly')}
          </button>
          <button type="button" role="radio" aria-checked={period === 'year'} className={cx(period === 'year' && 'is-active')} onClick={() => setPeriod('year')}>
            {t('Yearly')} <span className="premium-save">{t('4 months free')}</span>
          </button>
        </div>
      </header>

      <section className="premium-cards" aria-label={t('Plans')}>
        {order.map((id, i) => (
          <PlanCard
            key={id}
            plan={id}
            period={period}
            index={i}
            trial={trialOpen && PLANS[id].trialDays > 0}
            current={mine?.plan === id && mine.period === period}
            subscribed={!!mine}
            signedIn={!!profile}
            onChoose={() => void choose(id)}
          />
        ))}
      </section>

      <section className="premium-included">
        <span className="premium-label">{t('IN EVERY PLAN')}</span>
        <span>
          <strong>{t('{n} puzzle modules', { n: PAID_MODULES })}</strong> <span className="muted">· {t('{coins} coins', { coins: formatNumber(MODULES_COINS) })}</span>
        </span>
        <span>
          <strong>{t('Learn chapters 3–8')}</strong> <span className="muted">· {t('{coins} coins', { coins: formatNumber(LEARN_COINS) })}</span>
        </span>
        <span>
          <strong>{t('Free hints')}</strong> <span className="muted">· {t('every puzzle')}</span>
        </span>
      </section>

      <section className="premium-compare">
        <h2 className="premium-h2">{t('Compare the plans')}</h2>
        <button type="button" className="premium-compare-toggle" aria-expanded={compare} onClick={() => setCompare((v) => !v)}>
          {t('Compare all benefits')} <ChevronDown size={16} />
        </button>
        <div className={cx('premium-table-box', compare && 'is-open')}>
          <table className="premium-table">
            <thead>
              <tr>
                <th />
                <th>{t('Free')}</th>
                {PLAN_IDS.map((id) => (
                  <th key={id} className={`plan-${id}`}>
                    {PLANS[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison().map((g) => [
                <tr key={g.title} className="premium-table-group">
                  <td colSpan={5}>{t(g.title)}</td>
                </tr>,
                ...g.rows.map((r) => (
                  <tr key={r.label}>
                    <td>{t(r.label)}</td>
                    {r.cells[1] === '' ? (
                      <td colSpan={4} className="muted">
                        {say(r.cells[0], r.values)}
                      </td>
                    ) : (
                      r.cells.map((c, i) => (
                        <td key={i} className={cx(i === 0 && 'muted', i === 2 && 'is-recommended')}>
                          {say(c, r.values)}
                        </td>
                      ))
                    )}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </section>

      <section className="premium-faq">
        <h2 className="premium-h2">{t('Questions')}</h2>
        <details open>
          <summary>{t('Can I cancel anytime?')}</summary>
          <p>{t('Yes, in Settings, in two clicks. Your plan runs until the end of the period you paid for.')}</p>
        </details>
        <details>
          <summary>{t('What happens to my coins and progress if I cancel?')}</summary>
          <p>{t('Your coins, monthly icons, stars and progress stay. Modules, chapters and Wardrobe items you did not buy close until you come back.')}</p>
        </details>
        <details>
          <summary>{t('Do subscribers get an advantage in games?')}</summary>
          <p>{t('Never. Rank, matchmaking, clocks and season rewards are the same for everyone. Coins buy looks only.')}</p>
        </details>
        <details>
          <summary>{t('How do the coins work on a yearly plan?')}</summary>
          <p>{t('You get them every month, for twelve months: {wizard} a month with Wizard, {archmage} with Archmage.', { wizard: formatNumber(PLANS.wizard.coins), archmage: formatNumber(PLANS.archmage.coins) })}</p>
        </details>
        <details>
          <summary>{t('Who handles the payment?')}</summary>
          <p>{t('Paddle.com, our reseller. They take the payment and send the receipt. Prices include VAT.')}</p>
        </details>
      </section>

      {!mine && (
        <footer className="premium-foot">
          <Button variant="primary" size="lg" onClick={() => void choose(RECOMMENDED)}>
            {trialOpen ? t('Try {plan} {days} days free', { plan: PLANS[RECOMMENDED].name, days: PLANS[RECOMMENDED].trialDays }) : t('Choose {plan}', { plan: PLANS[RECOMMENDED].name })}
          </Button>
          <p className="premium-trust">
            <Lock size={13} /> {t('Payments by Paddle · Prices include VAT · Cancel in Settings')}
          </p>
        </footer>
      )}

      <SubscribeDialog plan={buying} period={period} onClose={() => setBuying(null)} />
    </div>
  );
}

function PlanCard({
  plan,
  period,
  index,
  trial,
  current,
  subscribed,
  signedIn,
  onChoose,
}: {
  plan: PlanId;
  period: Period;
  index: number;
  trial: boolean;
  current: boolean;
  subscribed: boolean;
  signedIn: boolean;
  onChoose: () => void;
}) {
  const p = PLANS[plan];
  const Icon = PLAN_ICON[plan];
  const { major, minor } = benefitsOf(plan);
  const pack = samePack(plan);
  const recommended = plan === RECOMMENDED;
  const price = priceParts(perMonth(p, period));
  const cta = !signedIn
    ? t('Create a free account')
    : current
      ? t('Your plan')
      : subscribed
        ? t('Switch to {plan}', { plan: p.name })
        : trial
          ? t('Try {days} days free', { days: p.trialDays })
          : t('Choose {plan}', { plan: p.name });

  return (
    <article className={cx('plan-card', `plan-${plan}`, recommended && 'is-recommended')} style={{ animationDelay: `${index * 30}ms` }}>
      {recommended && <span className="plan-ribbon">{t('RECOMMENDED')}</span>}
      <div className="plan-head">
        <Icon size={38} strokeWidth={1.5} className="plan-emblem" aria-hidden />
        <h2 className="plan-name">{p.name}</h2>
        <p className="plan-promise">{t(PLAN_PROMISE[plan])}</p>
      </div>
      <div className="plan-price">
        <div className="plan-amount">
          {price.before && <span className="plan-euro">{price.before}</span>}
          <span className="plan-number">{price.number}</span>
          {price.after && <span className="plan-euro">{price.after}</span>}
          <span className="plan-per">{t('/ month')}</span>
        </div>
        <div className="plan-billed">
          {period === 'year' ? (
            <>
              {t('{price} billed yearly', { price: euros(p.price.year) })} <s>{euros(twelveMonths(p))}</s>
            </>
          ) : (
            t('Billed monthly')
          )}
        </div>
        {p.coins > 0 && pack && (
          <div className="plan-payback">
            <CoinIcon size={15} />
            <span>
              <strong>{t('{coins} coins every month:', { coins: formatNumber(p.coins) })}</strong> {t('the same as a {price} pack', { price: euros(pack.price) })}
            </span>
          </div>
        )}
      </div>
      <Button variant={recommended && !current ? 'primary' : 'secondary'} size="lg" block disabled={current} onClick={onChoose} className="plan-cta">
        {cta}
      </Button>
      {!subscribed && <p className="plan-then">{billingLine(plan, period, trial)}</p>}
      <hr />
      <span className="premium-label">{t(PLUS_LINE[plan])}</span>
      <ul className="plan-major">
        {major.map((b) => (
          <li key={b.title}>
            <Check size={18} className="plan-tick" aria-hidden />
            <div>
              <strong>{say(b.title, b.values)}</strong>
              {b.text && <span>{say(b.text, b.values)}</span>}
            </div>
          </li>
        ))}
      </ul>
      <ul className="plan-minor">
        {minor.map((b) => (
          <li key={b.title}>
            <Check size={14} aria-hidden />
            {say(b.title, b.values)}
          </li>
        ))}
      </ul>
    </article>
  );
}
