// One puzzle module: its world, with a path of 100 levels played one after another, a chest
// of coins every 10 and the reward at the end (docs/PLATFORM.md §4.2). The player's piece
// stands on the next puzzle and hops on after each solve (`?from=<level>`). Without WebGL
// the levels are a plain grid.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Eye, Gift, Lock, Play, Repeat, RotateCcw, Star } from 'lucide-react';
import { BONUS_COINS, BONUS_EVERY, PUZZLES_PER_MODULE, moduleOf, type Puzzle, type PuzzleModule } from '#shared/puzzles.ts';
import type { PuzzleModuleProgress } from '../../api';
import { itemName } from '../../api/catalog';
import { modulePuzzles } from '../../api/puzzleData';
import { useProfile } from '../../app/session';
import { t } from '../../i18n';
import { Button, Coins, EmptyState, ProgressBar, Spinner, cx } from '../../ui/kit';
import { timeUntil } from '../../ui/format';
import { nextOpen, reviewReady, reviewWaiting } from './review';
import { modelFor } from '../shop/ModelViewer';
import { briefOf } from './brief';
import { WORLD_THEMES } from './map/themes';
import { World } from './map/World';
import { MODULE_ICONS } from './modules';
import { solvedCount, usePuzzleProgress } from './PuzzlesPage';
import './puzzles.css';

const compact = () => typeof matchMedia === 'function' && matchMedia('(max-width: 820px)').matches;

export function ModulePage() {
  const { module: id } = useParams();
  const module = moduleOf(id);
  const [progress, reload] = usePuzzleProgress();
  if (!module) return <Navigate to="/puzzles" replace />;
  const mine = Array.isArray(progress) ? progress.find((p) => p.id === module.id)! : null;
  if (mine && !mine.unlocked) return <Navigate to="/puzzles" replace />;

  return (
    <div className="world-page" style={{ '--module': module.color } as CSSProperties}>
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
      {mine && <ModuleWorld module={module} mine={mine} />}
    </div>
  );
}

function ModuleWorld({ module, mine }: { module: PuzzleModule; mine: PuzzleModuleProgress }) {
  const navigate = useNavigate();
  const profile = useProfile();
  const [params, setParams] = useSearchParams();
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const next = nextOpen(mine);
  const solved = solvedCount(mine);
  const ready = reviewReady(mine);
  const waiting = reviewWaiting(mine);
  const from = params.get('from');
  const [selected, setSelected] = useState(() => (next === -1 ? 0 : next));
  const [hopping, setHopping] = useState(from !== null);
  const Icon = MODULE_ICONS[module.icon];

  useEffect(() => {
    void modulePuzzles(module.id).then(setPuzzles, () => setPuzzles([]));
  }, [module.id]);

  // the world: built once per module
  useEffect(() => {
    let w: World;
    try {
      w = new World(host.current!, { id: module.id, color: module.color, theme: WORLD_THEMES[module.id] ?? WORLD_THEMES.openings, compact: compact() });
    } catch {
      setWebgl(false);
      return;
    }
    world.current = w;
    w.onPick = (i) => {
      setSelected(i);
      w.select(i);
    };
    let live = true;
    void modelFor(profile?.loadout.pieces ?? 'marble-set', false, 'n', 'w').then(
      (model) => live && w.setToken(model),
      () => {},
    );
    return () => {
      live = false;
      w.dispose();
      world.current = null;
    };
    // the piece set only matters when the world is built
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module.id, module.color]);

  // progress, and the hop after a solved puzzle
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const target = next === -1 ? PUZZLES_PER_MODULE - 1 : next;
    const start = from === null ? NaN : Number(from);
    if (Number.isInteger(start) && start >= 0 && start < target && (mine.stars[start] > 0 || mine.seen[start])) {
      setHopping(true);
      w.setProgress(mine.stars, next, solved - 1);
      w.select(-1);
      void w.hop(start, target).then(() => {
        w.openChests(solved);
        setSelected(target);
        w.select(target);
        setHopping(false);
        setParams({}, { replace: true });
      });
      return;
    }
    setHopping(false);
    w.setProgress(mine.stars, next);
    w.placeToken(target);
    w.focus(selected, true);
    w.select(selected);
    // run when progress arrives, not on every pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, webgl]);

  const play = (n: number) => navigate(`/game/puzzle/${module.id}?n=${n}`);

  return (
    <>
      <div className="world-stage" ref={host} />
      <header className="world-top">
        <Link to="/puzzles" className="world-back" aria-label={t('All modules')}>
          <ArrowLeft size={18} />
        </Link>
        <span className="coach-icon world-icon">
          <Icon size={20} />
        </span>
        <div className="world-title">
          <h1 className="display">{t(module.name)}</h1>
          <div className="world-progress">
            <ProgressBar value={solved / PUZZLES_PER_MODULE} />
            <span>{t('{n} of {total} solved', { n: solved, total: PUZZLES_PER_MODULE })}</span>
          </div>
        </div>
        {ready.length > 0 ? (
          <Button className="world-review" icon={<Repeat size={16} />} onClick={() => navigate(`/game/puzzle/${module.id}?n=${ready[0]}&review=1`)}>
            {t('Review ({n})', { n: ready.length })}
          </Button>
        ) : (
          waiting.next && (
            <span className="world-review-wait" title={t('Puzzles under three stars come back for a review once the moves are no longer fresh in your mind.')}>
              <Repeat size={14} /> {t('{n} to review {when}', { n: waiting.count, when: timeUntil(waiting.next) })}
            </span>
          )
        )}
      </header>

      {!webgl && <LevelGrid module={module} mine={mine} onPlay={play} />}

      {webgl && !hopping && (
        <LevelCard
          key={selected}
          module={module}
          mine={mine}
          index={selected}
          puzzle={puzzles?.[selected] ?? null}
          next={next}
          onPlay={() => play(selected)}
          onNext={next >= 0 && selected !== next ? () => (setSelected(next), world.current?.select(next)) : undefined}
        />
      )}
    </>
  );
}

