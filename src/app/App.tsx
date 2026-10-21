import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { api } from '../api';
import { t } from '../i18n';
import { AuthPage, ResetPasswordPage } from '../features/auth/AuthPage';
import { Onboarding } from '../features/onboarding/Onboarding';
import { PlayHub } from '../features/play/PlayHub';
import { ShopPage } from '../features/shop/ShopPage';
import { CommunityPage } from '../features/community/CommunityPage';
import { ModulePage } from '../features/puzzles/ModulePage';
import { PuzzlesPage } from '../features/puzzles/PuzzlesPage';
import { ChapterPage, LearnPage } from '../features/learn/LearnPage';
import { MessagesPage } from '../features/messages/MessagesPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { LogoMark } from '../ui/art/art';
import { ConfirmHost, Spinner, ToastProvider, formatNumber, useToast } from '../ui/kit';
import { AppLayout } from './AppLayout';
import { NotificationsProvider } from './notifications';
import { usePrefs } from './prefs';
import { SessionProvider, useSession } from './session';
import { SearchWatcher } from '../features/play/SearchWatcher';
import { puzzlesChanged } from '../features/puzzles/guest';

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

/** Puzzles: signed-out visitors play as guests; unfinished profiles go to /onboarding. */
function GuestOrPlayer({ children }: { children: ReactNode }) {
  const { status, profile } = useSession();
  if (status === 'loading') return <Splash />;
  if (status === 'ready' && !profile?.onboarded) return <Navigate to="/onboarding" replace />;
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
        {/* reached from a password-reset email: the link itself signs the player in */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/onboarding" element={<Guard onboarding><Onboarding /></Guard>} />
        {/* invite links work for guests too */}
        <Route path="/join/:gameId" element={<JoinPage />} />
        <Route path="/game/:mode/:id?" element={<GamePage />} />
        {/* puzzles and lessons work for guests too (the free parts) */}
        <Route element={<GuestOrPlayer><AppLayout /></GuestOrPlayer>}>
          <Route path="/puzzles" element={<PuzzlesPage />} />
          <Route path="/puzzles/:module" element={<ModulePage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/learn/:chapter" element={<ChapterPage />} />
        </Route>
        <Route element={<Guard><AppLayout /></Guard>}>
          <Route path="/play" element={<PlayHub />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/messages/:conversationId?" element={<MessagesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/play" replace />} />
      </Routes>
    </Suspense>
  );
}

let landingHandled = false;

/** Handles the way back from an auth email link or Apple/Google (once per page load). */
function AuthReturn() {
  const navigate = useNavigate();
  const toast = useToast();
  useEffect(() => {
    if (landingHandled) return;
    landingHandled = true;
    void api.auth.landing().then((landing) => {
      if (!landing) return;
      if (landing.kind === 'recovery') navigate('/reset-password', { replace: true });
      else if (landing.kind === 'confirmed') toast(t('Your email is confirmed. Sign in to continue.'), { tone: 'success', duration: 8 });
      else toast(landing.message, { tone: 'danger', duration: 8 });
    });
  }, [navigate, toast]);
  return null;
}

/** Once signed in and set up: this device's guest puzzles and lessons move into the account. */
function GuestClaim() {
  const { status, profile, refresh } = useSession();
  const toast = useToast();
  const done = useRef<string | null>(null);
  const ready = status === 'ready' && !!profile?.onboarded;
  useEffect(() => {
    if (!ready || done.current === profile!.id) return;
    done.current = profile!.id;
    void api.puzzles.claimGuest().then(
      (claimed) => {
        if (!claimed || (!claimed.puzzles && !claimed.days && !claimed.lessons)) return;
        void refresh();
        puzzlesChanged();
        toast(t('Your puzzles and lessons from before you signed in are now in your account: {coins} coins.', { coins: formatNumber(claimed.coins) }), { tone: 'success', duration: 8 });
      },
      () => (done.current = null), // tried again later
    );
  }, [ready, profile, refresh, toast]);
  return null;
}

/** Re-mounts the screens when the language changes, so every text is redrawn. */
function LanguageRoot() {
  const { language } = usePrefs();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <Routed key={language} />;
}

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <HashRouter>
          <AuthReturn />
          <GuestClaim />
          <SearchWatcher />
          <NotificationsProvider>
            <LanguageRoot />
          </NotificationsProvider>
        </HashRouter>
        <ConfirmHost />
      </ToastProvider>
    </SessionProvider>
  );
}
