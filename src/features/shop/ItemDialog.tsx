import { useState } from 'react';
import { Check, Eye, Lock, Sparkles } from 'lucide-react';
import { api, type ShopItem } from '../../api';
import { CATEGORY_AUDIENCE, CATEGORY_NAMES, RARITY_NAMES, itemDescription, itemName } from '../../api/catalog';
import { useSession } from '../../app/session';
import { t } from '../../i18n';
import { Button, Coins, Modal, confirmDialog, cx, formatNumber, useToast } from '../../ui/kit';
import { ItemPreview } from './previews';

/** Everything about one item, with buy and use actions. */
export function ItemDialog({ item, onClose, onChanged }: { item: ShopItem | null; onClose: () => void; onChanged: () => void }) {
  return (
    <Modal open={!!item} onClose={onClose} width={520}>
      {item && <ItemDetail item={item} onChanged={onChanged} />}
    </Modal>
  );
}

function ItemDetail({ item, onChanged }: { item: ShopItem; onChanged: () => void }) {
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
