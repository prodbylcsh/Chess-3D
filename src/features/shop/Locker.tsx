import { useState } from 'react';
import { Link } from 'react-router';
import { Store } from 'lucide-react';
import { CATEGORIES, CATEGORY_PLURALS, type ItemCategory } from '../../api/catalog';
import { t } from '../../i18n';
import { Modal, Spinner, cx } from '../../ui/kit';
import { ItemDialog } from './ItemDialog';
import { ItemCard, useShopItems } from './ShopPage';
import './shop.css';

/** Pick what to use from the items you own (opened from the Profile). */
export function Locker({ open, onClose, initial = 'pieces' }: { open: boolean; onClose: () => void; initial?: ItemCategory }) {
  const [items, reload] = useShopItems();
  const [category, setCategory] = useState<ItemCategory>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const owned = (items ?? []).filter((i) => i.owned && i.category === category);
  const detail = items?.find((i) => i.id === openId) ?? null;

  return (
    <Modal open={open} onClose={onClose} width={720} title={t('Your items')} subtitle={t('Choose what you use in games and on your profile.')}>
      <div className="shop-cats locker-cats" role="tablist" aria-label={t('Categories')}>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={category === c} className={cx('chip', category === c && 'is-active')} onClick={() => setCategory(c)}>
            {t(CATEGORY_PLURALS[c])}
          </button>
        ))}
      </div>
      {!items ? (
        <div className="shop-loading">
          <Spinner />
        </div>
      ) : (
        <div className="shop-grid locker-grid">
          {owned.map((item) => (
            <ItemCard key={item.id} item={item} compact onOpen={() => setOpenId(item.id)} />
          ))}
          <Link to={`/shop?c=${category}`} className="shop-card locker-more" onClick={onClose}>
            <Store size={26} />
            <strong>{t('Get more in the Shop')}</strong>
          </Link>
        </div>
      )}
      <ItemDialog item={detail} onClose={() => setOpenId(null)} onChanged={reload} />
    </Modal>
  );
}
