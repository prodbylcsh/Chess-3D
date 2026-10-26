// Mock puzzles: progress, rewards and unlocks in the browser, with the server's rules.
import { t } from '../../i18n';
import {
  BONUS_COINS,
  COMPLETION_COINS,
  MODULES,
  MODULE_PRICE,
  PUZZLES_PER_MODULE,
  bonusFor,
  completionItem,
  moduleOf,
  dailyCoins,
  dailyPuzzle,
  dayOf,
  liveStreak,
  nextStreak,
  reviewCounts,
  reviewFrom,
  streakMilestone,
  solveCoins,
  solution,
  hintPenalty,
  solves,
  stars,
  guestMayPlay,
} from '#shared/puzzles.ts';
import { ITEMS } from '#shared/shop.ts';
import { SHIELD_PRICE, hintsFree, moduleOpen, released, shieldCap } from '#shared/subscription.ts';
import { modulePuzzles } from '../puzzleData';
import { ApiError, type DailySolve, type GuestClaim, type PuzzleModuleProgress, type PuzzlesService } from '../types';
import { claimGuestLessons } from './learn';
import { GUEST_ID, db, emit, now, save, session, wait, type MockPuzzleModule } from './db';

/** The signed-in player, or null for a guest (signed out). */
const player = () => (db.sessionId ? session().profile : null);
/** Whose puzzles a call is about: the player's, or this browser's guest's. */
const who = () => player()?.id ?? GUEST_ID;
/** The player's Premium plan (guests have none). */
const plan = () => player()?.premium?.plan ?? null;
const DAY = 86_400_000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY);
const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - DAY).toISOString().slice(0, 10);

function guestLimit(module: string, index: number): void {
  if (!player() && !guestMayPlay(module, index)) throw new ApiError('guest_limit', t('Create a free account to keep going.'));
}

function mine(playerId: string, module: string): MockPuzzleModule {
  const all = (db.puzzles[playerId] ??= {});
  return (all[module] ??= {
    stars: Array.from({ length: PUZZLES_PER_MODULE }, () => 0),
    seen: Array.from({ length: PUZZLES_PER_MODULE }, () => false),
    tried: Array.from({ length: PUZZLES_PER_MODULE }, () => null),
    unlocked: false,
    completedAt: null,
    reward: null,
  });
}

function progress(playerId: string): PuzzleModuleProgress[] {
  const premium = playerId === GUEST_ID ? null : plan();
  return MODULES.filter((m) => released(m.releaseAt, premium)).map((m) => {
    const p = mine(playerId, m.id);
    return {
      id: m.id,
      unlocked: moduleOpen(m.free, p.unlocked, premium),
      bought: m.free || p.unlocked,
      stars: [...p.stars],
      seen: [...p.seen],
      reviewFrom: p.stars.map((s, i) => reviewFrom(s, p.tried[i])),
      completedAt: p.completedAt,
      reward: p.reward && { ...p.reward },
    };
  });
}

/**
 * Streak shields (as the server's `use_shields`): days missed since the last one solved are
 * kept when the player holds a shield for each. Returns the shields used now.
 */
function useShields(day: string): number {
  const profile = player();
  const d = profile && db.daily[profile.id];
  if (!profile || !d?.streak.lastDay || !d.streak.current) return 0;
  const missed = dayNumber(day) - dayNumber(d.streak.lastDay) - 1;
  const held = db.shields[profile.id] ?? 0;
  if (missed < 1 || missed > held) return 0;
  db.shields[profile.id] = held - missed;
  d.streak.lastDay = dayBefore(day);
  save();
  return missed;
}

