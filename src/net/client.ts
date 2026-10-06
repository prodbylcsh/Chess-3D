import { onlineFromEnv } from './online';

/** The shared online-game client, or null when this build has no Supabase settings. */
export const online = onlineFromEnv();

export function inviteUrl(gameId: string): string {
  return `${location.origin}${location.pathname}#/join/${gameId}`;
}
