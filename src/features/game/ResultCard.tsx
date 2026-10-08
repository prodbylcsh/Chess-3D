import { rankText, t, tk } from '../../i18n';
import { useEffect, useState } from 'react';
import { Eye, Sparkles, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { ProfileIcon, RankEmblem } from '../../ui/art/art';
import { Button, Coins, ProgressBar, Spinner, cx } from '../../ui/kit';
import type { Mode } from './modes/types';
import type { GameState } from './store';

const REASON: Record<string, string> = {
  checkmate: tk('by checkmate'),
  resignation: tk('by resignation'),
  agreement: tk('by agreement'),
  stalemate: tk('by stalemate'),
  'insufficient material': tk('by insufficient material'),
  'threefold repetition': tk('by threefold repetition'),
  'fifty-move rule': tk('by the fifty-move rule'),
  abandoned: tk('by abandonment'),
};

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function ResultCard({ s, mode, onHide }: { s: GameState; mode: Mode; onHide: () => void }) {
  const end = s.end!;
  const me = s.mySide;
  const outcome = !me ? null : end.winner === null ? 'draw' : end.winner === me ? 'win' : 'loss';
  const title = outcome === 'win' ? t('Victory') : outcome === 'loss' ? t('Defeat') : outcome === 'draw' ? t('Draw') : end.winner ? t('{name} wins', { name: s.players[end.winner].name }) : t('Draw');
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
          <h1 className="display">{title}</h1>
          <p className="muted">{outcome ? `${end.text} · ${sub}` : sub}</p>
        </header>

        {me && opp && (
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

        {result?.loading && (
          <div className="result-loading">
            <Spinner size={18} /> {t('Calculating your results…')}
          </div>
        )}
        {result?.error && <p className="form-error">{result.error}</p>}

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

        {result && !result.loading && result.accuracy != null && (
          <section className="result-block result-accuracy">
            <Target size={18} />
            <span className="result-label">{t('Your accuracy')}</span>
            <strong>{Math.round(result.accuracy)}%</strong>
            <ProgressBar value={result.accuracy / 100} tone={result.accuracy >= 70 ? 'success' : 'gold'} />
          </section>
        )}

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
