// What the Premium screens say about each plan (docs/PLATFORM.md §4.9). The numbers come
// from the rules (#shared/subscription.ts); only the wording lives here.
import { useState } from 'react';
import { Crown, GraduationCap, Sparkles, type LucideIcon } from 'lucide-react';
import { COIN_PACKS } from '#shared/payments.ts';
import { MODULES, MODULE_PRICE } from '#shared/puzzles.ts';
import { LEARN_PRICE } from '#shared/learn.ts';
import { PLANS, SHIELD_PRICE, perMonth, type Period, type PlanId } from '#shared/subscription.ts';
import { api } from '../../api';
import { locale, t, tk } from '../../i18n';
import { paddleSandbox } from '../../net/paddle';
import { formatNumber } from '../../ui/kit';

export const euros = (cents: number) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(cents / 100);
/**
 * A price split for the big display: the number large, the € sign smaller, on the side the
 * language puts it ("€6.67" in English, "6,67 €" in Czech).
 */
export function priceParts(cents: number): { before: string; number: string; after: string } {
  const parts = new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).formatToParts(cents / 100);
  const at = parts.findIndex((x) => x.type === 'currency');
  const first = parts.findIndex((x) => x.type === 'integer');
  const number = parts.filter((x) => x.type !== 'currency' && x.type !== 'literal').map((x) => x.value).join('');
  return at < first ? { before: parts[at].value, number, after: '' } : { before: '', number, after: parts[at].value };
}

/** What the paid content costs in coins: the anchor next to the plans. */
export const PAID_MODULES = MODULES.filter((m) => !m.free).length;
export const MODULES_COINS = PAID_MODULES * MODULE_PRICE;
export const LEARN_COINS = LEARN_PRICE;

/** The cheapest monthly price, as offers say it ("from €3.33 a month", yearly Apprentice). */
export const FROM_PRICE = perMonth(PLANS.apprentice, 'year');

/** The coin pack with the same price as a plan's month ("the same as a €9.99 pack"). */
export const samePack = (plan: PlanId) => COIN_PACKS.find((p) => p.price === PLANS[plan].price.month) ?? null;

export const PLAN_ICON: Record<PlanId, LucideIcon> = { apprentice: GraduationCap, wizard: Crown, archmage: Sparkles };

/** One line under the plan's name. */
export const PLAN_PROMISE: Record<PlanId, string> = {
  apprentice: tk('Learn and train without limits'),
  wizard: tk('The full Wizard Chess'),
  archmage: tk('Every look in the game, yours to use'),
};

export interface Benefit {
  title: string;
  text?: string;
  /** a value for the placeholders of title and text */
  values?: Record<string, string | number>;
}

/** The plan's own benefits: the big ones with a line, then the small ones. */
export function benefitsOf(plan: PlanId): { major: Benefit[]; minor: Benefit[] } {
  const p = PLANS[plan];
  const coins = { coins: formatNumber(p.coins), pack: samePack(plan) ? euros(samePack(plan)!.price) : '' };
  switch (plan) {
    case 'apprentice':
      return {
        major: [
          { title: tk('All {n} puzzle modules'), text: tk('and every new one · {coins} coins of puzzles'), values: { n: MODULES.length, coins: formatNumber(MODULES_COINS) } },
          { title: tk('All of Learn'), text: tk('chapters 3–8 and new courses') },
          { title: tk('Game Review, {n} a day'), text: tk('your best and worst moves on the 3D board'), values: { n: p.reviews ?? 0 } },
        ],
        minor: [{ title: tk('Free hints in puzzles') }, { title: tk('{n} streak shield a month'), values: { n: p.shields } }, { title: tk('Silver Apprentice badge') }],
      };
    case 'wizard':
      return {
        major: [
          { title: tk('{coins} coins every month'), text: tk('in your balance the moment you pay'), values: coins },
          { title: tk('Unlimited Game Review'), text: tk('every game, every move explained') },
          { title: tk('A new icon every month'), text: tk('only for subscribers, yours forever') },
        ],
        minor: [
          { title: tk('{n} streak shields a month'), values: { n: p.shields } },
          { title: tk('+{n}% coins on coin packs'), values: { n: Math.round(p.packBonus * 100) } },
          { title: tk('Gold Wizard badge and name') },
        ],
      };
    case 'archmage':
      return {
        major: [
          { title: tk('{coins} coins every month'), text: tk('more than twice Wizard’s'), values: coins },
          { title: tk('The Wardrobe'), text: tk('use every piece set, board and effect') },
          { title: tk('Early access'), text: tk('new items and modules {n} days early'), values: { n: p.earlyDays } },
        ],
        minor: [
          { title: tk('{n} streak shields a month'), values: { n: p.shields } },
          { title: tk('+{n}% coins on coin packs'), values: { n: Math.round(p.packBonus * 100) } },
          { title: tk('Animated badge and icon frame') },
        ],
      };
  }
}