/** The picked level: what it is about, the stars earned, and the way in. */
function LevelCard(props: {
  module: PuzzleModule;
  mine: PuzzleModuleProgress;
  index: number;
  puzzle: Puzzle | null;
  next: number;
  onPlay: () => void;
  onNext?: () => void;
}) {
  const { module, mine, index, puzzle, next } = props;
  const stars = mine.stars[index];
  const seen = mine.seen[index];
  const reviewAt = mine.reviewFrom[index];
  const brief = useMemo(() => (puzzle ? briefOf(puzzle, module.select.themes) : null), [puzzle, module]);
  const solvedNow = solvedCount(mine);
  const toChest = BONUS_EVERY - (solvedNow % BONUS_EVERY);
  const isNext = index === next;
  return (
    <section className="level-card" aria-live="polite">
      <div className="level-card-head">
        <span className="level-card-kicker">{t('Puzzle {n} of {total}', { n: index + 1, total: PUZZLES_PER_MODULE })}</span>
        <span className="level-card-stars" aria-label={t('{n} of 3 stars', { n: stars })}>
          {[1, 2, 3].map((n) => (
            <Star key={n} size={15} className={cx(n <= stars && 'is-lit')} />
          ))}
        </span>
      </div>
      <h2 className="display">{brief?.title ?? '…'}</h2>
      {brief && <p className="level-card-task">{brief.task}</p>}
      {seen && (
        <p className="level-card-note">
          <Eye size={14} /> {t('You saw the solution. Solve it in a review for its stars and coins.')}
        </p>
      )}
      {(stars > 0 || seen) && stars < 3 && reviewAt && (
        <p className="level-card-note">
          <Repeat size={14} />{' '}
          {Date.parse(reviewAt) > Date.now()
            ? t('Stars can improve {when}; until then a replay is practice.', { when: timeUntil(reviewAt) })
            : t('Ready for a review: try for more stars.')}
        </p>
      )}
      {isNext && next >= 0 && (
        <p className="level-card-note">
          <Gift size={14} />{' '}
          {solvedNow >= PUZZLES_PER_MODULE - BONUS_EVERY
            ? t('{n} more to the surprise from the shop.', { n: PUZZLES_PER_MODULE - solvedNow })
            : t('{n} more to the next chest: {coins} coins.', { n: toChest, coins: BONUS_COINS })}
        </p>
      )}
      {mine.completedAt && mine.reward && (
        <p className="level-card-note">
          <Gift size={14} />{' '}
          {mine.reward.item ? t('Your reward: {item}', { item: itemName(mine.reward.item) }) : <Coins amount={mine.reward.coins ?? 0} size={13} />}
        </p>
      )}
      <div className="level-card-actions">
        <Button variant="primary" block icon={stars > 0 || seen ? <RotateCcw size={16} /> : <Play size={16} />} onClick={props.onPlay}>
          {stars > 0 || seen ? t('Play again') : t('Play')}
        </Button>
        {props.onNext && <Button onClick={props.onNext}>{t('Next puzzle')}</Button>}
      </div>
    </section>
  );
}

/** Without WebGL: the levels as a grid, a chest after every 10. */
function LevelGrid({ module, mine, onPlay }: { module: PuzzleModule; mine: PuzzleModuleProgress; onPlay: (n: number) => void }) {
  const next = nextOpen(mine);
  const solved = solvedCount(mine);
  return (
    <div className="level-grid-wrap">
      <ol className="puzzle-map" aria-label={t('Levels')} style={{ '--module': module.color } as CSSProperties}>
        {mine.stars.map((stars, i) => {
          const open = next === -1 || i <= next;
          return (
            <li key={i} className="puzzle-step">
              <button type="button" className={cx('puzzle-node', stars > 0 && 'is-solved', i === next && 'is-next', !open && 'is-locked')} disabled={!open} onClick={() => onPlay(i)}>
                {open ? <span>{i + 1}</span> : <Lock size={14} />}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="faint">
        <Gift size={13} /> {t('{n} of {total} solved', { n: solved, total: PUZZLES_PER_MODULE })}
      </p>
    </div>
  );
}
