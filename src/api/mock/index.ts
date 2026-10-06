// In-browser stand-in for the back-end. Data lives in localStorage; every call
// waits a little so loading states are visible. The rules for MMR and coins are
// the real shared ones, so results look exactly like they will in production.
import { mmrChange, rankOf } from '#shared/rating.ts';
import { COINS, STAKES, coinReward, wagerNet } from '#shared/economy.ts';
import {
  ApiError,
  type Account,
  type Api,
  type AuthProviderId,
  type FriendEntry,
  type GameRecord,
  type MatchFound,
  type MatchKind,
  type MatchReport,
  type MatchResult,
  type Profile,
  type PublicProfile,
  type RankInfo,
  type StakeId,
} from '../types';
import { emailProblem, passwordProblem, usernameProblem } from '../validation';
import { DEFAULT_LOADOUT, NEW_PLAYER_STATS, SEED_FRIENDS, SEED_PLAYERS, START_MMR, type SeedPlayer } from './seed';

interface StoredAccount extends Account {
  /** demo only: a real back-end never stores plain passwords */
  password: string | null;
}

interface PendingMatch {
  playerId: string;
  kind: MatchKind;
  stake: StakeId | null;
  opponentId: string;
  color: 'w' | 'b';
  reported: boolean;
}

interface Db {
  version: 1;
  accounts: StoredAccount[];
  profiles: Record<string, Profile>;
  history: Record<string, GameRecord[]>;
  matches: Record<string, PendingMatch>;
  sessionId: string | null;
}

const KEY = 'wizard-chess.mock-db.v1';

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* fall through to a fresh database */
  }
  return { version: 1, accounts: [], profiles: {}, history: {}, matches: {}, sessionId: null };
}

let db = load();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

const wait = (min = 250, max = 650) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
const id = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

function rankInfo(mmr: number): RankInfo {
  const r = rankOf(mmr);
  return { tier: r.tier.id, division: r.division, label: r.label, progress: r.progress };
}

function publicSeed(p: SeedPlayer): PublicProfile {
  return {
    id: p.id,
    username: p.username,
    iconId: p.iconId,
    rank: rankInfo(p.mmr),
    stats: p.stats,
    loadout: DEFAULT_LOADOUT,
    createdAt: p.createdAt,
    online: p.online,
  };
}

function session(): { account: StoredAccount; profile: Profile } {
  const account = db.accounts.find((a) => a.id === db.sessionId);
  const profile = account && db.profiles[account.id];
  if (!account || !profile) throw new ApiError('unauthorized', 'Please sign in again.');
  return { account, profile };
}

function createAccount(email: string, provider: AuthProviderId, password: string | null): StoredAccount {
  const account: StoredAccount = { id: id('user'), email: email.trim().toLowerCase(), provider, password };
  db.accounts.push(account);
  db.profiles[account.id] = {
    id: account.id,
    username: null,
    iconId: null,
    onboardingStep: 0,
    onboarded: false,
    coins: COINS.startingBalance,
    mmr: START_MMR,
    stats: { ...NEW_PLAYER_STATS },
    loadout: { ...DEFAULT_LOADOUT },
    createdAt: new Date().toISOString(),
  };
  db.history[account.id] = [];
  return account;
}

const strip = ({ password: _password, ...account }: StoredAccount): Account => account;

function isTaken(username: string, exceptId?: string): boolean {
  const lower = username.toLowerCase();
  return (
    SEED_PLAYERS.some((p) => p.username.toLowerCase() === lower) ||
    Object.values(db.profiles).some((p) => p.id !== exceptId && p.username?.toLowerCase() === lower)
  );
}

