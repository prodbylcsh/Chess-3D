// Puzzles: progress, solving and module unlocks (rules: ../_shared/puzzles.ts), and the
// lessons of Learn (../_shared/learn.ts).
//
// POST { action: 'progress' }                                  → { modules, player }
// POST { action: 'start', module, index }                      → { ok } the player opened a puzzle
// POST { action: 'solve', module, index, moves, mistakes, hints } → { first, coins, hintCost, bonus, stars, solved, reward, player }
//      `moves`: the player's moves (UCI); the server checks them. Coins only for the first
//      solve, a bonus every 10 solved, and a reward (an item, or coins) for the 100th.
// POST { action: 'unlock', module }                            → { modules, player } pay MODULE_PRICE coins
// POST { action: 'reveal', module, index }                     → { modules } show the solution: the puzzle
//      counts as seen (no coins, no stars), the next one opens; a later solve (a review) pays
// POST { action: 'daily' }                                     → { day, module, index, solved, streak }
// POST { action: 'daily_start' }                               → { ok }
// POST { action: 'daily_solve', moves, mistakes, hints }        → { coins, hintCost, stars, already, streak, milestone, player }
//
// POST { action: 'learn' }                                     → { lessons, unlocked, rewarded, player | guest }
// POST { action: 'learn_done', lesson }                        → { first, chapterDone, reward, …progress } a lesson
//      was finished: in order, in an open chapter; the last lesson of a chapter pays CHAPTER_REWARD once
// POST { action: 'learn_unlock' }                              → { …progress } the paid chapters for LEARN_PRICE
// POST { action: 'claim', guest }                              → { claimed, player } move a guest's puzzles
//      (`guest`: the access token of this device's anonymous session) into this account
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
    admin.from('puzzle_solves').select('module, idx, stars, tried_at').eq('player_id', me),
    admin.from('puzzle_modules').select('*').eq('player_id', me),
  ]);
  if (solves_.error) throw solves_.error;
  if (modules_.error) throw modules_.error;
  return MODULES.map((m) => {
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
      unlocked: m.free || !!row?.unlocked_at,
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
  const mine = (await progress(me)).find((m) => m.id === module.id)!;
  if (!mine.unlocked) throw fail('locked', 'Unlock this module first.', 403);
  // one after another: solved (or seen) puzzles can be replayed, the next one is open
  const next = mine.stars.findIndex((s, i) => s === 0 && !mine.seen[i]);
  if (next !== -1 && index > next) throw fail('locked', 'Solve the puzzles before this one first.', 403);
  return { module, index, puzzle: PUZZLES[module.id][index] };
}

async function start(me: string, body: Record<string, unknown>, guest: boolean) {
  const { module, index } = await playable(me, body, guest);
  const { error } = await admin.from('puzzle_attempts').upsert({ player_id: me, module: module.id, idx: index, started_at: new Date().toISOString() });
  if (error) throw error;
  return { ok: true };
}

async function solve(me: string, body: Record<string, unknown>, guest: boolean) {
  const { module, index, puzzle } = await playable(me, body, guest);
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

  if (!guest) await ensurePlayer(admin, me);
  const { data: result, error: e2 } = await admin.rpc('solve_puzzle', {
    p_player: me,
    p_module: module.id,
    p_idx: index,
    p_stars: earned,
    p_coins: solveCoins(puzzle.rating, hints, solution(puzzle).length),
    p_every: BONUS_EVERY,
    p_bonus: BONUS_COINS,
    p_review: REVIEW_AFTER_HOURS * 3600,
  });
  if (e2) throw e2;
  await admin.from('puzzle_attempts').delete().eq('player_id', me);

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
  const hintCost = result.first ? hintPenalty(hints, solution(puzzle).length) : 0;
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
    ...(await whoAfter(me, guest, !!reward?.item)),
  };
}

/** A puzzle opened this long ago at least before its solution can be shown. */
const MIN_REVEAL_MS = 20_000;

async function reveal(me: string, body: Record<string, unknown>, guest: boolean) {
  const { module, index } = await playable(me, body, guest);
  const { data: attempt, error } = await admin.from('puzzle_attempts').select('*').eq('player_id', me).maybeSingle();
  if (error) throw error;
  if (!attempt || attempt.module !== module.id || attempt.idx !== index || Date.now() - Date.parse(attempt.started_at) < MIN_REVEAL_MS) {
    throw fail('not_started', 'Open the puzzle first.', 409);
  }
  const { error: e2 } = await admin.rpc('reveal_puzzle', { p_player: me, p_module: module.id, p_idx: index });
  if (e2) throw e2;
  await admin.from('puzzle_attempts').delete().eq('player_id', me);
  return { modules: await progress(me) };
}

// ---------------------------------------------------------------- daily puzzle

/** The attempt row of the daily puzzle (one attempt at a time, like the modules). */
const DAILY = 'daily';

