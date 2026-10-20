// Matchmaking and results for ranked, casual and coin games.
//
// POST { action: 'search', kind, control, stake? } → { gameId } once matched, else { searching, waiting }
//      The app calls this every couple of seconds while the player searches.
// POST { action: 'leave' }                          → { left: true } (or { gameId } if matched meanwhile)
// POST { action: 'result', gameId }                 → { result } the player's result (settles if needed)
// POST { action: 'history' }                        → { games } the player's own games with MMR and coins
// POST { action: 'analysis', gameId, report? }       → { status, result? } the player's engine report of a
//      finished ranked or casual game (see _shared/analysis.ts); without a report just the status.
//      `result` (as for 'result') once both reports agreed and the performance part was added.
//
// Ranked searches answer `ranked_closed` until season 1 starts (SEASON_ONE in _shared/seasons.ts).
// Errors: { error, code } with an HTTP error status. Registered, onboarded players only.
// Rules: ../_shared/play.ts; matching itself is the SQL function mm_poll (atomic).
import { createClient, type User } from '@supabase/supabase-js';
import { AccountError } from '../_shared/accounts.ts';
import { STAKES, type StakeId } from '../_shared/economy.ts';
import { CONTROLS, isControl, kindOpen, type MatchKind } from '../_shared/play.ts';
import { rankedOpen } from '../_shared/seasons.ts';
import * as rules from '../_shared/rules.ts';
import type { GameRow } from '../_shared/rules.ts';
import { SERVER_SEASON_ONE, ensurePlayer, recordAnalysis, settleGame } from '../_shared/server/competitive.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const fail = (code: string, message: string, status = 400) => new AccountError(code, message, status);
const KINDS: readonly MatchKind[] = ['ranked', 'casual', 'wager'];

