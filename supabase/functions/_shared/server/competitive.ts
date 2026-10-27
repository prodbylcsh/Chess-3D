// Server-only helpers for the competitive back-end (Deno; the app never imports this):
// loading a player's state with the lazy season rollover, and settling finished
// matchmade games. The numbers come from the pure rules in ../play.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ANALYSIS, accuracies, isReport, sameReport, type AnalysisReport, type AnalysisStatus } from '../analysis.ts';
import { gameSignals, review, reviewMmr, FAIRPLAY } from '../fairplay.ts';
import { newPlayer, performanceAdjustment, rollSeasons, settle, type FinishedGame, type PlayerState, type SeasonGrant, type Side } from '../play.ts';
import { awardsMet } from '../awards.ts';
import { rankOf } from '../rating.ts';
import { SEASON_ONE, parseMonth, rankedOpen, type Month } from '../seasons.ts';
import type { GameRow } from '../rules.ts';
import { showcaseOf } from '../social.ts';
import { DEFAULT_LOADOUT, FREE_ITEMS, itemDef } from '../shop.ts';
import { canUse } from '../subscription.ts';
import { applyPremium, subscriptionsOf, viewOf, type PremiumView } from './premium.ts';

export interface PlayerRow extends PlayerState {
  /** items bought or won (the `player_items` table; free items are not listed) */
  inventory: string[];
  loadout: Record<string, string>;
  badges: string[];
  /** the Premium plan the player has now (docs/PLATFORM.md §4.9), or null */
  premium: PremiumView | null;
  /** had a subscription before: no second free trial */
  trial_used: boolean;
}

const UNIQUE_VIOLATION = '23505';

/**
 * Start of season 1 and of ranked on this server: SEASON_ONE, unless the environment sets
 * `SEASON_ONE` ('2026-07', or 'none' for closed). The local stack sets it so the e2e tests
 * cover ranked and season ends while ranked is closed live.
 */
export const SERVER_SEASON_ONE: Month | null = (() => {
  const env = Deno.env.get('SEASON_ONE');
  return env ? parseMonth(env) : SEASON_ONE;
})();

export function rankInfo(mmr: number) {
  const r = rankOf(mmr);
  return { tier: r.tier.id, division: r.division, label: r.label, progress: r.progress };
}

async function loadPlayer(admin: SupabaseClient, id: string): Promise<PlayerRow | null> {
  const [player, items, subs] = await Promise.all([
    admin.from('players').select('*').eq('id', id).maybeSingle(),
    admin.from('player_items').select('item_id').eq('player_id', id).order('acquired_at'),
    subscriptionsOf(admin, id),
  ]);
  if (player.error) throw player.error;
  if (items.error) throw items.error;
  if (!player.data) return null;
  return { ...player.data, inventory: items.data.map((i) => i.item_id as string), premium: viewOf(subs.live), trial_used: subs.all.length > 0 } as PlayerRow;
}

const premiumBadge = (p: PlayerRow) => (p.premium ? { plan: p.premium.plan, founder: p.premium.founder } : null);

/** A player's current state (after `ensurePlayer` created it). */
export async function getPlayer(admin: SupabaseClient, id: string): Promise<PlayerRow> {
  const player = await loadPlayer(admin, id);
  if (!player) throw new Error('player not found');
  return player;
}

/** Publish what other players see of this player (rank, stats, items in use). */
export async function publishShowcase(admin: SupabaseClient, player: PlayerRow): Promise<void> {
  const { error } = await admin.from('profiles').update({ showcase: showcaseOf(player, player.loadout, premiumBadge(player)) }).eq('id', player.id);
  if (error) throw error;
}

/**
 * The player's competitive state: created on first use (everyone starts fresh), with
 * any season ends since the last visit applied (rewards, MMR reset). `grants` lists
 * the season rewards just handed out.
 */