async function dailyState(me: string) {
  const day = dayOf();
  const { module, index } = dailyPuzzle(day);
  const [solved_, streak_] = await Promise.all([
    admin.from('puzzle_daily').select('stars, coins').eq('player_id', me).eq('day', day).maybeSingle(),
    admin.from('puzzle_streaks').select('current, best, last_day').eq('player_id', me).maybeSingle(),
  ]);
  if (solved_.error) throw solved_.error;
  if (streak_.error) throw streak_.error;
  const s: Streak | null = streak_.data ? { current: streak_.data.current, best: streak_.data.best, lastDay: streak_.data.last_day } : null;
  return { day, module, index, solved: solved_.data, streak: { current: liveStreak(s, day), best: s?.best ?? 0, lastDay: s?.lastDay ?? null } };
}

async function dailyStart(me: string) {
  const { module, index } = dailyPuzzle(dayOf());
  const { error } = await admin.from('puzzle_attempts').upsert({ player_id: me, module: `${DAILY}:${module}`, idx: index, started_at: new Date().toISOString() });
  if (error) throw error;
  return { ok: true };
}

// milestones as the database gets them: the table, then every 100 days after 1000
const MILESTONES = [...STREAK_MILESTONES, ...Array.from({ length: 90 }, (_, i) => ({ days: 1100 + i * 100, coins: 10_000 }))];

async function dailySolve(me: string, body: Record<string, unknown>, guest: boolean) {
  const day = dayOf();
  const { module, index } = dailyPuzzle(day);
  const puzzle = PUZZLES[module][index];
  const { data: attempt, error } = await admin.from('puzzle_attempts').select('*').eq('player_id', me).maybeSingle();
  if (error) throw error;
  if (!attempt || attempt.module !== `${DAILY}:${module}` || attempt.idx !== index || Date.now() - Date.parse(attempt.started_at) < MIN_SOLVE_MS) {
    throw fail('not_started', 'Open the puzzle first.', 409);
  }
  const moves = Array.isArray(body.moves) && body.moves.every((m) => typeof m === 'string') ? (body.moves as string[]) : [];
  if (!solves(puzzle, moves)) throw fail('wrong', 'That is not the solution.', 409);
  const count = (n: unknown) => Math.max(0, Math.min(99, Math.floor(Number(n) || 0)));
  const hints = count(body.hints);
  const earned = stars(count(body.mistakes), hints);
  const coins = dailyCoins(hints, solution(puzzle).length);

  if (!guest) await ensurePlayer(admin, me);
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
  await admin.from('puzzle_attempts').delete().eq('player_id', me);
  return {
    ...(await whoAfter(me, guest, !!result.milestone?.item)),
    already: result.already,
    coins: result.coins,
    hintCost: result.already ? 0 : hintPenalty(hints, solution(puzzle).length),
    stars: earned,
    streak: { current: result.streak.current, best: result.streak.best, lastDay: result.streak.last_day },
    milestone: result.milestone,
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
  const [lessons, chapters, unlock] = await Promise.all([
    admin.from('learn_lessons').select('lesson').eq('player_id', me),
    admin.from('learn_chapters').select('chapter').eq('player_id', me),
    admin.from('learn_unlocks').select('player_id').eq('player_id', me).maybeSingle(),
  ]);
  for (const r of [lessons, chapters, unlock]) if (r.error) throw r.error;
  return { lessons: lessons.data!.map((l) => l.lesson as string), rewarded: chapters.data!.map((c) => c.chapter as string), unlocked: !!unlock.data };
}

async function learnDone(me: string, body: Record<string, unknown>, guest: boolean) {
  const at = lessonOf(body.lesson);
  if (!at) throw fail('bad_request', 'Unknown lesson.');
  const state = await learnState(me);
  if (!at.chapter.free && guest) throw fail('guest_limit', 'Create a free account to keep going.', 403);
  if (!lessonOpen(at.chapter.lessons[at.index], state.lessons, state.unlocked)) throw fail('locked', 'Finish the lessons before this one first.', 403);
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
const GUEST_ACTIONS = ['progress', 'start', 'solve', 'reveal', 'daily', 'daily_start', 'daily_solve', 'learn', 'learn_done'];

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
    case 'solve':
      return solve(user.id, body, guest);
    case 'unlock':
      return unlock(user.id, body);
    case 'reveal':
      return reveal(user.id, body, guest);
    case 'daily':
      return dailyState(user.id);
    case 'daily_start':
      return dailyStart(user.id);
    case 'daily_solve':
      return dailySolve(user.id, body, guest);
    case 'claim':
      return claim(user.id, body);
    case 'learn':
      return { ...(await learnState(user.id)), ...(await whoAfter(user.id, guest, false)) };
    case 'learn_done':
      return learnDone(user.id, body, guest);
    case 'learn_unlock':
      return learnUnlock(user.id);
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
