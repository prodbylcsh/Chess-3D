// The daily puzzle streak (docs/PLATFORM.md §4.2): a flame that grows with the streak, the
// daily card on the Puzzles page and the celebration after today's solve. Each tier
// (STREAK_TIERS) looks and moves more intensely than the one before: a spark flickers, a
// blaze throws embers, azure fire is ringed, a phoenix spreads wings, starfire has stars
// circling it.
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { Check, Gift, Shield, Sparkles } from 'lucide-react';
import { STREAK_MILESTONES, STREAK_TIERS, moduleOf, nextMilestone, streakTier } from '#shared/puzzles.ts';
import { PLANS, RECOMMENDED, SHIELD_PRICE, shieldCap } from '#shared/subscription.ts';
import { api, ApiError, type DailyPuzzle, type DailySolve } from '../../api';
import { itemName } from '../../api/catalog';
import { useSession } from '../../app/session';
import { t, tk, tn } from '../../i18n';
import { Button, Coins, ProgressBar, cx, formatNumber, useToast } from '../../ui/kit';
import { usePremiumShown } from '../premium/plans';
import './streak.css';

// the tier names, for the translator
export const TIER_NAMES = [tk('Spark'), tk('Flame'), tk('Blaze'), tk('Azure Fire'), tk('Phoenix'), tk('Starfire')];

const FLAME = 'M32 4 C38 18 54 28 54 48 C54 64 44 76 32 76 C20 76 10 64 10 48 C10 36 18 30 22 20 C24 30 28 34 30 34 C28 24 28 14 32 4 Z';
const INNER = 'M32 30 C36 41 45 46 45 57 C45 67 39 73 32 73 C25 73 19 67 19 58 C19 50 24 46 27 39 C29 45 31 47 32 47 C31 42 30 36 32 30 Z';
const CORE = 'M32 50 C35 56 39 59 39 64 C39 69 36 72 32 72 C28 72 25 69 25 64 C25 60 29 57 32 50 Z';