export async function ensurePlayer(admin: SupabaseClient, id: string, now = new Date()): Promise<{ player: PlayerRow; grants: SeasonGrant[] }> {
  let player = await loadPlayer(admin, id);
  if (!player) {
    const { error } = await admin.from('players').insert(newPlayer(id, now, SERVER_SEASON_ONE));
    if (error && error.code !== UNIQUE_VIOLATION) throw error;
    player = (await loadPlayer(admin, id))!;
    await publishShowcase(admin, player);
  }
  // the monthly coins a subscription owes, and items of the Wardrobe that are no longer in it
  const premium = await applyPremium(admin, id, now.getTime());
  if (premium.granted || (await tidyLoadout(admin, player, now))) {
    player = (await loadPlayer(admin, id))!;
    await publishShowcase(admin, player);
  }
  const { after, grants } = rollSeasons(player, player.inventory, now, SERVER_SEASON_ONE);
  if (after.season === player.season) return { player, grants };
  const { data: applied, error } = await admin.rpc('apply_seasons', {
    p_player: id,
    p_from: player.season,
    p_state: after,
    p_grants: grants,
  });
  if (error) throw error;
  player = (await loadPlayer(admin, id))!;
  await publishShowcase(admin, player);
  return { player, grants: applied ? grants : [] };
}

/** Whether the player may use an item now: owned, free, or in the Archmage's Wardrobe. */
export function mayUse(player: PlayerRow, itemId: string, now = Date.now()): boolean {
  const def = itemDef(itemId);
  if (!def) return false;
  const owned = FREE_ITEMS.includes(itemId) || player.inventory.includes(itemId);
  return canUse(def, owned, player.premium?.plan ?? null, now);
}

/**
 * Items in use that the player may no longer use (the Wardrobe ended with the plan) go back
 * to the standard ones. Returns whether anything changed.
 */
async function tidyLoadout(admin: SupabaseClient, player: PlayerRow, now: Date): Promise<boolean> {
  const loadout = { ...DEFAULT_LOADOUT, ...player.loadout } as Record<string, string>;
  let changed = false;
  for (const [slot, id] of Object.entries(loadout)) {
    if (!mayUse(player, id, now.getTime())) {
      loadout[slot] = DEFAULT_LOADOUT[slot as keyof typeof DEFAULT_LOADOUT];
      changed = true;
    }
  }
  // a Wardrobe icon too (only someone who had a plan can have one)
  if (player.trial_used && !player.premium?.plan) {
    const { data, error } = await admin.from('profiles').select('icon_id').eq('id', player.id).maybeSingle();
    if (error) throw error;
    if (data?.icon_id && !mayUse(player, data.icon_id, now.getTime())) {
      const { error: e2 } = await admin.from('profiles').update({ icon_id: 'king' }).eq('id', player.id);
      if (e2) throw e2;
    }
  }
  if (!changed) return false;
  const { error } = await admin.from('players').update({ loadout }).eq('id', player.id);
  if (error) throw error;
  return true;
}

