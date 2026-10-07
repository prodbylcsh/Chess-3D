import { locale, t } from '../i18n';

/** "just now", "5 min ago", "3 h ago", "yesterday", "12 Mar" */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('just now');
  if (s < 3600) return t('{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86_400) return t('{n} h ago', { n: Math.floor(s / 3600) });
  if (s < 172_800) return t('yesterday');
  if (s < 604_800) return t('{n} days ago', { n: Math.floor(s / 86_400) });
  return new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

/** "14:05" today, otherwise a short date */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

export function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
}

export function shortDate(date: Date): string {
  return date.toLocaleDateString(locale());
}

export function winRate(wins: number, losses: number, draws: number): number | null {
  const games = wins + losses + draws;
  return games ? Math.round(((wins + draws / 2) / games) * 100) : null;
}
