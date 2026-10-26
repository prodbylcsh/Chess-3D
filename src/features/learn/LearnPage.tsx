// Learn (docs/PLATFORM.md §4.3): chapters that teach the game. Chapters 1 and 2 are free (for
// guests too); the others open together for LEARN_PRICE coins. Every chapter pays
// CHAPTER_REWARD once when finished.
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  BookOpen,
  Castle,
  Check,
  Crown,
  Flag,
  Grid3x3,
  Hourglass,
  Lock,
  Play,
  RotateCcw,
  Scale,
  Star,
  UserPlus,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { CHAPTERS, CHAPTER_REWARD, LEARN_PRICE, chapterOf, chapterOpen, nextLesson, type LearnChapter } from '#shared/learn.ts';
import { api, type LearnProgress } from '../../api';
import { Page } from '../../app/AppLayout';
import { useSession } from '../../app/session';
import { t } from '../../i18n';
import { Badge, Button, Coins, EmptyState, ProgressBar, Spinner, confirmDialog, cx, formatNumber, useToast } from '../../ui/kit';
import { onPuzzlesChanged, signUp } from '../puzzles/guest';
import { FROM_PRICE, euros, usePremiumShown } from '../premium/plans';
import { LESSONS } from './lessons';
import './learn.css';

export const CHAPTER_ICONS: Record<string, LucideIcon> = { castle: Castle, crown: Crown, flag: Flag, book: BookOpen, scale: Scale, zap: Zap, hourglass: Hourglass, grid: Grid3x3 };

/** The player's lessons; reloads after unlocking and when a guest's lessons moved into the account. */
function useLearnProgress(): [LearnProgress | null | 'error', (next?: LearnProgress) => void] {
  const [progress, setProgress] = useState<LearnProgress | null | 'error'>(null);
  const reload = useCallback((next?: LearnProgress) => {
    if (next) return setProgress(next);
    void api.learn.progress().then(setProgress, () => setProgress('error'));
  }, []);
  useEffect(() => reload(), [reload]);
  useEffect(() => onPuzzlesChanged(() => reload()), [reload]);
  return [progress, reload];
}

const doneIn = (c: LearnChapter, p: LearnProgress) => c.lessons.filter((l) => p.lessons.includes(l)).length;

