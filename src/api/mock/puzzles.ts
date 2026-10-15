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
  puzzleCoins,
  solves,
  stars,
} from '#shared/puzzles.ts';
import { ITEMS } from '#shared/shop.ts';
import { modulePuzzles } from '../puzzleData';
import { ApiError, type PuzzleModuleProgress, type PuzzlesService } from '../types';
import { db, emit, now, save, session, wait, type MockPuzzleModule } from './db';

function mine(playerId: string, module: string): MockPuzzleModule {
  const all = (db.puzzles[playerId] ??= {});
  return (all[module] ??= { stars: Array.from({ length: PUZZLES_PER_MODULE }, () => 0), unlocked: false, completedAt: null, reward: null });
}

function progress(playerId: string): PuzzleModuleProgress[] {
  return MODULES.map((m) => {
    const p = mine(playerId, m.id);
    return { id: m.id, unlocked: m.free || p.unlocked, stars: [...p.stars], completedAt: p.completedAt, reward: p.reward && { ...p.reward } };
  });
}

export const puzzles: PuzzlesService = {
  async progress() {
    await wait(150, 300);
    return progress(session().profile.id);
  },

  async start(module, index) {
    const p = progress(session().profile.id).find((m) => m.id === module);
    if (!p?.unlocked) throw new ApiError('locked', t('Unlock this module first.'));
    const next = p.stars.findIndex((s) => s === 0);
    if (next !== -1 && index > next) throw new ApiError('locked', t('Solve the puzzles before this one first.'));
  },

  async solve(module, index, moves, mistakes, hints) {
    await wait(200, 400);
    const { profile } = session();
    const puzzle = (await modulePuzzles(module))[index];
    if (!puzzle || !solves(puzzle, moves)) throw new ApiError('wrong', t('That is not the solution.'));
    const p = mine(profile.id, module);
    const earned = stars(mistakes, hints);
    const first = p.stars[index] === 0;
    p.stars[index] = Math.max(p.stars[index], earned);
    const solved = p.stars.filter((s) => s > 0).length;
    const coins = first ? puzzleCoins(puzzle.rating) : 0;
    const bonus = first ? bonusFor(solved) : 0;
    profile.coins += coins + bonus;
    let reward: PuzzleModuleProgress['reward'] = null;
    if (first && solved === PUZZLES_PER_MODULE && !p.completedAt) {
      const item = completionItem(ITEMS.filter((i) => i.forSale && !profile.inventory.includes(i.id)).map((i) => i.id));
      if (item) profile.inventory.push(item);
      else profile.coins += COMPLETION_COINS;
      reward = { item, coins: item ? null : COMPLETION_COINS };
      p.completedAt = now();
      p.reward = reward;
    }
    save();
    emit({ type: 'profile' });
    return { first, coins, bonus: bonus === BONUS_COINS ? bonus : 0, stars: earned, solved, reward };
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
};
