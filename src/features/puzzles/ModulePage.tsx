// One puzzle module: its map of 100 levels, played one after another, with the bonus every
// 10 levels and the reward at the end (docs/PLATFORM.md §4.2).
import { type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Gift, Lock, Play, Star } from 'lucide-react';
import { BONUS_COINS, BONUS_EVERY, PUZZLES_PER_MODULE, moduleOf } from '#shared/puzzles.ts';
import { itemName } from '../../api/catalog';
import { t } from '../../i18n';
import { Button, Coins, EmptyState, ProgressBar, Spinner, cx } from '../../ui/kit';
import { MODULE_ICONS } from './modules';
import { solvedCount, usePuzzleProgress } from './PuzzlesPage';
import './puzzles.css';

export function ModulePage() {
  const { module: id } = useParams();
  const navigate = useNavigate();
  const module = moduleOf(id);
  const [progress, reload] = usePuzzleProgress();
  if (!module) return <Navigate to="/puzzles" replace />;

  const mine = Array.isArray(progress) ? progress.find((p) => p.id === module.id)! : null;
  if (mine && !mine.unlocked) return <Navigate to="/puzzles" replace />;
  const Icon = MODULE_ICONS[module.icon];
  const solved = mine ? solvedCount(mine) : 0;
  const next = mine ? mine.stars.findIndex((s) => s === 0) : -1;
  const play = (n: number) => navigate(`/game/puzzle/${module.id}?n=${n}`);

  return (
    <div className="page page-wide puzzle-page" style={{ '--module': module.color } as CSSProperties}>
      <header className="puzzle-hero">
        <div className="puzzle-hero-glow" />
        <Link to="/puzzles" className="link-btn puzzle-back">
          <ArrowLeft size={16} /> {t('All modules')}
        </Link>
        <div className="puzzle-hero-main">
          <span className="puzzle-module-icon is-large">
            <Icon size={34} />
          </span>
          <div>
            <h1 className="display">{t(module.name)}</h1>
            <p className="muted">{t(module.description)}</p>
          </div>
        </div>
        <div className="puzzle-hero-progress">
          <ProgressBar value={solved / PUZZLES_PER_MODULE} />
          <span className="faint">{t('{n} of {total} solved', { n: solved, total: PUZZLES_PER_MODULE })}</span>
          {mine && next !== -1 && (
            <Button variant="primary" icon={<Play size={16} />} onClick={() => play(next)}>
              {solved === 0 ? t('Start') : t('Continue: puzzle {n}', { n: next + 1 })}
            </Button>
          )}
        </div>
      </header>

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

      {mine && (
        <ol className="puzzle-map" aria-label={t('Levels')}>
          {mine.stars.map((stars, i) => {
            const open = next === -1 || i <= next;
            const row = Math.floor(i / BONUS_EVERY);
            // the path to the next level: along the row, or down past the chest at its end
            const link = i === PUZZLES_PER_MODULE - 1 ? null : i % BONUS_EVERY === BONUS_EVERY - 1 ? 'is-down' : 'is-along';
            return (
              <li key={i} className={cx('puzzle-step', row % 2 === 1 && 'is-reversed', link, stars > 0 && 'is-done')} style={{ '--col': (row % 2 === 1 ? 9 - (i % 10) : i % 10) + 1, '--row': row * 2 + 1 } as CSSProperties}>
                <button
                  type="button"
                  className={cx('puzzle-node', stars > 0 && 'is-solved', i === next && 'is-next', !open && 'is-locked')}
                  disabled={!open}
                  onClick={() => play(i)}
                  aria-label={t('Puzzle {n}', { n: i + 1 })}
                >
                  {open ? <span>{i + 1}</span> : <Lock size={14} />}
                  {stars > 0 && (
                    <span className="puzzle-node-stars" aria-label={t('{n} of 3 stars', { n: stars })}>
                      {[1, 2, 3].map((n) => (
                        <Star key={n} size={9} className={cx(n <= stars && 'is-lit')} />
                      ))}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {Array.from({ length: PUZZLES_PER_MODULE / BONUS_EVERY }, (_, k) => {
            const reached = solved >= (k + 1) * BONUS_EVERY;
            const last = k === PUZZLES_PER_MODULE / BONUS_EVERY - 1;
            return (
              <li key={`b${k}`} className={cx('puzzle-chest', reached && 'is-open', last && 'is-final')} style={{ '--row': k * 2 + 2, '--col': k % 2 === 0 ? 10 : 1 } as CSSProperties}>
                <span className="puzzle-chest-badge">
                  <Gift size={last ? 20 : 14} />
                  {last ? (
                    <span>{mine.reward?.item ? itemName(mine.reward.item) : mine.reward?.coins ? <Coins amount={mine.reward.coins} size={12} /> : t('A surprise from the shop')}</span>
                  ) : (
                    <Coins amount={BONUS_COINS} size={12} />
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
