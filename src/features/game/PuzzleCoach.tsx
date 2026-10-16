// The puzzle's guide during play (docs/PLATFORM.md §4.2): the briefing before the first
// move, then a coach card that keeps the goal in view and answers every move.
import { type CSSProperties } from 'react';
import { Check, Lightbulb, MessageCircle, Play, Star, X } from 'lucide-react';
import { HINT_PENALTY, PUZZLES_PER_MODULE, moduleOf } from '#shared/puzzles.ts';
import { t } from '../../i18n';
import { Button, cx } from '../../ui/kit';
import { MODULE_ICONS } from '../puzzles/modules';
import type { Mode } from './modes/types';
import type { GameState, PuzzleMessage } from './store';

const TONE_ICON: Record<PuzzleMessage['tone'], typeof Check> = { info: MessageCircle, good: Check, bad: X, hint: Lightbulb };

/** In place of the opponent's card: the goal, the moves found so far and what the coach says. */
export function PuzzleCoach({ s }: { s: GameState }) {
  const p = s.puzzle!;
  const module = moduleOf(p.module)!;
  const Icon = MODULE_ICONS[module.icon];
  const b = p.brief;
  const MsgIcon = p.message ? TONE_ICON[p.message.tone] : null;
  return (
    <section className="coach" style={{ '--module': p.color } as CSSProperties} aria-live="polite">
      <header className="coach-head">
        <span className="coach-icon">
          <Icon size={16} />
        </span>
        <span className="coach-kicker">
          {t(module.name)} · {p.index + 1}/{PUZZLES_PER_MODULE}
        </span>
        <span className="coach-steps" aria-label={t('{n} of {total} moves found', { n: p.step, total: b.moves })}>
          {Array.from({ length: b.moves }, (_, i) => (
            <i key={i} className={cx(i < p.step && 'is-done', i === p.step && !s.end && 'is-now')} />
          ))}
        </span>
      </header>
      <h2 className="coach-title display">{b.title}</h2>
      <p className="coach-task">{b.task}</p>
      {b.motifs.length > 0 && (
        <div className="coach-motifs">
          {b.motifs.map((m) => (
            <span key={m.theme} className="coach-motif" title={t(m.tip)}>
              {t(m.title)}
            </span>
          ))}
        </div>
      )}
      {p.message && MsgIcon && (
        <p key={p.message.text} className={cx('coach-msg', `is-${p.message.tone}`)}>
          <MsgIcon size={15} />
          <span>{p.message.text}</span>
        </p>
      )}
    </section>
  );
}

/** Before the first move (and on "Task"): what the puzzle is about and how to earn three stars. */
export function PuzzleBriefing({ s, mode }: { s: GameState; mode: Mode }) {
  const p = s.puzzle!;
  const module = moduleOf(p.module)!;
  const Icon = MODULE_ICONS[module.icon];
  const b = p.brief;
  const started = p.step > 0 || p.message !== null;
  return (
    <div className="brief-backdrop">
      <article className="brief" style={{ '--module': p.color } as CSSProperties} role="dialog" aria-labelledby="brief-title">
        <div className="brief-glow" />
        <span className="brief-kicker">
          <span className="coach-icon">
            <Icon size={16} />
          </span>
          {t(module.name)} · {t('Puzzle {n} of {total}', { n: p.index + 1, total: PUZZLES_PER_MODULE })}
        </span>
        <h2 id="brief-title" className="display">
          {b.title}
        </h2>
        <p className="brief-task">
          <span className={`swatch swatch-${b.side}`} /> {b.task}
        </p>
        {b.intro && <p className="brief-intro">{b.intro}</p>}
        {b.motifs.map((m) => (
          <div key={m.theme} className="brief-motif">
            <strong>{t(m.title)}</strong>
            <span>{t(m.tip)}</span>
          </div>
        ))}
        <p className="brief-stars">
          <span>
            {[0, 1, 2].map((i) => (
              <Star key={i} size={14} />
            ))}
          </span>
          {t('No mistakes and no hints: three stars. Hints also cost coins, up to {n}.', { n: HINT_PENALTY })}
        </p>
        <Button variant="primary" block icon={<Play size={16} />} onClick={() => mode.act('go')}>
          {started ? t('Back to the board') : t("Let's go")}
        </Button>
      </article>
    </div>
  );
}
