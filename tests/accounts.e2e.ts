// End-to-end test of accounts against a running local Supabase stack
// (.claude/skills/local-supabase: scripts/start.sh prints the keys):
//   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
// Emails are read from the local inbox (Mailpit API, or the skill's SMTP sink).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const INBOX = process.env.INBOX_URL ?? 'http://127.0.0.1:54324';
const KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY || !SERVICE) throw new Error('Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see `npx supabase status`)');

const APP = 'http://127.0.0.1:5173/';
const PASSWORD = 'knight42move';
const run = Date.now().toString(36);
const email = (name: string) => `${name}-${run}@example.com`;
/** usernames must be unique across runs against the same database */
const uname = (name: string) => `${name}_${run}`.slice(0, 20);

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const newClient = () => createClient(URL, KEY!, { auth: { persistSession: false, autoRefreshToken: false, flowType: 'pkce' } });

/** A confirmed account, signed in. */
async function player(name: string): Promise<SupabaseClient> {
  const { error } = await admin.auth.admin.createUser({ email: email(name), password: PASSWORD, email_confirm: true });
  assert.ifError(error);
  const client = newClient();
  const res = await client.auth.signInWithPassword({ email: email(name), password: PASSWORD });
  assert.ifError(res.error);
  return client;
}

/** Call the `account` function; returns the body, or { status, code } on an error status. */
async function account(client: SupabaseClient, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke('account', { body });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    return { status: res.status, ...(await res.json()) };
  }
  throw error;
}

