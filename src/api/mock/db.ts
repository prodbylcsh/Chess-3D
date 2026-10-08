import { t } from '../../i18n';
// The mock back-end's "database": one object persisted to localStorage, plus
// helpers shared by the mock services.
import { rankOf } from '#shared/rating.ts';
import { COINS } from '#shared/economy.ts';
import { ApiError, type Account, type ApiEvent, type AuthProviderId, type GameRecord, type Loadout, type MatchKind, type Message, type Profile, type PublicProfile, type RankInfo, type StakeId } from '../types';
import { DEFAULT_LOADOUT, NEW_PLAYER_STATS, SEED_FRIENDS, SEED_PLAYERS, START_MMR, type SeedPlayer } from './seed';

export interface StoredAccount extends Account {
  /** demo only: a real back-end never stores plain passwords */
  password: string | null;
}

export interface PendingMatch {
  playerId: string;
  kind: MatchKind;
  stake: StakeId | null;
  opponentId: string;
  color: 'w' | 'b';
  reported: boolean;
}

/** per player: other player id → ISO date */
export interface Social {
  friends: Record<string, string>;
  incoming: Record<string, string>;
  outgoing: Record<string, string>;
}

export interface StoredConversation {
  id: string;
  members: [string, string];
  messages: Message[];
  /** member id → when they last read the conversation */
  readAt: Record<string, string>;
}

export interface Db {
  version: 1;
  accounts: StoredAccount[];
  profiles: Record<string, Profile>;
  history: Record<string, GameRecord[]>;
  matches: Record<string, PendingMatch>;
  social: Record<string, Social>;
  conversations: Record<string, StoredConversation>;
  /** per player: highest MMR reached in each season ("2" → mmr) */
  seasonPeak: Record<string, Record<string, number>>;
  sessionId: string | null;
}

const KEY = 'wizard-chess.mock-db.v1';

function load(): Db {
  let data: Partial<Db> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = JSON.parse(raw) as Db;
  } catch {
    /* fall through to a fresh database */
  }
  // fill in collections added after a browser first stored the database
  return {
    version: 1,
    accounts: [],
    profiles: {},
    history: {},
    matches: {},
    social: {},
    conversations: {},
    seasonPeak: {},
    sessionId: null,
    ...data,
  };
}

/** Item ids before the shop existed (M1/M2): one id served two categories. */
const RENAMED: Record<string, Partial<Record<keyof Loadout, string>>> = {
  'classic-marble': { pieces: 'marble-set', board: 'marble-board' },
};

/** Bring profiles stored by older versions up to date. */
function migrate(data: Db): Db {
  for (const p of Object.values(data.profiles)) {
    p.inventory ??= [];
    for (const key of Object.keys(p.loadout) as Array<keyof Loadout>) {
      const renamed = RENAMED[p.loadout[key]]?.[key];
      if (renamed) p.loadout[key] = renamed;
    }
  }
  return data;
}

export const db = migrate(load());

export function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

export const wait = (min = 250, max = 650) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
export const now = () => new Date().toISOString();

// ------------------------------------------------------------------ events

const listeners = new Set<(e: ApiEvent) => void>();

export function emit(event: ApiEvent): void {
  for (const fn of listeners) fn(event);
}

