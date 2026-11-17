// Puzzles: progress, solving and module unlocks (rules: ../_shared/puzzles.ts), and the
// lessons of Learn (../_shared/learn.ts).
//
// POST { action: 'progress' }                                  → { modules, player }
// POST { action: 'start', module, index }                      → { ok, attempt, next } the player opened a puzzle
// POST { action: 'move', module, index, move }                  → { kind: right | alternative | wrong, …, mistakes, hints }
//      a move (UCI) in the open puzzle (`module: 'daily'`: today's). The solutions never leave
//      the server (audit, November 2026): it judges each move, plays the reply, counts mistakes.
// POST { action: 'hint', module, index }                        → { hint: { marks, hints } | null }
// POST { action: 'solve', module, index }                       → { first, coins, hintCost, bonus, stars, solved, reward, line, player }
//      the attempt is complete; stars and coins from what the server counted. Coins only for
//      the first solve, a bonus every 10 solved, and a reward (an item, or coins) for the 100th.
// POST { action: 'unlock', module }                            → { modules, player } pay MODULE_PRICE coins
// POST { action: 'reveal', module, index }                     → { modules, line } show the solution: the puzzle
//      counts as seen (no coins, no stars), the next one opens; a later solve (a review) pays
// POST { action: 'daily' }                                     → { day, module, index, solved, streak }
// POST { action: 'daily_start' }                               → { ok, attempt, next }
// POST { action: 'daily_solve' }                                → { coins, hintCost, stars, already, streak, milestone, line, player }
//
// POST { action: 'learn' }                                     → { lessons, unlocked, rewarded, player | guest }
// POST { action: 'learn_done', lesson, steps }                 → { first, chapterDone, reward, …progress } a lesson
//      was finished: in order, in an open chapter; `steps` (each step's kept moves and quiz answer)
//      is replayed on the lesson's boards first; the last lesson of a chapter pays CHAPTER_REWARD once
// POST { action: 'learn_unlock' }                              → { …progress } the paid chapters for LEARN_PRICE
// POST { action: 'claim', guest }                              → { claimed, player } move a guest's puzzles
//      (`guest`: the access token of this device's anonymous session) into this account
// POST { action: 'shield_buy' }                                 → { shields, player } a streak shield for SHIELD_PRICE
// POST { action: 'reviews' }                                    → { used, limit } today's Game Reviews (limit null: unlimited)
// POST { action: 'review_start', game }                         → { allowed, used, limit } start the Game Review of a game
//
// Premium (../_shared/subscription.ts): any plan opens every module and the paid Learn chapters
// and makes hints free; streak shields keep a streak over missed days (used when the player
// next shows up).
//
// Stars of a replayed puzzle improve only after REVIEW_AFTER_HOURS without trying it (`counted`).
//
// Registered, onboarded players; guests (anonymous sessions) may play the first GUEST_PUZZLES
// of the free module and the daily puzzle. A guest has no player row: what they earn is in the
// ledger, and their answers carry `guest: { coins }` instead of `player`; 'claim' pays it to
// the account by the account's rules. Errors: { error, code } with an HTTP error status.
import { createClient, type User } from '@supabase/supabase-js';
import { AccountError } from '../_shared/accounts.ts';
import {
  BONUS_COINS,
  BONUS_EVERY,
  COMPLETION_COINS,
  MODULE_PRICE,
  REVIEW_AFTER_HOURS,
  STREAK_MILESTONES,
  dailyCoins,
  dailyPuzzle,
  dayOf,
  liveStreak,
  reviewFrom,
  type Streak,
  PUZZLES_PER_MODULE,
  completionItem,
  moduleOf,
  solveCoins,
  solution,
  hintPenalty,
  solves,
  stars,
  MODULES,
  guestMayPlay,
} from '../_shared/puzzles.ts';
import { CHAPTER_REWARD, LEARN_PRICE, MIN_LESSON_MS, lessonOf, lessonOpen } from '../_shared/learn.ts';
import { LESSONS } from '../_shared/learn-lessons.ts';
import { checkLesson, stepRecords } from '../_shared/learn-check.ts';
import { ITEMS } from '../_shared/shop.ts';
import { SHIELD_PRICE, activePlan, hintsFree, learnUnlocked, moduleOpen, released, reviewsPerDay, shieldCap, type PlanId } from '../_shared/subscription.ts';
import { subscriptionsOf } from '../_shared/server/premium.ts';
import { ALTERNATIVES, PUZZLES } from '../_shared/server/puzzle-data.ts';
import { AttemptError, attemptState, freshAttempt, nextOf, playMove, takeHint, type AttemptState } from '../_shared/puzzle-attempt.ts';
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