/** The newest email to `to` with a matching subject, waiting for it to arrive. */
async function mail(to: string, subject: RegExp): Promise<{ Subject: string; HTML: string; link: string }> {
  for (let i = 0; i < 50; i++) {
    const list = (await (await fetch(`${INBOX}/api/v1/messages`)).json()) as { messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }> };
    const hit = list.messages.find((m) => m.To.some((a) => a.Address === to) && subject.test(m.Subject));
    if (hit) {
      const message = (await (await fetch(`${INBOX}/api/v1/message/${hit.ID}`)).json()) as { Subject: string; HTML: string; Text: string };
      const link = /href="([^"]+\/auth\/v1\/verify[^"]+)"/.exec(message.HTML)?.[1] ?? /(https?:\/\/\S+\/auth\/v1\/verify\S+)/.exec(message.Text)?.[1];
      assert.ok(link, 'the email contains a verify link');
      return { Subject: message.Subject, HTML: message.HTML, link: link.replaceAll('&amp;', '&') };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no email to ${to}`);
}

/** The link in the newest matching email. */
const mailTo = async (to: string, subject: RegExp) => (await mail(to, subject)).link;

/** Follow an emailed link like a browser would and return where it sends the player. */
async function follow(link: string): Promise<URL> {
  const res = await fetch(link, { redirect: 'manual' });
  return new globalThis.URL(res.headers.get('location')!);
}

test('sign-up needs the emailed link; the link brings the player back signed in', async () => {
  const client = newClient();
  const signUp = await client.auth.signUp({ email: email('newbie'), password: PASSWORD, options: { emailRedirectTo: APP } });
  assert.ifError(signUp.error);
  assert.equal(signUp.data.session, null, 'no session before the address is confirmed');

  const early = await client.auth.signInWithPassword({ email: email('newbie'), password: PASSWORD });
  assert.equal(early.error?.code, 'email_not_confirmed');

  const back = await follow(await mailTo(email('newbie'), /confirm/i));
  assert.equal(back.origin + back.pathname, APP);
  const code = back.searchParams.get('code');
  assert.ok(code, 'the app receives a PKCE code in the query string');
  const exchanged = await client.auth.exchangeCodeForSession(code);
  assert.ifError(exchanged.error);

  const me = await account(client, { action: 'me' });
  assert.equal(me.profile.username, null);
  assert.equal(me.profile.onboarding_step, 0);
});

test('emails are written in the language the player uses', async () => {
  const client = newClient();
  const signUp = await client.auth.signUp({
    email: email('jana'),
    password: PASSWORD,
    options: { emailRedirectTo: APP, data: { language: 'cs' } },
  });
  assert.ifError(signUp.error);
  const confirm = await mail(email('jana'), /Potvrď/);
  assert.equal(confirm.Subject, 'Potvrď svůj e-mail pro Wizard Chess');
  assert.match(confirm.HTML, /lang="cs"/);
  assert.match(confirm.HTML, /Potvrdit e-mail/);
  assert.doesNotMatch(confirm.HTML, /Confirm email/);

  await client.auth.resetPasswordForEmail(email('jana'), { redirectTo: APP });
  const reset = await mail(email('jana'), /heslo/);
  assert.equal(reset.Subject, 'Nové heslo pro Wizard Chess');
  assert.match(reset.HTML, /Zvolit nové heslo/);

  // no language (e.g. older accounts): English
  await newClient().auth.signUp({ email: email('john'), password: PASSWORD, options: { emailRedirectTo: APP } });
  const english = await mail(email('john'), /Confirm/);
  assert.equal(english.Subject, 'Confirm your email for Wizard Chess');
  assert.match(english.HTML, /lang="en"/);
});

test('onboarding: unique usernames (any case), known icons, finished only when complete', async () => {
  const a = await player('alice');
  const b = await player('bob');
  const name = uname('Alice');

  assert.deepEqual(await account(a, { action: 'check_username', username: name }), { status: 'available' });
  assert.equal((await account(a, { action: 'update', patch: { onboarded: true } })).code, 'not_ready');
  assert.equal((await account(a, { action: 'update', patch: { iconId: 'frost-set' } })).code, 'unknown_icon');
  assert.equal((await account(a, { action: 'update', patch: { username: 'Admin' } })).code, 'reserved');
  assert.equal((await account(a, { action: 'update', patch: { username: 'no spaces' } })).code, 'chars');

  const done = await account(a, { action: 'update', patch: { username: name, iconId: 'queen', onboardingStep: 4, onboarded: true } });
  assert.equal(done.profile.username, name);
  assert.ok(done.profile.onboarded_at);

  assert.deepEqual(await account(b, { action: 'check_username', username: name.toUpperCase() }), { status: 'taken' });
  const clash = await account(b, { action: 'update', patch: { username: name.toLowerCase() } });
  assert.equal(clash.status, 409);
  assert.equal(clash.code, 'taken');

  // profiles are public to signed-in players
  const { data } = await b.from('profiles').select('username, icon_id').ilike('username', name);
  assert.deepEqual(data, [{ username: name, icon_id: 'queen' }]);
});

test('after onboarding, the username can change once per 30 days', async () => {
  const c = await player('carol');
  await account(c, { action: 'update', patch: { username: uname('Carol'), iconId: 'rook', onboarded: true } });
  const first = await account(c, { action: 'update', patch: { username: uname('Carol2') } });
  assert.equal(first.profile.username, uname('Carol2'));
  assert.ok(first.profile.username_changed_at);
  const second = await account(c, { action: 'update', patch: { username: uname('Carol3') } });
  assert.equal(second.code, 'cooldown');
  assert.ok(Date.parse(second.detail.next) > Date.now() + 29 * 86_400_000);
});

test('players cannot write profiles directly, and guests have none', async () => {
  const d = await player('dave');
  await account(d, { action: 'me' });
  const update = await d.from('profiles').update({ username: uname('Hacker') }).eq('id', (await d.auth.getUser()).data.user!.id).select();
  assert.ok(update.error || update.data?.length === 0, 'direct update is refused');
  const insert = await d.from('profiles').insert({ id: crypto.randomUUID(), username: uname('Ghost') });
  assert.ok(insert.error, 'direct insert is refused');

  const guest = newClient();
  assert.ifError((await guest.auth.signInAnonymously()).error);
  const me = await account(guest, { action: 'me' });
  assert.equal(me.status, 403);
  assert.equal(me.code, 'guest');

  const nobody = await fetch(`${URL}/functions/v1/account`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"me"}' });
  assert.equal(nobody.status, 401);
});

test('password reset: the emailed link signs the player in to choose a new password', async () => {
  await player('erin');
  const client = newClient();
  const reset = await client.auth.resetPasswordForEmail(email('erin'), { redirectTo: `${APP}?flow=recovery` });
  assert.ifError(reset.error);

  const back = await follow(await mailTo(email('erin'), /reset/i));
  assert.equal(back.searchParams.get('flow'), 'recovery', 'our marker survives the redirect');
  const exchanged = await client.auth.exchangeCodeForSession(back.searchParams.get('code')!);
  assert.ifError(exchanged.error);
  assert.ifError((await client.auth.updateUser({ password: 'bishop99diag' })).error);

  const again = newClient();
  assert.ifError((await again.auth.signInWithPassword({ email: email('erin'), password: 'bishop99diag' })).error);
  assert.equal((await again.auth.signInWithPassword({ email: email('erin'), password: PASSWORD })).error?.code, 'invalid_credentials');

  // a used link no longer works and says why
  const reused = await follow(await mailTo(email('erin'), /reset/i));
  assert.equal(reused.searchParams.get('error_code'), 'otp_expired');
});

test('deleting an account needs the exact username and removes everything', async () => {
  const f = await player('frank');
  const id = (await f.auth.getUser()).data.user!.id;
  await account(f, { action: 'update', patch: { username: uname('Frank'), iconId: 'pawn', onboarded: true } });

  assert.equal((await account(f, { action: 'delete', username: uname('frank') })).code, 'confirm');
  assert.deepEqual(await account(f, { action: 'delete', username: uname('Frank') }), { deleted: true });

  const { data } = await admin.from('profiles').select('id').eq('id', id);
  assert.deepEqual(data, []);
  const signIn = await newClient().auth.signInWithPassword({ email: email('frank'), password: PASSWORD });
  assert.equal(signIn.error?.code, 'invalid_credentials');
});
