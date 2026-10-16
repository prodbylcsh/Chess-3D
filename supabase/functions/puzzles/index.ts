// Puzzles: progress, solving and module unlocks (rules: ../_shared/puzzles.ts).
//
// POST { action: 'progress' }                                  → { modules, player }
// POST { action: 'start', module, index }                      → { ok } the player opened a puzzle
// POST { action: 'solve', module, index, moves, mistakes, hints } → { first, coins, hintCost, bonus, stars, solved, reward, player }
//      `moves`: the player's moves (UCI); the server checks them. Coins only for the first
//      solve, a bonus every 10 solved, and a reward (an item, or coins) for the 100th.
// POST { action: 'unlock', module }                            → { modules, player } pay MODULE_PRICE coins
//
// Registered, onboarded players only. Errors: { error, code } with an HTTP error status.
import { createClient, type User } from '@supabase/supabase-js';
import { AccountError } from '../_shared/accounts.ts';
import {
  BONUS_COINS,
  BONUS_EVERY,
  COMPLETION_COINS,
  MODULE_PRICE,
  PUZZLES_PER_MODULE,
  completionItem,
  moduleOf,
  solveCoins,
  solution,
  hintPenalty,
  solves,
  stars,
  MODULES,
} from '../_shared/puzzles.ts';
import { ITEMS } from '../_shared/shop.ts';
import { PUZZLES } from '../_shared/server/puzzle-data.ts';
import { ensurePlayer, getPlayer, publishShowcase } from '../_shared/server/competitive.ts';

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

/** A puzzle takes at least this long from opening it to the solve (no scripted farming). */
const MIN_SOLVE_MS = 2_000;

async function progress(me: string) {
  const [solves_, modules_] = await Promise.all([
    admin.from('puzzle_solves').select('module, idx, stars').eq('player_id', me),
    admin.from('puzzle_modules').select('*').eq('player_id', me),
  ]);
  if (solves_.error) throw solves_.error;
  if (modules_.error) throw modules_.error;
  return MODULES.map((m) => {
    const row = modules_.data.find((r) => r.module === m.id);
    const starsByIdx = Array.from({ length: PUZZLES_PER_MODULE }, () => 0);
    for (const s of solves_.data) if (s.module === m.id) starsByIdx[s.idx] = s.stars;
    return {
      id: m.id,
      unlocked: m.free || !!row?.unlocked_at,
      stars: starsByIdx,
      completedAt: row?.completed_at ?? null,
      reward: row?.completed_at ? { item: row.reward_item, coins: row.reward_coins } : null,
    };
  });
}

/** The module and puzzle a request is about, if the player may play it now. */
async function playable(me: string, body: Record<string, unknown>) {
  const module = moduleOf(body.module);
  const index = Number(body.index);
  if (!module || !Number.isInteger(index) || index < 0 || index >= PUZZLES_PER_MODULE) throw fail('bad_request', 'Unknown puzzle.');
  const mine = (await progress(me)).find((m) => m.id === module.id)!;
  if (!mine.unlocked) throw fail('locked', 'Unlock this module first.', 403);
  // one after another: solved puzzles can be replayed, the next one is open
  const next = mine.stars.findIndex((s) => s === 0);
  if (next !== -1 && index > next) throw fail('locked', 'Solve the puzzles before this one first.', 403);
  return { module, index, puzzle: PUZZLES[module.id][index] };
}

async function start(me: string, body: Record<string, unknown>) {
  const { module, index } = await playable(me, body);
  const { error } = await admin.from('puzzle_attempts').upsert({ player_id: me, module: module.id, idx: index, started_at: new Date().toISOString() });
  if (error) throw error;
  return { ok: true };
}

async function solve(me: string, body: Record<string, unknown>) {
  const { module, index, puzzle } = await playable(me, body);
  const { data: attempt, error } = await admin.from('puzzle_attempts').select('*').eq('player_id', me).maybeSingle();
  if (error) throw error;
  if (!attempt || attempt.module !== module.id || attempt.idx !== index || Date.now() - Date.parse(attempt.started_at) < MIN_SOLVE_MS) {
    throw fail('not_started', 'Open the puzzle first.', 409);
  }
  const moves = Array.isArray(body.moves) && body.moves.every((m) => typeof m === 'string') ? (body.moves as string[]) : [];
  if (!solves(puzzle, moves)) throw fail('wrong', 'That is not the solution.', 409);
  const count = (n: unknown) => Math.max(0, Math.min(99, Math.floor(Number(n) || 0)));
  const hints = count(body.hints);
  const earned = stars(count(body.mistakes), hints);

  await ensurePlayer(admin, me);
  const { data: result, error: e2 } = await admin.rpc('solve_puzzle', {
    p_player: me,
    p_module: module.id,
    p_idx: index,
    p_stars: earned,
    p_coins: solveCoins(puzzle.rating, hints, solution(puzzle).length),
    p_every: BONUS_EVERY,
    p_bonus: BONUS_COINS,
  });
  if (e2) throw e2;
  await admin.from('puzzle_attempts').delete().eq('player_id', me);

  let reward: { item: string | null; coins: number | null } | null = null;
  if (result.first && result.solved >= PUZZLES_PER_MODULE) {
    // the finishing reward: an item from the shop the player does not have yet
    const { data: owned, error: e3 } = await admin.from('player_items').select('item_id').eq('player_id', me);
    if (e3) throw e3;
    const lacking = ITEMS.filter((i) => i.forSale && !owned.some((o) => o.item_id === i.id)).map((i) => i.id);
    const item = completionItem(lacking);
    const { data: given, error: e4 } = await admin.rpc('complete_module', { p_player: me, p_module: module.id, p_item: item, p_coins: COMPLETION_COINS });
    if (e4) throw e4;
    if (given) reward = { item, coins: item ? null : COMPLETION_COINS };
  }
  const player = await getPlayer(admin, me);
  if (reward?.item) await publishShowcase(admin, player);
  const hintCost = result.first ? hintPenalty(hints, solution(puzzle).length) : 0;
  return { first: result.first, coins: result.coins, hintCost, bonus: result.bonus, stars: earned, solved: result.solved, reward, player };
}

async function unlock(me: string, body: Record<string, unknown>) {
  const module = moduleOf(body.module);
  if (!module) throw fail('bad_request', 'Unknown module.');
  if (module.free) throw fail('bad_request', 'This module is free.');
  await ensurePlayer(admin, me);
  const { error } = await admin.rpc('unlock_module', { p_player: me, p_module: module.id, p_price: MODULE_PRICE });
  if (error) {
    if (/cannot_unlock/.test(error.message)) throw fail('insufficient_coins', `You need ${MODULE_PRICE} coins.`, 409);
    throw error;
  }
  return { modules: await progress(me), player: await getPlayer(admin, me) };
}

async function handle(user: User, body: Record<string, unknown>): Promise<unknown> {
  const { data: profile, error } = await admin.from('profiles').select('onboarded_at').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!profile?.onboarded_at) throw fail('not_ready', 'Finish setting up your profile first.', 403);
  switch (body.action) {
    case 'progress': {
      const { player } = await ensurePlayer(admin, user.id);
      return { modules: await progress(user.id), player };
    }
    case 'start':
      return start(user.id, body);
    case 'solve':
      return solve(user.id, body);
    case 'unlock':
      return unlock(user.id, body);
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
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return reply({ error: 'Invalid JSON.', code: 'bad_request' }, 400);
  try {
    return reply(await handle(auth.user, body));
  } catch (err) {
    if (err instanceof AccountError) return reply({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return reply({ error: 'Server error.', code: 'server_error' }, 500);
  }
});
