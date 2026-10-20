// Puzzles without an account (docs/PLATFORM.md §4.2): a guest plays the first GUEST_PUZZLES
// of the free module and the daily puzzle; signing up or in on this device keeps them.
import { useEffect, useState } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router';
import { UserPlus } from 'lucide-react';
import { GUEST_PUZZLES, MODULES } from '#shared/puzzles.ts';
import { api } from '../../api';
import { useSession } from '../../app/session';
import { t } from '../../i18n';
import { Button, Coins } from '../../ui/kit';

const changed = new Set<() => void>();
/** The puzzles a page shows changed outside it (a guest's moved into the account). */
export function puzzlesChanged(): void {
  changed.forEach((fn) => fn());
}
export function onPuzzlesChanged(fn: () => void): () => void {
  changed.add(fn);
  return () => changed.delete(fn);
}

/** To sign-up, and back to `from` once signed in. */
export const signUp = (navigate: NavigateFunction, from = '/puzzles') => navigate('/auth?signup', { state: { from } });

/** A guest's coins so far (null for a signed-in player, or while loading). */
export function useGuestCoins(): number | null {
  const { profile } = useSession();
  const [coins, setCoins] = useState<number | null>(null);
  useEffect(() => {
    if (profile) return;
    let live = true;
    const load = () => void api.puzzles.guest().then((g) => live && setCoins(g?.coins ?? null), () => {});
    load();
    const off = api.events.subscribe((e) => e.type === 'profile' && load());
    return () => {
      live = false;
      off();
    };
  }, [profile]);
  return profile ? null : coins;
}

/** On the puzzles page for guests: what they can try, and the way to keep it. */
export function GuestBanner() {
  const navigate = useNavigate();
  const coins = useGuestCoins();
  const free = MODULES.find((m) => m.free)!;
  return (
    <section className="guest-banner">
      <div>
        <h2 className="display">{t('Try puzzles without an account')}</h2>
        <p className="muted">
          {t('The first {n} puzzles of {module} and the daily puzzle are yours to try. Create a free account to keep your progress and coins, and to play on.', {
            n: GUEST_PUZZLES,
            module: t(free.name),
          })}
        </p>
      </div>
      <div className="guest-banner-side">
        {coins !== null && coins > 0 && (
          <span className="guest-banner-coins">
            <span className="faint">{t('Waiting for you')}</span>
            <Coins amount={coins} />
          </span>
        )}
        <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => signUp(navigate)}>
          {t('Create a free account')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate('/auth', { state: { from: '/puzzles' } })}>
          {t('I have an account')}
        </Button>
      </div>
    </section>
  );
}