/** A matchmade game this player is still in, after ending it if its time ran out. */
async function runningGame(me: string): Promise<GameRow | null> {
  const { data, error } = await admin
    .from('games')
    .select('*')
    .in('kind', KINDS)
    .or(`white_id.eq.${me},black_id.eq.${me}`)
    .or('status.eq.active,settled_at.is.null')
    .neq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  for (const row of data as GameRow[]) {
    if (row.status === 'finished') {
      await settleGame(admin, row);
      continue;
    }
    // nobody claimed a game whose time is up (both left): end it now
    try {
      const patch = rules.claim(row, me);
      const { data: ended } = await admin
        .from('games')
        .update({ ...patch, version: row.version + 1, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('version', row.version)
        .select()
        .maybeSingle();
      if (ended) await settleGame(admin, ended as GameRow);
    } catch (err) {
      if (err instanceof rules.RuleError && err.code === 'not_yet') return row;
      throw err;
    }
  }
  return null;
}

async function search(user: User, body: Record<string, unknown>): Promise<unknown> {
  const kind = body.kind as MatchKind;
  if (!KINDS.includes(kind)) throw fail('bad_request', 'Unknown game kind.');
  if (!kindOpen(kind, rankedOpen(new Date(), SERVER_SEASON_ONE))) throw fail('ranked_closed', 'Ranked games are not open yet.', 403);
  if (!isControl(kind, body.control)) throw fail('bad_request', 'That time control is not available here.');
  const stakeId = body.stake as StakeId | undefined;
  if (kind === 'wager' && !(stakeId && stakeId in STAKES)) throw fail('bad_request', 'Choose a stake.');
  const stake = kind === 'wager' ? STAKES[stakeId!].amount : null;

  const running = await runningGame(user.id);
  if (running) return { gameId: running.id, resumed: true };

  const { player } = await ensurePlayer(admin, user.id);
  if (stake && player.coins < stake) throw fail('insufficient_coins', `You need ${stake} coins for this stake.`, 409);

  const { data: gameId, error } = await admin.rpc('mm_poll', {
    p_player: user.id,
    p_kind: kind,
    p_control: body.control,
    p_stake: stake,
    p_mmr: player.mmr,
    p_base_ms: CONTROLS[body.control as keyof typeof CONTROLS].baseMs,
  });
  if (error) {
    if (/insufficient_coins/.test(error.message)) throw fail('insufficient_coins', `You need ${stake} coins for this stake.`, 409);
    throw error;
  }
  if (gameId) return { gameId };
  const { count } = await admin.from('mm_queue').select('player_id', { count: 'exact', head: true }).eq('kind', kind);
  return { searching: true, waiting: count ?? 1 };
}

async function leave(me: string): Promise<unknown> {
  const { data, error } = await admin.from('mm_queue').delete().eq('player_id', me).select('game_id').maybeSingle();
  if (error) throw error;
  return data?.game_id ? { gameId: data.game_id } : { left: true };
}

async function result(me: string, gameId: unknown): Promise<unknown> {
  if (typeof gameId !== 'string') throw fail('not_found', 'Game not found.', 404);
  const { data: row, error } = await admin.from('games').select('*').eq('id', gameId).maybeSingle();
  if (error) throw error;
  if (!row || (row.white_id !== me && row.black_id !== me)) throw fail('not_found', 'Game not found.', 404);
  if (row.status !== 'finished') throw fail('not_finished', 'The game is still running.', 409);
  await settleGame(admin, row as GameRow);
  const { player } = await ensurePlayer(admin, me);
  if (row.result === null) return { result: { aborted: true, player } };
  const [{ data: mine, error: e2 }, { data: awards, error: e3 }] = await Promise.all([
    admin.from('game_results').select('*').eq('game_id', gameId).eq('player_id', me).single(),
    admin.from('player_awards').select('award_id').eq('game_id', gameId).eq('player_id', me),
  ]);
  if (e2) throw e2;
  if (e3) throw e3;
  return { result: { ...mine, player, awards: awards.map((a) => a.award_id) } };
}

async function analysis(me: string, gameId: unknown, report: unknown): Promise<unknown> {
  if (typeof gameId !== 'string') throw fail('not_found', 'Game not found.', 404);
  const { data: row, error } = await admin.from('games').select('*').eq('id', gameId).maybeSingle();
  if (error) throw error;
  const color = row && rules.seatOf(row as GameRow, me);
  if (!row || !color) throw fail('not_found', 'Game not found.', 404);
  if (row.status !== 'finished') throw fail('not_finished', 'The game is still running.', 409);
  await settleGame(admin, row as GameRow);
  let status;
  try {
    status = await recordAnalysis(admin, row as GameRow, color, report);
  } catch (err) {
    if ((err as Error).message === 'bad_report') throw fail('bad_request', 'That analysis does not fit the game.');
    throw err;
  }
  if (status !== 'applied') return { status };
  return { status, ...(await result(me, gameId)) };
}

async function history(me: string): Promise<unknown> {
  const { data, error } = await admin.from('game_results').select('*').eq('player_id', me).order('played_at', { ascending: false }).limit(100);
  if (error) throw error;
  return { games: data };
}

async function handle(user: User, body: Record<string, unknown>): Promise<unknown> {
  const { data: profile, error } = await admin.from('profiles').select('onboarded_at').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!profile?.onboarded_at) throw fail('not_ready', 'Finish setting up your profile first.', 403);
  switch (body.action) {
    case 'search':
      return search(user, body);
    case 'leave':
      return leave(user.id);
    case 'result':
      return result(user.id, body.gameId);
    case 'history':
      return history(user.id);
    case 'analysis':
      return analysis(user.id, body.gameId, body.report);
    default:
      throw fail('bad_request', 'Unknown action.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed', code: 'bad_request' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return reply({ error: 'Please sign in again.', code: 'unauthorized' }, 401);
  if (auth.user.is_anonymous) return reply({ error: 'Create an account first.', code: 'guest' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid JSON.', code: 'bad_request' }, 400);
  }

  try {
    return reply(await handle(auth.user, body));
  } catch (err) {
    if (err instanceof AccountError) return reply({ error: err.message, code: err.code }, err.status);
    if (err instanceof rules.RuleError) return reply({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return reply({ error: 'Server error.', code: 'server_error' }, 500);
  }
});
