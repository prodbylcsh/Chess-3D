import { useSyncExternalStore } from 'react';

// Per-device preferences (not synced to the account).
export interface Prefs {
  sound: boolean;
  /** same-device games: turn the camera to the side to move */
  autoRotate: boolean;
  language: string;
}

const KEY = 'wizard-chess.prefs';
const DEFAULTS: Prefs = { sound: true, autoRotate: false, language: 'en' };

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode */
  }
  for (const fn of listeners) fn();
}

/** Calls `fn` after every change; returns the unsubscribe function. */
export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, () => current);
}

/** Languages the interface is available in; more are added as translations arrive. */
export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'cs', name: 'Čeština' },
];
