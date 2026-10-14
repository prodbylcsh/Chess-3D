// Server-only helpers for the competitive back-end (Deno; the app never imports this):
// loading a player's state with the lazy season rollover, and settling finished
// matchmade games. The numbers come from the pure rules in ../play.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ANALYSIS, accuracies, isReport, sameReport, type AnalysisReport, type AnalysisStatus } from '../analysis.ts';
import { newPlayer, performanceAdjustment, rollSeasons, settle, type FinishedGame, type PlayerState, type SeasonGrant, type Side } from '../play.ts';
import { awardsMet } from '../awards.ts';
import { rankOf } from '../rating.ts';
import type { GameRow } from '../rules.ts';
import { showcaseOf } from '../social.ts';

export interface PlayerRow extends PlayerState {
  /** items bought or won (the `player_items` table; free items are not listed) */
  inventory: string[];
  loadout: Record<string, string>;
  badges: string[];
}

const UNIQUE_VIOLATION = '23505';

export function rankInfo(mmr: number) {
  const r = rankOf(mmr);
  return { tier: r.tier.id, division: r.division, label: r.label, progress: r.progress };
}

async function loadPlayer(admin: SupabaseClient, id: string): Promise<PlayerRow | null> {
  const [player, items] = await Promise.all([
    admin.from('players').select('*').eq('id', id).maybeSingle(),
    admin.from('player_items').select('item_id').eq('player_id', id).order('acquired_at'),
  ]);
  if (player.error) throw player.error;
  if (items.error) throw items.error;
  return player.data ? ({ ...player.data, inventory: items.data.map((i) => i.item_id as string) } as PlayerRow) : null;
}

/** A player's current state (after `ensurePlayer` created it). */
export async function getPlayer(admin: SupabaseClient, id: string): Promise<PlayerRow> {
  const player = await loadPlayer(admin, id);
  if (!player) throw new Error('player not found');
  return player;
}

/** Publish what other players see of this player (rank, stats, items in use). */
export async function publishShowcase(admin: SupabaseClient, player: PlayerRow): Promise<void> {
  const { error } = await admin.from('profiles').update({ showcase: showcaseOf(player, player.loadout) }).eq('id', player.id);
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
    const { error } = await admin.from('players').insert(newPlayer(id, now));
    if (error && error.code !== UNIQUE_VIOLATION) throw error;
    player = (await loadPlayer(admin, id))!;
    await publishShowcase(admin, player);
  }
  const { after, grants } = rollSeasons(player, player.inventory, now);
  if (grants.length === 0) return { player, grants };
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
      showcase: showcaseOf(s.after, me.loadout),
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
  if (settled && row.result && (row.kind === 'ranked' || row.kind === 'casual')) {
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
  if (applied) {
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
