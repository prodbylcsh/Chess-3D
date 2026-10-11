import { Suspense, lazy, useEffect, useState } from 'react';
import { Box, Check, Eye, Lock, Sparkles } from 'lucide-react';
import { api, type ShopItem } from '../../api';
import { CATEGORY_AUDIENCE, CATEGORY_NAMES, RARITY_NAMES, itemDescription, itemName } from '../../api/catalog';
import { useSession } from '../../app/session';
import { t } from '../../i18n';
import { Button, Coins, Modal, Spinner, confirmDialog, cx, formatNumber, useToast } from '../../ui/kit';
import { ItemPreview } from './previews';

// three.js loads only when someone opens the 3D view
const ModelViewer = lazy(() => import('./ModelViewer').then((m) => ({ default: m.ModelViewer })));

/** Piece sets and boards can be looked at in 3D. */
const hasModel = (item: ShopItem) => item.category === 'pieces' || item.category === 'board';

/** Everything about one item, with buy and use actions, and a 3D view of sets and boards. */
export function ItemDialog({ item, onClose, onChanged }: { item: ShopItem | null; onClose: () => void; onChanged: () => void }) {
  const [view3d, setView3d] = useState(false);
  useEffect(() => setView3d(false), [item?.id]);
  return (
    <Modal open={!!item} onClose={onClose} width={view3d ? 920 : 520}>
      {item &&
        (view3d ? (
          <Suspense fallback={<div className="model-viewer-status"><Spinner size={28} /></div>}>
            <ModelViewer itemId={item.id} name={itemName(item.id)} onBack={() => setView3d(false)} />
          </Suspense>
        ) : (
          <ItemDetail item={item} onChanged={onChanged} onView3d={hasModel(item) ? () => setView3d(true) : undefined} />
        ))}
    </Modal>
  );
}

function ItemDetail({ item, onChanged, onView3d }: { item: ShopItem; onChanged: () => void; onView3d?: () => void }) {
  const { profile, setProfile } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<'buy' | 'equip' | null>(null);
  const coins = profile?.coins ?? 0;
  const missing = item.price - coins;
  const name = itemName(item.id);

  async function buy() {
    const ok = await confirmDialog({
      title: t('Buy {name}?', { name }),
      text: t('{price} coins will be taken from your balance.', { price: formatNumber(item.price) }),
      confirmLabel: t('Buy'),
    });
    if (!ok) return;
    setBusy('buy');
    try {
      setProfile(await api.shop.buy(item.id));
      toast(t('{name} is yours!', { name }), { tone: 'success' });
      onChanged();
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  async function equip() {
    setBusy('equip');
    try {
      setProfile(await api.shop.equip(item.id));
      toast(t('Now using {name}.', { name }), { tone: 'success' });
      onChanged();
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cx('item-detail', `rarity-${item.rarity}`)}>
      <div className="item-detail-art">
        <ItemPreview id={item.id} animate />
        {onView3d && (
          <Button variant="secondary" size="sm" className="item-detail-3d" icon={<Box size={15} />} onClick={onView3d}>
            {t('View in 3D')}
          </Button>
        )}
      </div>
      <div className="item-detail-head">
        <span className="rarity-label">{t(RARITY_NAMES[item.rarity])}</span>
        <span className="faint">· {t(CATEGORY_NAMES[item.category])}</span>
      </div>
      <h2 className="display item-detail-name">{name}</h2>
      <p className="muted">{itemDescription(item.id)}</p>
      <p className="item-detail-note">
        <Eye size={15} /> {t(CATEGORY_AUDIENCE[item.category])}
      </p>
      {!item.forSale && !item.owned && (
        <p className="item-detail-note">
          <Sparkles size={15} /> {t('Season reward: it cannot be bought.')}
        </p>
      )}

      <footer className="item-detail-foot">
        {item.owned ? (
          <span className="item-owned">
            <Check size={16} /> {item.price ? t('Owned') : t('Free for everyone')}
          </span>
        ) : item.forSale ? (
          <Coins amount={item.price} size={20} />
        ) : (
          <span />
        )}
        {item.equipped ? (
          <Button variant="secondary" icon={<Check size={16} />} disabled>
            {t('In use')}
          </Button>
        ) : item.owned ? (
          <Button variant="primary" loading={busy === 'equip'} onClick={() => void equip()}>
            {t('Use')}
          </Button>
        ) : item.forSale ? (
          missing > 0 ? (
            <Button variant="secondary" icon={<Lock size={15} />} disabled>
              {t('{n} more coins needed', { n: formatNumber(missing) })}
            </Button>
          ) : (
            <Button variant="primary" loading={busy === 'buy'} onClick={() => void buy()}>
              {t('Buy')}
            </Button>
          )
        ) : null}
      </footer>
    </div>
  );
}
