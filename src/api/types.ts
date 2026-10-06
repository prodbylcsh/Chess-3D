// Domain types and service contracts for the platform. The UI depends only on
// these; `mock/` implements them in the browser today, a Supabase
// implementation will replace it module by module (see docs/PLATFORM.md §8).
import type { Color as Side } from 'chess.js';
import type { MmrChange, Outcome, TierId } from '#shared/rating.ts';
import type { CoinReward, GameKind, StakeId } from '#shared/economy.ts';

export type { Side, Outcome, GameKind, StakeId, TierId };

// ------------------------------------------------------------------ accounts and profiles

export type AuthProviderId = 'email' | 'apple' | 'google';

export interface Account {
  id: string;
  email: string;
  provider: AuthProviderId;
}

export interface Stats {
  wins: number;
  losses: number;
  draws: number;
  /** consecutive wins in coin-paying games (casual + ranked) */
  winStreak: number;
  /** consecutive ranked wins (drives the MMR streak bonus) */
  rankedStreak: number;
  bestStreak: number;
}

export interface Loadout {
  pieces: string;
  board: string;
  background: string;
  moveAnimation: string;
  destruction: string;
}

/** The signed-in player's own profile. */
export interface Profile {
  id: string;
  username: string | null;
  iconId: string | null;
  /** onboarding wizard: last completed step, and whether it is finished */
  onboardingStep: number;
  onboarded: boolean;
  coins: number;
  /** never displayed; the client only needs it to preview MMR changes and pick the rank emblem */
  mmr: number;
  stats: Stats;
  loadout: Loadout;
  createdAt: string;
}

export interface RankInfo {
  tier: TierId;
  division: number | null;
  label: string;
  /** progress through the division, 0..1 */
  progress: number;
}

/** What anyone can see about a player. */
export interface PublicProfile {
  id: string;
  username: string;
  iconId: string;
  rank: RankInfo;
  stats: Stats;
  loadout: Loadout;
  createdAt: string;
  online: boolean;
}

export interface FriendEntry {
  profile: PublicProfile;
  since: string;
}

// ------------------------------------------------------------------ games

export type MatchKind = Extract<GameKind, 'ranked' | 'casual' | 'wager'>;

export interface MatchFound {
  matchId: string;
  kind: MatchKind;
  stake: StakeId | null;
  /** your colour */
  color: Side;
  opponent: PublicProfile;
  /** opponent MMR, used by the client only to preview the result (never displayed) */
  opponentMmr: number;
  /** true while matchmaking runs on mock data: the opponent is the AI engine */
  demo: boolean;
}

export interface MatchReport {
  outcome: Outcome;
  /** e.g. "checkmate", "resignation", "stalemate" */
  reason: string;
  /** the player's accuracy (client estimate today, server analysis later) */
  accuracy: number | null;
  moves: number;
}

export interface MatchResult {
  outcome: Outcome;
  mmr: MmrChange | null;
  coins: CoinReward | null;
  /** net coins for a wager game */
  wager: number | null;
  rankBefore: RankInfo;
  rankAfter: RankInfo;
  profile: Profile;
}

export interface GameRecord {
  id: string;
  kind: GameKind;
  playedAt: string;
  color: Side;
  opponent: { username: string; iconId: string; rankLabel: string | null };
  outcome: Outcome;
  reason: string;
  moves: number;
  accuracy: number | null;
  /** only ever shown to the owner */
  mmrDelta: number | null;
  coinsDelta: number;
}

// ------------------------------------------------------------------ service contracts

export interface AuthService {
  current(): Promise<Account | null>;
  signUp(email: string, password: string): Promise<Account>;
  signIn(email: string, password: string): Promise<Account>;
  signInWith(provider: Exclude<AuthProviderId, 'email'>): Promise<Account>;
  requestPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}

export type UsernameCheck = 'available' | 'taken' | 'invalid';

export interface ProfileService {
  me(): Promise<Profile>;
  checkUsername(username: string): Promise<UsernameCheck>;
  update(patch: Partial<Pick<Profile, 'username' | 'iconId' | 'onboardingStep' | 'onboarded'>>): Promise<Profile>;
  history(): Promise<GameRecord[]>;
}

export interface FriendsService {
  list(): Promise<FriendEntry[]>;
}

export interface MatchmakingTicket {
  /** resolves when an opponent is found; rejects if cancelled */
  found: Promise<MatchFound>;
  cancel(): void;
}

export interface MatchmakingService {
  find(kind: MatchKind, stake?: StakeId): MatchmakingTicket;
  /** players currently searching, for the queue screen */
  queueSize(kind: MatchKind): Promise<number>;
  report(matchId: string, report: MatchReport): Promise<MatchResult>;
}

export interface Api {
  auth: AuthService;
  profiles: ProfileService;
  friends: FriendsService;
  matchmaking: MatchmakingService;
  /** true while the data comes from the in-browser mock */
  mock: boolean;
}

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
