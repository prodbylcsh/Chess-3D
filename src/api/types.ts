// Domain types and service contracts for the platform. The UI depends only on
// these; `mock/` implements them in the browser today, a Supabase
// implementation will replace it module by module (see docs/PLATFORM.md §8).
import type { Color as Side } from 'chess.js';
import type { MmrChange, Outcome, TierId } from '#shared/rating.ts';
import type { CoinReward, GameKind, StakeId } from '#shared/economy.ts';
import type { ItemCategory, Rarity } from '#shared/shop.ts';
import type { SeasonReward } from '#shared/seasons.ts';

export type { Side, Outcome, GameKind, StakeId, TierId, ItemCategory, Rarity, SeasonReward };

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
  /** items bought or won; free items are owned by everyone and not listed */
  inventory: string[];
  createdAt: string;
  /** last time the username was changed after onboarding (changes are limited) */
  usernameChangedAt: string | null;
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

export interface FriendRequest {
  profile: PublicProfile;
  at: string;
}

/** How the signed-in player relates to another player. */
export type Relation = 'self' | 'friend' | 'incoming' | 'outgoing' | 'none';

// ------------------------------------------------------------------ messages

export interface Message {
  id: string;
  conversationId: string;
  /** sender's user id */
  from: string;
  body: string;
  at: string;
  /** an invitation to an online game (body is the note, gameId the game) */
  kind: 'text' | 'invite';
  gameId?: string;
}

export interface Conversation {
  id: string;
  with: PublicProfile;
  last: Message | null;
  unread: number;
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

// ------------------------------------------------------------------ shop and seasons

export interface ShopItem {
  id: string;
  category: ItemCategory;
  price: number;
  rarity: Rarity;
  /** false for season rewards */
  forSale: boolean;
  /** English text; the UI translates it */
  name: string;
  description: string;
  owned: boolean;
  equipped: boolean;
}

export interface SeasonInfo {
  number: number;
  start: string;
  end: string;
  /** highest rank reached this season: the rewards depend on it */
  peak: RankInfo;
  /** reward bracket of the peak rank */
  bracket: string;
  /** what each bracket receives when the season ends, lowest bracket first */
  rewards: SeasonReward[];
  /** share of the distance to 1,000 MMR removed when this season ends */
  resetShare: number;
}

// ------------------------------------------------------------------ service contracts

/** A new account is signed in at once, or first has to confirm its email address. */
export type SignUpResult = { account: Account } | { confirmEmail: string };

/** What brought the player to the app, when it was an auth email link or a provider. */
export type AuthLanding =
  | { kind: 'recovery' }
  /** the link worked (email confirmed) but this browser has no session: sign in */
  | { kind: 'confirmed' }
  | { kind: 'error'; message: string };

export type AuthEvent = { type: 'signedOut' } | { type: 'recovery' };

export interface AuthService {
  /** the signed-in registered player (guest sessions of invite games don't count) */
  current(): Promise<Account | null>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<Account>;
  /** sends the player to Apple or Google; resolves only in the demo */
  signInWith(provider: Exclude<AuthProviderId, 'email'>): Promise<Account>;
  /** which social sign-ins are set up on the server */
  providers(): Promise<Record<Exclude<AuthProviderId, 'email'>, boolean>>;
  resendConfirmation(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  /** set a new password after following a reset link (the link signs the player in) */
  updatePassword(password: string): Promise<void>;
  /** read once at start-up: did an email link or a provider send the player here? */
  landing(): Promise<AuthLanding | null>;
  /** session changes made elsewhere (expired, signed out in another tab, reset link) */
  onChange(fn: (event: AuthEvent) => void): () => void;
  signOut(): Promise<void>;
}

export type UsernameCheck = 'available' | 'taken' | 'invalid';

export interface ProfileService {
  me(): Promise<Profile>;
  checkUsername(username: string): Promise<UsernameCheck>;
  update(patch: Partial<Pick<Profile, 'username' | 'iconId' | 'onboardingStep' | 'onboarded'>>): Promise<Profile>;
  history(): Promise<GameRecord[]>;
  /** a player's public profile by username (case-insensitive) or id */
  get(usernameOrId: string): Promise<PublicProfile | null>;
  /** a player's recent games (no MMR changes: those are private) */
  publicHistory(userId: string): Promise<GameRecord[]>;
  search(query: string): Promise<PublicProfile[]>;
  /** players near your rank you may want to add */
  suggestions(): Promise<PublicProfile[]>;
}

export interface FriendsService {
  list(): Promise<FriendEntry[]>;
  requests(): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>;
  relation(userId: string): Promise<Relation>;
  request(userId: string): Promise<void>;
  accept(userId: string): Promise<void>;
  decline(userId: string): Promise<void>;
  cancel(userId: string): Promise<void>;
  remove(userId: string): Promise<void>;
}

export interface MessagesService {
  conversations(): Promise<Conversation[]>;
  /** the conversation with a player, created if needed */
  open(userId: string): Promise<Conversation>;
  messages(conversationId: string): Promise<Message[]>;
  send(conversationId: string, body: string, invite?: { gameId: string }): Promise<Message>;
  markRead(conversationId: string): Promise<void>;
}

export interface ShopService {
  /** every item with the signed-in player's ownership */
  items(): Promise<ShopItem[]>;
  buy(itemId: string): Promise<Profile>;
  /** use an owned item (profile icons included) */
  equip(itemId: string): Promise<Profile>;
}

export interface SeasonsService {
  current(): Promise<SeasonInfo>;
}

export interface AccountService {
  /** `confirm`: the change waits for the player to click the links sent by email */
  changeEmail(newEmail: string, password: string): Promise<{ account: Account; confirm: boolean }>;
  changePassword(current: string, next: string): Promise<void>;
  deleteAccount(username: string): Promise<void>;
}

/** Something changed on the server (pushed by realtime in production). */
export type ApiEvent =
  | { type: 'friends'; text?: string }
  | { type: 'messages'; conversationId: string; text?: string }
  | { type: 'profile' };

export interface EventsService {
  subscribe(fn: (event: ApiEvent) => void): () => void;
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
  messages: MessagesService;
  account: AccountService;
  events: EventsService;
  matchmaking: MatchmakingService;
  shop: ShopService;
  seasons: SeasonsService;
  /** which parts still run on the in-browser demo back-end */
  demo: { accounts: boolean; social: boolean };
}

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
