// Every write to a player's profile and account.
//
// POST { action: 'me' }                          → { profile }   (created on first call)
// POST { action: 'check_username', username }    → { status: 'available' | 'taken' | 'invalid' }
// POST { action: 'update', patch }               → { profile }   patch: { username?, iconId?, onboardingStep?, onboarded? }
// POST { action: 'showcase', showcase }          → { ok: true }    rank, stats, loadout others see
// POST { action: 'delete', username }            → { deleted: true }
//
// Errors: { error, code, detail? } with an HTTP error status. Only registered
// players have a profile; anonymous guest sessions get 403 'guest'. The rules
// live in ../_shared/accounts.ts (shared with the app's form checks).
import { createClient, type User } from '@supabase/supabase-js';
import { AccountError, profileUpdate, usernameProblem, type ProfilePatch, type ProfileRow } from '../_shared/accounts.ts';
import { parseShowcase } from '../_shared/social.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UNIQUE_VIOLATION = '23505';

async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

/** The player's profile, created on first use. */
async function me(user: User): Promise<ProfileRow> {
  const existing = await loadProfile(user.id);
  if (existing) return existing;
  const { error } = await admin.from('profiles').insert({ id: user.id });
  if (error && error.code !== UNIQUE_VIOLATION) throw error; // a parallel first call already created it
  return (await loadProfile(user.id))!;
}

async function usernameTaken(username: string, exceptId: string): Promise<boolean> {
  // ilike treats _ as a wildcard: escape it so "a_b" does not match "axb"
  const pattern = username.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await admin.from('profiles').select('id').ilike('username', pattern).neq('id', exceptId).limit(1);
  if (error) throw error;
  return data.length > 0;
}

async function handle(user: User, body: Record<string, unknown>): Promise<unknown> {
  switch (body.action) {
    case 'me':
      return { profile: await me(user) };

    case 'check_username': {
      const username = typeof body.username === 'string' ? body.username : '';
      if (usernameProblem(username)) return { status: 'invalid' };
      return { status: (await usernameTaken(username, user.id)) ? 'taken' : 'available' };
    }

    case 'update': {
      const row = await me(user);
      const changes = profileUpdate(row, body.patch as ProfilePatch);
      if (Object.keys(changes).length === 0) return { profile: row };
      const { data, error } = await admin.from('profiles').update(changes).eq('id', user.id).select().single();
      if (error?.code === UNIQUE_VIOLATION) throw new AccountError('taken', 'That username is taken.', 409);
      if (error) throw error;
      return { profile: data as ProfileRow };
    }

    case 'showcase': {
      const showcase = parseShowcase(body.showcase);
      if (!showcase) throw new AccountError('bad_request', 'Invalid showcase.');
      await me(user);
      const { error } = await admin.from('profiles').update({ showcase }).eq('id', user.id);
      if (error) throw error;
      return { ok: true };
    }

    case 'delete': {
      const row = await loadProfile(user.id);
      if (!row?.username || body.username !== row.username) {
        throw new AccountError('confirm', 'Type your username exactly to confirm.');
      }
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return { deleted: true };
    }

    default:
      throw new AccountError('bad_request', 'Unknown action.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed', code: 'bad_request' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return reply({ error: 'Please sign in again.', code: 'unauthorized' }, 401);
  if (auth.user.is_anonymous) return reply({ error: 'Create an account first.', code: 'guest' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid JSON.', code: 'bad_request' }, 400);
  }

  try {
    return reply(await handle(auth.user, body));
  } catch (err) {
    if (err instanceof AccountError) return reply({ error: err.message, code: err.code, detail: err.detail }, err.status);
    console.error(err);
    return reply({ error: 'Server error.', code: 'server_error' }, 500);
  }
});