export function subscribe(fn: (e: ApiEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ------------------------------------------------------------------ players

export function rankInfo(mmr: number): RankInfo {
  const r = rankOf(mmr);
  return { tier: r.tier.id, division: r.division, label: r.label, progress: r.progress };
}

export function publicSeed(p: SeedPlayer): PublicProfile {
  return {
    id: p.id,
    username: p.username,
    iconId: p.iconId,
    rank: rankInfo(p.mmr),
    stats: p.stats,
    loadout: p.loadout,
    createdAt: p.createdAt,
    online: p.online,
  };
}

export function publicProfile(p: Profile): PublicProfile {
  return {
    id: p.id,
    username: p.username ?? 'Player',
    iconId: p.iconId ?? 'guest',
    rank: rankInfo(p.mmr),
    stats: p.stats,
    loadout: p.loadout,
    createdAt: p.createdAt,
    // in the demo, real accounts are "online" while they are the signed-in one
    online: p.id === db.sessionId,
  };
}

/** Every player that can be looked up: demo players plus onboarded accounts. */
export function allPlayers(): PublicProfile[] {
  return [...SEED_PLAYERS.map(publicSeed), ...Object.values(db.profiles).filter((p) => p.onboarded).map(publicProfile)];
}

export function findPlayer(usernameOrId: string): PublicProfile | null {
  const key = usernameOrId.toLowerCase();
  return allPlayers().find((p) => p.id === usernameOrId || p.username.toLowerCase() === key) ?? null;
}

export const seedById = (id: string) => SEED_PLAYERS.find((p) => p.id === id) ?? null;

// ------------------------------------------------------------------ session and accounts

export function session(): { account: StoredAccount; profile: Profile } {
  const account = db.accounts.find((a) => a.id === db.sessionId);
  const profile = account && db.profiles[account.id];
  if (!account || !profile) throw new ApiError('unauthorized', t('Please sign in again.'));
  return { account, profile };
}

export function socialOf(playerId: string): Social {
  return (db.social[playerId] ??= { friends: {}, incoming: {}, outgoing: {} });
}

export function createAccount(email: string, provider: AuthProviderId, password: string | null): StoredAccount {
  const account: StoredAccount = { id: newId('user'), email: email.trim().toLowerCase(), provider, password };
  db.accounts.push(account);
  seedPlayer(account.id, now());
  return account;
}

/**
 * A fresh local profile with the demo social life: a few friends, two friend
 * requests and one chat waiting.
 */
function seedPlayer(id: string, createdAt: string): void {
  db.profiles[id] = {
    id,
    username: null,
    iconId: null,
    onboardingStep: 0,
    onboarded: false,
    coins: COINS.startingBalance,
    mmr: START_MMR,
    stats: { ...NEW_PLAYER_STATS },
    loadout: { ...DEFAULT_LOADOUT },
    inventory: [],
    createdAt,
    usernameChangedAt: null,
  };
  db.history[id] = [];

  const day = 86_400_000;
  const social = socialOf(id);
  SEED_FRIENDS.forEach((fid, i) => (social.friends[fid] = new Date(Date.now() - (i + 2) * 6 * day).toISOString()));
  social.incoming['seed-7'] = new Date(Date.now() - 3 * 3_600_000).toISOString();
  social.incoming['seed-16'] = new Date(Date.now() - 26 * 3_600_000).toISOString();
  const conv: StoredConversation = { id: newId('conv'), members: [id, 'seed-5'], messages: [], readAt: {} };
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  conv.messages.push(
    { id: newId('msg'), conversationId: conv.id, from: 'seed-5', body: t('Welcome to Wizard Chess! 👋'), at: at(95), kind: 'text' },
    { id: newId('msg'), conversationId: conv.id, from: 'seed-5', body: t('Fancy a game later? I still owe you a rematch.'), at: at(94), kind: 'text' },
  );
  db.conversations[conv.id] = conv;
}

/** The profile fields the server owns once accounts are real (M4). */
export type Identity = Pick<Profile, 'username' | 'iconId' | 'onboardingStep' | 'onboarded' | 'usernameChangedAt' | 'createdAt'>;

/**
 * Make a real (server) account the session of the local store. Coins, rank,
 * stats, items and the demo social life stay in this browser until their
 * back-end milestones; identity fields are copied from the server.
 */
export function adoptAccount(account: Account, identity: Identity): Profile {
  let stored = db.accounts.find((a) => a.id === account.id);
  if (!stored) {
    stored = { ...account, password: null };
    db.accounts.push(stored);
  }
  Object.assign(stored, account);
  if (!db.profiles[account.id]) seedPlayer(account.id, identity.createdAt);
  Object.assign(db.profiles[account.id], identity);
  db.sessionId = account.id;
  save();
  return db.profiles[account.id];
}

/** Remove everything this browser stores about a player. */
export function forgetAccount(id: string): void {
  db.accounts = db.accounts.filter((a) => a.id !== id);
  delete db.profiles[id];
  delete db.history[id];
  delete db.social[id];
  delete db.seasonPeak[id];
  for (const s of Object.values(db.social)) {
    delete s.friends[id];
    delete s.incoming[id];
    delete s.outgoing[id];
  }
  for (const [cid, c] of Object.entries(db.conversations)) if (c.members.includes(id)) delete db.conversations[cid];
  if (db.sessionId === id) db.sessionId = null;
  save();
}

export const strip = ({ password: _password, ...account }: StoredAccount): Account => account;

export function isTaken(username: string, exceptId?: string): boolean {
  const lower = username.toLowerCase();
  return (
    SEED_PLAYERS.some((p) => p.username.toLowerCase() === lower) ||
    Object.values(db.profiles).some((p) => p.id !== exceptId && p.username?.toLowerCase() === lower)
  );
}

export { DEFAULT_LOADOUT, SEED_PLAYERS, START_MMR };
