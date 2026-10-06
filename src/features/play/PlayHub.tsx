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
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
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
      title="Play"
      subtitle={
        <>
          {greeting()}, {profile.username}. Ready for a game?
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
            <Trophy size={12} /> Ranked
          </Badge>
          <h2>{rank.label}</h2>
          <div className="ranked-progress">
            <ProgressBar value={rank.progress} />
            <span className="faint">{rank.division ? `${Math.round(rank.progress * 100)}% to the next division` : 'Apex tier'}</span>
          </div>
          <p className="muted">
            {wins}W · {losses}L · {draws}D
            {profile.stats.rankedStreak >= 2 && (
              <span className="streak">
                <Zap size={13} /> {profile.stats.rankedStreak} win streak
              </span>
            )}
          </p>
        </div>
        <div className="ranked-cta">
          <Button variant="primary" size="lg" icon={<Swords size={18} />} onClick={() => setQueue({ kind: 'ranked' })}>
            Find ranked match
          </Button>
          <span className="faint">Opponents near your rank</span>
        </div>
      </section>

      <div className="modes">
        <ModeCard
          icon={Zap}
          tone="blue"
          title="Casual"
          text="A quick game against anyone online. No rank on the line."
          meta={`+${COINS.win} coins per win`}
          onClick={() => setQueue({ kind: 'casual' })}
        />
        <ModeCard icon={Users} tone="green" title="Play a friend" text="Invite a friend, share a link, or play on one device." meta="Link, friends list or same screen" onClick={() => setSheet('friend')} />
        <ModeCard icon={Bot} tone="violet" title="Play vs AI" text="Five levels from Novice to Master. Practise without pressure." meta="No rank, no coins" onClick={() => setSheet('ai')} />
        <ModeCard icon={CoinsIcon} tone="gold" title="Play for coins" text="Both players stake coins. The winner takes the pot." meta="Stakes from 100 to 2,000" onClick={() => setSheet('stake')} />
        <ModeCard icon={Trophy} tone="red" title="Tournaments" text="Brackets with entry fees and big prizes." meta="Coming soon" disabled />
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
          {disabled && <Badge>Soon</Badge>}
        </span>
        <span className="mode-text">{text}</span>
        <span className="mode-meta">{meta}</span>
      </span>
      {!disabled && <ChevronRight className="mode-arrow" size={20} />}
    </button>
  );
}
