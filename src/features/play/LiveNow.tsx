import { rankText, t, tk } from '../../i18n';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, Radio } from 'lucide-react';
import { CONTROLS, controlLabel } from '#shared/play.ts';
import { LIVE_NOW_OPEN } from '#shared/spectate.ts';
import { api, type LiveGame } from '../../api';
import { ProfileIcon, RankEmblem } from '../../ui/art/art';
import { Badge, Button, Spinner } from '../../ui/kit';

/** How often the list is read again while the hub is open. */
const LIVE_POLL_MS = 30_000;

/**
 * "Live now": running games to watch, friends' first (docs/PLATFORM.md §4.1 "Spectating").
 * Built, but closed until there are enough games to fill it (`LIVE_NOW_OPEN`).
 */
export function LiveNow() {
  return (
    <section className="live-now">
      <header className="live-now-head">
        <h2>
          <Radio size={18} /> {t('Live now')}
        </h2>
        {!LIVE_NOW_OPEN && <Badge>{t('Soon')}</Badge>}
      </header>
      {LIVE_NOW_OPEN ? (
        <LiveList />
      ) : (
        <p className="muted live-now-soon">
          {t('Watch the best games being played right now, on the same 3D board. Until then, watch your friends: their games show “Playing now” in Community.')}
        </p>
      )}
    </section>
  );
}

function LiveList() {
  const [games, setGames] = useState<LiveGame[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () =>
      void api.spectate.live().then(
        (g) => live && (setGames(g), setFailed(false)),
        () => live && setFailed(true),
      );
    load();
    const timer = setInterval(load, LIVE_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  if (failed && !games) return <p className="faint live-now-soon">{t('Could not load the running games.')}</p>;
  if (!games) {
    return (
      <div className="live-now-loading">
        <Spinner size={18} />
      </div>
    );
  }
  if (!games.length) return <p className="faint live-now-soon">{t('No games are running right now. Check back soon.')}</p>;
  return (
    <div className="live-games">
      {games.map((g) => (
        <LiveCard key={g.id} game={g} />
      ))}
    </div>
  );
}

const KIND_LABEL: Record<LiveGame['kind'], string> = { ranked: tk('Ranked'), casual: tk('Casual'), wager: tk('For coins') };

function LiveCard({ game }: { game: LiveGame }) {
  const navigate = useNavigate();
  const side = (p: LiveGame['white'], name: string) => (
    <span className="live-player">
      <ProfileIcon icon={p?.iconId ?? 'guest'} size={34} />
      <span className="live-player-text">
        <strong>{p?.username ?? name}</strong>
        {p && (
          <span className="faint">
            <RankEmblem tier={p.rank.tier} division={p.rank.division} size={13} /> {rankText(p.rank.label)}
          </span>
        )}
      </span>
    </span>
  );
  return (
    <div className="live-card">
      <div className="live-card-meta">
        <span className="faint">
          {t(KIND_LABEL[game.kind])}
          {game.control && ` · ${t(CONTROLS[game.control].name)} ${controlLabel(game.control)}`}
        </span>
        {game.friend && <Badge tone="violet">{t('Friend')}</Badge>}
      </div>
      <div className="live-card-players">
        {side(game.white, game.whiteName)}
        <span className="live-vs faint">{t('vs')}</span>
        {side(game.black, game.blackName)}
      </div>
      <Button size="sm" variant="secondary" icon={<Eye size={15} />} onClick={() => navigate(`/watch/${game.id}`)}>
        {t('Watch')}
      </Button>
    </div>
  );
}
