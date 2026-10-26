// Ranked, casual and coin games, the shop and game history on Supabase (milestone 6).
// The server keeps coins, MMR, stats and items (`players`) and settles every game; the
// app copies the player's state into the local store the screens read (`adopt`).
import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { STAKES, type StakeId } from '#shared/economy.ts';
import { DEFAULT_CONTROL } from '#shared/play.ts';
import { TIERS, DIVISION_SIZE } from '#shared/rating.ts';
import { DEFAULT_LOADOUT } from '#shared/shop.ts';
import { t } from '../../i18n';
import { forgetGuest, guestSession, guestToken } from '../../net/guest';
import { SUPABASE_KEY, SUPABASE_URL } from '../../net/supabase';
import { paddleConfigured } from '../../net/paddle';
import {
  ApiError,
  type AnalysisStatus,
  type GameRecord,
  type MatchFound,
  type MatchKind,
  type MatchmakingService,
  type MatchResult,
  type PaymentsService,
  type PremiumService,
  type PremiumState,
  type PremiumView,
  type Profile,
  type ReviewService,
  type PurchaseStatus,
  type PuzzleModuleProgress,
  type PuzzleSolve,
  type DailyPuzzle,
  type DailySolve,
  type GuestClaim,
  type LearnProgress,
  type LearnService,
  type LessonDone,
  type PuzzlesService,
  type ProfileService,
  type PublicProfile,
  type ShopService,
} from '../types';

/** A player's competitive state as the server stores it. */
export interface PlayerRecord {
  mmr: number;
  coins: number;
  wins: number;
  losses: number;
  draws: number;
  win_streak: number;
  ranked_streak: number;
  best_streak: number;
  season: number;
  season_peak_mmr: number;
  inventory: string[];
  loadout: Record<string, string>;
  /** the Premium plan now (docs/PLATFORM.md §4.9) */
  premium?: PremiumView | null;
  trial_used?: boolean;
}

interface ResultRecord {
  game_id: string;
  kind: GameRecord['kind'];
  color: 'w' | 'b';
  played_at: string;
  opponent_name: string;
  opponent_icon: string;
  opponent_rank: string | null;
  outcome: GameRecord['outcome'];
  reason: string;
  moves: number;
  accuracy: number | null;
  mmr_delta?: number | null;
  coins_delta?: number;
  breakdown?: { mmr: MatchResult['mmr']; coins: MatchResult['coins']; wager: number | null; rankBefore: MatchResult['rankBefore']; rankAfter: MatchResult['rankAfter'] };
}

/** The profile fields that come from the server's player state. */
export function economyOf(p: PlayerRecord) {
  return {
    coins: p.coins,
    mmr: p.mmr,
    stats: {
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      winStreak: p.win_streak,
      rankedStreak: p.ranked_streak,
      bestStreak: p.best_streak,
    },
    loadout: { ...DEFAULT_LOADOUT, ...p.loadout } as Profile['loadout'],
    inventory: p.inventory,
    premium: p.premium ?? null,
    trialUsed: !!p.trial_used,
    seasonPeak: { season: p.season, mmr: p.season_peak_mmr },
  };
}

function toRecord(r: ResultRecord): GameRecord {
  return {
    id: r.game_id,
    kind: r.kind,
    playedAt: r.played_at,
    color: r.color,
    opponent: { username: r.opponent_name, iconId: r.opponent_icon, rankLabel: r.opponent_rank },
    outcome: r.outcome,
    reason: r.reason,
    moves: r.moves,
    accuracy: r.accuracy,
    mmrDelta: r.mmr_delta ?? null,
    coinsDelta: r.coins_delta ?? 0,
  };
}

/** The middle of a rank's MMR band: opponents' MMR stays private, this is only for previews. */
function mmrEstimate(p: PublicProfile): number {
  const tier = TIERS.find((x) => x.id === p.rank.tier) ?? TIERS[2];
  const step = p.rank.division ? 4 - p.rank.division : 0;
  return tier.from + step * DIVISION_SIZE + Math.round(p.rank.progress * DIVISION_SIZE);
}

const SEARCH_EVERY_MS = 2000;

