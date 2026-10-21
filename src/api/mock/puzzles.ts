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
import { modulePuzzles } from '../puzzleData';
import { ApiError, type DailySolve, type GuestClaim, type PuzzleModuleProgress, type PuzzlesService } from '../types';
import { claimGuestLessons } from './learn';
import { GUEST_ID, db, emit, now, save, session, wait, type MockPuzzleModule } from './db';

/** The signed-in player, or null for a guest (signed out). */
const player = () => (db.sessionId ? session().profile : null);
/** Whose puzzles a call is about: the player's, or this browser's guest's. */
const who = () => player()?.id ?? GUEST_ID;

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
  return MODULES.map((m) => {
    const p = mine(playerId, m.id);
    return {
      id: m.id,
      unlocked: m.free || p.unlocked,
      stars: [...p.stars],
      seen: [...p.seen],
      reviewFrom: p.stars.map((s, i) => reviewFrom(s, p.tried[i])),
      completedAt: p.completedAt,
      reward: p.reward && { ...p.reward },
    };
  });
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
    const counted = p.stars[index] < 3 && reviewCounts(p.tried[index]);
    const first = p.stars[index] === 0 && counted;
    if (counted) p.stars[index] = Math.max(p.stars[index], earned);
    p.seen[index] = p.seen[index] && p.stars[index] === 0;
    p.tried[index] = now();
    const solved = p.stars.filter((s) => s > 0).length;
    const coins = first ? solveCoins(puzzle.rating, hints, solution(puzzle).length) : 0;
    const hintCost = first ? hintPenalty(hints, solution(puzzle).length) : 0;
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
    const d = db.daily[who()];
    return { day, ...dailyPuzzle(day), solved: d?.days[day] ?? null, streak: { ...(d?.streak ?? { best: 0, lastDay: null }), current: liveStreak(d?.streak ?? null, day) } };
  },

  async dailyStart() {},

  async dailySolve(moves, mistakes, hints): Promise<DailySolve> {
    await wait(200, 400);
    const profile = player();
    const day = dayOf();
    const { module, index } = dailyPuzzle(day);
    const puzzle = (await modulePuzzles(module))[index];
    if (!puzzle || !solves(puzzle, moves)) throw new ApiError('wrong', t('That is not the solution.'));
    const d = (db.daily[who()] ??= { days: {}, streak: { current: 0, best: 0, lastDay: null } });
    const earned = stars(mistakes, hints);
    if (d.days[day]) return { already: true, coins: 0, hintCost: 0, stars: earned, streak: { ...d.streak }, milestone: null };
    const coins = dailyCoins(hints, solution(puzzle).length);
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
      hintCost: hintPenalty(hints, solution(puzzle).length),
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
