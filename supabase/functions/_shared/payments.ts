// Coins for real money through Paddle (merchant of record: Paddle sells to the player,
// handles VAT and payment methods, and pays us out). Pure rules and Paddle helpers shared
// by the `payments` Edge Function, the app and the tests (docs/PLATFORM.md §4.5, §8.2).

export interface CoinPack {
  id: string;
  coins: number;
  /** price in euro cents, VAT included */
  price: number;
}

/** Decided October 2026. More coins per euro in the bigger packs. */
export const COIN_PACKS: readonly CoinPack[] = [
  { id: 'coins-15k', coins: 15_000, price: 499 },
  { id: 'coins-35k', coins: 35_000, price: 999 },
  { id: 'coins-75k', coins: 75_000, price: 1999 },
  { id: 'coins-200k', coins: 200_000, price: 4999 },
];

export const CURRENCY = 'EUR';

/** A purchase can be refunded within this many days, if its coins have not been spent. */
export const REFUND_DAYS = 14;

export const packOf = (id: unknown): CoinPack | null => COIN_PACKS.find((p) => p.id === id) ?? null;

/** Extra coins per euro compared with the smallest pack, in whole percent (0 for it). */
export function bonusPercent(pack: CoinPack): number {
  const base = COIN_PACKS[0];
  return Math.floor(((pack.coins / pack.price) / (base.coins / base.price) - 1) * 100);
}

/** The purchase is refundable: recent enough, and the player still has its coins. */
export function refundable(purchase: { coins: number; completedAt: string }, balance: number, now = Date.now()): boolean {
  return now - Date.parse(purchase.completedAt) <= REFUND_DAYS * 86_400_000 && balance >= purchase.coins;
}

// ------------------------------------------------------------------ Paddle

export type PaddleEnv = 'sandbox' | 'production';

export const paddleApi = (env: PaddleEnv) => (env === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com');

/**
 * The body of a Paddle transaction for one pack (POST /transactions). The price is given
 * here (a "non-catalog" item), so nothing has to be set up in Paddle's product catalogue;
 * `custom_data` tells the webhook whose coins these are.
 */
export function transactionBody(pack: CoinPack, playerId: string) {
  return {
    items: [
      {
        quantity: 1,
        price: {
          name: `${pack.coins.toLocaleString('en')} coins`,
          description: `${pack.coins.toLocaleString('en')} Wizard Chess coins`,
          unit_price: { amount: String(pack.price), currency_code: CURRENCY },
          product: {
            name: `Wizard Chess · ${pack.coins.toLocaleString('en')} coins`,
            tax_category: 'standard',
          },
        },
      },
    ],
    custom_data: { player_id: playerId, pack: pack.id },
  };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The `Paddle-Signature` header Paddle sends with a webhook body (also used by the tests). */
export async function signWebhook(body: string, secret: string, ts = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}:${body}`));
  return `ts=${ts};h1=${hex(mac)}`;
}

/** Whether a webhook really comes from Paddle: HMAC of `ts:body`, at most 5 minutes old. */
export async function verifyWebhook(header: string | null, body: string, secret: string, now = Date.now()): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(';').map((p) => p.split('=', 2) as [string, string]));
  const ts = Number(parts.ts);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300 || !parts.h1) return false;
  const expected = (await signWebhook(body, secret, ts)).split('h1=')[1];
  if (expected.length !== parts.h1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.h1.charCodeAt(i);
  return diff === 0;
}

/** What a webhook means for us: a paid purchase, a refund or chargeback, or nothing. */
export type PaymentEvent =
  | { kind: 'paid'; transactionId: string; playerId: string; pack: CoinPack; amount: number; currency: string }
  | { kind: 'reversed'; transactionId: string }
  | { kind: 'ignored' };

// deno-lint-ignore no-explicit-any
export function paymentEvent(event: any): PaymentEvent {
  const data = event?.data ?? {};
  if (event?.event_type === 'transaction.completed' || (event?.event_type === 'transaction.paid' && data.status === 'paid')) {
    const pack = packOf(data.custom_data?.pack);
    const playerId = data.custom_data?.player_id;
    if (!pack || typeof playerId !== 'string' || typeof data.id !== 'string') return { kind: 'ignored' };
    const total = Number(data.details?.totals?.grand_total ?? data.details?.totals?.total ?? pack.price);
    return { kind: 'paid', transactionId: data.id, playerId, pack, amount: total, currency: data.currency_code ?? CURRENCY };
  }
  // a whole refund approved, or a chargeback: the coins go back
  if (
    (event?.event_type === 'adjustment.created' || event?.event_type === 'adjustment.updated') &&
    typeof data.transaction_id === 'string' &&
    ((data.action === 'refund' && data.status === 'approved') || data.action === 'chargeback')
  ) {
    return { kind: 'reversed', transactionId: data.transaction_id };
  }
  return { kind: 'ignored' };
}