export function createCompetitive(
  client: SupabaseClient,
  deps: {
    me: () => string | null;
    /** copy the server's player state into the local profile */
    adopt: (player: PlayerRecord) => Profile;
    account: <T>(action: string, body?: Record<string, unknown>) => Promise<T>;
    lookup: (id: string) => Promise<PublicProfile | null>;
    onlineCount: () => number;
  },
) {
  async function play<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.functions.invoke<T>('play', { body: { action, ...body } });
    if (!error) return data!;
    if (error instanceof FunctionsHttpError) {
      const payload = await (error.context as Response).json().catch(() => null);
      throw playError(payload?.code ?? 'server_error');
    }
    throw new ApiError('network', t('Could not reach the server. Check your connection.'));
  }

  function playError(code: string): ApiError {
    switch (code) {
      case 'insufficient_coins':
        return new ApiError(code, t('You do not have enough coins for this stake.'));
      case 'ranked_closed':
        return new ApiError(code, t('Ranked games open soon. Try a casual game meanwhile.'));
      case 'not_ready':
        return new ApiError(code, t('Choose a username and an icon first.'));
      case 'unauthorized':
      case 'guest':
        return new ApiError('unauthorized', t('Please sign in again.'));
      case 'not_found':
        return new ApiError(code, t('Match not found.'));
      default:
        return new ApiError('server_error', t('Something went wrong. Please try again.'));
    }
  }

  async function matchFound(gameId: string): Promise<MatchFound> {
    const { data: row, error } = await client.from('games').select('*').eq('id', gameId).single();
    if (error || !row) throw new ApiError('not_found', t('Match not found.'));
    const color = row.white_id === deps.me() ? 'w' : 'b';
    const opponent = await deps.lookup(color === 'w' ? row.black_id : row.white_id);
    if (!opponent) throw new ApiError('not_found', t('Match not found.'));
    const stake = (Object.keys(STAKES) as StakeId[]).find((k) => STAKES[k].amount === row.stake) ?? null;
    return { matchId: gameId, kind: row.kind as MatchKind, stake, color, opponent, opponentMmr: mmrEstimate(opponent), demo: false, control: row.control };
  }

  const matchmaking: MatchmakingService = {
    find(kind, stake, control) {
      let cancelled = false;
      let reject: (e: Error) => void = () => {};
      const found = new Promise<MatchFound>((resolve, rej) => {
        reject = rej;
        void (async () => {
          while (!cancelled) {
            try {
              const r = await play<{ gameId?: string }>('search', { kind, stake, control: control ?? DEFAULT_CONTROL });
              if (cancelled) return;
              if (r.gameId) return resolve(await matchFound(r.gameId));
            } catch (err) {
              return rej(err);
            }
            await new Promise((r) => setTimeout(r, SEARCH_EVERY_MS));
          }
        })();
      });
      return {
        found,
        cancel() {
          if (cancelled) return;
          cancelled = true;
          void play('leave').catch(() => {});
          reject(new ApiError('cancelled', t('Search cancelled.')));
        },
      };
    },

    async queueSize() {
      return deps.onlineCount();
    },

    async report() {
      throw new ApiError('server_error', t('Results are recorded by the server.'));
    },

    async result(matchId) {
      const { result } = await play<{ result: ServerResult }>('result', { gameId: matchId });
      return toMatchResult(result);
    },

    async analysis(matchId, report) {
      const { status, result } = await play<{ status: AnalysisStatus; result?: ServerResult }>('analysis', { gameId: matchId, report });
      return { status, result: result ? toMatchResult(result) : null };
    },
  };

  type ServerResult = (ResultRecord & { player: PlayerRecord; awards?: string[] }) | { aborted: true; player: PlayerRecord };
  function toMatchResult(result: ServerResult): MatchResult | null {
    const profile = structuredClone(deps.adopt(result.player));
    if ('aborted' in result) return null;
    const b = result.breakdown!;
    return { outcome: result.outcome, mmr: b.mmr, coins: b.coins, wager: b.wager, rankBefore: b.rankBefore, rankAfter: b.rankAfter, profile, awards: result.awards ?? [] };
  }

  const shop: Pick<ShopService, 'buy' | 'equip'> = {
    async buy(itemId) {
      const { player } = await deps.account<{ player: PlayerRecord }>('buy', { itemId });
      return structuredClone(deps.adopt(player));
    },
    async equip(itemId) {
      const { player } = await deps.account<{ player: PlayerRecord }>('equip', { itemId });
      return structuredClone(deps.adopt(player));
    },
  };

  const history: Pick<ProfileService, 'history' | 'publicHistory' | 'awards'> = {
    async awards(userId) {
      const { data, error } = await client.from('player_awards').select('award_id, earned_at').eq('player_id', userId);
      if (error) throw new ApiError('network', t('Could not reach the server. Check your connection.'));
      return data.map((a) => ({ id: a.award_id as string, earnedAt: a.earned_at as string }));
    },
    async history() {
      const { games } = await play<{ games: ResultRecord[] }>('history');
      return games.map(toRecord);
    },
    async publicHistory(userId) {
      if (userId === deps.me()) return (await this.history()).map((g) => ({ ...g, mmrDelta: null }));
      const { data, error } = await client
        .from('game_results')
        .select('game_id, kind, color, played_at, opponent_name, opponent_icon, opponent_rank, outcome, reason, moves, accuracy')
        .eq('player_id', userId)
        .order('played_at', { ascending: false })
        .limit(30);
      if (error) throw new ApiError('network', t('Could not reach the server. Check your connection.'));
      return (data as ResultRecord[]).map(toRecord);
    },
  };

  // ---------------------------------------------------------------- buying coins (Paddle)

  async function payments<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.functions.invoke<T>('payments', { body: { action, ...body } });
    if (!error) return data!;
    if (error instanceof FunctionsHttpError) {
      const payload = await (error.context as Response).json().catch(() => null);
      switch (payload?.code) {
        case 'unavailable':
          throw new ApiError('unavailable', t('Buying coins is not available yet.'));
        case 'unauthorized':
        case 'guest':
          throw new ApiError('unauthorized', t('Please sign in again.'));
        case 'not_ready':
          throw new ApiError('not_ready', t('Choose a username and an icon first.'));
        default:
          throw new ApiError('payment_failed', t('The payment could not be started. Please try again.'));
      }
    }
    throw new ApiError('network', t('Could not reach the server. Check your connection.'));
  }

  const coinPayments: PaymentsService = {
    available: paddleConfigured(),
    async checkout(packId) {
      const { transactionId } = await payments<{ transactionId: string }>('checkout', { pack: packId, waiver: true });
      return transactionId;
    },
    async status(transactionId) {
      const { status, player } = await payments<{ status: PurchaseStatus; player: PlayerRecord }>('status', { transactionId });
      deps.adopt(player);
      return status;
    },
  };

  // ---------------------------------------------------------------- puzzles

  async function puzzleCall<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    if (!deps.me()) await guestSession(client).catch(() => {}); // signed out: puzzles as this device's guest
    const { data, error } = await client.functions.invoke<T>('puzzles', { body: { action, ...body } });
    if (!error) return data!;
    if (error instanceof FunctionsHttpError) {
      const payload = await (error.context as Response).json().catch(() => null);
      switch (payload?.code) {
        case 'insufficient_coins':
          throw new ApiError('insufficient_coins', t('You do not have enough coins for this module.'));
        case 'locked':
          throw new ApiError('locked', t('Solve the puzzles before this one first.'));
        case 'wrong':
          throw new ApiError('wrong', t('That is not the solution.'));
        case 'not_started':
          throw new ApiError('not_started', t('Something went wrong. Please try again.'));
        case 'guest_limit':
        case 'guest':
          throw new ApiError('guest_limit', t('Create a free account to keep going.'));
        case 'too_fast':
          throw new ApiError('too_fast', t('That was quick. Take the lesson again a little slower.'));
        case 'shields_full':
          throw new ApiError('shields_full', t('You hold as many streak shields as you can.'));
        default:
          throw playError(payload?.code ?? 'server_error');
      }
    }
    throw new ApiError('network', t('Could not reach the server. Check your connection.'));
  }

  /** a guest's coins from their last answer (guests have no player state) */
  let guestState: { coins: number } | null = null;
  /** A puzzle answer carries the player's state, or a guest's coins. */
  function took<T extends { player?: PlayerRecord; guest?: { coins: number } }>(res: T): Omit<T, 'player' | 'guest'> {
    const { player, guest, ...rest } = res;
    if (player) deps.adopt(player);
    if (guest) guestState = guest;
    return rest;
  }

  const puzzles: PuzzlesService = {
    async progress() {
      return took(await puzzleCall<{ modules: PuzzleModuleProgress[]; player?: PlayerRecord; guest?: { coins: number } }>('progress')).modules;
    },
    async start(module, index) {
      await puzzleCall('start', { module, index });
    },
    async solve(module, index, moves, mistakes, hints) {
      return took(await puzzleCall<PuzzleSolve & { player?: PlayerRecord; guest?: { coins: number } }>('solve', { module, index, moves, mistakes, hints }));
    },
    async unlock(module) {
      const { modules, player } = await puzzleCall<{ modules: PuzzleModuleProgress[]; player: PlayerRecord }>('unlock', { module });
      deps.adopt(player);
      return modules;
    },
    async reveal(module, index) {
      const { modules } = await puzzleCall<{ modules: PuzzleModuleProgress[] }>('reveal', { module, index });
      return modules;
    },
    daily() {
      return puzzleCall<DailyPuzzle>('daily');
    },
    async dailyStart() {
      await puzzleCall('daily_start');
    },
    async dailySolve(moves, mistakes, hints) {
      return took(await puzzleCall<DailySolve & { player?: PlayerRecord; guest?: { coins: number } }>('daily_solve', { moves, mistakes, hints }));
    },
    async guest() {
      if (deps.me()) return null;
      if (!guestState) await puzzles.progress();
      return guestState && { ...guestState };
    },
    async buyShield() {
      return took(await puzzleCall<{ shields: number; player: PlayerRecord }>('shield_buy')).shields;
    },
    async claimGuest() {
      if (!deps.me()) return null;
      const token = await guestToken(SUPABASE_URL!, SUPABASE_KEY!).catch(() => null);
      if (!token) return null;
      const { claimed } = took(await puzzleCall<{ claimed: GuestClaim | null; player: PlayerRecord }>('claim', { guest: token }));
      forgetGuest();
      guestState = null;
      return claimed;
    },
  };

  const learn: LearnService = {
    async progress() {
      return took(await puzzleCall<LearnProgress & { player?: PlayerRecord; guest?: { coins: number } }>('learn'));
    },
    async done(lesson) {
      return took(await puzzleCall<LessonDone & { player?: PlayerRecord; guest?: { coins: number } }>('learn_done', { lesson }));
    },
    async unlock() {
      try {
        return took(await puzzleCall<LearnProgress & { player: PlayerRecord }>('learn_unlock'));
      } catch (err) {
        throw err instanceof ApiError && err.code === 'insufficient_coins' ? new ApiError(err.code, t('You do not have enough coins for these chapters.')) : err;
      }
    },
  };

  // ---------------------------------------------------------------- Premium and Game Review

  async function premiumCall<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.functions.invoke<T>('payments', { body: { action, ...body } });
    if (!error) return data!;
    if (error instanceof FunctionsHttpError) {
      const payload = await (error.context as Response).json().catch(() => null);
      switch (payload?.code) {
        case 'unavailable':
          throw new ApiError('unavailable', t('Premium is not available yet.'));
        case 'subscribed':
          throw new ApiError('subscribed', t('You already have Premium. Change your plan in Settings.'));
        case 'not_subscribed':
          throw new ApiError('not_subscribed', t('You have no Premium plan.'));
        case 'unauthorized':
        case 'guest':
          throw new ApiError('unauthorized', t('Please sign in again.'));
        case 'not_ready':
          throw new ApiError('not_ready', t('Choose a username and an icon first.'));
        default:
          throw new ApiError('payment_failed', t('The payment could not be started. Please try again.'));
      }
    }
    throw new ApiError('network', t('Could not reach the server. Check your connection.'));
  }

  /** The subscription's answers carry the player's state too. */
  async function premiumState(action: string, body: Record<string, unknown> = {}): Promise<PremiumState> {
    const { player, premium, trialUsed, given } = await premiumCall<PremiumState & { player: PlayerRecord }>(action, body);
    deps.adopt(player);
    return { premium, trialUsed, given };
  }

  const premium: PremiumService = {
    available: paddleConfigured(),
    checkout: 'paddle',
    state: () => premiumState('subscription'),
    async subscribe(plan, period) {
      return (await premiumCall<{ transactionId: string }>('subscribe', { plan, period, waiver: true })).transactionId;
    },
    change: (plan, period) => premiumState('change', { plan, period }),
    cancel: () => premiumState('cancel'),
    resume: () => premiumState('resume'),
    async manage() {
      return (await premiumCall<{ url: string }>('manage')).url;
    },
  };

  const reviews: ReviewService = {
    today: () => puzzleCall<{ used: number; limit: number | null }>('reviews'),
    start: (gameId) => puzzleCall<{ allowed: boolean; used: number; limit: number | null }>('review_start', { game: gameId }),
  };

  return { matchmaking, shop, history, payments: coinPayments, puzzles, learn, premium, reviews };
}
