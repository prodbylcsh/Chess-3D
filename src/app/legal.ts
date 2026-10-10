// The Privacy Policy and Terms of Service are static pages (public/legal/) in English and
// Czech, so they work without the app and have stable addresses (Google links to them).
import { getPrefs } from './prefs';

export type LegalPage = 'privacy' | 'terms';

/** Address of a legal page in the current interface language. */
export function legalUrl(page: LegalPage): string {
  return `${import.meta.env.BASE_URL}legal/${getPrefs().language === 'cs' ? 'cs/' : ''}${page}.html`;
}

export const CONTACT_EMAIL = 'seblis@seznam.cz';
