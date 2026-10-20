// The guest's anonymous session on this device: puzzles (and invite games) without an
// account. Supabase drops it from the client when the person signs up or in, so its refresh
// token is kept here too: the app then hands it to the server once (`puzzles` 'claim'),
// which moves the guest's puzzles into the account.
// Node runs src/net/online.ts in the e2e tests, so this file reads no build settings itself.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const KEY = 'wizard-chess-guest';

interface StoredGuest {
  id: string;
  refreshToken: string;
}

function stored(): StoredGuest | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredGuest) : null;
  } catch {
    return null;
  }
}

export function forgetGuest(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

/** Keep the refresh token of this device's guest up to date (one guest per device). */
export function rememberGuest(client: SupabaseClient): void {
  client.auth.onAuthStateChange((_, session) => {
    const u = session?.user;
    if (!u?.is_anonymous) return;
    const prev = stored();
    if (prev && prev.id !== u.id) return; // another guest is still waiting to be claimed
    try {
      localStorage.setItem(KEY, JSON.stringify({ id: u.id, refreshToken: session!.refresh_token }));
    } catch {
      /* private mode: the guest's progress stays with the session only */
    }
  });
}

/** a guest sign-in under way: the page's first calls come together and must share one guest */
let signingIn: Promise<string> | null = null;

/** The client's session (a registered player's or a guest's): this device's guest again, or a new one. */
export async function guestSession(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  signingIn ??= (async () => {
    const prev = stored();
    if (prev) {
      const res = await client.auth.refreshSession({ refresh_token: prev.refreshToken });
      if (res.data.user) return res.data.user.id;
      forgetGuest(); // expired or deleted (guests are removed after 6 months without activity)
    }
    const res = await client.auth.signInAnonymously();
    if (res.error || !res.data.user) throw res.error ?? new Error('Could not sign in');
    return res.data.user.id;
  })().finally(() => (signingIn = null));
  return signingIn;
}

/** A fresh access token of this device's guest, for the server to check (null: no guest). */
export async function guestToken(url: string, key: string): Promise<string | null> {
  const prev = stored();
  if (!prev) return null;
  const temp = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const res = await temp.auth.refreshSession({ refresh_token: prev.refreshToken });
  if (!res.data.session?.user.is_anonymous) {
    forgetGuest();
    return null;
  }
  // the refresh token rotated: keep the new one in case the claim fails and is retried
  try {
    localStorage.setItem(KEY, JSON.stringify({ id: prev.id, refreshToken: res.data.session.refresh_token }));
  } catch {
    /* ignore */
  }
  return res.data.session.access_token;
}
