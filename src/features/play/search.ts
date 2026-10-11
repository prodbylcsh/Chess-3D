// The running matchmaking search, kept outside any screen: a player may play the AI
// while the search goes on (decided in docs/PLATFORM.md §4.1), and the match must still
// be picked up when it is found.
import { useSyncExternalStore } from 'react';
import { api, ApiError, type ControlId, type MatchFound, type MatchKind, type StakeId } from '../../api';

export interface Search {
  /** the same for one search across its updates */
  id: number;
  kind: MatchKind;
  stake?: StakeId;
  control: ControlId;
  startedAt: number;
  match: MatchFound | null;
  error: ApiError | Error | null;
  /** the player left the search screen to play the AI meanwhile */
  background: boolean;
}

let current: Search | null = null;
let lastId = 0;
let cancelTicket: (() => void) | null = null;
const listeners = new Set<() => void>();

function set(next: Search | null): void {
  current = next;
  listeners.forEach((fn) => fn());
}

export function startSearch(kind: MatchKind, stake: StakeId | undefined, control: ControlId): void {
  if (current && !current.match && !current.error && current.kind === kind && current.stake === stake && current.control === control) return;
  cancelSearch();
  const ticket = api.matchmaking.find(kind, stake, control);
  cancelTicket = ticket.cancel;
  const id = ++lastId;
  set({ id, kind, stake, control, startedAt: Date.now(), match: null, error: null, background: false });
  ticket.found.then(
    (match) => current?.id === id && set({ ...current, match }),
    (error) => {
      if (current?.id !== id || (error instanceof ApiError && error.code === 'cancelled')) return;
      set({ ...current, error });
    },
  );
}

export function cancelSearch(): void {
  cancelTicket?.();
  cancelTicket = null;
  set(null);
}

/** Keep searching while the player does something else (plays the AI). */
export function searchInBackground(): void {
  if (current) set({ ...current, background: true });
}

/** The match was taken to the game screen, or the search ended: forget it. */
export function clearSearch(): void {
  cancelTicket = null;
  set(null);
}

export const currentSearch = () => current;

export function useSearch(): Search | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}
