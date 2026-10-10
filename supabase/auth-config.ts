// Auth settings of the live Supabase project, applied by the deploy workflow
// (.github/workflows/supabase.yml) through the Management API:
//
//   SUPABASE_ACCESS_TOKEN=… PROJECT_ID=… node supabase/auth-config.ts
//
// supabase/config.toml is the source (local development runs on it), so local and
// live behave the same: email sign-up with confirmation, password rules, anonymous
// guests, secure email change and the email templates. Only the URLs differ and are
// set here. A change made in the dashboard to one of these settings is overwritten
// by the next deploy: change config.toml (or the URLs below) instead.
//
// Not handled here, set in the dashboard (they hold secrets or depend on them):
// SMTP, the email rate limit, Google and Apple sign-in. See docs/PLATFORM.md §8.4.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The address players open. Moving to the game's own domain: change both. */
export const SITE_URL = 'https://prodbylcsh.github.io/Chess-3D/';
export const REDIRECT_URLS = ['https://prodbylcsh.github.io/Chess-3D/**'];

// config.toml `password_requirements` → the Management API's character sets.
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const PASSWORD_REQUIREMENTS: Record<string, string> = {
  '': '',
  letters_digits: `${LOWER}${UPPER}:${DIGITS}`,
  lower_upper_letters_digits: `${LOWER}:${UPPER}:${DIGITS}`,
};

/** The email templates the app uses (sign-up, password reset, email change). */
export const TEMPLATES = ['confirmation', 'recovery', 'email_change'];

type Value = string | number | boolean | string[];
export type Toml = Record<string, Record<string, Value>>;

/** Just enough TOML for config.toml: [sections] and `key = value` lines. */
export function parseToml(text: string): Toml {
  const out: Toml = {};
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const head = /^\[([^\]]+)\]$/.exec(line);
    if (head) {
      section = head[1];
      continue;
    }
    const kv = /^([\w-]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    let value: Value = kv[2];
    try {
      value = JSON.parse(kv[2]) as Value; // strings, numbers, booleans, string arrays
    } catch {
      /* other TOML (inline tables, trailing comments): not needed here */
    }
    (out[section] ??= {})[kv[1]] = value;
  }
  return out;
}

function get<T extends Value>(toml: Toml, section: string, key: string, type: string): T {
  const value = toml[section]?.[key];
  if (typeof value !== type) throw new Error(`config.toml: [${section}] ${key} is missing or not a ${type}`);
  return value as T;
}

/** The PATCH body for /v1/projects/{ref}/config/auth. */
export function authConfig(toml: Toml, readFile: (path: string) => string): Record<string, string | number | boolean> {
  const requirements = PASSWORD_REQUIREMENTS[get<string>(toml, 'auth', 'password_requirements', 'string')];
  if (requirements === undefined) throw new Error('config.toml: unknown password_requirements');
  const body: Record<string, string | number | boolean> = {
    site_url: SITE_URL,
    uri_allow_list: REDIRECT_URLS.join(','),
    disable_signup: !get<boolean>(toml, 'auth', 'enable_signup', 'boolean'),
    external_anonymous_users_enabled: get<boolean>(toml, 'auth', 'enable_anonymous_sign_ins', 'boolean'),
    password_min_length: get<number>(toml, 'auth', 'minimum_password_length', 'number'),
    password_required_characters: requirements,
    external_email_enabled: get<boolean>(toml, 'auth.email', 'enable_signup', 'boolean'),
    mailer_autoconfirm: !get<boolean>(toml, 'auth.email', 'enable_confirmations', 'boolean'),
    mailer_secure_email_change_enabled: get<boolean>(toml, 'auth.email', 'double_confirm_changes', 'boolean'),
    mailer_otp_exp: get<number>(toml, 'auth.email', 'otp_expiry', 'number'),
  };
  for (const name of TEMPLATES) {
    const section = `auth.email.template.${name}`;
    body[`mailer_subjects_${name}`] = get<string>(toml, section, 'subject', 'string');
    // content_path is relative to the repository root, like the Supabase CLI reads it
    body[`mailer_templates_${name}_content`] = readFile(get<string>(toml, section, 'content_path', 'string'));
  }
  return body;
}

async function apply(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.PROJECT_ID;
  if (!token || !ref) throw new Error('SUPABASE_ACCESS_TOKEN and PROJECT_ID are required');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const toml = parseToml(readFileSync(join(root, 'supabase/config.toml'), 'utf8'));
  const wanted = authConfig(toml, (path) => readFileSync(join(root, path), 'utf8'));

  const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const read = async (): Promise<Record<string, unknown>> => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`reading the auth config failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as Record<string, unknown>;
  };

  // Only our keys are compared and printed: the full config also holds secrets.
  const differs = (current: Record<string, unknown>) => Object.keys(wanted).filter((k) => current[k] !== wanted[k]);
  const changes = differs(await read());
  if (changes.length === 0) {
    console.log('Auth settings are up to date.');
    return;
  }
  console.log(`Updating: ${changes.join(', ')}`);
  const patch = Object.fromEntries(changes.map((k) => [k, wanted[k]]));
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`updating the auth config failed: ${res.status} ${await res.text()}`);
  const left = differs(await read());
  if (left.length) throw new Error(`these settings did not take: ${left.join(', ')}`);
  console.log('Auth settings updated.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  apply().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
