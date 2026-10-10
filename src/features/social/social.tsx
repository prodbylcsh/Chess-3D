import { rankText, t } from '../../i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Check, MessageCircle, Swords, UserCheck, UserMinus, UserPlus, X } from 'lucide-react';
import { api, ApiError, type PublicProfile, type Relation } from '../../api';
import { useBadges } from '../../app/notifications';
import { useProfile } from '../../app/session';
import { online } from '../../net/client';
import { ProfileIcon, RankEmblem } from '../../ui/art/art';
import { Badge, Button, confirmDialog, cx, toast } from '../../ui/kit';
import './social.css';

/** Avatar + name + rank, linking to the profile. */
export function PlayerLine({ player, sub, size = 44 }: { player: PublicProfile; sub?: ReactNode; size?: number }) {
  return (
    <Link to={`/u/${player.username}`} className="player-line">
      <span className="player-line-avatar">
        <ProfileIcon icon={player.iconId} size={size} />
        <span className={cx('presence-dot', player.online && 'is-on')} title={player.online ? t('Online') : t('Offline')} />
      </span>
      <span className="player-line-text">
        <strong>{player.username}</strong>
        <span className="player-line-sub">
          <RankEmblem tier={player.rank.tier} division={player.rank.division} size={15} />
          {rankText(player.rank.label)}
          {sub}
        </span>
      </span>
    </Link>
  );
}

/** The relationship-aware friend button: add, cancel, accept/decline, or remove. */
export function FriendButton({ playerId, compact, iconOnly }: { playerId: string; compact?: boolean; iconOnly?: boolean }) {
  const { version } = useBadges();
  const [relation, setRelation] = useState<Relation | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.friends.relation(playerId).then(setRelation);
  }, [playerId, version]);

  async function run(action: () => Promise<void>, next: Relation, message?: string) {
    setBusy(true);
    try {
      await action();
      setRelation(next);
      if (message) toast(message, { tone: 'success' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Something went wrong.'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  const size = compact ? 'sm' : 'md';
  if (!relation || relation === 'self') return null;
  if (relation === 'friend') {
    return (
      <Button
        size={size}
        variant="secondary"
        icon={<UserCheck size={16} />}
        loading={busy}
        title={t('Remove friend')}
        onClick={async () => {
          if (await confirmDialog({ title: t('Remove this friend?'), confirmLabel: t('Remove'), tone: 'danger' })) {
            void run(() => api.friends.remove(playerId), 'none');
          }
        }}
      >
        {t('Friends')}
      </Button>
    );
  }
  if (relation === 'outgoing') {
    return (
      <Button size={size} variant="secondary" icon={<X size={16} />} loading={busy} title={t('Cancel request')} aria-label={t('Cancel request')} onClick={() => void run(() => api.friends.cancel(playerId), 'none')}>
        {iconOnly ? null : t('Cancel request')}
      </Button>
    );
  }
  if (relation === 'incoming') {
    return (
      <span className="btn-pair">
        <Button size={size} variant="primary" icon={<Check size={16} />} loading={busy} onClick={() => void run(() => api.friends.accept(playerId), 'friend', t('Friend added.'))}>
          {t('Accept')}
        </Button>
        <Button size={size} variant="ghost" icon={<UserMinus size={16} />} disabled={busy} onClick={() => void run(() => api.friends.decline(playerId), 'none')}>
          {t('Decline')}
        </Button>
      </span>
    );
  }
  return (
    <Button
      size={size}
      variant="primary"
      icon={<UserPlus size={16} />}
      loading={busy}
      title={t('Add friend')}
      aria-label={t('Add friend')}
      onClick={() => void run(() => api.friends.request(playerId), 'outgoing', t('Friend request sent.'))}
    >
      {iconOnly ? null : t('Add friend')}
    </Button>
  );
}

/** Create an online game, send the invite as a chat message, and open the waiting room. */
export function useChallenge() {
  const profile = useProfile();
  const navigate = useNavigate();
  return async (player: PublicProfile) => {
    try {
      if (!online) throw new Error(t('Online play is not configured in this build.'));
      await online.signIn();
      const row = await online.create(profile.username ?? 'Player', 'random');
      const conversation = await api.messages.open(player.id);
      await api.messages.send(conversation.id, t("Let's play! ♟️"), { gameId: row.id });
      toast(t('Challenge sent to {name}.', { name: player.username }), { tone: 'success' });
      navigate(`/game/online/${row.id}`);
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' });
    }
  };
}

export function MessageButton({ player, compact }: { player: PublicProfile; compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <Button
      size={compact ? 'sm' : 'md'}
      variant="secondary"
      icon={<MessageCircle size={16} />}
      onClick={async () => navigate(`/messages/${(await api.messages.open(player.id)).id}`)}
    >
      {compact ? null : t('Message')}
    </Button>
  );
}

export function ChallengeButton({ player, compact }: { player: PublicProfile; compact?: boolean }) {
  const challenge = useChallenge();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={compact ? 'sm' : 'md'}
      variant="secondary"
      icon={<Swords size={16} />}
      loading={busy}
      disabled={!online}
      title={online ? t('Challenge to a game') : t('Online play is not configured.')}
      onClick={async () => {
        setBusy(true);
        await challenge(player);
        setBusy(false);
      }}
    >
      {compact ? null : t('Challenge')}
    </Button>
  );
}

/** Messages and challenges go between friends only: show `children` once you are friends. */
export function FriendsOnly({ playerId, children }: { playerId: string; children: ReactNode }) {
  const { version } = useBadges();
  const [friend, setFriend] = useState(false);
  useEffect(() => {
    void api.friends.relation(playerId).then((r) => setFriend(r === 'friend'));
  }, [playerId, version]);
  return friend ? <>{children}</> : null;
}

export function OnlineBadge({ online: on }: { online: boolean }) {
  return on ? <Badge tone="success">{t('Online')}</Badge> : <Badge>{t('Offline')}</Badge>;
}
