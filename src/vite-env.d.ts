/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "mock": keep accounts in the browser even when Supabase is configured */
  readonly VITE_ACCOUNTS?: string;
  /** where shop models and pictures are served from (the R2 bucket's public URL) */
  readonly VITE_ASSETS_URL?: string;
  /** Paddle's client-side token (public) for buying coins; without it the shop has no coin packs */
  readonly VITE_PADDLE_CLIENT_TOKEN?: string;
  /** 'sandbox' (test payments, the default) or 'production' */
  readonly VITE_PADDLE_ENV?: string;
}
