// The one unrequested Premium offer (docs/PLATFORM.md §4.9 "Where offers appear"): a card on
// the Play hub, never in the first three days of an account, never to someone who had a
// plan, and gone for two weeks once closed.
import { useState } from 'react';
import { Link } from 'react-router';
import { Crown, X } from 'lucide-react';
import { PLANS, RECOMMENDED } from '#shared/subscription.ts';
import { useSession } from '../../app/session';
import { t } from '../../i18n';
import { IconButton, formatNumber } from '../../ui/kit';
import { usePremiumShown } from './plans';
import './premium.css';

const KEY = 'wizard-chess.premium-card';
const DAY = 86_400_000;
/** an account's first days are for the game itself */
const AFTER_DAYS = 3;
const HIDDEN_DAYS = 14;

function closedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(KEY));
    return !!at && Date.now() - at < HIDDEN_DAYS * DAY;
  } catch {
    return false;
  }
}

export function TrialCard() {
  const { profile } = useSession();
  const shown = usePremiumShown();
  const [closed, setClosed] = useState(closedRecently);
  if (!shown || !profile || profile.premium || closed) return null;
  if (Date.now() - Date.parse(profile.createdAt) < AFTER_DAYS * DAY) return null;
  const plan = PLANS[RECOMMENDED];
  const trial = !profile.trialUsed && plan.trialDays > 0;

  function close() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // private mode: it stays closed until the page reloads
    }
    setClosed(true);
  }

  return (
    <aside className="trial-card plan-wizard">
      <Crown size={30} strokeWidth={1.6} className="plan-emblem" aria-hidden />
      <div className="trial-copy">
        <strong>{trial ? t('Try {plan} free for {days} days', { plan: plan.name, days: plan.trialDays }) : t('Every puzzle, every lesson, {coins} coins a month', { coins: formatNumber(plan.coins) })}</strong>
        <span className="muted">{t('Every puzzle module and lesson, unlimited Game Review and {coins} coins every month.', { coins: formatNumber(plan.coins) })}</span>
      </div>
      <Link to="/premium" className="btn btn-primary btn-md">
        {t('See Premium')}
      </Link>
      <IconButton label={t('Close')} className="trial-close" onClick={close}>
        <X size={16} />
      </IconButton>
    </aside>
  );
}
