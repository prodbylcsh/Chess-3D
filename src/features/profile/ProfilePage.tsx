import { rankText, t, tk, tn } from '../../i18n';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Crown, Flame, Gem, Pencil, Settings, Swords, Target, Trophy, Zap, type LucideIcon } from 'lucide-react';
import { TIERS } from '#shared/rating.ts';
import { api, type GameRecord, type PublicProfile } from '../../api';
import { awardsFor, type AwardIcon } from '../../api/awards';
import { CATEGORY_NAMES, LOADOUT_CATEGORIES, itemName, type ItemCategory } from '../../api/catalog';
import { Locker } from '../shop/Locker';
import { ItemPreview } from '../shop/previews';
import { Page } from '../../app/AppLayout';
import { useSession } from '../../app/session';
import { ProfileIcon, RankEmblem } from '../../ui/art/art';
import { Badge, Button, Card, Coins, EmptyState, ProgressBar, Segmented, Spinner, cx } from '../../ui/kit';
import { memberSince, timeAgo, winRate } from '../../ui/format';
import { ChallengeButton, FriendButton, FriendsOnly, MessageButton } from '../social/social';
import './profile.css';

const AWARD_ICON: Record<AwardIcon, LucideIcon> = { trophy: Trophy, flame: Flame, crown: Crown, target: Target, zap: Zap, swords: Swords, gem: Gem };
const KIND: Record<string, string> = { ranked: tk('Ranked'), casual: tk('Casual'), wager: tk('For coins'), friend: tk('Friend'), ai: tk('vs AI'), local: tk('Same device') };

/** /profile (yourself) and /u/:username (anyone). Everything shown is public, except MMR changes. */
export function ProfilePage() {
  const { username } = useParams();
  const { profile: me } = useSession();
  const [player, setPlayer] = useState<PublicProfile | null | undefined>(undefined);
  const [history, setHistory] = useState<GameRecord[] | null>(null);
  const own = !username || username.toLowerCase() === me?.username?.toLowerCase();

  useEffect(() => {
    setPlayer(undefined);
    setHistory(null);
    if (own) {
      void api.profiles.get(me!.id).then(setPlayer);
      void api.profiles.history().then(setHistory);
    } else {
      void api.profiles.get(username!).then((p) => {
        setPlayer(p);
        if (p) void api.profiles.publicHistory(p.id).then(setHistory);
      });
    }
    // reload when your own profile changes (icon, results)
  }, [own, username, me]);

  if (username && own) return <Navigate to="/profile" replace />;
  if (player === null) {
    return (
      <Page title={t('Player not found')}>
        <EmptyState title={t('No player called “{name}”', { name: username ?? '' })}>
          {t('Check the spelling, or')} <Link to="/community">{t('search in Community')}</Link>.
        </EmptyState>
      </Page>
    );
  }
  if (!player) {
    return (
      <div className="page profile-loading">
        <Spinner />
      </div>
    );
  }
  return <ProfileView player={player} history={history} own={own} />;
}

