/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "mock": keep accounts in the browser even when Supabase is configured */
  readonly VITE_ACCOUNTS?: string;
}
