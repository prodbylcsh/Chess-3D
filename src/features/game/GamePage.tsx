import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { Color as Side } from 'chess.js';
import { useSession } from '../../app/session';
import { ProgressBar } from '../../ui/kit';
import { LogoMark } from '../../ui/art/art';
import { attach, detach, loadEngine, type Engine } from './engine';
import { getMatch } from './matches';
import { GameHud } from './GameHud';
import { AiMode } from './modes/ai';
import { LocalMode } from './modes/local';
import { MatchMode } from './modes/match';
import { OnlineMode } from './modes/online';
import type { Mode, ModeContext } from './modes/types';
import './game.css';

/** Full-screen game: the 3D board with the game interface around it. */
export default function GamePage() {
  const { mode: modeId = 'local', id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // engine: created on the first game, re-attached on later visits
  useEffect(() => {
    let current: Engine | null = null;
    let live = true;
    loadEngine(container.current!, setProgress).then(
      (e) => {
        if (!live) return;
        current = e;
        attach(e, container.current!);
        setEngine(e);
      },
      (err) => live && setError(`Could not load the chess set: ${(err as Error).message}`),
    );
    return () => {
      live = false;
      if (current) detach(current);
    };
  }, []);

  // the latest session for modes, without restarting them when the profile changes
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const level = Number(params.get('level') ?? 3);
  const color = params.get('color');
  const mode = useMemo<Mode | null>(() => {
    if (!engine) return null;
    const ctx: ModeContext = {
      engine,
      navigate: (to) => navigate(to),
      get profile() {
        return sessionRef.current.profile;
      },
      refreshProfile: () => sessionRef.current.refresh(),
    };
    switch (modeId) {
      case 'ai': {
        const side: Side = color === 'w' || color === 'b' ? color : Math.random() < 0.5 ? 'w' : 'b';
        return new AiMode(ctx, side, level);
      }
      case 'match': {
        const match = id ? getMatch(id) : null;
        return match ? new MatchMode(ctx, match) : null;
      }
      case 'online':
        return id ? new OnlineMode(ctx, id) : null;
      default:
        return new LocalMode(ctx);
    }
  }, [engine, modeId, id, level, color, navigate]);

  useEffect(() => {
    if (!mode) return;
    mode.start();
    return () => mode.dispose();
  }, [mode]);

  // a match that no longer exists (e.g. after a reload on the demo back-end)
  useEffect(() => {
    if (engine && !mode) navigate('/play', { replace: true });
  }, [engine, mode, navigate]);

  return (
    <div className="game-screen">
      <div ref={container} className="game-canvas" />
      <div className="game-vignette" />
      {engine && mode ? (
        <GameHud engine={engine} mode={mode} />
      ) : (
        <div className="game-loader">
          <LogoMark size={52} />
          <div className="game-loader-title display">Wizard Chess</div>
          <ProgressBar value={progress} className="game-loader-bar" />
          <div className="faint">{error ?? 'Summoning the pieces…'}</div>
        </div>
      )}
    </div>
  );
}
