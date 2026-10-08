// Account and profile rules shared by the app (form checks) and the `account`
// Edge Function (the only place profiles are written). Pure functions; problems
// are returned as codes, and the app turns them into translated messages.
import { itemDef } from './shop.ts';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[A-Za-z0-9_]+$/;

/** Names nobody may take (compared case-insensitively). */
export const RESERVED_USERNAMES: readonly string[] = [
  'admin',
  'administrator',
  'moderator',
  'mod',
  'support',
  'help',
  'system',
  'official',
  'staff',
  'guest',
  'player',
  'anonymous',
  'wizardchess',
  'wizard_chess',
  'wizardbot',
  'wizard_bot',
];

export type UsernameProblem = 'short' | 'long' | 'chars' | 'reserved';

export function usernameProblem(name: string): UsernameProblem | null {
  if (name.length < USERNAME_MIN) return 'short';
  if (name.length > USERNAME_MAX) return 'long';
  if (!USERNAME_RE.test(name)) return 'chars';
  if (RESERVED_USERNAMES.includes(name.toLowerCase())) return 'reserved';
  return null;
}

/** Usernames can be changed once per this many days (the first choice in onboarding is free). */
export const USERNAME_COOLDOWN_DAYS = 30;

/** When the next username change is allowed, or null if it is allowed now. */
export function nextUsernameChange(changedAt: string | null, now = Date.now()): Date | null {
  if (!changedAt) return null;
  const next = new Date(changedAt).getTime() + USERNAME_COOLDOWN_DAYS * 86_400_000;
  return next > now ? new Date(next) : null;
}

/** The onboarding wizard's steps: welcome, username, icon, done. */
export const ONBOARDING_STEPS = 4;

/** A stored profile as the database holds it. */
export interface ProfileRow {
  id: string;
  username: string | null;
  icon_id: string | null;
  onboarding_step: number;
  onboarded_at: string | null;
  username_changed_at: string | null;
  created_at: string;
}

/** What a player may ask to change. */
export interface ProfilePatch {
  username?: string;
  iconId?: string;
  onboardingStep?: number;
  onboarded?: boolean;
}

export type PatchProblem =
  | UsernameProblem
  | 'cooldown'
  | 'unknown_icon'
  | 'not_ready'
  | 'bad_request';

export class AccountError extends Error {
  readonly code: PatchProblem | string;
  readonly status: number;
  /** extra data for the client, e.g. when the next username change is allowed */
  readonly detail?: Record<string, unknown>;

  constructor(code: PatchProblem | string, message: string, status = 400, detail?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** Profile icons a player may use: any icon item (starters, shop and season icons). */
export function isIcon(id: string): boolean {
  return itemDef(id)?.category === 'icon';
}

/**
 * Turn a requested change into the columns to write, or throw an AccountError.
 * Username uniqueness is left to the database's unique index.
 *
 * Icon ownership is not checked yet: purchases still live in the browser until the
 * shop moves to the server (M6), so any known icon is accepted.
 */
export function profileUpdate(row: ProfileRow, patch: ProfilePatch, now = Date.now()): Partial<ProfileRow> {
  if (typeof patch !== 'object' || patch === null) throw new AccountError('bad_request', 'Nothing to change.');
  const out: Partial<ProfileRow> = {};

  if (patch.username !== undefined) {
    if (typeof patch.username !== 'string') throw new AccountError('bad_request', 'Invalid username.');
    const problem = usernameProblem(patch.username);
    if (problem) throw new AccountError(problem, 'Invalid username.');
    if (patch.username !== row.username) {
      if (row.onboarded_at) {
        const next = nextUsernameChange(row.username_changed_at, now);
        if (next) throw new AccountError('cooldown', 'Username changed too recently.', 400, { next: next.toISOString() });
        out.username_changed_at = new Date(now).toISOString();
      }
      out.username = patch.username;
    }
  }

  if (patch.iconId !== undefined) {
    if (typeof patch.iconId !== 'string' || !isIcon(patch.iconId)) throw new AccountError('unknown_icon', 'Unknown profile icon.');
    out.icon_id = patch.iconId;
  }

  if (patch.onboardingStep !== undefined) {
    if (!Number.isInteger(patch.onboardingStep)) throw new AccountError('bad_request', 'Invalid onboarding step.');
    out.onboarding_step = Math.max(0, Math.min(ONBOARDING_STEPS, patch.onboardingStep));
  }

  if (patch.onboarded === true && !row.onboarded_at) {
    const username = out.username ?? row.username;
    const icon = out.icon_id ?? row.icon_id;
    if (!username || !icon) throw new AccountError('not_ready', 'Choose a username and an icon first.');
    out.onboarded_at = new Date(now).toISOString();
  }

  return out;
}