function pickOpponent(kind: MatchKind, mmr: number): SeedPlayer {
  const pool = SEED_PLAYERS.filter((p) => p.online);
  if (kind === 'ranked') {
    // closest ratings first, a little randomness among the nearest few
    const near = [...pool].sort((a, b) => Math.abs(a.mmr - mmr) - Math.abs(b.mmr - mmr)).slice(0, 4);
    return near[Math.floor(Math.random() * near.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function createMockApi(): Api {
  return {
    mock: true,

    auth: {
      async current() {
        const account = db.accounts.find((a) => a.id === db.sessionId);
        return account ? strip(account) : null;
      },

      async signUp(email, password) {
        await wait();
        const problem = emailProblem(email) ?? passwordProblem(password);
        if (problem) throw new ApiError('invalid', problem);
        if (db.accounts.some((a) => a.email === email.trim().toLowerCase())) {
          throw new ApiError('email_taken', 'An account with this email already exists. Sign in instead.');
        }
        const account = createAccount(email, 'email', password);
        db.sessionId = account.id;
        save();
        return strip(account);
      },

      async signIn(email, password) {
        await wait();
        const account = db.accounts.find((a) => a.email === email.trim().toLowerCase());
        if (!account || account.password !== password) {
          throw new ApiError('bad_credentials', 'Wrong email or password.');
        }
        db.sessionId = account.id;
        save();
        return strip(account);
      },

      async signInWith(provider) {
        await wait(500, 900);
        // the real flow redirects to Apple/Google; the demo reuses one account per provider
        const email = `demo.${provider}@wizardchess.dev`;
        const account = db.accounts.find((a) => a.email === email) ?? createAccount(email, provider, null);
        db.sessionId = account.id;
        save();
        return strip(account);
      },

      async requestPasswordReset(email) {
        await wait();
        const problem = emailProblem(email);
        if (problem) throw new ApiError('invalid', problem);
      },

      async signOut() {
        await wait(150, 300);
        db.sessionId = null;
        save();
      },
    },

    profiles: {
      async me() {
        return structuredClone(session().profile);
      },

      async checkUsername(username) {
        await wait(200, 450);
        if (usernameProblem(username)) return 'invalid';
        return isTaken(username, db.sessionId ?? undefined) ? 'taken' : 'available';
      },

      async update(patch) {
        await wait();
        const { profile } = session();
        if (patch.username != null) {
          const problem = usernameProblem(patch.username);
          if (problem) throw new ApiError('invalid', problem);
          if (isTaken(patch.username, profile.id)) throw new ApiError('username_taken', 'That username is taken.');
        }
        Object.assign(profile, patch);
        save();
        return structuredClone(profile);
      },

      async history() {
        await wait();
        return structuredClone(db.history[session().profile.id] ?? []);
      },
    },

    friends: {
      async list(): Promise<FriendEntry[]> {
        await wait();
        session();
        return SEED_FRIENDS.map((fid, i) => ({
          profile: publicSeed(SEED_PLAYERS.find((p) => p.id === fid)!),
          since: new Date(Date.now() - (i + 1) * 6.5e8).toISOString(),
        }));
      },
    },

    matchmaking: {
      find(kind, stake) {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let reject: (e: Error) => void = () => {};
        const found = new Promise<MatchFound>((resolve, rej) => {
          reject = rej;
          const { profile } = session();
          if (kind === 'wager') {
            const amount = STAKES[stake ?? 'low'].amount;
            if (profile.coins < amount) {
              rej(new ApiError('insufficient_coins', `You need ${amount} coins for this stake.`));
              return;
            }
          }
          timer = setTimeout(() => {
            if (cancelled) return;
            const opponent = pickOpponent(kind, profile.mmr);
            const matchId = id('match');
            const color = Math.random() < 0.5 ? 'w' : 'b';
            db.matches[matchId] = { playerId: profile.id, kind, stake: stake ?? null, opponentId: opponent.id, color, reported: false };
            save();
            resolve({
              matchId,
              kind,
              stake: kind === 'wager' ? (stake ?? 'low') : null,
              color,
              opponent: publicSeed(opponent),
              opponentMmr: opponent.mmr,
              demo: true,
            });
          }, 2500 + Math.random() * 3500);
        });
        return {
          found,
          cancel() {
            cancelled = true;
            clearTimeout(timer);
            reject(new ApiError('cancelled', 'Search cancelled.'));
          },
        };
      },

      async queueSize(kind) {
        return { ranked: 1243, casual: 2871, wager: 412 }[kind] + Math.floor(Math.random() * 60);
      },

      async report(matchId: string, report: MatchReport): Promise<MatchResult> {
        await wait(400, 900);
        const { profile } = session();
        const match = db.matches[matchId];
        if (!match || match.playerId !== profile.id) throw new ApiError('not_found', 'Match not found.');
        if (match.reported) throw new ApiError('already_reported', 'This result was already recorded.');
        const opponent = SEED_PLAYERS.find((p) => p.id === match.opponentId)!;
        const rankBefore = rankInfo(profile.mmr);
        const { outcome, accuracy } = report;

        let mmr = null;
        let coins = null;
        let wager = null;
        if (match.kind === 'ranked') {
          mmr = mmrChange({ outcome, mmr: profile.mmr, opponentMmr: opponent.mmr, accuracy, winStreak: profile.stats.rankedStreak });
          profile.mmr = mmr.mmrAfter;
          profile.stats.rankedStreak = mmr.winStreakAfter;
        }
        if (match.kind === 'wager') {
          wager = wagerNet(STAKES[match.stake ?? 'low'].amount, outcome);
          profile.coins = Math.max(0, profile.coins + wager);
        } else {
          coins = coinReward({
            kind: match.kind,
            outcome,
            accuracy,
            mmr: profile.mmr - (mmr?.total ?? 0),
            opponentMmr: opponent.mmr,
            winStreak: profile.stats.winStreak,
          });
          profile.coins += coins.total;
        }

        const s = profile.stats;
        if (outcome === 'win') {
          s.wins++;
          if (match.kind !== 'wager') s.winStreak++;
          s.bestStreak = Math.max(s.bestStreak, s.winStreak);
        } else if (outcome === 'loss') {
          s.losses++;
          s.winStreak = 0;
        } else {
          s.draws++;
        }

        match.reported = true;
        (db.history[profile.id] ??= []).unshift({
          id: matchId,
          kind: match.kind,
          playedAt: new Date().toISOString(),
          color: match.color,
          opponent: { username: opponent.username, iconId: opponent.iconId, rankLabel: rankOf(opponent.mmr).label },
          outcome,
          reason: report.reason,
          moves: report.moves,
          accuracy,
          mmrDelta: mmr?.total ?? null,
          coinsDelta: wager ?? coins?.total ?? 0,
        });
        save();
        return { outcome, mmr, coins, wager, rankBefore, rankAfter: rankInfo(profile.mmr), profile: structuredClone(profile) };
      },
    },
  };
}
