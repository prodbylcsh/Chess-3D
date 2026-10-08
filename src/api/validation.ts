import { t } from '../i18n';
import { USERNAME_COOLDOWN_DAYS, USERNAME_MAX, USERNAME_MIN, nextUsernameChange, usernameProblem as usernameRule } from '#shared/accounts.ts';

// Form checks. Username rules come from the server's shared module, so the app
// and the `account` Edge Function always agree; this file adds the messages.

export { USERNAME_COOLDOWN_DAYS, USERNAME_MAX, USERNAME_MIN, nextUsernameChange };

/** null when valid, otherwise a message for the user */
export function usernameProblem(name: string): string | null {
  switch (usernameRule(name)) {
    case 'short':
      return t('At least {n} characters', { n: USERNAME_MIN });
    case 'long':
      return t('At most {n} characters', { n: USERNAME_MAX });
    case 'chars':
      return t('Letters, numbers and _ only');
    case 'reserved':
      return t('This name is reserved');
    default:
      return null;
  }
}

export function emailProblem(email: string): string | null {
  if (!email.trim()) return t('Enter your email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return t('That email does not look right');
  return null;
}

export const PASSWORD_MIN = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return t('At least {n} characters', { n: PASSWORD_MIN });
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return t('Use letters and at least one number');
  return null;
}

/** 0 (weak) … 3 (strong), for the strength meter */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= PASSWORD_MIN) score++;
  if (/[A-Za-z]/.test(password) && /\d/.test(password)) score++;
  if (password.length >= 12 || /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}
