import { rankText, t, tk } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { STAKES } from '#shared/economy.ts';
import { rankOf } from '#shared/rating.ts';
import { api, ApiError, type MatchFound, type MatchKind, type StakeId } from '../../api';
import { useProfile } from '../../app/session';
import { ProfileIcon, RankEmblem } from '../../ui/art/art';
import { Badge, Button, formatNumber, useToast } from '../../ui/kit';
import { rememberMatch } from '../game/matches';

const TITLES: Record<MatchKind, string> = { ranked: tk('Ranked'), casual: tk('Casual'), wager: tk('Play for coins') };

/** Full-screen search: pulsing rings while searching, then a versus card and a countdown. */
export function Matchmaking({ kind, stake, onCancel }: { kind: MatchKind; stake?: StakeId; onCancel: () => void }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const toast = useToast();
  const [elapsed, setElapsed] = useState(0);
  const [queueSize, setQueueSize] = useState<number | null>(null);
  const [match, setMatch] = useState<MatchFound | null>(null);
  const [count, setCount] = useState(3);
  const cancelRef = useRef<() => void>(() => {});
  // the parent passes a new callback on every render; the search must not restart
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const ticket = api.matchmaking.find(kind, stake);
    cancelRef.current = ticket.cancel;
    let live = true;
    void api.matchmaking.queueSize(kind).then((n) => live && setQueueSize(n));
    ticket.found.then(
      (m) => live && setMatch(m),
      (err) => {
        if (!live || (err instanceof ApiError && err.code === 'cancelled')) return;
        toast(err instanceof ApiError ? t(err.message) : t('Matchmaking failed. Please try again.'), { tone: 'danger' });
        onCancelRef.current();
      },
    );
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      live = false;
      clearInterval(timer);
      ticket.cancel();
    };
  }, [kind, stake, toast]);

  // countdown, then into the game
  useEffect(() => {
    if (!match) return;
    rememberMatch(match);
    if (count <= 0) {
      navigate(`/game/match/${match.matchId}`);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [match, count, navigate]);

  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const myRank = rankOf(profile.mmr);
  const title = kind === 'wager' ? `${t(TITLES[kind])} · ${formatNumber(STAKES[stake ?? 'low'].amount)}` : t(TITLES[kind]);

  return createPortal(
    <div className="mm">
      {!match ? (
        <div className="mm-search">
          <span className="mm-kicker">{title}</span>
          <div className="mm-rings">
            <span />
            <span />
            <span />
            <ProfileIcon icon={profile.iconId} size={96} />
          </div>
          <h2>{t('Searching for an opponent')}</h2>
          <p className="mm-time">
            {mm}:{ss}
          </p>
          <p className="faint">
            {queueSize ? t('{n} players searching', { n: formatNumber(queueSize) }) : ' '}
            {kind === 'ranked' && ` · ${t('matching by rank')}`}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              cancelRef.current();
              onCancel();
            }}
          >
            {t('Cancel')}
          </Button>
        </div>
      ) : (
        <div className="mm-found">
          <span className="mm-kicker">{t('Match found')}</span>
          <div className="mm-vs">
            <div className="mm-player">
              <ProfileIcon icon={profile.iconId} size={88} />
              <strong>{profile.username}</strong>
              <span className="mm-rank">
                <RankEmblem tier={myRank.tier.id} division={myRank.division} size={20} /> {rankText(myRank.label)}
              </span>
            </div>
            <span className="mm-vs-label display">{t('VS')}</span>
            <div className="mm-player">
              <ProfileIcon icon={match.opponent.iconId} size={88} />
              <strong>{match.opponent.username}</strong>
              <span className="mm-rank">
                <RankEmblem tier={match.opponent.rank.tier} division={match.opponent.rank.division} size={20} /> {rankText(match.opponent.rank.label)}
              </span>
            </div>
          </div>
          <p className="mm-count">
            {t('You play {color} · starting in {n}', { color: match.color === 'w' ? t('White') : t('Black'), n: Math.max(count, 1) })}
          </p>
          {match.demo && (
            <p className="mm-demo">
              <Badge tone="violet">{t('Demo')}</Badge> {t("Matchmaking runs on demo data for now: this opponent's moves are played by the AI.")}
            </p>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
