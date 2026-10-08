import { t } from '../../i18n';
// In-browser stand-in for the back-end. Data lives in localStorage; every call
// waits a little so loading states are visible. The rules for MMR and coins are
// the real shared ones, so results look exactly like they will in production.
import { mmrChange, rankOf } from '#shared/rating.ts';
import { STAKES, coinReward, wagerNet } from '#shared/economy.ts';
import { ApiError, type Api, type MatchFound, type MatchKind, type MatchReport, type MatchResult } from '../types';
import { emailProblem, nextUsernameChange, passwordProblem, usernameProblem } from '../validation';
import { createAccount, db, emit, isTaken, newId as id, publicSeed, rankInfo, save, session, strip, subscribe, wait } from './db';
import { SEED_PLAYERS, type SeedPlayer } from './seed';
import { account, friends, messages, profileLookups } from './social';
import { notePeak, owns, seasons, shop } from './shop';

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
    demo: { accounts: true, social: true },

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
          throw new ApiError('email_taken', t('An account with this email already exists. Sign in instead.'));
        }
        const account = createAccount(email, 'email', password);
        db.sessionId = account.id;
        save();
        return { account: strip(account) };
      },

      async signIn(email, password) {
        await wait();
        const account = db.accounts.find((a) => a.email === email.trim().toLowerCase());
        if (!account || account.password !== password) {
          throw new ApiError('bad_credentials', t('Wrong email or password.'));
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

      async providers() {
        return { apple: true, google: true };
      },

      async resendConfirmation() {
        await wait();
      },

      async requestPasswordReset(email) {
        await wait();
        const problem = emailProblem(email);
        if (problem) throw new ApiError('invalid', problem);
      },

      async updatePassword(password) {
        await wait();
        const problem = passwordProblem(password);
        if (problem) throw new ApiError('invalid', problem);
        const { account } = session();
        account.password = password;
        save();
      },

      async landing() {
        return null;
      },

      onChange() {
        return () => {};
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
          if (isTaken(patch.username, profile.id)) throw new ApiError('username_taken', t('That username is taken.'));
        }
        if (patch.username != null && profile.onboarded && patch.username !== profile.username) {
          const next = nextUsernameChange(profile.usernameChangedAt ?? null);
          if (next) throw new ApiError('cooldown', t('You can change your username again on {date}.', { date: next.toLocaleDateString() }));
          profile.usernameChangedAt = new Date().toISOString();
        }
        if (patch.iconId != null && !owns(profile, patch.iconId)) throw new ApiError('not_owned', t('You do not own this item.'));
        Object.assign(profile, patch);
        save();
        emit({ type: 'profile' });
        return structuredClone(profile);
      },

      async history() {
        await wait();
        return structuredClone(db.history[session().profile.id] ?? []);
      },

      ...profileLookups,
    },

    friends,
    messages,
    account,
    shop,
    seasons,
    events: { subscribe },

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
              rej(new ApiError('insufficient_coins', t('You need {amount} coins for this stake.', { amount })));
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
            reject(new ApiError('cancelled', t('Search cancelled.')));
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
        if (!match || match.playerId !== profile.id) throw new ApiError('not_found', t('Match not found.'));
        if (match.reported) throw new ApiError('already_reported', t('This result was already recorded.'));
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
          notePeak(profile);
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
