// The live project's auth settings come from supabase/config.toml
// (supabase/auth-config.ts, applied by the deploy workflow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REDIRECT_URLS, SITE_URL, TEMPLATES, authConfig, parseToml } from '../supabase/auth-config.ts';

const toml = parseToml(readFileSync('supabase/config.toml', 'utf8'));
const config = authConfig(toml, (path) => readFileSync(path, 'utf8'));

test('the live project gets the decided account rules', () => {
  assert.equal(config.mailer_autoconfirm, false, 'email sign-ups confirm their address');
  assert.equal(config.external_anonymous_users_enabled, true, 'guests play invite games');
  assert.equal(config.mailer_secure_email_change_enabled, true);
  assert.equal(config.password_min_length, 8);
  // GoTrue's value for "letters and digits" (what the CLI gives the local stack)
  assert.equal(config.password_required_characters, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789');
  assert.equal(config.disable_signup, false);
});

test('players return to the site; local addresses stay out of the live allow-list', () => {
  assert.equal(config.site_url, SITE_URL);
  assert.ok(REDIRECT_URLS.every((url) => url.startsWith('https://')));
  assert.ok(REDIRECT_URLS.some((url) => url.startsWith(SITE_URL)));
});

test('every email exists in English and Czech and carries its link', () => {
  for (const name of TEMPLATES) {
    const subject = String(config[`mailer_subjects_${name}`]);
    const body = String(config[`mailer_templates_${name}_content`]);
    assert.match(subject, /^\{\{ if eq \.Data\.language "cs" \}\}.+\{\{ else \}\}.+\{\{ end \}\}$/, `${name} subject`);
    assert.match(body, /^\{\{ if eq \.Data\.language "cs" \}\}/, `${name} body starts with the Czech branch`);
    assert.match(body, /lang="cs"[\s\S]*\{\{ else \}\}[\s\S]*lang="en"[\s\S]*\{\{ end \}\}\s*$/, `${name} body has both languages`);
    assert.equal(body.match(/\{\{ \.ConfirmationURL \}\}/g)?.length, 2, `${name} links in both languages`);
  }
  assert.equal(String(config.mailer_templates_email_change_content).match(/\{\{ \.NewEmail \}\}/g)?.length, 2);
});