/** The Premium plan the player has now (guests have none). */
async function planNow(me: string): Promise<PlanId | null> {
  return activePlan((await subscriptionsOf(admin, me)).live);
}

async function progress(me: string, plan?: PlanId | null) {
  const [solves_, modules_, plan_] = await Promise.all([
    admin.from('puzzle_solves').select('module, idx, stars, tried_at').eq('player_id', me),
    admin.from('puzzle_modules').select('*').eq('player_id', me),
    plan === undefined ? planNow(me) : plan,
  ]);
  if (solves_.error) throw solves_.error;
  if (modules_.error) throw modules_.error;
  // a module waiting for its release date shows early with Archmage
  return MODULES.filter((m) => released(m.releaseAt, plan_)).map((m) => {
    const row = modules_.data.find((r) => r.module === m.id);
    const starsByIdx = Array.from({ length: PUZZLES_PER_MODULE }, () => 0);
    const seen = Array.from({ length: PUZZLES_PER_MODULE }, () => false);
    const review = Array.from({ length: PUZZLES_PER_MODULE }, (): string | null => null);
    for (const s of solves_.data) {
      if (s.module !== m.id) continue;
      starsByIdx[s.idx] = s.stars;
      seen[s.idx] = s.stars === 0;
      review[s.idx] = reviewFrom(s.stars, s.tried_at);
    }
    return {
      id: m.id,
      unlocked: moduleOpen(m.free, !!row?.unlocked_at, plan_),
      bought: m.free || !!row?.unlocked_at,
      stars: starsByIdx,
      seen,
      reviewFrom: review,
      completedAt: row?.completed_at ?? null,
      reward: row?.completed_at ? { item: row.reward_item, coins: row.reward_coins } : null,
    };
  });
}

/** The module and puzzle a request is about, if the player may play it now. */
async function playable(me: string, body: Record<string, unknown>, guest = false) {
  const module = moduleOf(body.module);
  const index = Number(body.index);
  if (!module || !Number.isInteger(index) || index < 0 || index >= PUZZLES_PER_MODULE) throw fail('bad_request', 'Unknown puzzle.');
  if (guest && !guestMayPlay(module.id, index)) throw fail('guest_limit', 'Create a free account to keep going.', 403);
  const plan = guest ? null : await planNow(me);
  const mine = (await progress(me, plan)).find((m) => m.id === module.id);
  if (!mine?.unlocked) throw fail('locked', 'Unlock this module first.', 403);
  // one after another: solved (or seen) puzzles can be replayed, the next one is open
  const next = mine.stars.findIndex((s, i) => s === 0 && !mine.seen[i]);
  if (next !== -1 && index > next) throw fail('locked', 'Solve the puzzles before this one first.', 403);
  return { module, index, puzzle: PUZZLES[module.id][index], plan };
}

/** Attempts opened and left this long ago are cleared away. */
const STALE_ATTEMPT_MS = 2 * 86_400_000;

/**
 * Open an attempt at one puzzle (`module` is "daily:<module>" for the daily puzzle, with its
 * `day`). Each puzzle has its own attempt, so another tab's puzzle doesn't overwrite it.
 */
