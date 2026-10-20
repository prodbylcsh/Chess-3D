// Mock shop and seasons: buying and equipping items, and the running season.
import { t } from '../../i18n';
import { rankOf } from '#shared/rating.ts';
import { FREE_ITEMS, ITEMS, itemDef, purchaseProblem, seasonRewardPool } from '#shared/shop.ts';
import { bracketOf, resetShare, rewardHistory, seasonAt } from '#shared/seasons.ts';
import { itemInfo, type LoadoutCategory } from '../catalog';
import { ApiError, type Profile, type SeasonInfo, type SeasonsService, type ShopItem, type ShopService } from '../types';
import { db, emit, rankInfo, save, session, wait } from './db';

export function owns(profile: Profile, id: string): boolean {
  return FREE_ITEMS.includes(id) || profile.inventory.includes(id);
}

function equipped(profile: Profile, id: string): boolean {
  const def = itemDef(id);
  if (!def) return false;
  return def.category === 'icon' ? profile.iconId === id : profile.loadout[def.category] === id;
}

function view(profile: Profile, id: string): ShopItem | null {
  const info = itemInfo(id);
  if (!info) return null;
  return {
    id,
    category: info.category,
    price: info.price,
    rarity: info.rarity,
    forSale: info.forSale,
    name: info.name,
    description: info.description,
    owned: owns(profile, id),
    equipped: equipped(profile, id),
  };
}

export const shop: ShopService = {
  async items() {
    await wait(200, 450);
    const { profile } = session();
    // regular items, plus rewards the player won that are not for sale
    const ids = [...ITEMS.map((i) => i.id), ...profile.inventory.filter((id) => !ITEMS.some((i) => i.id === id))];
    return ids.map((id) => view(profile, id)).filter((x): x is ShopItem => !!x);
  },

  async buy(itemId) {
    await wait(350, 700);
    const { profile } = session();
    const problem = purchaseProblem(itemId, profile.inventory, profile.coins);
    if (problem === 'coins') throw new ApiError('insufficient_coins', t('You do not have enough coins for this item.'));
    if (problem === 'owned') throw new ApiError('owned', t('You already own this item.'));
    if (problem) throw new ApiError('not_for_sale', t('This item cannot be bought.'));
    profile.coins -= itemDef(itemId)!.price;
    profile.inventory.push(itemId);
    save();
    emit({ type: 'profile' });
    return structuredClone(profile);
  },

  async equip(itemId) {
    await wait(150, 300);
    const { profile } = session();
    const def = itemDef(itemId);
    if (!def || !owns(profile, itemId)) throw new ApiError('not_owned', t('You do not own this item.'));
    if (def.category === 'icon') profile.iconId = itemId;
    else profile.loadout[def.category as LoadoutCategory] = itemId;
    save();
    emit({ type: 'profile' });
    return structuredClone(profile);
  },
};

/** Remember the highest MMR of the running season (rewards depend on it). */
export function notePeak(profile: Profile): void {
  const season = String(seasonAt(new Date())?.number ?? 0);
  const peaks = (db.seasonPeak[profile.id] ??= {});
  peaks[season] = Math.max(peaks[season] ?? 0, profile.mmr);
}

export const seasons: SeasonsService = {
  async current(): Promise<SeasonInfo> {
    await wait(150, 350);
    const { profile } = session();
    // before season 1 (ranked closed) the panel previews season 1, without dates
    const season = seasonAt(new Date());
    const number = season?.number ?? 1;
    const peakMmr = season ? Math.max(db.seasonPeak[profile.id]?.[String(number)] ?? 0, profile.mmr) : profile.mmr;
    const history = rewardHistory(number, seasonRewardPool());
    return {
      number,
      start: season?.start.toISOString() ?? null,
      end: season?.end.toISOString() ?? null,
      peak: rankInfo(peakMmr),
      bracket: bracketOf(rankOf(peakMmr).tier.id).id,
      rewards: history[number - 1],
      resetShare: resetShare(number),
    };
  },
};
