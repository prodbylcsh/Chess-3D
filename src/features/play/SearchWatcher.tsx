import { t } from '../../i18n';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { Search as SearchIcon, X } from 'lucide-react';
import { CONTROLS } from '#shared/play.ts';
import { IconButton, cx, useToast } from '../../ui/kit';
import { rememberMatch } from '../game/matches';
import { cancelSearch, clearSearch, useSearch } from './search';

const TITLES = { ranked: 'Ranked', casual: 'Casual', wager: 'Play for coins' } as const;

/**
 * While a search runs in the background (the player is playing the AI meanwhile), show
 * a small pill with the time searched, and go to the match as soon as it is found.
 * On the game screen the HUD shows the pill under the turn indicator instead.
 */
export function SearchWatcher() {
  const search = useSearch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();

  useEffect(() => {
    if (!search?.background) return;
    if (search.match) {
      rememberMatch(search.match);
      clearSearch();
      toast(t('Opponent found! Your game is starting.'), { tone: 'success' });
      navigate(`/game/match/${search.match.matchId}`);
    } else if (search.error) {
      clearSearch();
      toast(t('Matchmaking failed. Please try again.'), { tone: 'danger' });
    }
  }, [search, navigate, toast]);

  if (pathname.startsWith('/game/')) return null;
  return createPortal(<SearchPill floating />, document.body);
}

/** The running background search: mode, time control, time searched, and a stop button. */
export function SearchPill({ floating = false }: { floating?: boolean }) {
  const search = useSearch();
  const [, tick] = useState(0);
  const shown = !!search?.background && !search.match;

  useEffect(() => {
    if (!shown) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [shown]);

  if (!shown) return null;
  const seconds = Math.floor((Date.now() - search.startedAt) / 1000);
  return (
    <div className={cx('search-pill', floating && 'is-floating')} role="status">
      <SearchIcon size={15} />
      <span>
        {t('Searching: {mode}', { mode: t(TITLES[search.kind]) })} · {t(CONTROLS[search.control].name)} ·{' '}
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </span>
      <IconButton label={t('Stop searching')} onClick={() => cancelSearch()}>
        <X size={15} />
      </IconButton>
    </div>
  );
}
