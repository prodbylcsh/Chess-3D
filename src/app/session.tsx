import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Account, type Profile } from '../api';

type Status = 'loading' | 'signedOut' | 'ready';

interface SessionValue {
  status: Status;
  account: Account | null;
  profile: Profile | null;
  /** after signing in: load the profile */
  signedIn(account: Account): Promise<void>;
  setProfile(profile: Profile): void;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const signedIn = useCallback(async (a: Account) => {
    setAccount(a);
    setProfile(await api.profiles.me());
    setStatus('ready');
  }, []);

  useEffect(() => {
    void api.auth
      .current()
      .then((a) => (a ? signedIn(a) : setStatus('signedOut')))
      .catch(() => setStatus('signedOut'));
    // signed out elsewhere (another tab, an expired session, a deleted account)
    return api.auth.onChange((event) => {
      if (event.type !== 'signedOut') return;
      setAccount(null);
      setProfile(null);
      setStatus('signedOut');
    });
  }, [signedIn]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      account,
      profile,
      signedIn,
      setProfile,
      async refresh() {
        setProfile(await api.profiles.me());
      },
      async signOut() {
        await api.auth.signOut();
        setAccount(null);
        setProfile(null);
        setStatus('signedOut');
      },
    }),
    [status, account, profile, signedIn],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}

/** The signed-in, onboarded player's profile (for screens behind the guard). */
export function useProfile(): Profile {
  const { profile } = useSession();
  if (!profile) throw new Error('useProfile without a profile');
  return profile;
}
