// Paddle's checkout (Paddle.js v2, from Paddle's CDN): loaded only when a player opens a
// coin purchase. Paddle shows its own payment window over the app, takes the payment as
// the merchant of record, and tells the server through a webhook (supabase/functions/payments).
import { getPrefs } from '../app/prefs';

const TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
const ENV = (import.meta.env.VITE_PADDLE_ENV as string | undefined) === 'production' ? 'production' : 'sandbox';
const SCRIPT = 'https://cdn.paddle.com/paddle/v2/paddle.js';

/** This build has Paddle settings (a client-side token). */
export const paddleConfigured = () => !!TOKEN;

/** Test payments only (Paddle's sandbox: test cards, no real money). */
export const paddleSandbox = ENV === 'sandbox';

interface PaddleEvent {
  name?: string;
}
interface PaddleJs {
  Environment: { set(env: string): void };
  Initialize(options: { token: string; eventCallback?: (e: PaddleEvent) => void }): void;
  Checkout: {
    open(options: { transactionId: string; customer?: { email: string }; settings?: Record<string, unknown> }): void;
    close(): void;
  };
}

let loading: Promise<PaddleJs> | null = null;
let onEvent: (e: PaddleEvent) => void = () => {};

function load(): Promise<PaddleJs> {
  loading ??= new Promise<PaddleJs>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => {
      const paddle = (window as unknown as { Paddle?: PaddleJs }).Paddle;
      if (!paddle) return reject(new Error('Paddle did not load'));
      if (ENV === 'sandbox') paddle.Environment.set('sandbox');
      paddle.Initialize({ token: TOKEN!, eventCallback: (e) => onEvent(e) });
      resolve(paddle);
    };
    script.onerror = () => reject(new Error('Paddle did not load'));
    document.head.append(script);
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/**
 * Open Paddle's checkout for a transaction the server created. Resolves `true` when the
 * payment went through, `false` when the player closed the window without paying.
 */
export async function openCheckout(transactionId: string, email?: string): Promise<boolean> {
  const paddle = await load();
  return new Promise((resolve) => {
    let paid = false;
    onEvent = (e) => {
      if (e.name === 'checkout.completed') {
        paid = true;
        // let the player see Paddle's confirmation for a moment
        setTimeout(() => paddle.Checkout.close(), 2500);
      }
      if (e.name === 'checkout.closed') resolve(paid);
    };
    paddle.Checkout.open({
      transactionId,
      ...(email ? { customer: { email } } : {}),
      settings: { displayMode: 'overlay', theme: 'dark', locale: getPrefs().language, allowLogout: false },
    });
  });
}
