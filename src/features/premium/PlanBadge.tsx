// The Premium badge next to a player's name (profile, Community, chat, the cards in games):
// silver Apprentice, gold Wizard, violet Archmage (animated). Tapping it opens the Premium
// page, so every subscriber shows the plans to others (docs/PLATFORM.md §4.9).
import { Link } from 'react-router';
import { PLANS, type PlanId } from '#shared/subscription.ts';
import { t } from '../../i18n';
import { cx } from '../../ui/kit';
import { PLAN_ICON } from './plans';
import './premium.css';

export function PlanBadge({ plan, founder, size = 'sm', link = true }: { plan: PlanId | null | undefined; founder?: boolean; size?: 'sm' | 'md'; link?: boolean }) {
  if (!plan) return null;
  const Icon = PLAN_ICON[plan];
  const label = founder ? t('{plan} · Founder', { plan: PLANS[plan].name }) : PLANS[plan].name;
  const body = (
    <>
      <Icon size={size === 'md' ? 14 : 12} strokeWidth={2} aria-hidden />
      {size === 'md' && <span>{label}</span>}
    </>
  );
  const props = { className: cx('plan-badge', `plan-${plan}`, size === 'md' && 'is-md'), title: label, 'aria-label': t('Premium: {plan}', { plan: label }) };
  return link ? (
    <Link to="/premium" {...props} onClick={(e) => e.stopPropagation()}>
      {body}
    </Link>
  ) : (
    <span {...props}>{body}</span>
  );
}