export function LearnPage() {
  const { profile, setProfile } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [progress, reload] = useLearnProgress();
  const [busy, setBusy] = useState(false);
  const premiumShown = usePremiumShown();

  async function unlock() {
    const ok = await confirmDialog({
      title: t('Unlock all chapters?'),
      text: t('{price} coins will be taken from your balance. Every paid chapter opens, the ones still being written too.', { price: formatNumber(LEARN_PRICE) }),
      confirmLabel: t('Unlock'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      reload(await api.learn.unlock());
      setProfile(await api.profiles.me());
      toast(t('All chapters are open. Enjoy learning!'), { tone: 'success' });
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title={t('Learn')}
      subtitle={t('Chess from the very first move: the pieces, the rules and the first ideas, one step at a time on the board. {coins} coins for every chapter you finish.', {
        coins: CHAPTER_REWARD,
      })}
      wide
    >
      {progress === null && (
        <div className="puzzles-loading">
          <Spinner size={28} />
        </div>
      )}
      {progress === 'error' && (
        <EmptyState title={t('Could not load your lessons.')}>
          <Button onClick={() => reload()}>{t('Try again')}</Button>
        </EmptyState>
      )}
      {progress && progress !== 'error' && (
        <>
          {!progress.unlocked && (
            <section className="learn-unlock">
              <div>
                {/* after chapter 2 the next chapter is the reason to go on */}
                {progress.rewarded.includes('rules') ? (
                  <>
                    <h2 className="display">{t('You know the rules.')}</h2>
                    <p className="muted">{t('Chapter 3, How a game ends, is next: stalemate, the draws and the clock. The paid chapters open together, once and for good.')}</p>
                  </>
                ) : (
                  <>
                    <h2 className="display">{t('The whole course')}</h2>
                    <p className="muted">{t('The first two chapters are free. The others open together, once and for good.')}</p>
                  </>
                )}
              </div>
              {profile ? (
                <div className="learn-unlock-side">
                  {premiumShown && (
                    <Link to="/premium" className="premium-offer">
                      <Crown size={15} /> {t('Included in Premium · from {price} a month', { price: euros(FROM_PRICE) })}
                    </Link>
                  )}
                  <Button variant={premiumShown ? 'secondary' : 'primary'} loading={busy} disabled={busy || profile.coins < LEARN_PRICE} onClick={() => void unlock()}>
                    <Lock size={15} /> {t('Unlock for')} <Coins amount={LEARN_PRICE} size={14} />
                  </Button>
                  {profile.coins < LEARN_PRICE && <span className="faint">{t('Earn coins in games or buy them in the shop.')}</span>}
                </div>
              ) : (
                <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => signUp(navigate, '/learn')}>
                  {t('Create a free account')}
                </Button>
              )}
            </section>
          )}
          <div className="learn-chapters">
            {CHAPTERS.map((c, i) => (
              <ChapterCard key={c.id} chapter={c} number={i + 1} progress={progress} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

function ChapterCard({ chapter, number, progress }: { chapter: LearnChapter; number: number; progress: LearnProgress }) {
  const navigate = useNavigate();
  const Icon = CHAPTER_ICONS[chapter.icon] ?? BookOpen;
  const ready = chapter.lessons.length > 0;
  const open = chapterOpen(chapter, progress.unlocked);
  const done = doneIn(chapter, progress);
  const complete = ready && done === chapter.lessons.length;
  return (
    <article className={cx('learn-chapter', (!open || !ready) && 'is-locked')} style={{ '--chapter': chapter.color } as CSSProperties}>
      <header>
        <span className="learn-chapter-icon">
          <Icon size={22} />
        </span>
        <span className="learn-chapter-number faint">{t('Chapter {n}', { n: number })}</span>
        {chapter.free ? <Badge tone="success">{t('Free')}</Badge> : !open && <Lock size={16} className="faint" />}
        {complete && (
          <Badge tone="gold">
            <Check size={12} /> {t('Complete')}
          </Badge>
        )}
      </header>
      <h2 className="display">{t(chapter.name)}</h2>
      <p className="muted">{t(chapter.description)}</p>
      {ready ? (
        <>
          <div className="learn-chapter-progress">
            <ProgressBar value={done / chapter.lessons.length} />
            <span className="faint">{t('{n} of {total} lessons', { n: done, total: chapter.lessons.length })}</span>
          </div>
          <Button variant={open ? 'primary' : 'secondary'} block disabled={!open} onClick={() => navigate(`/learn/${chapter.id}`)}>
            {!open ? (
              <>
                <Lock size={15} /> {t('Locked')}
              </>
            ) : done === 0 ? (
              t('Start')
            ) : complete ? (
              t('Review')
            ) : (
              t('Continue')
            )}
          </Button>
          <p className="faint learn-chapter-note">
            <Star size={13} /> {progress.rewarded.includes(chapter.id) ? t('Reward collected') : t('{coins} coins when you finish it', { coins: CHAPTER_REWARD })}
          </p>
        </>
      ) : (
        <Badge>{t('Coming soon')}</Badge>
      )}
    </article>
  );
}

/** One chapter: its lessons in order, each opening after the one before. */
export function ChapterPage() {
  const { chapter: id } = useParams();
  const chapter = chapterOf(id);
  const navigate = useNavigate();
  const [progress, reload] = useLearnProgress();
  if (!chapter || !chapter.lessons.length) return <Navigate to="/learn" replace />;
  if (progress && progress !== 'error' && !chapterOpen(chapter, progress.unlocked)) return <Navigate to="/learn" replace />;
  const Icon = CHAPTER_ICONS[chapter.icon] ?? BookOpen;
  const ready = progress && progress !== 'error' ? progress : null;
  const next = ready ? nextLesson(chapter, ready.lessons) : 0;
  const done = ready ? doneIn(chapter, ready) : 0;

  return (
    <Page
      title={t(chapter.name)}
      subtitle={t(chapter.description)}
      actions={
        <Link to="/learn" className="btn btn-sm btn-ghost">
          <ArrowLeft size={15} /> <span>{t('All chapters')}</span>
        </Link>
      }
    >
      {progress === null && (
        <div className="puzzles-loading">
          <Spinner size={28} />
        </div>
      )}
      {progress === 'error' && (
        <EmptyState title={t('Could not load your lessons.')}>
          <Button onClick={() => reload()}>{t('Try again')}</Button>
        </EmptyState>
      )}
      {ready && (
        <section className="learn-lessons" style={{ '--chapter': chapter.color } as CSSProperties}>
          <div className="learn-lessons-head">
            <span className="learn-chapter-icon">
              <Icon size={22} />
            </span>
            <div className="learn-chapter-progress">
              <ProgressBar value={done / chapter.lessons.length} />
              <span className="faint">
                {t('{n} of {total} lessons', { n: done, total: chapter.lessons.length })} ·{' '}
                {ready.rewarded.includes(chapter.id) ? t('Reward collected') : <>{t('Reward')} <Coins amount={CHAPTER_REWARD} size={13} /></>}
              </span>
            </div>
          </div>
          <ol className="learn-lesson-list">
            {chapter.lessons.map((lessonId, i) => {
              const finished = ready.lessons.includes(lessonId);
              const open = next === -1 || i <= next;
              return (
                <li key={lessonId}>
                  <button type="button" className={cx('learn-lesson', finished && 'is-done', i === next && 'is-next')} disabled={!open} onClick={() => navigate(`/game/learn/${lessonId}`)}>
                    <span className="learn-lesson-n">{finished ? <Check size={15} /> : open ? i + 1 : <Lock size={14} />}</span>
                    <span className="learn-lesson-title">{t(LESSONS[lessonId].title)}</span>
                    <span className="learn-lesson-go">
                      {finished ? <RotateCcw size={15} /> : open ? <Play size={15} /> : null}
                      {finished ? t('Again') : open ? t('Start') : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </Page>
  );
}