/** "Everything in Apprentice, plus" above a plan's own benefits. */
export const PLUS_LINE: Record<PlanId, string> = {
  apprentice: tk('Included'),
  wizard: tk('Everything in Apprentice, plus'),
  archmage: tk('Everything in Wizard, plus'),
};

/** The comparison table: a row per benefit, a cell per plan (free first). */
/** A cell: a text to translate (with the row's values), or one with its own values. */
export type Cell = string | { text: string; values: Record<string, string | number> };
export interface CompareRow {
  label: string;
  cells: [Cell, Cell, Cell, Cell];
  values?: Record<string, string | number>;
}
export interface CompareGroup {
  title: string;
  rows: CompareRow[];
}

const PERCENT = tk('+{n}%');

export function comparison(): CompareGroup[] {
  const shields = (id: PlanId) => String(PLANS[id].shields);
  return [
    {
      title: tk('Puzzles and Learn'),
      rows: [
        { label: tk('Puzzle modules'), cells: [tk('Openings · others {price} coins'), tk('all {n} + new'), tk('all {n} + new'), tk('all {n} + new')], values: { price: formatNumber(MODULE_PRICE), n: MODULES.length } },
        { label: tk('Learn'), cells: [tk('chapters 1–2'), tk('everything'), tk('everything'), tk('everything')] },
        { label: tk('Hints in puzzles'), cells: [tk('up to 10 coins'), tk('free'), tk('free'), tk('free')] },
        { label: tk('Game Review'), cells: [tk('1 a day'), tk('3 a day'), tk('unlimited'), tk('unlimited')] },
      ],
    },
    {
      title: tk('Coins'),
      rows: [
        { label: tk('Coins every month'), cells: ['–', '–', formatNumber(PLANS.wizard.coins), formatNumber(PLANS.archmage.coins)] },
        {
          label: tk('Bonus on coin packs'),
          cells: ['–', '–', { text: PERCENT, values: { n: Math.round(PLANS.wizard.packBonus * 100) } }, { text: PERCENT, values: { n: Math.round(PLANS.archmage.packBonus * 100) } }],
        },
      ],
    },
    {
      title: tk('Streak and looks'),
      rows: [
        { label: tk('Streak shields a month'), cells: [tk('{price} coins each'), shields('apprentice'), shields('wizard'), shields('archmage')], values: { price: formatNumber(SHIELD_PRICE) } },
        { label: tk('Subscriber icon every month'), cells: ['–', '–', tk('yes'), tk('yes, animated frame')] },
        { label: tk('The Wardrobe (every shop item)'), cells: ['–', '–', '–', tk('yes')] },
        { label: tk('Early access to new items'), cells: ['–', '–', '–', tk('{n} days')], values: { n: PLANS.archmage.earlyDays } },
        { label: tk('Badge'), cells: ['–', tk('silver'), tk('gold, gold name'), tk('violet, animated')] },
      ],
    },
    {
      title: tk('Fair play'),
      rows: [{ label: tk('Rank, matchmaking, clocks, rewards'), cells: [tk('the same for everyone, always'), '', '', ''] }],
    },
  ];
}

/** Translate a benefit or table text with its values (numbers and dashes stay as they are). */
export function say(text: Cell, values?: Record<string, string | number>): string {
  if (typeof text !== 'string') return t(text.text, text.values);
  return text === '' || text === '–' || /^[\d\s ,.]+$/.test(text) ? text : t(text, values);
}

// ------------------------------------------------------------------ is Premium shown at all?

const TEST_KEY = 'wizard-chess.premium-test';

/**
 * Premium shows wherever subscribing works: in the demo, and on the real site once Paddle
 * takes real payments. While Paddle runs in its sandbox (test payments), only those who
 * opened `#/premium?test=1` on this device see it, like "Buy coins".
 */
export function premiumShown(search = ''): boolean {
  if (api.premium.checkout === 'demo') return true;
  if (!api.premium.available) return false;
  if (!paddleSandbox) return true;
  try {
    if (new URLSearchParams(search).get('test') === '1') sessionStorage.setItem(TEST_KEY, '1');
    return sessionStorage.getItem(TEST_KEY) === '1';
  } catch {
    return false;
  }
}

export function usePremiumShown(): boolean {
  const [shown] = useState(() => premiumShown(window.location.hash.split('?')[1] ?? ''));
  return shown;
}

export type { Period, PlanId };