async function openAttempt(me: string, module: string, idx: number, day: string | null): Promise<string> {
  const cleared = await admin.from('puzzle_attempts').delete().eq('player_id', me).lt('started_at', new Date(Date.now() - STALE_ATTEMPT_MS).toISOString());
  if (cleared.error) throw cleared.error;
  const { data, error } = await admin
    .from('puzzle_attempts')
    .upsert(
      { player_id: me, module, idx, day, id: crypto.randomUUID(), started_at: new Date().toISOString(), state: freshAttempt(), rev: 0 },
      { onConflict: 'player_id,module,idx' },
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

interface Attempt {
  id: string;
  started_at: string;
  day: string | null;
  rev: number;
  state: AttemptState;
}

/** The open attempt at this puzzle, if it was opened at least `minMs` ago. */
async function attemptAt(me: string, module: string, idx: number, minMs: number): Promise<Attempt> {
  const { data, error } = await admin.from('puzzle_attempts').select('id, started_at, day, rev, state').eq('player_id', me).eq('module', module).eq('idx', idx).maybeSingle();
  if (error) throw error;
  if (!data || Date.now() - Date.parse(data.started_at) < minMs) throw fail('not_started', 'Open the puzzle first.', 409);
  return { ...data, state: attemptState(data.state) } as Attempt;
}

/** Store the attempt's new state, unless another request changed it first (then: try again). */
async function saveAttempt(me: string, attempt: Attempt, state: AttemptState): Promise<void> {
  const { data, error } = await admin
    .from('puzzle_attempts')
    .update({ state, rev: attempt.rev + 1 })
    .eq('player_id', me)
    .eq('id', attempt.id)
    .eq('rev', attempt.rev)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw fail('busy', 'The puzzle is busy, please try again.', 409);
}

/**
 * The puzzle a move or hint is about: a module's (checked like opening it) or, for
 * `module: 'daily'`, today's daily puzzle (its attempt must be today's).
 */
async function target(me: string, body: Record<string, unknown>, guest: boolean) {
  if (body.module === DAILY) {
    const day = dayOf();
    const { module, index } = dailyPuzzle(day);
    const attempt = await attemptAt(me, `${DAILY}:${module}`, index, 0).catch(async (err) => {
      throw (await dailyChanged(me, day)) ? fail('day_changed', 'A new daily puzzle is out.', 409) : err;
    });
    if (attempt.day !== day) throw fail('day_changed', 'A new daily puzzle is out.', 409);
    return { module, index, puzzle: PUZZLES[module][index], attempt };
  }
  const { module, index, puzzle } = await playable(me, body, guest);
  return { module: module.id, index, puzzle, attempt: await attemptAt(me, module.id, index, 0) };
}

/** A daily attempt of an earlier day is open (the day changed while the player was at it). */
async function dailyChanged(me: string, day: string): Promise<boolean> {
  const { data, error } = await admin.from('puzzle_attempts').select('day').eq('player_id', me).like('module', `${DAILY}:%`);
  if (error) throw error;
  return data.length > 0 && !data.some((a) => a.day === day);
}

/** The player's move in the open puzzle: judged here, the solution stays on the server. */
async function move(me: string, body: Record<string, unknown>, guest: boolean) {
  const { module, puzzle, attempt } = await target(me, body, guest);
  let played;
  try {
    played = playMove(puzzle, ALTERNATIVES[module]?.[puzzle.id], attempt.state, body.move as string, module === 'openings');
  } catch (err) {
    if (err instanceof AttemptError) throw fail(err.code === 'illegal' ? 'illegal_move' : 'solved', err.message, 409);
    throw err;
  }
  await saveAttempt(me, attempt, played.state);
  return { ...played.outcome, mistakes: played.state.mistakes, hints: played.state.hints };
}

/** The next hint for the current move (null when the piece and the square are both shown). */
async function hint(me: string, body: Record<string, unknown>, guest: boolean) {
  const { puzzle, attempt } = await target(me, body, guest);
  const taken = takeHint(puzzle, attempt.state);
  if (!taken) return { hint: null };
  await saveAttempt(me, attempt, taken.state);
  return { hint: { marks: taken.marks, hints: taken.state.hints } };
}

/** Use up exactly this attempt (a newer one, opened meanwhile, stays). */
async function consume(me: string, attempt: Attempt): Promise<void> {
  const { error } = await admin.from('puzzle_attempts').delete().eq('player_id', me).eq('id', attempt.id);
  if (error) throw error;
}

async function start(me: string, body: Record<string, unknown>, guest: boolean) {
  const { module, index, puzzle } = await playable(me, body, guest);
  return { ok: true, attempt: await openAttempt(me, module.id, index, null), next: nextOf(puzzle, [], module.id === 'openings') };
}

/** The attempt is complete: its moves solve the puzzle (checked again) and the counts are the server's. */
function finished(puzzle: Parameters<typeof solves>[0], attempt: Attempt): AttemptState {
  if (!attempt.state.done || !solves(puzzle, attempt.state.played)) throw fail('wrong', 'That is not the solution.', 409);
  return attempt.state;
}

async function solve(me: string, body: Record<string, unknown>, guest: boolean) {
  const { module, index, puzzle, plan } = await playable(me, body, guest);
  const attempt = await attemptAt(me, module.id, index, MIN_SOLVE_MS);
  // what this server counted while the puzzle was played, never the browser's word
  const { mistakes, hints } = finished(puzzle, attempt);
  const earned = stars(mistakes, hints);
  // with Premium hints cost no coins (the stars still count them)
  const paidHints = hintsFree(plan) ? 0 : hints;

  if (!guest) await ensurePlayer(admin, me);
  const { data: result, error: e2 } = await admin.rpc('solve_puzzle', {
    p_player: me,
    p_module: module.id,
    p_idx: index,
    p_stars: earned,
    p_coins: solveCoins(puzzle.rating, paidHints, solution(puzzle).length),
    p_every: BONUS_EVERY,
    p_bonus: BONUS_COINS,
    p_review: REVIEW_AFTER_HOURS * 3600,
  });
  if (e2) throw e2;
  await consume(me, attempt);

  let reward: { item: string | null; coins: number | null } | null = null;
  if (!guest && result.first && result.solved >= PUZZLES_PER_MODULE) {
    // the finishing reward: an item from the shop the player does not have yet
    const { data: owned, error: e3 } = await admin.from('player_items').select('item_id').eq('player_id', me);
    if (e3) throw e3;
    const lacking = ITEMS.filter((i) => i.forSale && !owned.some((o) => o.item_id === i.id)).map((i) => i.id);
    const item = completionItem(lacking);
    const { data: given, error: e4 } = await admin.rpc('complete_module', { p_player: me, p_module: module.id, p_item: item, p_coins: COMPLETION_COINS });
    if (e4) throw e4;
    if (given) reward = { item, coins: item ? null : COMPLETION_COINS };
  }
  const hintCost = result.first ? hintPenalty(paidHints, solution(puzzle).length) : 0;
  return {
    first: result.first,
    coins: result.coins,
    hintCost,
    bonus: result.bonus,
    stars: earned,
    counted: result.counted,
    best: result.stars,
    reviewFrom: reviewFrom(result.stars, result.tried_at),
    solved: result.solved,
    reward,
    line: puzzle.moves,
    ...(await whoAfter(me, guest, !!reward?.item)),
  };
}

/** A puzzle opened this long ago at least before its solution can be shown. */
const MIN_REVEAL_MS = 20_000;

async function reveal(me: string, body: Record<string, unknown>, guest: boolean) {
  const { module, index } = await playable(me, body, guest);
  const attempt = await attemptAt(me, module.id, index, MIN_REVEAL_MS);
  const { error: e2 } = await admin.rpc('reveal_puzzle', { p_player: me, p_module: module.id, p_idx: index });
  if (e2) throw e2;
  await consume(me, attempt);
  return { modules: await progress(me), line: PUZZLES[module.id][index].moves };
}

// ---------------------------------------------------------------- daily puzzle

/** The daily puzzle's attempts are stored under "daily:<module>" with their day. */
const DAILY = 'daily';

/** Streak shields keep the streak over the days missed since the last one (when there are enough). */
async function useShields(me: string, day: string): Promise<number> {
  const { data, error } = await admin.rpc('use_shields', { p_player: me, p_today: day });
  if (error) throw error;
  return data as number;
}

async function dailyState(me: string, guest: boolean) {
  const day = dayOf();
  const { module, index } = dailyPuzzle(day);
  const shielded = guest ? 0 : await useShields(me, day);
  const [solved_, streak_] = await Promise.all([
    admin.from('puzzle_daily').select('stars, coins').eq('player_id', me).eq('day', day).maybeSingle(),
    admin.from('puzzle_streaks').select('current, best, last_day, shields').eq('player_id', me).maybeSingle(),
  ]);
  if (solved_.error) throw solved_.error;
  if (streak_.error) throw streak_.error;
  const s: Streak | null = streak_.data ? { current: streak_.data.current, best: streak_.data.best, lastDay: streak_.data.last_day } : null;
  return {
    day,
    module,
    index,
    solved: solved_.data,
    streak: { current: liveStreak(s, day), best: s?.best ?? 0, lastDay: s?.lastDay ?? null, shields: streak_.data?.shields ?? 0, shielded },
  };
}

async function shieldBuy(me: string) {
  const { player } = await ensurePlayer(admin, me);
  const { data, error } = await admin.rpc('buy_shield', { p_player: me, p_price: SHIELD_PRICE, p_cap: shieldCap(player.premium?.plan ?? null) });
  if (error) {
    if (/shields_full/.test(error.message)) throw fail('shields_full', 'You hold as many streak shields as you can.', 409);
    if (/cannot_buy/.test(error.message)) throw fail('insufficient_coins', `You need ${SHIELD_PRICE} coins.`, 409);
    throw error;
  }
  return { shields: data, player: await getPlayer(admin, me) };
}

// ---------------------------------------------------------------- Game Review limits

async function reviews(me: string) {
  const limit = reviewsPerDay(await planNow(me));
  const { count, error } = await admin.from('review_uses').select('game_id', { count: 'exact', head: true }).eq('player_id', me).eq('day', dayOf());
  if (error) throw error;
  return { used: count ?? 0, limit };
}

async function reviewStart(me: string, body: Record<string, unknown>) {
  const game = typeof body.game === 'string' && body.game.length <= 80 ? body.game : null;
  if (!game) throw fail('bad_request', 'Unknown game.');
  const limit = reviewsPerDay(await planNow(me));
  const { data, error } = await admin.rpc('start_review', { p_player: me, p_day: dayOf(), p_game: game, p_limit: limit });
  if (error) throw error;
  return { allowed: data.allowed, used: data.used, limit };
}

async function dailyStart(me: string) {
  const day = dayOf();
  const { module, index } = dailyPuzzle(day);
  // an earlier day's daily attempt is over
  const old = await admin.from('puzzle_attempts').delete().eq('player_id', me).like('module', `${DAILY}:%`).neq('day', day);
  if (old.error) throw old.error;
  return { ok: true, attempt: await openAttempt(me, `${DAILY}:${module}`, index, day), next: nextOf(PUZZLES[module][index], [], module === 'openings') };
}

// milestones as the database gets them: the table, then every 100 days after 1000
const MILESTONES = [...STREAK_MILESTONES, ...Array.from({ length: 90 }, (_, i) => ({ days: 1100 + i * 100, coins: 10_000 }))];

async function dailySolve(me: string, guest: boolean) {
  const day = dayOf();
  const { module, index } = dailyPuzzle(day);
  const puzzle = PUZZLES[module][index];
  // opened before midnight (UTC): that day's puzzle is over, the app offers the new one
  if (await dailyChanged(me, day)) throw fail('day_changed', 'A new daily puzzle is out.', 409);
  const attempt = await attemptAt(me, `${DAILY}:${module}`, index, MIN_SOLVE_MS);
  if (attempt.day !== day) throw fail('day_changed', 'A new daily puzzle is out.', 409);
  const { mistakes, hints } = finished(puzzle, attempt);
  const earned = stars(mistakes, hints);
  const plan = guest ? null : await planNow(me);
  const paidHints = hintsFree(plan) ? 0 : hints;
  const coins = dailyCoins(paidHints, solution(puzzle).length);

  if (!guest) {
    await ensurePlayer(admin, me);
    await useShields(me, day);
  }
  // an item for the milestones that give one: one the player lacks (guests get it on claiming)
  const item = guest ? null : await lackingItem(me);
  const { data: result, error: e2 } = await admin.rpc('solve_daily', {
    p_player: me,
    p_day: day,
    p_module: module,
    p_idx: index,
    p_stars: earned,
    p_coins: coins,
    p_milestones: MILESTONES,
    p_item: item,
  });
  if (e2) throw e2;
  await consume(me, attempt);
  return {
    ...(await whoAfter(me, guest, !!result.milestone?.item)),
    already: result.already,
    coins: result.coins,
    hintCost: result.already ? 0 : hintPenalty(paidHints, solution(puzzle).length),
    stars: earned,
    streak: { current: result.streak.current, best: result.streak.best, lastDay: result.streak.last_day },
    milestone: result.milestone,
    line: puzzle.moves,
  };
}

/** A random shop item the player does not own yet (finishing rewards, streak milestones). */
async function lackingItem(me: string): Promise<string | null> {
  const { data: owned, error } = await admin.from('player_items').select('item_id').eq('player_id', me);
  if (error) throw error;
  return completionItem(ITEMS.filter((i) => i.forSale && !owned.some((o) => o.item_id === i.id)).map((i) => i.id));
}

/** What a guest has earned so far: it waits in the ledger until they claim it. */
async function guestCoins(me: string): Promise<number> {
  const { data, error } = await admin.from('coin_ledger').select('amount').eq('player_id', me);
  if (error) throw error;
  return data.reduce((sum, r) => sum + r.amount, 0);
}

/** The state a solve answers with: the player's (showcase refreshed for a new item), or a guest's coins. */
async function whoAfter(me: string, guest: boolean, newItem: boolean): Promise<{ player: unknown } | { guest: { coins: number } }> {
  if (guest) return { guest: { coins: await guestCoins(me) } };
  const player = await getPlayer(admin, me);
  if (newItem) await publishShowcase(admin, player);
  return { player };
}

/**
 * Move a guest's puzzles into this account, once: each solve is replayed with the account's
 * rules (a puzzle the account solved already pays nothing, a bonus every BONUS_EVERY), and
 * daily puzzles after the account's last one continue its streak. The guest's rows go.
 */
async function claim(me: string, body: Record<string, unknown>) {
  const token = typeof body.guest === 'string' ? body.guest : '';
  const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const guest = data.user;
  if (!guest?.is_anonymous || guest.id === me) return { claimed: null, player: (await ensurePlayer(admin, me)).player };
  // a guest's progress goes to one account: the first to claim it (and it may retry)
  const { data: owner, error: e0 } = await admin.rpc('bind_guest', { p_guest: guest.id, p_account: me });
  if (e0) throw e0;
  if (owner !== me) return { claimed: null, player: (await ensurePlayer(admin, me)).player };
  const [solves_, daily_, ledger_, streak_] = await Promise.all([
    admin.from('puzzle_solves').select('module, idx, stars').eq('player_id', guest.id).order('solved_at'),
    admin.from('puzzle_daily').select('day, module, idx, stars, coins').eq('player_id', guest.id).order('day'),
    admin.from('coin_ledger').select('amount, ref').eq('player_id', guest.id).eq('reason', 'puzzle'),
    admin.from('puzzle_streaks').select('last_day').eq('player_id', me).maybeSingle(),
  ]);
  for (const r of [solves_, daily_, ledger_, streak_]) if (r.error) throw r.error;
  const { player: before } = await ensurePlayer(admin, me);
  const lessons = await claimLessons(me, guest.id);
  if (!solves_.data!.length && !daily_.data!.length) {
    const player = await getPlayer(admin, me);
    return { claimed: lessons ? { puzzles: 0, days: 0, lessons, coins: player.coins - before.coins } : null, player };
  }

  let puzzles = 0;
  let days = 0;
  let newItem = false;
  for (const s of solves_.data!) {
    if (!guestMayPlay(s.module, s.idx)) continue;
    if (s.stars === 0) {
      // seen: opens the next puzzle, unless the account has this one already
      const { error } = await admin.from('puzzle_solves').upsert({ player_id: me, module: s.module, idx: s.idx, stars: 0 }, { onConflict: 'player_id,module,idx', ignoreDuplicates: true });
      if (error) throw error;
      continue;
    }
    const coins = ledger_.data!.find((l) => l.ref === `${s.module}:${s.idx}`)?.amount ?? 0;
    const { data: r, error } = await admin.rpc('solve_puzzle', {
      p_player: me,
      p_module: s.module,
      p_idx: s.idx,
      p_stars: s.stars,
      p_coins: coins,
      p_every: BONUS_EVERY,
      p_bonus: BONUS_COINS,
      p_review: REVIEW_AFTER_HOURS * 3600,
    });
    if (error) throw error;
    if (r.first) puzzles++;
  }
  const lastDay = streak_.data?.last_day ?? null;
  for (const d of daily_.data!) {
    if (lastDay && d.day <= lastDay) continue; // the account's streak is further on
    const { data: r, error } = await admin.rpc('solve_daily', {
      p_player: me,
      p_day: d.day,
      p_module: d.module,
      p_idx: d.idx,
      p_stars: d.stars,
      p_coins: d.coins,
      p_milestones: MILESTONES,
      p_item: await lackingItem(me),
    });
    if (error) throw error;
    if (!r.already) days++;
    if (r.milestone?.item) newItem = true;
  }
  for (const table of ['puzzle_solves', 'puzzle_daily', 'puzzle_streaks', 'puzzle_attempts']) {
    const { error } = await admin.from(table).delete().eq('player_id', guest.id);
    if (error) throw error;
  }
  const player = await getPlayer(admin, me);
  if (newItem) await publishShowcase(admin, player);
  return { claimed: { puzzles, days, lessons, coins: player.coins - before.coins }, player };
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

// ---------------------------------------------------------------- Learn

async function learnState(me: string) {
  const [lessons, chapters, unlock, plan] = await Promise.all([
    admin.from('learn_lessons').select('lesson').eq('player_id', me),
    admin.from('learn_chapters').select('chapter').eq('player_id', me),
    admin.from('learn_unlocks').select('player_id').eq('player_id', me).maybeSingle(),
    planNow(me),
  ]);
  for (const r of [lessons, chapters, unlock]) if (r.error) throw r.error;
  return {
    lessons: lessons.data!.map((l) => l.lesson as string),
    rewarded: chapters.data!.map((c) => c.chapter as string),
    // every Premium plan opens the paid chapters; bought with coins they stay open
    unlocked: learnUnlocked(!!unlock.data, plan),
    bought: !!unlock.data,
  };
}

async function learnDone(me: string, body: Record<string, unknown>, guest: boolean) {
  const at = lessonOf(body.lesson);
  if (!at) throw fail('bad_request', 'Unknown lesson.');
  const state = await learnState(me);
  if (!at.chapter.free && guest) throw fail('guest_limit', 'Create a free account to keep going.', 403);
  if (!lessonOpen(at.chapter.lessons[at.index], state.lessons, state.unlocked)) throw fail('locked', 'Finish the lessons before this one first.', 403);
  // what the player did in each step, replayed on the lesson's boards (audit, November 2026)
  const steps = stepRecords(body.steps);
  const problem = steps ? checkLesson(LESSONS[at.chapter.lessons[at.index]], steps) : 'no steps';
  if (problem) {
    console.warn(`learn_done ${at.chapter.lessons[at.index]}: ${problem}`);
    throw fail('not_done', 'Finish every step of the lesson first.', 409);
  }
  if (!guest) await ensurePlayer(admin, me);
  const { data, error } = await admin.rpc('complete_lesson', {
    p_player: me,
    p_lesson: at.chapter.lessons[at.index],
    p_chapter: at.chapter.id,
    p_lessons: at.chapter.lessons,
    p_reward: CHAPTER_REWARD,
    p_min_ms: MIN_LESSON_MS,
  });
  if (error) {
    if (/too_fast/.test(error.message)) throw fail('too_fast', 'That was quick. Take the lesson again a little slower.', 429);
    throw error;
  }
  return { first: data.first, chapterDone: data.chapter_done, reward: data.reward, ...(await learnState(me)), ...(await whoAfter(me, guest, false)) };
}

async function learnUnlock(me: string) {
  await ensurePlayer(admin, me);
  const { error } = await admin.rpc('unlock_learn', { p_player: me, p_price: LEARN_PRICE });
  if (error) {
    if (/cannot_unlock/.test(error.message)) throw fail('insufficient_coins', `You need ${LEARN_PRICE} coins.`, 409);
    throw error;
  }
  return { ...(await learnState(me)), player: await getPlayer(admin, me) };
}

/** Move a guest's lessons into the account (their count); a chapter the account had not finished pays its reward. */
async function claimLessons(me: string, guestId: string): Promise<number> {
  const [lessons_, chapters_] = await Promise.all([
    admin.from('learn_lessons').select('lesson, done_at').eq('player_id', guestId),
    admin.from('learn_chapters').select('chapter').eq('player_id', guestId),
  ]);
  for (const r of [lessons_, chapters_]) if (r.error) throw r.error;
  if (!lessons_.data!.length) return 0;
  const { error } = await admin
    .from('learn_lessons')
    .upsert(lessons_.data!.map((l) => ({ player_id: me, lesson: l.lesson, done_at: l.done_at })), { onConflict: 'player_id,lesson', ignoreDuplicates: true });
  if (error) throw error;
  for (const c of chapters_.data!) {
    const { error: e2 } = await admin.rpc('claim_chapter', { p_player: me, p_chapter: c.chapter, p_reward: CHAPTER_REWARD });
    if (e2) throw e2;
  }
  for (const table of ['learn_lessons', 'learn_chapters']) {
    const { error: e6 } = await admin.from(table).delete().eq('player_id', guestId);
    if (e6) throw e6;
  }
  return lessons_.data!.length;
}

/** Actions a guest may use (the free module's first puzzles, the daily puzzle, the free lessons). */
const GUEST_ACTIONS = ['progress', 'start', 'move', 'hint', 'solve', 'reveal', 'daily', 'daily_start', 'daily_solve', 'learn', 'learn_done'];

async function handle(user: User, body: Record<string, unknown>): Promise<unknown> {
  const guest = !!user.is_anonymous;
  if (guest) {
    if (!GUEST_ACTIONS.includes(body.action as string)) throw fail('guest', 'Create an account first.', 403);
  } else {
    const { data: profile, error } = await admin.from('profiles').select('onboarded_at').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!profile?.onboarded_at) throw fail('not_ready', 'Finish setting up your profile first.', 403);
  }
  switch (body.action) {
    case 'progress': {
      if (guest) return { modules: await progress(user.id), guest: { coins: await guestCoins(user.id) } };
      const { player } = await ensurePlayer(admin, user.id);
      return { modules: await progress(user.id), player };
    }
    case 'start':
      return start(user.id, body, guest);
    case 'move':
      return move(user.id, body, guest);
    case 'hint':
      return hint(user.id, body, guest);
    case 'solve':
      return solve(user.id, body, guest);
    case 'unlock':
      return unlock(user.id, body);
    case 'reveal':
      return reveal(user.id, body, guest);
    case 'daily':
      return dailyState(user.id, guest);
    case 'daily_start':
      return dailyStart(user.id);
    case 'daily_solve':
      return dailySolve(user.id, guest);
    case 'claim':
      return claim(user.id, body);
    case 'learn':
      return { ...(await learnState(user.id)), ...(await whoAfter(user.id, guest, false)) };
    case 'learn_done':
      return learnDone(user.id, body, guest);
    case 'learn_unlock':
      return learnUnlock(user.id);
    case 'shield_buy':
      return shieldBuy(user.id);
    case 'reviews':
      return reviews(user.id);
    case 'review_start':
      return reviewStart(user.id, body);
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
