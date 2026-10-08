import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AccountError,
  USERNAME_COOLDOWN_DAYS,
  nextUsernameChange,
  profileUpdate,
  usernameProblem,
  type ProfileRow,
} from '../supabase/functions/_shared/accounts.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 8);

function row(over: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'u1',
    username: null,
    icon_id: null,
    onboarding_step: 0,
    onboarded_at: null,
    username_changed_at: null,
    created_at: new Date(NOW - 10 * DAY).toISOString(),
    ...over,
  };
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof AccountError) return err.code;
    throw err;
  }
  return null;
};

test('username rules', () => {
  assert.equal(usernameProblem('ab'), 'short');
  assert.equal(usernameProblem('a'.repeat(21)), 'long');
  assert.equal(usernameProblem('knight rider'), 'chars');
  assert.equal(usernameProblem('Žluťoučký'), 'chars');
  assert.equal(usernameProblem('Admin'), 'reserved');
  assert.equal(usernameProblem('Knight_Rider_42'), null);
  assert.equal(usernameProblem('abc'), null);
  assert.equal(usernameProblem('a'.repeat(20)), null);
});

test('the first username during onboarding is free; later changes wait 30 days', () => {
  const first = profileUpdate(row(), { username: 'Knight' }, NOW);
  assert.deepEqual(first, { username: 'Knight' });

  const onboarded = row({ username: 'Knight', icon_id: 'king', onboarded_at: new Date(NOW - 5 * DAY).toISOString() });
  const change = profileUpdate(onboarded, { username: 'Rook' }, NOW);
  assert.equal(change.username, 'Rook');
  assert.equal(change.username_changed_at, new Date(NOW).toISOString());

  const recent = { ...onboarded, username_changed_at: new Date(NOW - 3 * DAY).toISOString() };
  assert.equal(code(() => profileUpdate(recent, { username: 'Bishop' }, NOW)), 'cooldown');
  const old = { ...onboarded, username_changed_at: new Date(NOW - (USERNAME_COOLDOWN_DAYS + 1) * DAY).toISOString() };
  assert.equal(profileUpdate(old, { username: 'Bishop' }, NOW).username, 'Bishop');

  // saving the same name again is not a change
  assert.deepEqual(profileUpdate(recent, { username: 'Knight' }, NOW), {});
  assert.equal(nextUsernameChange(null), null);
});

test('icons: any icon item, nothing else', () => {
  assert.equal(profileUpdate(row(), { iconId: 'queen' }, NOW).icon_id, 'queen');
  assert.equal(profileUpdate(row(), { iconId: 'sun-king' }, NOW).icon_id, 'sun-king');
  assert.equal(profileUpdate(row(), { iconId: 'season-2-iron' }, NOW).icon_id, 'season-2-iron');
  assert.equal(code(() => profileUpdate(row(), { iconId: 'frost-set' }, NOW)), 'unknown_icon');
  assert.equal(code(() => profileUpdate(row(), { iconId: 'nope' }, NOW)), 'unknown_icon');
});

test('onboarding finishes only with a username and an icon', () => {
  assert.equal(code(() => profileUpdate(row({ username: 'Knight' }), { onboarded: true }, NOW)), 'not_ready');
  const done = profileUpdate(row({ username: 'Knight' }), { iconId: 'king', onboarded: true, onboardingStep: 4 }, NOW);
  assert.equal(done.onboarded_at, new Date(NOW).toISOString());
  assert.equal(done.onboarding_step, 4);
  assert.equal(profileUpdate(row(), { onboardingStep: 99 }, NOW).onboarding_step, 4);
  assert.equal(code(() => profileUpdate(row(), { onboardingStep: 1.5 }, NOW)), 'bad_request');
  assert.equal(code(() => profileUpdate(row(), { username: 42 as unknown as string }, NOW)), 'bad_request');
});
