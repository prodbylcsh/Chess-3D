import { t } from '../../i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Swords, UserRound } from 'lucide-react';
import { useSession } from '../../app/session';
import { Wordmark } from '../../app/AppLayout';
import { online } from '../../net/client';
import type { GameRow } from '../../net/online';
import { ProfileIcon } from '../../ui/art/art';
import { Button, Field, Spinner } from '../../ui/kit';
import './join.css';

const GUEST_NAME_KEY = 'wizard-chess.guest-name';

/** Where invite links land: accept the invitation (as a player or a guest). */
export default function JoinPage() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const { status, profile } = useSession();
  const [row, setRow] = useState<GameRow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState(() => localStorage.getItem(GUEST_NAME_KEY) ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!online) return setProblem(t('Online play is not available in this build.'));
    let live = true;
    void (async () => {
      try {
        await online.signIn();
        const r = await online.fetch(gameId);
        if (!live) return;
        if (!r) return setProblem(t('This invite is no longer valid.'));
        // already playing in it, or it is full: go straight to the board
        if (online.sideOf(r) || r.status !== 'waiting') return navigate(`/game/online/${r.id}`, { replace: true });
        setRow(r);
      } catch (err) {
        if (live) setProblem((err as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [gameId, navigate]);

  const signedIn = status === 'ready' && !!profile?.username;

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!online || !row) return;
    const joinName = signedIn ? profile!.username! : name.trim() || t('Guest');
    if (!signedIn) localStorage.setItem(GUEST_NAME_KEY, joinName);
    setBusy(true);
    try {
      await online.join(row.id, joinName);
      navigate(`/game/online/${row.id}`, { replace: true });
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }

  const host = row ? (row.white_name ?? row.black_name ?? t('A friend')) : '';
  const youPlay = row ? (row.white_id ? t('Black') : t('White')) : '';

  return (
    <div className="join">
      <Wordmark />
      <div className="join-card">
        {problem ? (
          <>
            <h1>{t("Can't join this game")}</h1>
            <p className="muted">{problem}</p>
            <Button variant="primary" onClick={() => navigate('/play')}>
              {t('Go to Wizard Chess')}
            </Button>
          </>
        ) : !row ? (
          <div className="join-loading">
            <Spinner /> {t('Opening the invitation…')}
          </div>
        ) : (
          <form onSubmit={join}>
            <div className="join-vs">
              <ProfileIcon icon="guest" size={64} />
              <Swords size={22} className="join-swords" />
              <ProfileIcon icon={signedIn ? profile!.iconId : 'guest'} size={64} />
            </div>
            <h1>
              <span className="gold">{host}</span> {t('invites you to a game')}
            </h1>
            <p className="muted">{t("You'll play {color}. The game starts as soon as you join.", { color: youPlay })}</p>
            {signedIn ? (
              <p className="join-as">
                {t('Joining as')} <strong>{profile!.username}</strong>
              </p>
            ) : (
              <Field label={t('Your name')} placeholder={t('Guest')} maxLength={24} leading={<UserRound size={18} />} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            )}
            <Button type="submit" variant="primary" size="lg" block loading={busy}>
              {t('Join game')}
            </Button>
            {!signedIn && (
              <p className="faint join-foot">
                {t('Have an account?')} <Link to="/auth" state={{ from: `/join/${gameId}` }}>{t('Sign in')}</Link> {t('to play under your username.')}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
