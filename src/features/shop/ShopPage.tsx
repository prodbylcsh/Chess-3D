import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check } from 'lucide-react';
import { api, type ShopItem } from '../../api';
import { CATEGORIES, CATEGORY_NAMES, CATEGORY_PLURALS, RARITY_NAMES, itemName, type ItemCategory } from '../../api/catalog';
import { Page } from '../../app/AppLayout';
import { useSession } from '../../app/session';
import { t } from '../../i18n';
import { Badge, Coins, EmptyState, Segmented, Spinner, cx } from '../../ui/kit';
import { ItemDialog } from './ItemDialog';
import { ItemPreview } from './previews';
import { SeasonPanel } from './SeasonPanel';
import './shop.css';

type Filter = 'all' | 'owned' | 'available';

/** Shop items of the signed-in player; reloads when the profile changes (purchases, equips). */
export function useShopItems(): [ShopItem[] | null, () => void] {
  const { profile } = useSession();
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const reload = useCallback(() => void api.shop.items().then(setItems), []);
  useEffect(reload, [reload, profile?.coins, profile?.iconId, profile?.loadout]);
  return [items, reload];
}

export function ShopPage() {
  const { profile } = useSession();
  const [items, reload] = useShopItems();
  const [params, setParams] = useSearchParams();
  const category = (params.get('c') as ItemCategory | null) ?? null;
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items?.find((i) => i.id === openId) ?? null;

  const shown = useMemo(
    () =>
      (items ?? []).filter(
        (i) => (!category || i.category === category) && (filter === 'all' || (filter === 'owned' ? i.owned : !i.owned && i.forSale)),
      ),
    [items, category, filter],
  );
  const groups = CATEGORIES.filter((c) => !category || c === category)
    .map((c) => ({ category: c, items: shown.filter((i) => i.category === c) }))
    .filter((g) => g.items.length);

  const pick = (c: ItemCategory | null) => setParams(c ? { c } : {}, { replace: true });

  return (
    <Page
      title={t('Shop')}
      subtitle={t('Spend the coins you earn on looks for your games.')}
      wide
      actions={
        profile && (
          <div className="shop-balance">
            <span className="faint">{t('Balance')}</span>
            <Coins amount={profile.coins} size={20} />
          </div>
        )
      }
    >
      <SeasonPanel onShowItem={setOpenId} />

      <div className="shop-bar">
        <div className="shop-cats" role="tablist" aria-label={t('Categories')}>
          <button type="button" role="tab" aria-selected={!category} className={cx('chip', !category && 'is-active')} onClick={() => pick(null)}>
            {t('All')}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={category === c} className={cx('chip', category === c && 'is-active')} onClick={() => pick(c)}>
              {t(CATEGORY_PLURALS[c])}
            </button>
          ))}
        </div>
        <Segmented
          label={t('Show')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('All') },
            { value: 'available', label: t('To buy') },
            { value: 'owned', label: t('Owned') },
          ]}
        />
      </div>

      {!items ? (
        <div className="shop-loading">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState title={filter === 'owned' ? t('Nothing here yet') : t('You own everything here!')}>
          {filter === 'owned' ? t('Items you buy or win show up here.') : t('New items arrive with every season.')}
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.category} className="shop-section">
            {!category && <h2 className="shop-section-title">{t(CATEGORY_PLURALS[g.category])}</h2>}
            <div className="shop-grid">
              {g.items.map((item, i) => (
                <ItemCard key={item.id} item={item} index={i} onOpen={() => setOpenId(item.id)} />
              ))}
            </div>
          </section>
        ))
      )}

      <ItemDialog item={open} onClose={() => setOpenId(null)} onChanged={reload} />
    </Page>
  );
}

export function ItemCard({ item, index = 0, onOpen, compact }: { item: ShopItem; index?: number; onOpen: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      className={cx('shop-card', `rarity-${item.rarity}`, item.equipped && 'is-equipped', compact && 'is-compact')}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
      onClick={onOpen}
    >
      <span className="shop-card-art">
        <ItemPreview id={item.id} />
      </span>
      <span className="shop-card-body">
        {!compact && <span className="rarity-label">{t(RARITY_NAMES[item.rarity])}</span>}
        <strong>{itemName(item.id)}</strong>
        {!compact && <span className="faint">{t(CATEGORY_NAMES[item.category])}</span>}
      </span>
      <span className="shop-card-foot">
        {item.equipped ? (
          <Badge tone="gold">
            <Check size={12} /> {t('In use')}
          </Badge>
        ) : item.owned ? (
          <Badge tone="success">{t('Owned')}</Badge>
        ) : item.forSale ? (
          <Coins amount={item.price} size={15} />
        ) : (
          <Badge tone="violet">{t('Season reward')}</Badge>
        )}
      </span>
    </button>
  );
}