function ProfileView({ player, history, own }: { player: PublicProfile; history: GameRecord[] | null; own: boolean }) {
  const { profile } = useSession();
  const [tab, setTab] = useState<'overview' | 'games'>('overview');
  const [locker, setLocker] = useState<ItemCategory | null>(null);
  const { wins, losses, draws, bestStreak, winStreak } = player.stats;
  const games = wins + losses + draws;
  const rate = winRate(wins, losses, draws);
  const tier = TIERS.find((x) => x.id === player.rank.tier)!;
  const awards = useMemo(() => awardsFor(player.stats, player.rank, history ?? []), [player, history]);
  const earned = awards.filter((a) => a.earned).length;

  return (
    <div className="page page-wide">
      <section className="profile-hero" style={{ '--tier': tier.color } as CSSProperties}>
        <div className="profile-hero-bg" />
        <div className="profile-avatar">
          <ProfileIcon icon={player.iconId} size={116} ring={tier.color} />
          {own && (
            <button type="button" className="profile-avatar-edit" onClick={() => setLocker('icon')} aria-label={t('Change profile icon')}>
              <Pencil size={15} />
            </button>
          )}
        </div>
        <div className="profile-id">
          <div className="profile-name">
            <h1>{player.username}</h1>
            {own ? <Badge tone="gold">{t('You')}</Badge> : player.online ? <Badge tone="success">{t('Online')}</Badge> : <Badge>{t('Offline')}</Badge>}
          </div>
          <p className="faint">{t('Member since {date}', { date: memberSince(player.createdAt) })}</p>
          <div className="profile-actions">
            {own ? (
              <>
                <Button size="sm" variant="secondary" icon={<Pencil size={15} />} onClick={() => setLocker('icon')}>
                  {t('Change icon')}
                </Button>
                <Link to="/settings" className="btn btn-sm btn-ghost">
                  <Settings size={15} /> <span>{t('Settings')}</span>
                </Link>
              </>
            ) : (
              <>
                <FriendButton playerId={player.id} compact />
                <FriendsOnly playerId={player.id}>
                  <MessageButton player={player} compact />
                  <ChallengeButton player={player} compact />
                </FriendsOnly>
              </>
            )}
          </div>
        </div>
        <div className="profile-rank">
          <RankEmblem tier={player.rank.tier} division={player.rank.division} size={92} />
          <div>
            <span className="faint">{t('Rank')}</span>
            <strong>{rankText(player.rank.label)}</strong>
            <ProgressBar value={player.rank.progress} />
          </div>
        </div>
      </section>

      <section className="stat-tiles">
        <Stat label={t('Games')} value={games} />
        <Stat label={t('Win rate')} value={rate === null ? '–' : `${rate}%`} />
        <Stat label={t('W · L · D')} value={`${wins} · ${losses} · ${draws}`} />
        <Stat label={t('Current streak')} value={winStreak} icon={winStreak >= 3 ? <Flame size={16} /> : undefined} />
        <Stat label={t('Best streak')} value={bestStreak} />
        {own && profile && <Stat label={t('Coins')} value={<Coins amount={profile.coins} size={18} />} />}
      </section>

      <div className="profile-tabs">
        <Segmented
          label={t('Profile sections')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: t('Overview') },
            { value: 'games', label: `${t('Games')}${history ? ` (${history.length})` : ''}` },
          ]}
        />
      </div>

      {tab === 'overview' ? (
        <div className="profile-grid">
          <Card className="profile-card">
            <header>
              <h2>{t('Awards')}</h2>
              <span className="faint">
                {t('{n} of {total}', { n: earned, total: awards.length })}
              </span>
            </header>
            <div className="awards">
              {awards.map((a) => {
                const Icon = AWARD_ICON[a.icon];
                return (
                  <div key={a.id} className={cx('award', a.earned && 'is-earned')} title={a.description}>
                    <span className="award-icon">
                      <Icon size={20} />
                    </span>
                    <strong>{a.name}</strong>
                    <span className="faint">{a.description}</span>
                    {!a.earned && a.progress && (
                      <span className="award-progress">
                        <ProgressBar value={a.progress[0] / a.progress[1]} tone="violet" />
                        <span>
                          {a.progress[0]}/{a.progress[1]}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="profile-card">
            <header>
              <h2>{t('In use')}</h2>
              {own && (
                <button type="button" className="link-btn" onClick={() => setLocker('pieces')}>
                  {t('Change')}
                </button>
              )}
            </header>
            <ul className="loadout">
              {LOADOUT_CATEGORIES.map((cat) => {
                const id = player.loadout[cat];
                const body = (
                  <>
                    <span className="loadout-art">
                      <ItemPreview id={id} />
                    </span>
                    <span className="loadout-text">
                      <span className="faint">{t(CATEGORY_NAMES[cat])}</span>
                      <strong>{itemName(id)}</strong>
                    </span>
                  </>
                );
                return (
                  <li key={cat}>
                    {own ? (
                      <button type="button" className="loadout-item" onClick={() => setLocker(cat)}>
                        {body}
                        <Pencil size={14} className="loadout-edit" />
                      </button>
                    ) : (
                      <div className="loadout-item">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      ) : (
        <GameList history={history} own={own} />
      )}

      {own && <Locker key={locker ?? 'closed'} open={!!locker} initial={locker ?? 'pieces'} onClose={() => setLocker(null)} />}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="stat">
      <span className="faint">{label}</span>
      <strong>
        {icon}
        {value}
      </strong>
    </div>
  );
}

function GameList({ history, own }: { history: GameRecord[] | null; own: boolean }) {
  if (!history) {
    return (
      <div className="profile-loading">
        <Spinner />
      </div>
    );
  }
  if (!history.length) {
    return (
      <EmptyState icon={<Swords size={28} />} title={t('No games yet')}>
        {own ? t('Ranked, casual and coin games show up here.') : t('This player has not played any rated games yet.')}
      </EmptyState>
    );
  }
  return (
    <Card className="games">
      {history.map((g) => (
        <div key={g.id} className="game-row">
          <span className={cx('result-pill', `is-${g.outcome}`)}>{g.outcome === 'win' ? t('W') : g.outcome === 'loss' ? t('L') : t('D')}</span>
          <ProfileIcon icon={g.opponent.iconId} size={36} />
          <span className="game-opp">
            <strong>{g.opponent.username}</strong>
            <span className="faint">{rankText(g.opponent.rankLabel)}</span>
          </span>
          <span className="game-meta">
            <span>{KIND[g.kind] ? t(KIND[g.kind]) : g.kind}</span>
            <span className="faint">
              {t(g.reason)} · {tn(Math.ceil(g.moves / 2), '{n} move', '{n} moves')}
            </span>
          </span>
          <span className="game-acc">{g.accuracy != null ? `${Math.round(g.accuracy)}%` : '–'}</span>
          {own && (
            <span className="game-delta">
              {g.mmrDelta != null && <span className={g.mmrDelta >= 0 ? 'up' : 'down'}>{t('{n} MMR', { n: g.mmrDelta >= 0 ? `+${g.mmrDelta}` : g.mmrDelta })}</span>}
              {g.coinsDelta !== 0 && <Coins amount={g.coinsDelta} signed size={14} />}
            </span>
          )}
          <span className="game-when faint">{timeAgo(g.playedAt)}</span>
        </div>
      ))}
    </Card>
  );
}
