// Buying coins for real money: pick a pack, agree to delivery right away (which ends the
// right of withdrawal), pay in Paddle's checkout; the coins arrive when Paddle tells our
// server the payment went through (docs/PLATFORM.md §4.5).
import { useState } from 'react';
import { Link } from 'react-router';
import { COIN_PACKS, bonusPercent, type CoinPack } from '#shared/payments.ts';
import { PLANS, RECOMMENDED, packBonus } from '#shared/subscription.ts';
import { api, ApiError } from '../../api';
import { legalUrl } from '../../app/legal';
import { useSession } from '../../app/session';
import { locale, t, withNodes } from '../../i18n';
import { openCheckout, paddleSandbox } from '../../net/paddle';
import { Button, CoinIcon, Modal, Spinner, cx, formatNumber, useToast } from '../../ui/kit';
import { usePremiumShown } from '../premium/plans';
import '../premium/premium.css';

const euros = (cents: number) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(cents / 100);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BuyCoins({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { account, profile, refresh } = useSession();
  const toast = useToast();
  const premiumShown = usePremiumShown();
  const plan = profile?.premium?.plan ?? null;
  const extra = (p: CoinPack) => packBonus(p.coins, plan);
  const [pack, setPack] = useState<CoinPack>(COIN_PACKS[1]);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<'paying' | 'confirming' | null>(null);

  /** Paddle confirms to our server separately: ask until the coins are there (about a minute at most). */
  async function confirm(transactionId: string): Promise<boolean> {
    for (let i = 0; i < 30; i++) {
      if ((await api.payments.status(transactionId).catch(() => 'created')) === 'completed') return true;
      await wait(2000);
    }
    return false;
  }

  async function buy() {
    setBusy('paying');
    try {
      const transactionId = await api.payments.checkout(pack.id);
      const paid = await openCheckout(transactionId, account?.email);
      if (!paid) return;
      setBusy('confirming');
      if (await confirm(transactionId)) {
        await refresh();
        toast(t('{coins} coins added to your balance. Thank you!', { coins: formatNumber(pack.coins + extra(pack)) }), { tone: 'success' });
        onClose();
      } else {
        toast(t('Your payment went through; the coins will appear shortly.'), { tone: 'success' });
        onClose();
      }
    } catch (err) {
      // our server's errors are translated; Paddle's script failing to load is not
      toast(err instanceof ApiError ? err.message : t('The payment could not be started. Please try again.'), { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} dismissable={!busy} width={560} title={t('Buy coins')} subtitle={t('Coins buy looks in the shop. They have no value outside Wizard Chess.')}>
      {/* the same money every month gives the coins and everything else (docs/PLATFORM.md §4.9) */}
      {premiumShown && !plan && (
        <Link to="/premium" className="premium-banner" onClick={onClose}>
          <span className="premium-label">{t('OR EVERY MONTH')}</span>
          <strong>{t('{coins} coins + every puzzle and lesson', { coins: formatNumber(PLANS[RECOMMENDED].coins) })}</strong>
          <span className="muted">{t('{plan} · {price} a month · the same price as the {pack} pack', { plan: PLANS[RECOMMENDED].name, price: euros(PLANS[RECOMMENDED].price.month), pack: formatNumber(PLANS[RECOMMENDED].coins) })}</span>
          <span className="premium-quiet">{t('See Premium')}</span>
        </Link>
      )}
      <div className="coin-packs" role="radiogroup" aria-label={t('Coin packs')}>
        {COIN_PACKS.map((p) => {
          const bonus = bonusPercent(p);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={pack.id === p.id}
              className={cx('coin-pack', pack.id === p.id && 'is-active')}
              onClick={() => setPack(p)}
              disabled={!!busy}
            >
              <CoinIcon size={26} />
              <strong>{formatNumber(p.coins)}</strong>
              {extra(p) > 0 && <span className="coin-pack-extra">{t('+{coins} {plan} bonus', { coins: formatNumber(extra(p)), plan: PLANS[plan!].name })}</span>}
              <span className="coin-pack-price">{euros(p.price)}</span>
              {bonus > 0 && <span className="coin-pack-bonus">{t('+{n}% coins', { n: bonus })}</span>}
            </button>
          );
        })}
      </div>

      <label className="coin-waiver">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={!!busy} />
        <span>
          {t('I want the coins right away and understand that I lose my right of withdrawal once they are delivered.')}{' '}
          {withNodes(t('I agree to the {terms}.'), {
            terms: (
              <a href={legalUrl('terms')} target="_blank" rel="noreferrer">
                {t('Terms of Service')}
              </a>
            ),
          })}
        </span>
      </label>

      {paddleSandbox && (
        <p className="coin-test">{t('Test mode: no real money. Pay with the card 4242 4242 4242 4242, any future date and any CVC.')}</p>
      )}

      <p className="faint coin-note">
        {t('Paddle.com handles the payment as our reseller and sends the receipt. Prices include VAT. Under 18? Ask a parent first.')}
      </p>

      <Button variant="primary" size="lg" block disabled={!agreed || !!busy} onClick={() => void buy()}>
        {busy === 'confirming' ? (
          <>
            <Spinner size={16} /> {t('Adding your coins…')}
          </>
        ) : (
          t('Pay {price}', { price: euros(pack.price) })
        )}
      </Button>
    </Modal>
  );
}