/** Settle a finished matchmade game once: MMR, coins, stats, results, ledger, showcases. */
export async function settleGame(admin: SupabaseClient, row: GameRow): Promise<void> {
  if (!row.kind || row.kind === 'friend' || row.status !== 'finished' || row.settled_at) return;
  if (!row.white_id || !row.black_id) return;
  const [{ player: white }, { player: black }] = await Promise.all([ensurePlayer(admin, row.white_id), ensurePlayer(admin, row.black_id)]);
  const { data: profiles, error } = await admin.from('profiles').select('id, username, icon_id').in('id', [white.id, black.id]);
  if (error) throw error;
  const profile = (id: string) => profiles!.find((p) => p.id === id);

  const game: FinishedGame = {
    kind: row.kind,
    stake: row.stake ?? null,
    result: row.result,
    plies: row.moves.length,
    white: stateOf(white),
    black: stateOf(black),
  };
  const settlements = settle(game);

  const rows = settlements.map((s) => {
    const me = s.color === 'w' ? white : black;
    const opponent = s.color === 'w' ? black : white;
    const result = s.outcome && {
      kind: row.kind,
      color: s.color,
      opponent_id: opponent.id,
      opponent_name: profile(opponent.id)?.username ?? 'Player',
      opponent_icon: profile(opponent.id)?.icon_id ?? 'guest',
      opponent_rank: rankOf(opponent.mmr).label,
      outcome: s.outcome,
      reason: row.reason ?? 'unknown',
      moves: row.moves.length,
      accuracy: null,
      mmr_delta: s.mmr?.total ?? null,
      coins_delta: s.coinsDelta,
      breakdown: { mmr: s.mmr, coins: s.coins, wager: s.wager, rankBefore: rankInfo(me.mmr), rankAfter: rankInfo(s.after.mmr) },
    };
    return {
      player_id: s.playerId,
      credit: s.credit,
      state: s.after,
      showcase: showcaseOf(s.after, me.loadout, premiumBadge(me)),
      result,
    };
  });

  const { data: settled, error: rpcError } = await admin.rpc('settle_game', { p_game: row.id, p_rows: rows });
  if (rpcError) throw rpcError;
  if (settled) {
    for (const st of settlements) {
      if (!st.outcome) continue;
      await grantAwards(admin, st.playerId, awardsMet(st.after, { outcome: st.outcome, reason: row.reason ?? '', plies: row.moves.length }), row.id);
    }
  }
  // the players' browsers analyse the game next; their reports add the performance part
  // (coin games: just the accuracy) and give the fair-play signals (_shared/fairplay.ts)
  if (settled && row.result) {
    const { error } = await admin.from('game_analysis').insert({ game_id: row.id, game });
    if (error && error.code !== UNIQUE_VIOLATION) throw error;
  }
}

/** Give a player the awards they have met (each once, kept with the game that earned it). */
export async function grantAwards(admin: SupabaseClient, playerId: string, awards: string[], gameId: string | null): Promise<void> {
  if (!awards.length) return;
  const { error } = await admin.rpc('grant_awards', { p_player: playerId, p_awards: awards, p_game: gameId });
  if (error) throw error;
}

/** The settlement's view of a player (no inventory, loadout or badges). */
const stateOf = (p: PlayerRow): PlayerState => ({
  id: p.id,
  mmr: p.mmr,
  coins: p.coins,
  wins: p.wins,
  losses: p.losses,
  draws: p.draws,
  win_streak: p.win_streak,
  ranked_streak: p.ranked_streak,
  best_streak: p.best_streak,
  season: p.season,
  season_peak_mmr: p.season_peak_mmr,
});

interface AnalysisRow {
  game_id: string;
  game: FinishedGame;
  reports: Partial<Record<Side, AnalysisReport>>;
  status: 'waiting' | 'applied' | 'mismatch';
  created_at: string;
}

/**
 * A player's engine report for a settled game (or, without a report, just the state of
 * its analysis). When both reports are in, the game is decided: identical reports add each
 * player's performance part (MMR, coins, accuracy on the result), different ones change
 * nothing. Returns the state as the player sees it.
 */
