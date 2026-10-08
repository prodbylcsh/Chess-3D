import { createMockApi } from './mock';
import { createSupabaseApi } from './supabase';
import type { Api } from './types';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '../net/supabase';

export * from './types';

/**
 * The platform's data layer. Screens only see the `Api` contracts. Accounts run on
 * Supabase whenever the build has Supabase settings (milestone 4); everything else
 * still runs on the in-browser demo back-end until its milestone.
 *
 * `VITE_ACCOUNTS=mock` keeps accounts in the browser too (UI work without a running
 * Supabase; see `npm run dev:mock`).
 */
export const api: Api =
  supabase && import.meta.env.VITE_ACCOUNTS !== 'mock' ? createSupabaseApi(supabase, SUPABASE_URL!, SUPABASE_KEY!) : createMockApi();
