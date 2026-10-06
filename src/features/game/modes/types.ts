import type { LucideIcon } from 'lucide-react';
import type { Profile } from '../../../api';
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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
