import { rankText, t } from '../../i18n';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Bot, ChevronRight, Coins as CoinsIcon, Swords, Trophy, Users, Zap, type LucideIcon } from 'lucide-react';
import { rankOf } from '#shared/rating.ts';
import { COINS } from '#shared/economy.ts';
import type { MatchKind, StakeId } from '../../api';
import { Page } from '../../app/AppLayout';
import { useProfile } from '../../app/session';
import { RankEmblem } from '../../ui/art/art';
import { Badge, Button, ProgressBar, cx } from '../../ui/kit';
import { prefetchModel } from '../game/model';
import { AiSetup } from './AiSetup';
import { Matchmaking } from './Matchmaking';
import { PlayFriend } from './PlayFriend';
import { StakePicker } from './StakePicker';
import './play.css';

type Sheet = 'friend' | 'ai' | 'stake' | null;

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? t('Good night') : h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
}

export function PlayHub() {
  const profile = useProfile();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [queue, setQueue] = useState<{ kind: MatchKind; stake?: StakeId } | null>(null);
  const rank = rankOf(profile.mmr);
  const { wins, losses, draws } = profile.stats;

  useEffect(() => prefetchModel(), []);

  // "Find another game" from a result screen lands here with ?queue=…
  useEffect(() => {
    const kind = params.get('queue') as MatchKind | null;
    if (kind === 'ranked' || kind === 'casual' || kind === 'wager') {
      setQueue({ kind, stake: (params.get('stake') as StakeId) ?? undefined });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  return (
    <Page
      title={t('Play')}
      subtitle={
        <>
          {t('{greeting}, {name}. Ready for a game?', { greeting: greeting(), name: profile.username ?? '' })}
        </>
      }
    >
      <section className="ranked-hero">
        <div className="ranked-hero-bg" />
        <div className="ranked-emblem">
          <RankEmblem tier={rank.tier.id} division={rank.division} size={112} />
        </div>
        <div className="ranked-copy">
          <Badge tone="gold">
            <Trophy size={12} /> {t('Ranked')}
          </Badge>
          <h2>{rankText(rank.label)}</h2>
          <div className="ranked-progress">
            <ProgressBar value={rank.progress} />
            <span className="faint">{rank.division ? t('{n}% to the next division', { n: Math.round(rank.progress * 100) }) : t('Apex tier')}</span>
          </div>
          <p className="muted">
            {t('{w}W · {l}L · {d}D', { w: wins, l: losses, d: draws })}
            {profile.stats.rankedStreak >= 2 && (
              <span className="streak">
                <Zap size={13} /> {t('{n} win streak', { n: profile.stats.rankedStreak })}
              </span>
            )}
          </p>
        </div>
        <div className="ranked-cta">
          <Button variant="primary" size="lg" icon={<Swords size={18} />} onClick={() => setQueue({ kind: 'ranked' })}>
            {t('Find ranked match')}
          </Button>
          <span className="faint">{t('Opponents near your rank')}</span>
        </div>
      </section>

      <div className="modes">
        <ModeCard
          icon={Zap}
          tone="blue"
          title={t('Casual')}
          text={t('A quick game against anyone online. No rank on the line.')}
          meta={t('+{n} coins per win', { n: COINS.win })}
          onClick={() => setQueue({ kind: 'casual' })}
        />
        <ModeCard icon={Users} tone="green" title={t('Play a friend')} text={t('Invite a friend, share a link, or play on one device.')} meta={t('Link, friends list or same screen')} onClick={() => setSheet('friend')} />
        <ModeCard icon={Bot} tone="violet" title={t('Play vs AI')} text={t('Five levels from Novice to Master. Practise without pressure.')} meta={t('No rank, no coins')} onClick={() => setSheet('ai')} />
        <ModeCard icon={CoinsIcon} tone="gold" title={t('Play for coins')} text={t('Both players stake coins. The winner takes the pot.')} meta={t('Stakes from 100 to 2,000')} onClick={() => setSheet('stake')} />
        <ModeCard icon={Trophy} tone="red" title={t('Tournaments')} text={t('Brackets with entry fees and big prizes.')} meta={t('Coming soon')} disabled />
      </div>

      <PlayFriend open={sheet === 'friend'} onClose={() => setSheet(null)} />
      <AiSetup open={sheet === 'ai'} onClose={() => setSheet(null)} onStart={(level, color) => navigate(`/game/ai?level=${level}&color=${color}`)} />
      <StakePicker
        open={sheet === 'stake'}
        onClose={() => setSheet(null)}
        onPick={(stake) => {
          setSheet(null);
          setQueue({ kind: 'wager', stake });
        }}
      />
      {queue && <Matchmaking kind={queue.kind} stake={queue.stake} onCancel={() => setQueue(null)} />}
    </Page>
  );
}

function ModeCard({
  icon: Icon,
  tone,
  title,
  text,
  meta,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  tone: 'blue' | 'green' | 'violet' | 'gold' | 'red';
  title: string;
  text: string;
  meta: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={cx('mode-card', `tone-${tone}`, disabled && 'is-disabled')} onClick={onClick} disabled={disabled}>
      <span className="mode-icon">
        <Icon size={24} />
      </span>
      <span className="mode-body">
        <span className="mode-title">
          {title}
          {disabled && <Badge>{t('Soon')}</Badge>}
        </span>
        <span className="mode-text">{text}</span>
        <span className="mode-meta">{meta}</span>
      </span>
      {!disabled && <ChevronRight className="mode-arrow" size={20} />}
    </button>
  );
}
