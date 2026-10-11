// Server-only helpers for the competitive back-end (Deno; the app never imports this):
// loading a player's state with the lazy season rollover, and settling finished
// matchmade games. The numbers come from the pure rules in ../play.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { newPlayer, rollSeasons, settle, type PlayerState, type SeasonGrant } from '../play.ts';
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

  const settlements = settle({
    kind: row.kind,
    stake: row.stake ?? null,
    result: row.result,
    plies: row.moves.length,
    white,
    black,
  });

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

  const { error: rpcError } = await admin.rpc('settle_game', { p_game: row.id, p_rows: rows });
  if (rpcError) throw rpcError;
}
