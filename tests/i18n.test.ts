// Every string the interface translates must have a Czech entry. Finds the
// literals passed to t(), tk() and tn() across src/ and checks the dictionary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cs } from '../src/i18n/cs.ts';
import { scanKeys as keys } from './i18n-scan.ts';

test('every translatable string has a Czech translation', () => {
  const found = keys();
  assert.ok(found.size > 300, `only ${found.size} strings found; is the scanner broken?`);
  const missing = [...found].filter(([k]) => !(k in cs)).map(([k, file]) => `${file}: ${k}`);
  assert.deepEqual(missing, []);
});

test('Czech translations keep their {placeholders}', () => {
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  const broken = Object.entries(cs)
    .filter(([en, tr]) => vars(en.replace(/#few$/, '')) !== vars(tr))
    .map(([en]) => en);
  assert.deepEqual(broken, []);
});

test('the dictionary has no leftover entries', () => {
  const found = keys();
  const stale = Object.keys(cs).filter((k) => !found.has(k));
  assert.deepEqual(stale, []);
});