export const puzzles: PuzzlesService = {
  async progress() {
    await wait(150, 300);
    return progress(who());
  },

  async start(module, index) {
    guestLimit(module, index);
    const p = progress(who()).find((m) => m.id === module);
    if (!p?.unlocked) throw new ApiError('locked', t('Unlock this module first.'));
    const next = p.stars.findIndex((s, i) => s === 0 && !p.seen[i]);
    if (next !== -1 && index > next) throw new ApiError('locked', t('Solve the puzzles before this one first.'));
  },

  async solve(module, index, moves, mistakes, hints) {
    await wait(200, 400);
    guestLimit(module, index);
    const profile = player();
    const puzzle = (await modulePuzzles(module))[index];
    if (!puzzle || !solves(puzzle, moves)) throw new ApiError('wrong', t('That is not the solution.'));
    const p = mine(who(), module);
    const earned = stars(mistakes, hints);
    // with Premium hints cost no coins (the stars still count them)
    const paidHints = hintsFree(plan()) ? 0 : hints;
    const counted = p.stars[index] < 3 && reviewCounts(p.tried[index]);
    const first = p.stars[index] === 0 && counted;
    if (counted) p.stars[index] = Math.max(p.stars[index], earned);
    p.seen[index] = p.seen[index] && p.stars[index] === 0;
    p.tried[index] = now();
    const solved = p.stars.filter((s) => s > 0).length;
    const coins = first ? solveCoins(puzzle.rating, paidHints, solution(puzzle).length) : 0;
    const hintCost = first ? hintPenalty(paidHints, solution(puzzle).length) : 0;
    const bonus = first ? bonusFor(solved) : 0;
    if (profile) profile.coins += coins + bonus;
    else {
      db.guest.coins += coins + bonus;
      if (first) db.guest.paid[`${module}:${index}`] = coins;
    }
    let reward: PuzzleModuleProgress['reward'] = null;
    if (profile && first && solved === PUZZLES_PER_MODULE && !p.completedAt) {
      const item = completionItem(ITEMS.filter((i) => i.forSale && !profile.inventory.includes(i.id)).map((i) => i.id));
      if (item) profile.inventory.push(item);
      else profile.coins += COMPLETION_COINS;
      reward = { item, coins: item ? null : COMPLETION_COINS };
      p.completedAt = now();
      p.reward = reward;
    }
    save();
    emit({ type: 'profile' });
    return {
      first,
      coins,
      hintCost,
      bonus: bonus === BONUS_COINS ? bonus : 0,
      stars: earned,
      counted,
      best: p.stars[index],
      reviewFrom: reviewFrom(p.stars[index], p.tried[index]),
      solved,
      reward,
    };
  },

  async reveal(module, index) {
    await wait(150, 300);
    await puzzles.start(module, index);
    const p = mine(who(), module);
    if (p.stars[index] === 0) p.seen[index] = true;
    p.tried[index] = now();
    save();
    return progress(who());
  },

  async daily() {
    await wait(100, 250);
    const day = dayOf();
    const shielded = useShields(day);
    const d = db.daily[who()];
    return {
      day,
      ...dailyPuzzle(day),
      solved: d?.days[day] ?? null,
      streak: { ...(d?.streak ?? { best: 0, lastDay: null }), current: liveStreak(d?.streak ?? null, day), shields: player() ? (db.shields[who()] ?? 0) : 0, shielded },
    };
  },

  async buyShield() {
    await wait(250, 450);
    const { profile } = session();
    const held = db.shields[profile.id] ?? 0;
    if (held >= shieldCap(plan())) throw new ApiError('shields_full', t('You hold as many streak shields as you can.'));
    if (profile.coins < SHIELD_PRICE) throw new ApiError('insufficient_coins', t('You do not have enough coins for a streak shield.'));
    profile.coins -= SHIELD_PRICE;
    db.shields[profile.id] = held + 1;
    save();
    emit({ type: 'profile' });
    return held + 1;
  },

  async dailyStart() {},

  async dailySolve(moves, mistakes, hints): Promise<DailySolve> {
    await wait(200, 400);
    const profile = player();
    const day = dayOf();
    const { module, index } = dailyPuzzle(day);
    const puzzle = (await modulePuzzles(module))[index];
    if (!puzzle || !solves(puzzle, moves)) throw new ApiError('wrong', t('That is not the solution.'));
    useShields(day);
    const d = (db.daily[who()] ??= { days: {}, streak: { current: 0, best: 0, lastDay: null } });
    const earned = stars(mistakes, hints);
    if (d.days[day]) return { already: true, coins: 0, hintCost: 0, stars: earned, streak: { ...d.streak }, milestone: null };
    const paidHints = hintsFree(plan()) ? 0 : hints;
    const coins = dailyCoins(paidHints, solution(puzzle).length);
    d.days[day] = { stars: earned, coins };
    d.streak = nextStreak(d.streak, day);
    const m = streakMilestone(d.streak.current);
    let item: string | null = null;
    if (m?.item && profile) {
      item = completionItem(ITEMS.filter((i) => i.forSale && !profile.inventory.includes(i.id)).map((i) => i.id));
      if (item) profile.inventory.push(item);
    }
    if (profile) profile.coins += coins + (m?.coins ?? 0);
    else db.guest.coins += coins + (m?.coins ?? 0);
    save();
    emit({ type: 'profile' });
    return {
      already: false,
      coins,
      hintCost: hintPenalty(paidHints, solution(puzzle).length),
      stars: earned,
      streak: { ...d.streak },
      milestone: m ? { days: m.days, coins: m.coins, item } : null,
    };
  },

  async unlock(module) {
    await wait();
    const { profile } = session();
    const def = moduleOf(module);
    if (!def || def.free) throw new ApiError('bad_request', t('Something went wrong. Please try again.'));
    const p = mine(profile.id, module);
    if (!p.unlocked) {
      if (profile.coins < MODULE_PRICE) throw new ApiError('insufficient_coins', t('You do not have enough coins for this module.'));
      profile.coins -= MODULE_PRICE;
      p.unlocked = true;
      save();
      emit({ type: 'profile' });
    }
    return progress(profile.id);
  },

  async guest() {
    return player() ? null : { coins: db.guest.coins };
  },

  async claimGuest(): Promise<GuestClaim | null> {
    const profile = player();
    const guestPuzzles = db.puzzles[GUEST_ID];
    const guestDaily = db.daily[GUEST_ID];
    if (!profile || (!guestPuzzles && !guestDaily && !db.learn[GUEST_ID])) return null;
    await wait(200, 400);
    const before = profile.coins;
    const lessons = claimGuestLessons(profile);
    let solvedNew = 0;
    // each solve again, with the account's rules: a puzzle it solved already pays nothing
    for (const [module, g] of Object.entries(guestPuzzles ?? {})) {
      const p = mine(profile.id, module);
      g.stars.forEach((s, i) => {
        if (!guestMayPlay(module, i)) return;
        if (s === 0) {
          if (g.seen[i] && p.stars[i] === 0) p.seen[i] = true;
          return;
        }
        if (p.stars[i] > 0) return void (p.stars[i] = Math.max(p.stars[i], s));
        p.stars[i] = s;
        p.seen[i] = false;
        p.tried[i] = g.tried[i];
        solvedNew++;
        profile.coins += (db.guest.paid[`${module}:${i}`] ?? 0) + bonusFor(p.stars.filter((x) => x > 0).length);
      });
    }
    // daily puzzles after the account's last one continue its streak
    let days = 0;
    const d = (db.daily[profile.id] ??= { days: {}, streak: { current: 0, best: 0, lastDay: null } });
    for (const day of Object.keys(guestDaily?.days ?? {}).sort()) {
      if (d.days[day] || (d.streak.lastDay && day <= d.streak.lastDay)) continue;
      d.days[day] = { ...guestDaily!.days[day] };
      d.streak = nextStreak(d.streak, day);
      profile.coins += d.days[day].coins + (streakMilestone(d.streak.current)?.coins ?? 0);
      days++;
    }
    delete db.puzzles[GUEST_ID];
    delete db.daily[GUEST_ID];
    db.guest = { coins: 0, paid: {} };
    save();
    emit({ type: 'profile' });
    return { puzzles: solvedNew, days, lessons, coins: profile.coins - before };
  },
};
