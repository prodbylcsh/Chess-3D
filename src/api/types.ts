// Domain types and service contracts for the platform. The UI depends only on
// these; `mock/` implements them in the browser today, a Supabase
// implementation will replace it module by module (see docs/PLATFORM.md §8).
import type { Color as Side } from 'chess.js';
import type { MmrChange, Outcome, TierId } from '#shared/rating.ts';
import type { CoinReward, GameKind, StakeId } from '#shared/economy.ts';
import type { ItemCategory, Rarity } from '#shared/shop.ts';
import type { SeasonReward } from '#shared/seasons.ts';
import type { ControlId } from '#shared/play.ts';
import type { AnalysisReport, AnalysisStatus } from '#shared/analysis.ts';
import type { WatchPolicy } from '#shared/spectate.ts';
import type { Period, PlanId, PremiumState, PremiumView } from '#shared/subscription.ts';

export type { Side, Outcome, GameKind, StakeId, TierId, ItemCategory, Rarity, SeasonReward, ControlId, AnalysisReport, AnalysisStatus, WatchPolicy };
export type { Period, PlanId, PremiumState, PremiumView };

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
  /** who may watch this player's games (docs/PLATFORM.md §4.1 "Spectating"); missing means everyone */
  watch?: WatchPolicy;
  /** the Premium plan the player has now (docs/PLATFORM.md §4.9); missing or null without one */
  premium?: PremiumView | null;
  /** had a subscription before: no second free trial */
  trialUsed?: boolean;
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
  /** the Premium badge (plan and Founder), when the player has a plan */
  premium?: { plan: PlanId; founder: boolean } | null;
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
  /** time control of a server game */
  control?: ControlId;
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
  /** awards this game earned (real accounts) */
  awards?: string[];
}

export interface EarnedAward {
  id: string;
  earnedAt: string;
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
  /** not owned, but usable with the Archmage's Wardrobe (until the plan ends) */
  wardrobe?: boolean;
}

