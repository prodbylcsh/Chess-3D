import type { MatchFound } from '../../api';

// Matches found by the Play hub, handed to the game screen. In-memory only: a
// reload drops it, which is fine for the mock back-end (the real one stores it).
const found = new Map<string, MatchFound>();

export function rememberMatch(match: MatchFound): void {
  found.set(match.matchId, match);
}

export function getMatch(matchId: string): MatchFound | null {
  return found.get(matchId) ?? null;
}
