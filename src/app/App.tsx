import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthPage } from '../features/auth/AuthPage';
import { Onboarding } from '../features/onboarding/Onboarding';
import { PlayHub } from '../features/play/PlayHub';
import { ComingNext } from '../features/placeholders/ComingNext';
import { LogoMark } from '../ui/art/art';
import { ConfirmHost, Spinner, ToastProvider } from '../ui/kit';
import { AppLayout } from './AppLayout';
import { SessionProvider, useSession } from './session';

// the 3D game (three.js) is loaded only when a game starts
const GamePage = lazy(() => import('../features/game/GamePage'));
const JoinPage = lazy(() => import('../features/game/JoinPage'));

export function Splash({ label }: { label?: string }) {
  return (
    <div className="splash">
      <LogoMark size={56} />
      <Spinner size={22} />
      {label && <span className="faint">{label}</span>}
    </div>
  );
}

/** Signed-out players go to /auth, unfinished profiles to /onboarding. */
function Guard({ children, onboarding }: { children: ReactNode; onboarding?: boolean }) {
  const { status, profile } = useSession();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (!profile?.onboarded && !onboarding) return <Navigate to="/onboarding" replace />;
  if (profile?.onboarded && onboarding) return <Navigate to="/play" replace />;
  return <>{children}</>;
}

function SignedOutOnly({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'ready') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/auth' ? from : '/play'} replace />;
  }
  return <>{children}</>;
}

function Routed() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/auth" element={<SignedOutOnly><AuthPage /></SignedOutOnly>} />
        <Route path="/onboarding" element={<Guard onboarding><Onboarding /></Guard>} />
        {/* invite links work for guests too */}
        <Route path="/join/:gameId" element={<JoinPage />} />
        <Route path="/game/:mode/:id?" element={<GamePage />} />
        <Route element={<Guard><AppLayout /></Guard>}>
          <Route path="/play" element={<PlayHub />} />
          <Route path="/community" element={<ComingNext module="community" />} />
          <Route path="/shop" element={<ComingNext module="shop" />} />
          <Route path="/profile" element={<ComingNext module="profile" />} />
          <Route path="/messages" element={<ComingNext module="messages" />} />
          <Route path="/settings" element={<ComingNext module="settings" />} />
        </Route>
        <Route path="*" element={<Navigate to="/play" replace />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <HashRouter>
          <Routed />
        </HashRouter>
        <ConfirmHost />
      </ToastProvider>
    </SessionProvider>
  );
}
