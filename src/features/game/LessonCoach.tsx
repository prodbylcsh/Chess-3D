// The teacher during a lesson (Learn, docs/PLATFORM.md §4.3): what to look at, the task and
// the questions, step by step, then the finished lesson and the chapter's reward.
import { type CSSProperties } from 'react';
import { ArrowRight, Check, GraduationCap, Lightbulb, MessageCircle, Star, X } from 'lucide-react';
import { CHAPTER_REWARD, chapterOf } from '#shared/learn.ts';
import { t } from '../../i18n';
import { Button, Coins, cx } from '../../ui/kit';
import type { Mode } from './modes/types';
import type { GameState, PuzzleMessage } from './store';

const TONE_ICON: Record<PuzzleMessage['tone'], typeof Check> = { info: MessageCircle, good: Check, bad: X, hint: Lightbulb };

export function LessonCoach({ s, mode }: { s: GameState; mode: Mode }) {
  const l = s.lesson!;
  const chapter = chapterOf(l.chapter)!;
  const MsgIcon = l.message ? TONE_ICON[l.message.tone] : null;
  const last = l.step === l.steps - 1;
  const canGo = (!l.task || l.taskDone) && (!l.quiz || l.quiz.right);

  if (l.done) {
    const more = l.index + 1 < l.total;
    return (
      <section className="coach lesson-coach" style={{ '--module': l.color } as CSSProperties} aria-live="polite">
        <header className="coach-head">
          <span className="coach-icon">
            <GraduationCap size={16} />
          </span>
          <span className="coach-kicker">{t(chapter.name)}</span>
        </header>
        <h2 className="coach-title display">{l.done.chapterDone ? t('Chapter complete!') : t('Lesson complete!')}</h2>
        <p className="coach-task">{l.title}</p>
        {l.done.reward > 0 && (
          <p className="coach-msg is-good lesson-reward">
            <Star size={15} />
            <span>
              {t('Chapter reward')} <Coins amount={l.done.reward} size={14} />
            </span>
          </p>
        )}
        {l.guest && (
          <p className="coach-practice">{t('Create a free account on this device to keep your lessons and the {coins} coins of every chapter.', { coins: CHAPTER_REWARD })}</p>
        )}
        <div className="lesson-actions">
          <Button variant="primary" block icon={<ArrowRight size={16} />} onClick={() => mode.act('next-lesson')}>
            {more ? t('Next lesson') : t('Back to the chapter')}
          </Button>
          {more && (
            <Button variant="ghost" block onClick={() => mode.act('exit')}>
              {t('Back to the chapter')}
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="coach lesson-coach" style={{ '--module': l.color } as CSSProperties} aria-live="polite">
      <header className="coach-head">
        <span className="coach-icon">
          <GraduationCap size={16} />
        </span>
        <span className="coach-kicker">
          {t(chapter.name)} · {l.index + 1}/{l.total}
        </span>
        <span className="coach-steps" aria-label={t('Step {n} of {total}', { n: l.step + 1, total: l.steps })}>
          {Array.from({ length: l.steps }, (_, i) => (
            <i key={i} className={cx(i < l.step && 'is-done', i === l.step && 'is-now')} />
          ))}
        </span>
      </header>
      <h2 className="coach-title display">{l.title}</h2>
      <p key={l.step} className="lesson-say">
        {l.say}
      </p>
      {l.task && !l.taskDone && l.left !== null && l.left > 0 && <p className="coach-practice">{t('{n} left', { n: l.left })}</p>}
      {l.quiz && (
        <div className="lesson-quiz" role="group" aria-label={t('Answers')}>
          {l.quiz.options.map((o, i) => (
            <button
              key={i}
              type="button"
              className={cx('lesson-option', l.quiz!.chosen === i && (l.quiz!.right ? 'is-right' : 'is-wrong'))}
              disabled={l.quiz!.right}
              onClick={() => mode.act(`answer:${i}`)}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {l.message && MsgIcon && (
        <p key={l.message.text} className={cx('coach-msg', `is-${l.message.tone}`)}>
          <MsgIcon size={15} />
          <span>{l.message.text}</span>
        </p>
      )}
      {l.error && (
        <p className="coach-msg is-bad">
          <X size={15} />
          <span>{l.error}</span>
        </p>
      )}
      <div className="lesson-actions">
        {l.error ? (
          <Button variant="primary" block loading={l.saving} onClick={() => mode.act('save')}>
            {t('Try again')}
          </Button>
        ) : (
          <Button variant="primary" block disabled={!canGo} loading={l.saving} icon={<ArrowRight size={16} />} onClick={() => mode.act('next')}>
            {last ? t('Finish the lesson') : l.task && !l.taskDone ? t('Your move') : t('Next')}
          </Button>
        )}
      </div>
    </section>
  );
}
