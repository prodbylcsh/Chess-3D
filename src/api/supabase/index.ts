// Accounts on Supabase (milestone 4): sign-up and sign-in (email, Apple, Google),
// email confirmation, password reset, and the player's own profile (username,
// icon, onboarding), written through the `account` Edge Function.
//
// Everything else (coins, rank, items, friends, messages, matchmaking) still runs
// on the in-browser store until its milestone; the signed-in Supabase user becomes
// that store's session (`adoptAccount`).
import { FunctionsHttpError, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { ProfileRow } from '#shared/accounts.ts';
import { getPrefs, subscribePrefs } from '../../app/prefs';
import { t } from '../../i18n';
import { appUrl, authReturn, cleanAuthReturn } from '../../net/supabase';
import { shortDate } from '../../ui/format';
import { createMockApi } from '../mock';
import { adoptAccount, db, forgetAccount, save, SEED_PLAYERS } from '../mock/db';
import { owns } from '../mock/shop';
import {
  ApiError,
  type Account,
  type AccountService,
  type Api,
  type AuthLanding,
  type AuthProviderId,
  type AuthService,
  type Profile,
  type ProfileService,
} from '../types';
import { emailProblem, passwordProblem, usernameProblem } from '../validation';

type Social = Exclude<AuthProviderId, 'email'>;
const PROVIDER_NAMES: Record<Social, string> = { apple: 'Apple', google: 'Google' };

function toAccount(user: User): Account {
  const provider = user.app_metadata?.provider;
  return { id: user.id, email: user.email ?? '', provider: provider === 'apple' || provider === 'google' ? provider : 'email' };
}

const somethingWrong = () => new ApiError('server_error', t('Something went wrong. Please try again.'));

/** Supabase Auth errors → translated ApiErrors. */
function authError(error: { code?: string; message?: string; status?: number }): ApiError {
  switch (error.code) {
    case 'invalid_credentials':
      return new ApiError('bad_credentials', t('Wrong email or password.'));
    case 'email_not_confirmed':
      return new ApiError('email_not_confirmed', t('Confirm your email first: open the link we sent you.'));
    case 'user_already_exists':
    case 'email_exists':
      return new ApiError('email_taken', t('An account with this email already exists. Sign in instead.'));
    case 'weak_password':
      return new ApiError('weak_password', t('Use letters and at least one number'));
    case 'same_password':
      return new ApiError('same_password', t('Choose a password different from your current one.'));
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return new ApiError('rate_limited', t('Too many attempts. Please wait a minute and try again.'));
    case 'signup_disabled':
    case 'email_provider_disabled':
      return new ApiError('signup_disabled', t('Sign-ups are closed at the moment.'));
    default:
      if (error.status === 0 || /fetch/i.test(error.message ?? '')) return new ApiError('network', t('Could not reach the server. Check your connection.'));
      return somethingWrong();
  }
}

/** The `account` Edge Function's errors → translated ApiErrors. */
function accountError(code: string, detail?: { next?: string }): ApiError {
  switch (code) {
    case 'taken':
      return new ApiError('username_taken', t('That username is taken.'));
    case 'cooldown':
      return new ApiError('cooldown', t('You can change your username again on {date}.', { date: detail?.next ? shortDate(new Date(detail.next)) : '' }));
    case 'short':
    case 'long':
    case 'chars':
    case 'reserved':
      return new ApiError('invalid', t('That username is not allowed.'));
    case 'unknown_icon':
      return new ApiError('unknown_icon', t('Unknown profile icon.'));
    case 'not_ready':
      return new ApiError('not_ready', t('Choose a username and an icon first.'));
    case 'confirm':
      return new ApiError('confirm', t('Type your username exactly to confirm.'));
    case 'unauthorized':
    case 'guest':
      return new ApiError('unauthorized', t('Please sign in again.'));
    case 'network':
      return new ApiError('network', t('Could not reach the server. Check your connection.'));
    default:
      return somethingWrong();
  }
}

/** Demo players (friends, matchmaking) exist only in the browser, but their names are taken too. */
const isDemoName = (name: string) => SEED_PLAYERS.some((p) => p.username.toLowerCase() === name.toLowerCase());

function identity(row: ProfileRow) {
  return {
    username: row.username,
    iconId: row.icon_id,
    onboardingStep: row.onboarding_step,
    onboarded: !!row.onboarded_at,
    usernameChangedAt: row.username_changed_at,
    createdAt: row.created_at,
  };
}

export function createSupabaseApi(client: SupabaseClient, url: string, key: string): Api {
  const local = createMockApi();

  async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.functions.invoke<T>('account', { body: { action, ...body } });
    if (!error) return data!;
    if (error instanceof FunctionsHttpError) {
      const payload = await (error.context as Response).json().catch(() => null);
      throw accountError(payload?.code ?? 'server_error', payload?.detail);
    }
    throw accountError('network');
  }

  async function user(): Promise<User> {
    const { data } = await client.auth.getSession();
    const u = data.session?.user;
    if (!u || u.is_anonymous) throw accountError('unauthorized');
    return u;
  }

  /** Copy the server's profile into the local store and return the full profile. */
  async function adopt(row: ProfileRow): Promise<Profile> {
    return structuredClone(adoptAccount(toAccount(await user()), identity(row)));
  }

  /** Check a password by signing in with it again (Supabase has no separate check). */
  async function verifyPassword(email: string, password: string, message: string): Promise<void> {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error.code === 'invalid_credentials' ? new ApiError('bad_password', message) : authError(error);
  }

  /** Auth emails are written in the player's language (the templates read
   *  user_metadata.language), so keep it in step with the interface language. */
  async function syncLanguage(): Promise<void> {
    const { data } = await client.auth.getSession();
    const u = data.session?.user;
    const { language } = getPrefs();
    if (u && !u.is_anonymous && u.user_metadata?.language !== language) await client.auth.updateUser({ data: { language } });
  }
  subscribePrefs(() => void syncLanguage().catch(() => {}));

  let providers: Promise<Record<Social, boolean>> | null = null;
  let landing: Promise<AuthLanding | null> | null = null;

  const auth: AuthService = {
    async current() {
      await auth.landing(); // a returning email link or provider signs the player in first
      const { data } = await client.auth.getSession();
      const u = data.session?.user;
      if (!u || u.is_anonymous) return null;
      void syncLanguage().catch(() => {});
      return toAccount(u);
    },

    async signUp(email, password) {
      const problem = emailProblem(email) ?? passwordProblem(password);
      if (problem) throw new ApiError('invalid', problem);
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: appUrl(), data: { language: getPrefs().language } },
      });
      if (error) throw authError(error);
      // with confirmations on, an existing address also lands here (no hint for attackers)
      return data.session && data.user ? { account: toAccount(data.user) } : { confirmEmail: email.trim() };
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw authError(error);
      return toAccount(data.user);
    },

    providers() {
      providers ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
        .then((r) => r.json())
        .then((s: { external?: Record<string, boolean> }) => ({ apple: !!s.external?.apple, google: !!s.external?.google }))
        .catch(() => ({ apple: false, google: false }));
      return providers;
    },

    async signInWith(provider) {
      if (!(await auth.providers())[provider]) {
        throw new ApiError('provider_disabled', t('Sign in with {provider} is not available yet.', { provider: PROVIDER_NAMES[provider] }));
      }
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: appUrl() } });
      if (error) throw authError(error);
      return new Promise<Account>(() => {}); // the browser is on its way to the provider
    },

    async resendConfirmation(email) {
      const { error } = await client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: appUrl() } });
      if (error) throw authError(error);
    },

    async requestPasswordReset(email) {
      const problem = emailProblem(email);
      if (problem) throw new ApiError('invalid', problem);
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl({ flow: 'recovery' }) });
      // unknown addresses are not an error: nobody learns who has an account
      if (error) throw authError(error);
    },

    async updatePassword(password) {
      const problem = passwordProblem(password);
      if (problem) throw new ApiError('invalid', problem);
      const { error } = await client.auth.updateUser({ password });
      if (error) throw authError(error);
    },

    landing() {
      landing ??= (async (): Promise<AuthLanding | null> => {
        const r = authReturn;
        if (!r.code && !r.error && !r.recovery) return null;
        const exchanged = r.code ? !(await client.auth.exchangeCodeForSession(r.code)).error : false;
        cleanAuthReturn();
        if (r.error) {
          return {
            kind: 'error',
            message:
              r.error.code === 'otp_expired'
                ? t('This link has expired or was already used. Ask for a new one.')
                : t('That link did not work. Please try again.'),
          };
        }
        if (r.recovery) {
          // the code only works in the browser that asked for the link
          return exchanged
            ? { kind: 'recovery' }
            : { kind: 'error', message: t('Open the reset link in the browser where you asked for it, or ask for a new one.') };
        }
        // a sign-up link opened in another browser confirms the address but can't sign in there
        return exchanged ? null : { kind: 'confirmed' };
      })();
      return landing;
    },

    onChange(fn) {
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') fn({ type: 'signedOut' });
        if (event === 'PASSWORD_RECOVERY') fn({ type: 'recovery' });
      });
      return () => data.subscription.unsubscribe();
    },

    async signOut() {
      await client.auth.signOut({ scope: 'local' });
      db.sessionId = null;
      save();
    },
  };

  const profiles: ProfileService = {
    ...local.profiles,

    async me() {
      return adopt((await call<{ profile: ProfileRow }>('me')).profile);
    },

    async checkUsername(username) {
      if (usernameProblem(username)) return 'invalid';
      if (isDemoName(username)) return 'taken';
      return (await call<{ status: 'available' | 'taken' | 'invalid' }>('check_username', { username })).status;
    },

    async update(patch) {
      if (patch.username != null) {
        const problem = usernameProblem(patch.username);
        if (problem) throw new ApiError('invalid', problem);
        if (isDemoName(patch.username)) throw accountError('taken');
      }
      if (patch.iconId != null) {
        const me = db.sessionId ? db.profiles[db.sessionId] : null;
        if (me && !owns(me, patch.iconId)) throw new ApiError('not_owned', t('You do not own this item.'));
      }
      return adopt((await call<{ profile: ProfileRow }>('update', { patch })).profile);
    },
  };

  const account: AccountService = {
    async changeEmail(newEmail, password) {
      const u = await user();
      const acc = toAccount(u);
      if (acc.provider !== 'email') {
        throw new ApiError('provider', t('Your email is managed by {provider}.', { provider: PROVIDER_NAMES[acc.provider] }));
      }
      const problem = emailProblem(newEmail);
      if (problem) throw new ApiError('invalid', problem);
      if (newEmail.trim().toLowerCase() === acc.email.toLowerCase()) throw new ApiError('same_email', t('That is already your email.'));
      await verifyPassword(acc.email, password, t('Your password is not correct.'));
      const { data, error } = await client.auth.updateUser(
        { email: newEmail.trim(), data: { language: getPrefs().language } },
        { emailRedirectTo: appUrl() },
      );
      if (error) throw error.code === 'email_exists' ? new ApiError('email_taken', t('That email is already used by another account.')) : authError(error);
      return { account: toAccount(data.user), confirm: true };
    },

    async changePassword(current, next) {
      const acc = toAccount(await user());
      if (acc.provider !== 'email') {
        throw new ApiError('provider', t('You sign in with Apple or Google, so there is no password to change.'));
      }
      const problem = passwordProblem(next);
      if (problem) throw new ApiError('invalid', problem);
      await verifyPassword(acc.email, current, t('Your current password is not correct.'));
      const { error } = await client.auth.updateUser({ password: next });
      if (error) throw authError(error);
    },

    async deleteAccount(username) {
      const id = (await user()).id;
      await call('delete', { username });
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      forgetAccount(id);
    },
  };

  return { ...local, demo: { accounts: false, social: true }, auth, profiles, account };
}