export interface SeasonInfo {
  number: number;
  /** null before season 1: ranked is closed and the season starts when it opens */
  start: string | null;
  end: string | null;
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
  update(patch: Partial<Pick<Profile, 'username' | 'iconId' | 'onboardingStep' | 'onboarded' | 'watch'>>): Promise<Profile>;
  history(): Promise<GameRecord[]>;
  /** a player's public profile by username (case-insensitive) or id */
  get(usernameOrId: string): Promise<PublicProfile | null>;
  /** a player's recent games (no MMR changes: those are private) */
  publicHistory(userId: string): Promise<GameRecord[]>;
  /** the awards the server has given a player, with when (real accounts; the demo computes them) */
  awards?(userId: string): Promise<EarnedAward[]>;
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

/** Why a player is reported (the same list as REPORT_REASONS in _shared/social.ts). */
export type ReportReason = 'cheating' | 'abuse' | 'username' | 'spam' | 'other';

export interface BlockedPlayer {
  profile: PublicProfile;
  at: string;
}

/**
 * Blocking and reporting. A block ends the friendship or request between the two, and
 * neither can send the other a request; matchmaking keeps them apart. The blocked player is
 * not told. Reports go to the operator.
 */
export interface SafetyService {
  blocked(): Promise<BlockedPlayer[]>;
  isBlocked(userId: string): Promise<boolean>;
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;
  /** report a player, or one of their messages to you (`messageId`) */
  report(userId: string, reason: ReportReason, extra?: { messageId?: string; note?: string }): Promise<void>;
}

/** A running game anyone may watch, for "Live now" on the Play hub. */
export interface LiveGame {
  id: string;
  kind: 'ranked' | 'casual' | 'wager';
  control: ControlId | null;
  /** the players' profiles (null for a guest) and names */
  white: PublicProfile | null;
  black: PublicProfile | null;
  whiteName: string;
  blackName: string;
  /** half-moves spectators can see */
  moves: number;
  /** one of the players is the viewer's friend */
  friend: boolean;
}

/** Watching other players' games (docs/PLATFORM.md §4.1 "Spectating"). */
export interface SpectateService {
  /** of these players, those in a game the viewer may watch: player id → game id */
  playing(userIds: string[]): Promise<Record<string, string>>;
  /** running matchmade games to watch, friends' games first ("Live now", closed for now) */
  live(): Promise<LiveGame[]>;
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
  | { type: 'profile'; text?: string };

export interface EventsService {
  subscribe(fn: (event: ApiEvent) => void): () => void;
}

export interface MatchmakingTicket {
  /** resolves when an opponent is found; rejects if cancelled */
  found: Promise<MatchFound>;
  cancel(): void;
}

export interface MatchmakingService {
  find(kind: MatchKind, stake?: StakeId, control?: ControlId): MatchmakingTicket;
  /** players currently searching, for the queue screen */
  queueSize(kind: MatchKind): Promise<number>;
  report(matchId: string, report: MatchReport): Promise<MatchResult>;
  /** server games: the player's result once the game is over (null: aborted, nothing changed) */
  result?(matchId: string): Promise<MatchResult | null>;
  /**
   * server games: this player's engine report of a finished ranked or casual game, or
   * without one how its analysis stands; `result` once the performance part was added
   */
  analysis?(matchId: string, report?: AnalysisReport): Promise<{ status: AnalysisStatus; result: MatchResult | null }>;
}

// ------------------------------------------------------------------ puzzles

export interface PuzzleModuleProgress {
  id: string;
  /** open now: free, unlocked with coins, or with Premium */
  unlocked: boolean;
  /** free or unlocked with coins (stays open without Premium) */
  bought?: boolean;
  /** best stars per puzzle (1–3), 0 while unsolved */
  stars: number[];
  /** the solution was shown and the puzzle isn't solved yet (it counts as passed, without stars) */
  seen: boolean[];
  /** per puzzle under three stars: from when a replay can improve its stars (ISO), else null */
  reviewFrom: (string | null)[];
  completedAt: string | null;
  /** what finishing the module gave: an item, or coins */
  reward: { item: string | null; coins: number | null } | null;
}

export interface PuzzleSolve {
  /** the first time this puzzle was solved (only that pays) */
  first: boolean;
  coins: number;
  /** coins the hints took off (first solve only) */
  hintCost: number;
  /** the bonus for every 10 solved */
  bonus: number;
  stars: 1 | 2 | 3;
  /** whether this solve counted for the stars (a replay counts only after the review wait) */
  counted: boolean;
  /** the puzzle's best stars now */
  best: number;
  /** from when the next replay can improve the stars, null at three stars */
  reviewFrom: string | null;
  /** puzzles solved in the module now */
  solved: number;
  /** finishing the module */
  reward: { item: string | null; coins: number | null } | null;
}

export interface PuzzlesService {
  progress(): Promise<PuzzleModuleProgress[]>;
  /** the player opened a puzzle (the server times the solve from here) */
  start(module: string, index: number): Promise<void>;
  /** the player's moves (UCI) for a puzzle; the server checks them and pays the rewards */
  solve(module: string, index: number, moves: string[], mistakes: number, hints: number): Promise<PuzzleSolve>;
  /** unlock a paid module with coins */
  unlock(module: string): Promise<PuzzleModuleProgress[]>;
  /** show the solution of an open puzzle (after `start`): seen, the next one opens, no coins */
  reveal(module: string, index: number): Promise<PuzzleModuleProgress[]>;
  /** today's daily puzzle and the player's streak */
  daily(): Promise<DailyPuzzle>;
  dailyStart(): Promise<void>;
  dailySolve(moves: string[], mistakes: number, hints: number): Promise<DailySolve>;
  /**
   * Signed out: the guest's coins so far (they move into the account on signing up or in).
   * Null for a signed-in player. Guests play the first GUEST_PUZZLES of the free module and
   * the daily puzzle; anything else answers `guest_limit`.
   */
  guest(): Promise<{ coins: number } | null>;
  /** Signed in: move this device's guest puzzles into the account, once (null: nothing to move). */
  claimGuest(): Promise<GuestClaim | null>;
  /** buy a streak shield for SHIELD_PRICE coins (the shields held now) */
  buyShield(): Promise<number>;
}

export interface GuestClaim {
  /** puzzles that were new to the account */
  puzzles: number;
  /** daily puzzles added to the account's streak */
  days: number;
  /** lessons of Learn moved in */
  lessons?: number;
  coins: number;
}

/** Learn (docs/PLATFORM.md §4.3): the finished lessons and whether the paid chapters are open. */
export interface LearnProgress {
  lessons: string[];
  /** the paid chapters are open: unlocked with coins, or with Premium */
  unlocked: boolean;
  /** unlocked with coins (stays open without Premium) */
  bought?: boolean;
  /** chapters whose reward was paid */
  rewarded: string[];
}

export interface LessonDone extends LearnProgress {
  /** the lesson was new (a replay records nothing) */
  first: boolean;
  /** this lesson finished its chapter */
  chapterDone: boolean;
  /** coins paid now (CHAPTER_REWARD once per chapter) */
  reward: number;
}

/** Guests may take the free chapters (like the first puzzles); their lessons move into an account later. */
export interface LearnService {
  progress(): Promise<LearnProgress>;
  done(lesson: string): Promise<LessonDone>;
  /** open the paid chapters for LEARN_PRICE coins */
  unlock(): Promise<LearnProgress>;
}

/** Game Review limits (the review itself runs in the browser, src/features/review). */
export interface ReviewService {
  /** today's reviews (UTC day); `limit` null: unlimited */
  today(): Promise<{ used: number; limit: number | null }>;
  /** start reviewing a game; a game already reviewed today opens again for free */
  start(gameId: string): Promise<{ allowed: boolean; used: number; limit: number | null }>;
}

/** Premium, the subscription (docs/PLATFORM.md §4.9). */
export interface PremiumService {
  /** subscribing works in this build (real back-end with Paddle settings, or the demo) */
  available: boolean;
  /** 'demo': the in-browser back-end subscribes at once, without Paddle's checkout */
  checkout: 'paddle' | 'demo';
  state(): Promise<PremiumState>;
  /** start a plan: the Paddle transaction to open in the checkout (null in the demo: subscribed already) */
  subscribe(plan: PlanId, period: Period): Promise<string | null>;
  change(plan: PlanId, period: Period): Promise<PremiumState>;
  /** ends at the end of the paid period (a trial at once) */
  cancel(): Promise<PremiumState>;
  /** take a cancellation back */
  resume(): Promise<PremiumState>;
  /** Paddle's page for the payment method and invoices */
  manage(): Promise<string>;
}

export interface StreakView {
  /** days in a row, 0 when broken */
  current: number;
  best: number;
  /** the last day solved (UTC date) */
  lastDay: string | null;
  /** streak shields held (a missed day doesn't end the streak) */
  shields?: number;
  /** shields used just now for missed days */
  shielded?: number;
}

export interface DailyPuzzle {
  /** UTC date */
  day: string;
  module: string;
  index: number;
  /** today's solve, if done */
  solved: { stars: number; coins: number } | null;
  streak: StreakView;
}

export interface DailySolve {
  /** today's puzzle had been solved already (nothing paid) */
  already: boolean;
  coins: number;
  hintCost: number;
  stars: 1 | 2 | 3;
  streak: StreakView;
  /** a milestone the streak reached today */
  milestone: { days: number; coins: number; item: string | null } | null;
}

// ------------------------------------------------------------------ buying coins

export type PurchaseStatus = 'created' | 'completed' | 'refunded';

export interface PaymentsService {
  /** buying coins is set up in this build (Supabase back-end and Paddle settings) */
  available: boolean;
  /** start buying a coin pack: the id of the Paddle transaction to open in the checkout */
  checkout(packId: string): Promise<string>;
  /** where a purchase stands; the profile is updated once its coins arrived */
  status(transactionId: string): Promise<PurchaseStatus>;
}

export interface Api {
  auth: AuthService;
  profiles: ProfileService;
  friends: FriendsService;
  messages: MessagesService;
  safety: SafetyService;
  spectate: SpectateService;
  account: AccountService;
  events: EventsService;
  matchmaking: MatchmakingService;
  shop: ShopService;
  seasons: SeasonsService;
  payments: PaymentsService;
  puzzles: PuzzlesService;
  learn: LearnService;
  premium: PremiumService;
  reviews: ReviewService;
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