export async function recordAnalysis(admin: SupabaseClient, row: GameRow, color: Side, report: unknown): Promise<AnalysisStatus> {
  const read = async (): Promise<AnalysisRow | null> => {
    if (report === undefined) {
      const { data, error } = await admin.from('game_analysis').select('*').eq('game_id', row.id).maybeSingle();
      if (error) throw error;
      return data as AnalysisRow | null;
    }
    if (!isReport(report, row.moves.length)) throw new Error('bad_report');
    const { data, error } = await admin.rpc('analysis_report', { p_game: row.id, p_color: color, p_report: report });
    if (error) throw error;
    return ((data as AnalysisRow[])[0] ?? null);
  };
  const analysis = await read();
  if (!analysis) return 'none';
  if (analysis.status !== 'waiting') return analysis.status;
  // fair play never stands in the way of the player's own result
  if (report !== undefined) await recordFairPlay(admin, row, analysis).catch((err) => console.error('fair play', err));
  const { w, b } = analysis.reports;
  if (!w || !b) return Date.now() - Date.parse(analysis.created_at) > ANALYSIS.windowMs ? 'expired' : 'waiting';

  if (!sameReport(w, b)) {
    await admin.rpc('apply_analysis', { p_game: row.id, p_status: 'mismatch', p_rows: [] });
    return 'mismatch';
  }
  const accuracy = accuracies(w.scores);
  const rounded = { w: accuracy.w === null ? null : Math.round(accuracy.w), b: accuracy.b === null ? null : Math.round(accuracy.b) };
  const game = analysis.game;
  const rows = performanceAdjustment(game, accuracy).map((a) => {
    const me = a.color === 'w' ? game.white : game.black;
    // a coin game pays its stake whatever the accuracy: the analysis only shows the accuracy
    if (game.kind === 'wager') return { player_id: a.playerId, season: me.season, accuracy: rounded[a.color], mmr_delta: 0, coins_delta: 0, result: {} };
    return {
      player_id: a.playerId,
      season: me.season,
      accuracy: rounded[a.color],
      mmr_delta: a.mmrDelta,
      coins_delta: a.coinsDelta,
      result: {
        mmr_delta: a.mmr?.total ?? null,
        coins_delta: a.coins?.total ?? 0,
        breakdown: { mmr: a.mmr, coins: a.coins, ...(a.mmr ? { rankAfter: rankInfo(a.mmr.mmrAfter) } : {}) },
      },
    };
  });
  const { data: applied, error: applyError } = await admin.rpc('apply_analysis', { p_game: row.id, p_status: 'applied', p_rows: rows });
  if (applyError) throw applyError;
  if (applied && game.kind !== 'wager') {
    await Promise.all(
      rows.map(async (r) => {
        const player = await getPlayer(admin, r.player_id);
        await publishShowcase(admin, player);
        // precision, and a rank the performance part may have reached
        await grantAwards(admin, r.player_id, awardsMet(player, { accuracy: r.accuracy }), row.id);
      }),
    );
  }
  return 'applied';
}

/**
 * The fair-play signals of a game whenever a report comes in, and each player's review over
 * their recent games (docs/PLATFORM.md §6.4). A player is judged by the agreed analysis, or
 * until then (or when the two differ) by the opponent's report: a player who hides or alters
 * their own report is still analysed. The away times are always the player's own.
 */
async function recordFairPlay(admin: SupabaseClient, row: GameRow, analysis: AnalysisRow): Promise<void> {
  const { w, b } = analysis.reports;
  const agreed = !!w && !!b && sameReport(w, b);
  for (const color of ['w', 'b'] as const) {
    const playerId = color === 'w' ? row.white_id : row.black_id;
    const source = agreed ? (w!.best ? w! : b!) : analysis.reports[color === 'w' ? 'b' : 'w'];
    if (!playerId || !source?.best) continue;
    const signals = gameSignals({
      moves: row.moves,
      scores: source.scores,
      best: source.best,
      color,
      moveMs: row.move_ms ?? null,
      away: analysis.reports[color]?.away ?? null,
    });
    const me = color === 'w' ? analysis.game.white : analysis.game.black;
    const { error } = await admin.from('fairplay_games').upsert({
      game_id: row.id,
      player_id: playerId,
      kind: analysis.game.kind,
      mmr: me.mmr,
      source: agreed ? 'agreed' : 'opponent',
      signals,
      played_at: analysis.created_at,
    });
    if (error) throw error;

    // the bar follows the player's MMR once ranked runs and they have played enough of it
    const [recent, player, ranked] = await Promise.all([
      admin.from('fairplay_games').select('signals, source').eq('player_id', playerId).order('played_at', { ascending: false }).limit(FAIRPLAY.window),
      admin.from('players').select('mmr').eq('id', playerId).single(),
      admin.from('game_results').select('game_id', { count: 'exact', head: true }).eq('player_id', playerId).eq('kind', 'ranked'),
    ]);
    if (recent.error) throw recent.error;
    if (player.error) throw player.error;
    if (ranked.error) throw ranked.error;
    const mmr = reviewMmr(player.data.mmr, rankedOpen(new Date(), SERVER_SEASON_ONE), ranked.count ?? 0);
    const r = review(recent.data as Parameters<typeof review>[0], mmr);
    const { error: e3 } = await admin.rpc('fairplay_flag', { p_player: playerId, p_level: r.level, p_reasons: r.reasons, p_stats: r.stats });
    if (e3) throw e3;
  }
}
