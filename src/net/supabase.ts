// The app's single Supabase client (accounts and online games share one session),
// or null when this build has no Supabase settings.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** What an auth email link or an OAuth provider sent the player back with. */
export interface AuthReturn {
  /** a PKCE code to exchange for a session (done by the accounts service, see `landing()`) */
  code: string | null;
  /** our own marker on password-reset links */
  recovery: boolean;
  /** the provider's or Supabase's error, e.g. an expired link */
  error: { code: string; description: string } | null;
}

/**
 * Read the return parameters before the client consumes them. Supabase adds them
 * to the query string (PKCE) or, for some errors, to the hash, which would
 * otherwise be mistaken for a route.
 */
function readReturn(): AuthReturn {
  const query = new URLSearchParams(location.search);
  const hash = location.hash.startsWith('#') && !location.hash.startsWith('#/') ? new URLSearchParams(location.hash.slice(1)) : null;
  const get = (key: string) => query.get(key) ?? hash?.get(key) ?? null;
  const error = get('error') ? { code: get('error_code') ?? get('error') ?? 'error', description: get('error_description') ?? '' } : null;
  return { code: query.get('code'), recovery: query.get('flow') === 'recovery', error };
}

export const authReturn: AuthReturn = readReturn();

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        // PKCE puts the return code in the query string, which works with the hash router.
        // The code is exchanged by the accounts service, which then knows whether it worked.
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;

/** Remove auth return parameters from the address bar, keeping the current route. */
export function cleanAuthReturn(): void {
  const route = location.hash.startsWith('#/') ? location.hash : '#/';
  history.replaceState(history.state, '', `${location.pathname}${route}`);
}

/** Where auth emails and OAuth providers send players back to: this app's address. */
export function appUrl(params?: Record<string, string>): string {
  const url = new URL('./', `${location.origin}${location.pathname}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  return url.href;
}
