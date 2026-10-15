// Puzzles: the themed modules (docs/PLATFORM.md §4.2). Openings, the first, is free; the others are
// unlocked with coins. Each has 100 puzzles, a bonus every 10 and a reward at the end.
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { Check, Gift, Lock, Star } from 'lucide-react';
import { BONUS_COINS, BONUS_EVERY, MODULES, MODULE_PRICE, PUZZLES_PER_MODULE } from '#shared/puzzles.ts';
import { api, type PuzzleModuleProgress } from '../../api';
import { itemName } from '../../api/catalog';
import { Page } from '../../app/AppLayout';
import { useSession } from '../../app/session';
import { t } from '../../i18n';
import { Badge, Button, Coins, EmptyState, ProgressBar, Spinner, confirmDialog, formatNumber, useToast } from '../../ui/kit';
import { MODULE_ICONS } from './modules';
import './puzzles.css';

/** The player's progress in every module; reloads after unlocking. */
export function usePuzzleProgress(): [PuzzleModuleProgress[] | null | 'error', (next?: PuzzleModuleProgress[]) => void] {
  const [progress, setProgress] = useState<PuzzleModuleProgress[] | null | 'error'>(null);
  const reload = useCallback((next?: PuzzleModuleProgress[]) => {
    if (next) return setProgress(next);
    void api.puzzles.progress().then(setProgress, () => setProgress('error'));
  }, []);
  useEffect(() => reload(), [reload]);
  return [progress, reload];
}

export const solvedCount = (p: PuzzleModuleProgress) => p.stars.filter((s) => s > 0).length;

export function PuzzlesPage() {
  const { profile, setProfile } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [progress, reload] = usePuzzleProgress();
  const [busy, setBusy] = useState<string | null>(null);

  async function unlock(id: string, name: string) {
    const ok = await confirmDialog({
      title: t('Unlock {name}?', { name }),
      text: t('{price} coins will be taken from your balance.', { price: formatNumber(MODULE_PRICE) }),
      confirmLabel: t('Unlock'),
    });
    if (!ok) return;
    setBusy(id);
    try {
      reload(await api.puzzles.unlock(id));
      setProfile(await api.profiles.me());
      toast(t('{name} is unlocked. Have fun!', { name }), { tone: 'success' });
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page
      title={t('Puzzles')}
      subtitle={t('Themed modules of 100 puzzles, easiest first. Coins for every new solve, {bonus} for every {every}, and a surprise from the shop when you finish one.', {
        bonus: formatNumber(BONUS_COINS),
        every: BONUS_EVERY,
      })}
      wide
    >
      {progress === null && (
        <div className="puzzles-loading">
          <Spinner size={28} />
        </div>
      )}
      {progress === 'error' && (
        <EmptyState title={t('Could not load your puzzles.')}>
          <Button onClick={() => reload()}>{t('Try again')}</Button>
        </EmptyState>
      )}
      {Array.isArray(progress) && (
        <div className="puzzle-modules">
          {MODULES.map((m) => {
            const p = progress.find((x) => x.id === m.id)!;
            const Icon = MODULE_ICONS[m.icon];
            const solved = solvedCount(p);
            const stars = p.stars.reduce((a, b) => a + b, 0);
            const name = t(m.name);
            return (
              <article key={m.id} className={`puzzle-module${p.unlocked ? '' : ' is-locked'}`} style={{ '--module': m.color } as CSSProperties}>
                <div className="puzzle-module-glow" />
                <header>
                  <span className="puzzle-module-icon">
                    <Icon size={26} />
                  </span>
                  {m.free ? <Badge tone="success">{t('Free')}</Badge> : !p.unlocked && <Lock size={18} className="faint" />}
                  {p.completedAt && (
                    <Badge tone="gold">
                      <Check size={12} /> {t('Complete')}
                    </Badge>
                  )}
                </header>
                <h2 className="display">{name}</h2>
                <p className="muted">{t(m.description)}</p>
                <div className="puzzle-module-progress">
                  <ProgressBar value={solved / PUZZLES_PER_MODULE} />
                  <span className="faint">
                    {t('{n} of {total} solved', { n: solved, total: PUZZLES_PER_MODULE })} · <Star size={12} /> {stars}
                  </span>
                </div>
                {p.unlocked ? (
                  <Button variant="primary" block onClick={() => navigate(`/puzzles/${m.id}`)}>
                    {solved === 0 ? t('Start') : solved >= PUZZLES_PER_MODULE ? t('Replay') : t('Continue')}
                  </Button>
                ) : (
                  <Button block loading={busy === m.id} disabled={!!busy || (profile?.coins ?? 0) < MODULE_PRICE} onClick={() => void unlock(m.id, name)}>
                    <Lock size={15} /> {t('Unlock')} · <Coins amount={MODULE_PRICE} size={14} />
                  </Button>
                )}
                {!p.unlocked && (profile?.coins ?? 0) < MODULE_PRICE && <p className="faint puzzle-module-note">{t('Earn coins in games or buy them in the shop.')}</p>}
                {p.reward?.item && (
                  <p className="faint puzzle-module-note">
                    <Gift size={13} /> {t('Your reward: {item}', { item: itemName(p.reward.item) })}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Page>
  );
}
