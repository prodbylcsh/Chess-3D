import type { LucideIcon } from 'lucide-react';
import type { Color as Side } from 'chess.js';
import type { Loadout, Profile } from '../../../api';
import { looksFor } from '../../../cosmetics/looks';
import type { Engine } from '../engine';
import type { GameState, PlayerView } from '../store';
import { rankOf } from '#shared/rating.ts';

export interface ModeAction {
  id: string;
  label: string;
  icon: LucideIcon;
  tone?: 'danger';
  disabled?: boolean;
  pressed?: boolean;
}

export interface EndAction {
  id: string;
  label: string;
  primary?: boolean;
}

/** One way of playing (same device, vs AI, matchmade, online link). */
export interface Mode {
  /** chip in the top bar */
  readonly label: string;
  start(): void;
  dispose(): void;
  actions(state: GameState): ModeAction[];
  endActions(state: GameState): EndAction[];
  /** an extra line on the result card (e.g. inviting guests to register) */
  endNote?(state: GameState): string | null;
  act(id: string): void;
}

export interface ModeContext {
  engine: Engine;
  navigate(to: string): void;
  profile: Profile | null;
  refreshProfile(): Promise<void>;
}

export function playerFromProfile(profile: Profile | null, fallbackName = 'You'): PlayerView {
  if (!profile?.username) return { name: fallbackName, iconId: profile?.iconId ?? 'guest', you: true };
  const r = rankOf(profile.mmr);
  return {
    name: profile.username,
    iconId: profile.iconId ?? 'guest',
    rank: { tier: r.tier.id, division: r.division, label: r.label, progress: r.progress },
    you: true,
  };
}

/**
 * Dress the next game: each side in its player's items, board and background
 * picked from one of them (`seed` makes the pick the same for both players).
 */
export function dressGame(engine: Engine, loadouts: Partial<Record<Side, Loadout | null>>, seed: string): void {
  engine.wardrobe.apply(looksFor(loadouts.w ?? null, loadouts.b ?? null, seed));
}

export const randomSeed = () => Math.random().toString(36).slice(2);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
