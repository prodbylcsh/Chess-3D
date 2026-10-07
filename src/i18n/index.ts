// Interface translations. Strings are written in English in the code and wrapped
// in t(); each language is a dictionary from the English text to its translation.
// Missing entries fall back to English (tests/i18n.test.ts checks Czech is complete).
import { useCallback } from 'react';
import { getPrefs, usePrefs } from '../app/prefs';
import { cs } from './cs';

export type Vars = Record<string, string | number>;

const DICTIONARIES: Record<string, Record<string, string>> = { cs };

export function translate(language: string, text: string, vars?: Vars): string {
  const s = DICTIONARIES[language]?.[text] ?? text;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s;
}

/** Translate outside React (game modes, helpers). Uses the current language. */
export function t(text: string, vars?: Vars): string {
  return translate(getPrefs().language, text, vars);
}

/** Translate inside components; re-renders when the language changes. */
export function useT(): (text: string, vars?: Vars) => string {
  const { language } = usePrefs();
  return useCallback((text: string, vars?: Vars) => translate(language, text, vars), [language]);
}

/**
 * Translate a count: `tn(3, '{n} move', '{n} moves')`. English picks one/other;
 * Czech also has a "few" form (2–4), stored in the dictionary as `<other>#few`.
 */
export function tn(n: number, one: string, other: string): string {
  const lang = getPrefs().language;
  if (n === 1) return translate(lang, one, { n });
  const few = n >= 2 && n <= 4 ? DICTIONARIES[lang]?.[`${other}#few`] : undefined;
  return few ? few.replace(/\{n\}/g, String(n)) : translate(lang, other, { n });
}

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

/** "Silver II" / "Stříbro II" */
export function rankName(tierName: string, division: number | null): string {
  const tier = t(tierName);
  return division ? `${tier} ${ROMAN[division]}` : tier;
}

export function tierName(tierId: string): string {
  return t(tierId.charAt(0).toUpperCase() + tierId.slice(1));
}

/** Locale for dates and numbers. */
export function locale(): string {
  return getPrefs().language === 'cs' ? 'cs-CZ' : 'en-GB';
}

/** Rank label from a rank's tier id and division: "Silver II" / "Stříbro II". */
export function rankLabel(rank: { tier: string; division: number | null }): string {
  return rankName(rank.tier.charAt(0).toUpperCase() + rank.tier.slice(1), rank.division);
}

/** Translate a stored rank label such as "Silver II". */
export function rankText(label: string | null | undefined): string {
  if (!label) return '';
  const [tier, division] = label.split(' ');
  return division ? `${t(tier)} ${division}` : t(tier);
}

/** Marks a string in data (menus, tables) as translatable; translate it with t() when shown. */
export const tk = (text: string) => text;
