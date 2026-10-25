import { Online } from './online';
import { supabase } from './supabase';

/** The shared online-game client, or null when this build has no Supabase settings. */
export const online = supabase ? new Online(supabase) : null;

export function inviteUrl(gameId: string): string {
  return `${location.origin}${location.pathname}#/join/${gameId}`;
}

/** The link spectators open (docs/PLATFORM.md §4.1 "Spectating"). */
export function watchUrl(gameId: string): string {
  return `${location.origin}${location.pathname}#/watch/${gameId}`;
}
