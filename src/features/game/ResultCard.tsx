import { rankText, t, tk, tn } from '../../i18n';
import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { itemDef } from '#shared/shop.ts';
import { Award, Crown, Eye, Gift, LineChart, ShoppingBag, Sparkles, Star, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { PLANS, RECOMMENDED } from '#shared/subscription.ts';
import { api } from '../../api';
import { useSession } from '../../app/session';
import type { Engine } from './engine';
import { reviewPath } from './modes/review';
import { usePremiumShown } from '../premium/plans';
import { CATEGORY_NAMES, itemName } from '../../api/catalog';
import { awardName } from '../../api/awards';
import { ProfileIcon, RankEmblem } from '../../ui/art/art';
import { Button, Coins, ProgressBar, Spinner, cx, formatNumber } from '../../ui/kit';
import type { Analysis } from '../../ai/analysis';
import type { Mode } from './modes/types';
import type { GameState } from './store';
import { DailyResult } from '../puzzles/streak';
import { timeUntil } from '../../ui/format';

const REASON: Record<string, string> = {
  checkmate: tk('by checkmate'),
  resignation: tk('by resignation'),
  agreement: tk('by agreement'),
  stalemate: tk('by stalemate'),
  'insufficient material': tk('by insufficient material'),
  'threefold repetition': tk('by threefold repetition'),
  'fifty-move rule': tk('by the fifty-move rule'),
  abandoned: tk('by abandonment'),
  timeout: tk('on time'),
};

/** A solved puzzle: stars, coins, the bonus every 10 and the module's finishing reward. */
function PuzzleBlock({ puzzle }: { puzzle: NonNullable<GameState['puzzle']> }) {
  const r = puzzle.result;
  const daily = puzzle.daily;
  if (daily) {
    return (
      <>
        {puzzle.saving && (
          <div className="result-loading">
            <Spinner size={18} /> {t('Saving your progress…')}
          </div>
        )}
        {puzzle.error && <p className="form-error">{puzzle.error}</p>}
        {daily.result && <DailyResult before={daily.streak.current} result={daily.result} />}
      </>
    );
  }
  if (puzzle.revealed && !r) {
    return (
      <section className="result-block">
        <p className="muted result-revealed">
          <Eye size={16} /> {t('Seen, not solved: no coins or stars this time. The next puzzle is open, and this one comes back in your reviews tomorrow.')}
        </p>
      </section>
    );
  }
  const lit = r ? (r.counted ? r.stars : r.best) : 0;
  return (
    <>
      <div className="puzzle-stars" aria-label={r ? t('{n} of 3 stars', { n: lit }) : undefined}>
        {[1, 2, 3].map((n) => (
          <Star key={n} size={34} className={cx(r && n <= lit && 'is-lit')} />
        ))}
      </div>
      {puzzle.saving && (
        <div className="result-loading">
          <Spinner size={18} /> {t('Saving your progress…')}
        </div>
      )}
      {puzzle.error && <p className="form-error">{puzzle.error}</p>}
      {r && !r.counted && (
        <p className="faint result-note">
          {r.reviewFrom
            ? t('A practice round: your stars stay at {n}. They can improve in a review {when}, once the moves are no longer fresh in your mind.', { n: r.best, when: timeUntil(r.reviewFrom) })
            : t('A practice round: you already have all three stars.')}
        </p>
      )}
      {r && (
        <section className="result-block">
          <div className="result-row">
            <span className="result-label">{t('Coins')}</span>
            <Coins amount={r.coins + r.bonus} signed size={20} />
          </div>
          <div className="result-chips">
            {r.first ? <span>{t('Puzzle')} +{r.coins + r.hintCost}</span> : <span>{t('Already solved: no coins this time')}</span>}
            {r.hintCost > 0 && <span>{t('Hints')} −{r.hintCost}</span>}
            {r.bonus > 0 && <span>{t('Bonus for {n} solved', { n: r.solved })} +{r.bonus}</span>}
            <span>{t('{n} of {total} solved', { n: r.solved, total: 100 })}</span>
          </div>
        </section>
      )}
      {r?.reward && (
        <section className="result-block puzzle-reward">
          <Gift size={20} />
          <div>
            <strong>{t('Module complete!')}</strong>
            <span className="muted">
              {r.reward.item ? t('Your reward: {item}', { item: itemName(r.reward.item) }) : t('Your reward: {coins} coins', { coins: formatNumber(r.reward.coins ?? 0) })}
            </span>
          </div>
        </section>
      )}
    </>
  );
}

/** What the engine analysis means for this game's performance part. */
const ANALYSIS_NOTE: Partial<Record<Analysis['status'], string>> = {
  running: tk('Stockfish analyses the game in your browser; you can leave this screen meanwhile.'),
  waiting: tk('Your performance counts once your opponent\'s analysis agrees.'),
  applied: tk('Your performance from the engine analysis is included.'),
  mismatch: tk('The two analyses did not agree, so your performance counts as average.'),
  expired: tk('Your opponent\'s analysis did not arrive, so your performance counts as average.'),
  failed: tk('This device could not analyse the game, so your performance counts as average.'),
};

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Game Review from the result card (docs/PLATFORM.md §4.9): how many reviews are left today,
 * and the plan without a limit once they are used.
 */
function ReviewOffer({ s, mode, engine }: { s: GameState; mode: Mode; engine: Engine }) {
  const { profile } = useSession();
  const navigate = useNavigate();
  const params = useParams();
  const premiumShown = usePremiumShown();
  const [limit, setLimit] = useState<{ used: number; limit: number | null } | null>(null);
  // games without an id of their own (vs AI) get one for today's count
  const [id] = useState(() => params.id ?? `${params.mode ?? 'game'}-${Date.now().toString(36)}`);
  useEffect(() => void api.reviews.today().then(setLimit, () => {}), []);
  if (!profile || !limit) return null;
  const left = limit.limit === null ? null : Math.max(0, limit.limit - limit.used);
  const me = s.mySide!;

  function open() {
    navigate(
      reviewPath({
        id,
        moves: engine.game.history,
        color: me,
        players: s.players,
        loadouts: { [me]: profile!.loadout },
        label: mode.label,
      }),
    );
  }

  return (
    <section className="result-block result-review">
      <div className="result-row">
        <span className="result-label">
          <LineChart size={16} /> {t('See your best and worst moves')}
        </span>
      </div>
      <p className="faint result-note">
        {left === null ? t('Game Review is unlimited with your plan.') : left > 0 ? tn(left, '{n} free review left today', '{n} free reviews left today') : t('Today’s free review is used.')}
      </p>
      {left === 0 && premiumShown ? (
        <Button variant="secondary" icon={<Crown size={15} />} onClick={() => navigate('/premium')}>
          {t('Every game with {plan}', { plan: PLANS[RECOMMENDED].name })}
        </Button>
      ) : (
        <Button variant="secondary" icon={<LineChart size={15} />} disabled={left === 0} onClick={open}>
          {t('Game Review')}
        </Button>
      )}
    </section>
  );
}

export function ResultCard({ s, mode, engine, onHide }: { s: GameState; mode: Mode; engine: Engine; onHide: () => void }) {
  const end = s.end!;
  const me = s.mySide;
  const outcome = !me ? null : end.winner === null ? 'draw' : end.winner === me ? 'win' : 'loss';
  // an aborted game has no result: say so instead of "Draw"
  const aborted = end.reason === 'aborted';
  const custom = mode.endTitle?.(s);
  const title = custom ? custom.title : aborted ? end.title : outcome === 'win' ? t('Victory') : outcome === 'loss' ? t('Defeat') : outcome === 'draw' ? t('Draw') : end.winner ? t('{name} wins', { name: s.players[end.winner].name }) : t('Draw');
  const sub = REASON[end.reason] ? t(REASON[end.reason]) : end.text;
  const opp = me ? s.players[me === 'w' ? 'b' : 'w'] : null;
  const result = s.result;
  const data = result?.data;

  return (
    <div className="result-backdrop">
      <div className={cx('result', outcome && `is-${outcome}`)}>
        <div className="result-glow" />
        <header className="result-head">
          <span className="result-kicker">{mode.label}</span>
          <h1 className={cx('display', s.spectator && title.length > 16 && 'is-long')}>{title}</h1>
          <p className="muted">{custom ? custom.text : aborted ? end.text : outcome ? `${end.text} · ${sub}` : sub}</p>
        </header>

        {s.puzzle && <PuzzleBlock puzzle={s.puzzle} />}

        {me && opp && !s.puzzle && (
          <div className="result-vs">
            <div className={cx('result-player', outcome === 'win' && 'is-winner')}>
              <ProfileIcon icon={s.players[me].iconId} size={52} />
              <span>{s.players[me].name}</span>
            </div>
            <span className="result-vs-label">{t('vs')}</span>
            <div className={cx('result-player', outcome === 'loss' && 'is-winner')}>
              <ProfileIcon icon={opp.iconId} size={52} />
              <span>{opp.name}</span>
            </div>
          </div>
        )}

        {!me && s.spectator && (
          <div className="result-vs">
            {(['w', 'b'] as const).map((side, i) => (
              <Fragment key={side}>
                {i === 1 && <span className="result-vs-label">{t('vs')}</span>}
                <div className={cx('result-player', end.winner === side && 'is-winner')}>
                  <ProfileIcon icon={s.players[side].iconId} size={52} />
                  <span>{s.players[side].name}</span>
                </div>
              </Fragment>
            ))}
          </div>
        )}

        {s.spectator && s.spectator.items.length > 0 && (
          <section className="result-block result-seen">
            <span className="result-label">{t('Seen in this game')}</span>
            <div className="result-chips">
              {s.spectator.items.map((id) => (
                <Link key={id} to={`/shop?c=${itemDef(id)!.category}`} className="result-seen-item">
                  <ShoppingBag size={14} /> {itemName(id)} <span className="result-seen-kind">{t(CATEGORY_NAMES[itemDef(id)!.category])}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {result?.loading && (
          <div className="result-loading">
            <Spinner size={18} /> {t('Calculating your results…')}
          </div>
        )}
        {result?.error && <p className="form-error">{result.error}</p>}

        {data?.awards && data.awards.length > 0 && (
          <div className="result-awards">
            {data.awards.map((id) => (
              <span key={id} className="result-award">
                <Award size={15} /> {t('New award: {name}', { name: awardName(id) })}
              </span>
            ))}
          </div>
        )}

        {data?.mmr && <MmrBlock data={data} />}

        {data && (data.coins || data.wager !== null) && (
          <section className="result-block">
            <div className="result-row">
              <span className="result-label">{t('Coins')}</span>
              <Coins amount={data.wager ?? data.coins!.total} signed size={20} />
            </div>
            {data.coins && (
              <div className="result-chips">
                <span>{t('Base')} {signed(data.coins.baseline)}</span>
                {data.coins.performance !== 0 && <span>{t('Performance')} {signed(data.coins.performance)}</span>}
                {data.coins.difference !== 0 && <span>{t('Opponent')} {signed(data.coins.difference)}</span>}
                {data.coins.streak !== 0 && <span>{t('Streak')} {signed(data.coins.streak)}</span>}
              </div>
            )}
          </section>
        )}

        {result && !result.loading && result.analysis?.status === 'running' && result.accuracy == null && (
          <section className="result-block result-accuracy">
            <Target size={18} />
            <span className="result-label">{t('Analysing the game…')}</span>
            <strong>{Math.round(result.analysis.progress * 100)}%</strong>
            <ProgressBar value={result.analysis.progress} />
          </section>
        )}
        {result && !result.loading && result.accuracy != null && (
          <section className="result-block result-accuracy">
            <Target size={18} />
            <span className="result-label">{t('Your accuracy')}</span>
            <strong>{Math.round(result.accuracy)}%</strong>
            <ProgressBar value={result.accuracy / 100} tone={result.accuracy >= 70 ? 'success' : 'gold'} />
          </section>
        )}
        {result?.analysis && ANALYSIS_NOTE[result.analysis.status] && <p className="faint result-note">{t(ANALYSIS_NOTE[result.analysis.status]!)}</p>}

        {me && !s.puzzle && !s.lesson && !s.spectator && !s.review && engine.game.history.length >= 4 && <ReviewOffer s={s} mode={mode} engine={engine} />}

        {mode.endNote?.(s) && <p className="faint result-note">{mode.endNote(s)}</p>}

        <footer className="result-actions">
          {mode.endActions(s).map((a) => (
            <Button key={a.id} variant={a.primary ? 'primary' : 'secondary'} size={a.primary ? 'lg' : 'md'} block={a.primary} onClick={() => mode.act(a.id)}>
              {a.label}
            </Button>
          ))}
          <Button variant="ghost" icon={<Eye size={16} />} onClick={onHide}>
            {t('View board')}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function MmrBlock({ data }: { data: NonNullable<GameState['result']>['data'] & object }) {
  const mmr = data.mmr!;
  const before = data.rankBefore;
  const after = data.rankAfter;
  const promoted = after.label !== before.label && mmr.total > 0;
  const demoted = after.label !== before.label && mmr.total < 0;
  // animate the bar from where it was to where it is
  const [progress, setProgress] = useState(before.progress);
  useEffect(() => {
    const t1 = setTimeout(() => setProgress(promoted ? 1 : demoted ? 0 : after.progress), 350);
    const t2 = promoted || demoted ? setTimeout(() => setProgress(after.progress), 1200) : undefined;
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [after.progress, promoted, demoted]);

  const rows: Array<[string, number]> = [
    [t('Base'), mmr.baseline],
    [t('Rating difference'), mmr.difference],
    [t('Performance'), mmr.performance],
    [t('Win streak'), mmr.streak],
  ];

  return (
    <section className="result-block">
      <div className="result-row">
        <span className="result-label">{t('Ranked')}</span>
        <span className={cx('result-mmr', mmr.total >= 0 ? 'up' : 'down')}>
          {mmr.total >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          {t('{n} MMR', { n: signed(mmr.total) })}
        </span>
      </div>
      <div className="result-breakdown">
        {rows
          .filter(([, v], i) => i === 0 || v !== 0)
          .map(([label, v]) => (
            <div key={label}>
              <span>{label}</span>
              <span className={v >= 0 ? 'up' : 'down'}>{signed(v)}</span>
            </div>
          ))}
      </div>
      <div className="result-rank">
        <RankEmblem tier={(promoted || demoted ? after : before).tier} division={(promoted || demoted ? after : before).division} size={44} />
        <div>
          <strong>{rankText(after.label)}</strong>
          <ProgressBar value={progress} />
        </div>
      </div>
      {promoted && (
        <div className="result-promoted">
          <Sparkles size={16} /> {t('Promoted to {rank}!', { rank: rankText(after.label) })}
        </div>
      )}
      {demoted && <div className="result-demoted">{t('Dropped to {rank}', { rank: rankText(after.label) })}</div>}
    </section>
  );
}