/** The streak's flame; `tier` -1 is an unlit one. */
export function StreakFlame({ days, size = 40, still = false }: { days: number; size?: number; still?: boolean }) {
  const tier = streakTier(days);
  const id = useId().replace(/:/g, '');
  const tierId = tier < 0 ? 'none' : STREAK_TIERS[tier].id;
  return (
    <span className={cx('flame', `flame-${tierId}`, still && 'is-still')} style={{ width: size, height: size * 1.2 } as CSSProperties} aria-hidden="true">
      {tier >= 2 && (
        <span className="flame-embers">
          {Array.from({ length: 4 + tier * 2 }, (_, i) => (
            <i key={i} style={{ '--i': i, '--n': 4 + tier * 2 } as CSSProperties} />
          ))}
        </span>
      )}
      {tier >= 3 && <span className="flame-ring" />}
      {tier >= 5 && (
        <span className="flame-orbit">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
      )}
      <svg viewBox="0 0 64 80" className="flame-svg">
        <defs>
          <linearGradient id={`fo${id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="var(--f-outer-a)" />
            <stop offset="1" stopColor="var(--f-outer-b)" />
          </linearGradient>
          <linearGradient id={`fi${id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="var(--f-inner-a)" />
            <stop offset="1" stopColor="var(--f-inner-b)" />
          </linearGradient>
        </defs>
        {tier >= 4 && (
          <g className="flame-wings">
            <path d="M24 52 C12 50 4 40 2 26 C10 34 18 36 26 38 Z" />
            <path d="M40 52 C52 50 60 40 62 26 C54 34 46 36 38 38 Z" />
          </g>
        )}
        <path className="flame-outer" d={FLAME} fill={`url(#fo${id})`} />
        <path className="flame-inner" d={INNER} fill={`url(#fi${id})`} />
        <path className="flame-core" d={CORE} />
      </svg>
    </span>
  );
}

const tierName = (days: number) => {
  const tier = streakTier(days);
  return tier < 0 ? '' : t(TIER_NAMES[tier]);
};

/** On the Puzzles page: today's puzzle, the streak and the next milestone. */
export function DailyCard() {
  const navigate = useNavigate();
  const [daily, setDaily] = useState<DailyPuzzle | null | 'error'>(null);
  useEffect(() => {
    void api.puzzles.daily().then(setDaily, () => setDaily('error'));
  }, []);
  if (!daily || daily === 'error') return null;
  const days = daily.streak.current;
  const next = nextMilestone(days);
  // progress from the last milestone reached to the next one
  const last = [0, ...STREAK_MILESTONES.map((m) => m.days)].filter((d) => d <= days).at(-1)!;
  const from = days > 1000 ? Math.floor(days / 100) * 100 : last;
  const done = !!daily.solved;
  return (
    <article className={cx('daily', done && 'is-done')} data-tier={streakTier(days)}>
      <div className="daily-flame">
        <StreakFlame days={days} size={58} />
      </div>
      <div className="daily-body">
        <span className="daily-kicker">{t('Daily puzzle')}</span>
        <h2 className="display">
          {days > 0 ? tn(days, '{n} day in a row', '{n} days in a row') : t('Start a streak today')}
          {days > 0 && <small>{tierName(days)}</small>}
        </h2>
        <p className="muted">
          {done
            ? t('Solved today. Come back tomorrow to keep the streak going.')
            : days > 0
              ? t('Solve today\'s puzzle to keep your streak. It comes from {module}.', { module: t(moduleOf(daily.module)?.name ?? '') })
              : t('A new puzzle every day, from every module. Solve it day after day for growing rewards.')}
        </p>
        {daily.streak.shields !== undefined && <Shields daily={daily} onChange={setDaily} />}
        <div className="daily-next">
          <ProgressBar value={Math.min(1, (days - from) / (next.days - from))} />
          <span className="faint">
            {tn(next.days - days, '{n} more day', '{n} more days')} · {t('reward on day {days}', { days: next.days })} <Coins amount={next.coins} size={13} />
            {next.item && (
              <>
                {' '}
                + <Gift size={13} />
              </>
            )}
          </span>
        </div>
      </div>
      <div className="daily-action">
        {done ? (
          <span className="daily-done">
            <Check size={18} /> {t('Done for today')}
          </span>
        ) : (
          <Button variant="primary" size="lg" onClick={() => navigate('/game/puzzle/daily')}>
            {t('Play today\'s puzzle')}
          </Button>
        )}
      </div>
    </article>
  );
}

/**
 * Streak shields (docs/PLATFORM.md §4.9): how many keep the streak over missed days, one
 * more for coins, and late in the UTC day of a long unsolved streak, the plan that gives
 * them every month.
 */
function Shields({ daily, onChange }: { daily: DailyPuzzle; onChange: (d: DailyPuzzle) => void }) {
  const { profile, refresh } = useSession();
  const toast = useToast();
  const premiumShown = usePremiumShown();
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const held = daily.streak.shields ?? 0;
  const plan = profile.premium?.plan ?? null;
  const late = new Date().getUTCHours() >= 18 && !daily.solved && daily.streak.current >= 7;

  async function buy() {
    setBusy(true);
    try {
      const shields = await api.puzzles.buyShield();
      onChange({ ...daily, streak: { ...daily.streak, shields } });
      await refresh();
      toast(t('A streak shield is ready. It keeps your streak on a day you miss.'), { tone: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="daily-shields">
      {!!daily.streak.shielded && <span className="daily-shielded">{tn(daily.streak.shielded, 'A shield kept your streak over {n} missed day.', 'Shields kept your streak over {n} missed days.')}</span>}
      <span>
        <Shield size={14} /> {held ? tn(held, '{n} streak shield', '{n} streak shields') : t('No streak shield')}
      </span>
      {held < shieldCap(plan) && (
        <button type="button" className="link-btn" disabled={busy || profile.coins < SHIELD_PRICE} onClick={() => void buy()}>
          {t('Buy one for')} <Coins amount={SHIELD_PRICE} size={12} />
        </button>
      )}
      {late && premiumShown && !plan && (
        <Link to="/premium" className="premium-quiet">
          {t('{plan} gives you {n} every month', { plan: PLANS[RECOMMENDED].name, n: PLANS[RECOMMENDED].shields })}
        </Link>
      )}
    </div>
  );
}

/** On the result card after the daily puzzle: the streak counting up, a milestone's reward. */
export function DailyResult({ before, result }: { before: number; result: DailySolve }) {
  const after = result.streak.current;
  const [shown, setShown] = useState(result.already ? after : before);
  useEffect(() => {
    if (result.already) return;
    const timer = setTimeout(() => setShown(after), 500);
    return () => clearTimeout(timer);
  }, [after, result.already]);
  const tierUp = streakTier(after) > streakTier(before);
  const tier = streakTier(shown);
  const big = !!result.milestone || tierUp;
  return (
    <section className={cx('daily-result', big && 'is-big')} data-tier={tier}>
      {shown === after && !result.already && (
        <span className="daily-burst" style={{ '--rays': 6 + Math.max(0, tier) * 4 } as CSSProperties}>
          {Array.from({ length: 6 + Math.max(0, tier) * 4 }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
      )}
      <StreakFlame days={shown} size={big ? 84 : 64} />
      <strong key={shown} className="daily-count display">
        {tn(shown, '{n} day in a row', '{n} days in a row')}
      </strong>
      <span className="daily-tier">{tierUp && shown === after ? t('New flame: {name}!', { name: tierName(after) }) : tierName(shown)}</span>
      {result.already ? (
        <span className="faint">{t('Already solved today: the streak counts once a day.')}</span>
      ) : (
        <div className="result-chips">
          <span>
            {t('Daily puzzle')} +{result.coins + result.hintCost}
          </span>
          {result.hintCost > 0 && (
            <span>
              {t('Hints')} −{result.hintCost}
            </span>
          )}
        </div>
      )}
      {result.milestone && (
        <div className="daily-milestone">
          <Sparkles size={18} />
          <div>
            <strong>{t('{days}-day streak!', { days: result.milestone.days })}</strong>
            <span className="muted">
              {t('Reward: {coins} coins', { coins: formatNumber(result.milestone.coins) })}
              {result.milestone.item && ` + ${itemName(result.milestone.item)}`}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
