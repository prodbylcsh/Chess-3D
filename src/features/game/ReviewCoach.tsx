// Game Review's card (docs/PLATFORM.md §4.9), in place of the opponent's card: how each side
// played, the move on the board judged, the better move (its arrow is on the board) and
// the key moments to jump to. Over the day's limit it says so, with the plan that has none.
import type { CSSProperties } from 'react';
import { Crown, LineChart, Sparkles } from 'lucide-react';
import type { PieceSymbol } from 'chess.js';
import { PLANS, RECOMMENDED } from '#shared/subscription.ts';
import { t, tk, tn } from '../../i18n';
import { Button, ProgressBar, Spinner, cx } from '../../ui/kit';
import { worse, type MoveKind, type ReviewedMove } from '../review/review';
import type { Mode } from './modes/types';
import type { GameState } from './store';

const KIND_NAME: Record<MoveKind, string> = {
  best: tk('Best move'),
  great: tk('Great move'),
  good: tk('Good move'),
  inaccuracy: tk('Inaccuracy'),
  mistake: tk('Mistake'),
  blunder: tk('Blunder'),
};

const KIND_TEXT: Record<MoveKind, string> = {
  best: tk('The engine’s own choice.'),
  great: tk('It punishes the mistake before it.'),
  good: tk('Nearly as good as the best move.'),
  inaccuracy: tk('A little weaker. Better: {move}.'),
  mistake: tk('This gave a lot away. Better: {move}.'),
  blunder: tk('This turned the game. Better: {move}.'),
};

const PIECE: Record<PieceSymbol, string> = { p: tk('the pawn'), n: tk('the knight'), b: tk('the bishop'), r: tk('the rook'), q: tk('the queen'), k: tk('the king') };
const TAKES: Record<PieceSymbol, string> = { p: tk('taking a pawn'), n: tk('taking a knight'), b: tk('taking a bishop'), r: tk('taking a rook'), q: tk('taking the queen'), k: '' };

/** The better move by its piece (the arrow on the board shows where it goes). */
function betterText(b: NonNullable<ReviewedMove['better']>): string {
  const parts = [b.castle ? t('castling') : t(PIECE[b.piece])];
  if (b.captured) parts.push(t(TAKES[b.captured]));
  if (b.promotion) parts.push(t('promoting'));
  if (b.check) parts.push(t('with check'));
  return parts.join(', ');
}

export function ReviewCoach({ s, mode }: { s: GameState; mode: Mode }) {
  const r = s.review!;
  const me = r.color;
  const opp = me === 'w' ? 'b' : 'w';
  return (
    <section className="coach review-coach" style={{ '--module': 'var(--gold)' } as CSSProperties} aria-live="polite">
      <header className="coach-head">
        <span className="coach-icon">
          <LineChart size={16} />
        </span>
        <span className="coach-kicker">{t('Game Review')}</span>
      </header>

      {r.status === 'checking' && (
        <p className="coach-task">
          <Spinner size={14} /> {t('Opening the review…')}
        </p>
      )}
      {r.status === 'analysing' && (
        <div className="review-progress">
          <p className="coach-task">{t('Stockfish looks at every move in your browser…')}</p>
          <ProgressBar value={r.progress} />
        </div>
      )}
      {r.status === 'failed' && <p className="coach-task">{t('This device could not review the game.')}</p>}
      {r.status === 'locked' && (
        <div className="review-locked">
          <h2 className="coach-title display">{t('Today’s free review is used')}</h2>
          <p className="coach-task">{t('Free players review one game a day. With {plan} every game, every move.', { plan: PLANS[RECOMMENDED].name })}</p>
          <Button variant="primary" size="sm" icon={<Crown size={14} />} onClick={() => mode.act('premium')}>
            {t('See Premium')}
          </Button>
        </div>
      )}

      {r.status === 'ready' && r.review && (
        <>
          <div className="review-sides">
            {([me, opp] as const).map((side) => {
              const c = worse(r.review!.counts[side]);
              return (
                <div key={side} className="review-side">
                  <strong>{side === me ? t('You') : s.players[side].name}</strong>
                  <span>
                    {c.blunders + c.mistakes + c.inaccuracies === 0
                      ? t('no slips')
                      : [
                          c.blunders ? tn(c.blunders, '{n} blunder', '{n} blunders') : '',
                          c.mistakes ? tn(c.mistakes, '{n} mistake', '{n} mistakes') : '',
                          c.inaccuracies ? tn(c.inaccuracies, '{n} inaccuracy', '{n} inaccuracies') : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                    {c.great > 0 && (
                      <>
                        {' '}
                        · <Sparkles size={12} /> {tn(c.great, '{n} great move', '{n} great moves')}
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <Current s={s} />
          {r.review.keys.length > 0 && (
            <div className="review-keys">
              <span className="faint">{t('Key moments')}</span>
              {r.review.keys.map((ply) => {
                const m = r.review!.moves[ply];
                return (
                  <button key={ply} type="button" className={cx('review-key', `kind-${m.kind}`, r.at === ply + 1 && 'is-now')} onClick={() => mode.act(`ply:${ply}`)}>
                    {moveLabel(m)}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** "3. Bc4" for White's move, "3… Nf6" for Black's (the move list's numbering). */
const moveLabel = (m: ReviewedMove) => `${Math.floor(m.ply / 2) + 1}${m.side === 'w' ? '.' : '…'} ${m.san}`;

function Current({ s }: { s: GameState }) {
  const r = s.review!;
  const move = r.at > 0 ? r.review!.moves[r.at - 1] : null;
  if (!move) return <p className="coach-task">{t('The start of the game. Step through it, or jump to a key moment.')}</p>;
  const who = move.side === r.color ? t('You') : s.players[move.side].name;
  return (
    <div key={r.at} className={cx('review-move', `kind-${move.kind}`)}>
      <span className="review-move-head">
        <span className="review-dot" />
        <strong>{t(KIND_NAME[move.kind])}</strong>
        <span className="faint">
          {t('Move {n}', { n: Math.floor(move.ply / 2) + 1 })} · {who}: {move.san}
        </span>
      </span>
      <span className="review-move-text">{t(KIND_TEXT[move.kind], { move: move.better ? betterText(move.better) : '' })}</span>
    </div>
  );
}
