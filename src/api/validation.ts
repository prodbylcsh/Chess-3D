import { t } from '../i18n';

// Input rules shared by forms (and later mirrored by database constraints).

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[A-Za-z0-9_]+$/;

/** null when valid, otherwise a message for the user */
export function usernameProblem(name: string): string | null {
  if (name.length < USERNAME_MIN) return t('At least {n} characters', { n: USERNAME_MIN });
  if (name.length > USERNAME_MAX) return t('At most {n} characters', { n: USERNAME_MAX });
  if (!USERNAME_RE.test(name)) return t('Letters, numbers and _ only');
  return null;
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

/** Usernames can be changed once per this many days (the first choice in onboarding is free). */
export const USERNAME_COOLDOWN_DAYS = 30;

/** When the next username change is allowed, or null if it is allowed now. */
export function nextUsernameChange(changedAt: string | null, now = Date.now()): Date | null {
  if (!changedAt) return null;
  const next = new Date(changedAt).getTime() + USERNAME_COOLDOWN_DAYS * 86_400_000;
  return next > now ? new Date(next) : null;
}
