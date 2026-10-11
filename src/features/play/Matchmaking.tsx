import { rankText, t, tk } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { STAKES } from '#shared/economy.ts';
import { CONTROLS, controlLabel } from '#shared/play.ts';
import { rankOf } from '#shared/rating.ts';
import { api, ApiError, type ControlId, type MatchKind, type StakeId } from '../../api';
import { useProfile } from '../../app/session';
import { ProfileIcon, RankEmblem } from '../../ui/art/art';
import { Badge, Button, formatNumber, useToast } from '../../ui/kit';
import { rememberMatch } from '../game/matches';
import { cancelSearch, clearSearch, currentSearch, searchInBackground, startSearch, useSearch } from './search';

const TITLES: Record<MatchKind, string> = { ranked: tk('Ranked'), casual: tk('Casual'), wager: tk('Play for coins') };

/** Full-screen search: pulsing rings while searching, then a versus card and a countdown. */
export function Matchmaking({ kind, stake, control, onCancel }: { kind: MatchKind; stake?: StakeId; control: ControlId; onCancel: () => void }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const toast = useToast();
  const search = useSearch();
  const [now, setNow] = useState(Date.now());
  const [queueSize, setQueueSize] = useState<number | null>(null);
  const [count, setCount] = useState(3);
  const match = search?.match ?? null;
  // the parent passes a new callback on every render; the search must not restart
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    startSearch(kind, stake, control);
    let live = true;
    void api.matchmaking.queueSize(kind).then((n) => live && setQueueSize(n));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [kind, stake, control]);

  // leaving the screen ends the search, unless the player went to play the AI meanwhile
  useEffect(
    () => () => {
      const s = currentSearch();
      if (s && !s.background && !s.match) cancelSearch();
    },
    [],
  );

  useEffect(() => {
    if (!search?.error) return;
    const err = search.error;
    toast(err instanceof ApiError ? t(err.message) : t('Matchmaking failed. Please try again.'), { tone: 'danger' });
    clearSearch();
    onCancelRef.current();
  }, [search?.error, toast]);

  // countdown, then into the game
  useEffect(() => {
    if (!match) return;
    rememberMatch(match);
    if (count <= 0) {
      clearSearch();
      navigate(`/game/match/${match.matchId}`);
      return;
    }
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [match, count, navigate]);

  const elapsed = Math.max(0, Math.floor((now - (search?.startedAt ?? now)) / 1000));
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
            {api.demo.accounts
              ? queueSize
                ? t('{n} players searching', { n: formatNumber(queueSize) })
                : ' '
              : t('{n} players online', { n: formatNumber(Math.max(1, queueSize ?? 1)) })}
            {kind === 'ranked' && ` · ${t('matching by rank')}`}
            {` · ${t(CONTROLS[control].name)} ${controlLabel(control)}`}
          </p>
          <div className="mm-actions">
            <Button
              variant="secondary"
              onClick={() => {
                cancelSearch();
                onCancel();
              }}
            >
              {t('Cancel')}
            </Button>
            {elapsed >= 10 && (
              <Button
                variant="ghost"
                icon={<Bot size={16} />}
                onClick={() => {
                  searchInBackground();
                  navigate('/game/ai?level=3&color=random');
                }}
              >
                {t('Play the AI while you wait')}
              </Button>
            )}
          </div>
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
