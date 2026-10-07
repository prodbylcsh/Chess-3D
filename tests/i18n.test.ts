// Every string the interface translates must have a Czech entry. Finds the
// literals passed to t(), tk() and tn() across src/ and checks the dictionary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cs } from '../src/i18n/cs.ts';

const STRING = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
// t('text', …) and tk('text'); tn(count, 'one', 'other') takes a count first
const CALL = new RegExp(String.raw`(?<![\w.])tk?\(\s*(${STRING})`, 'g');
const COUNT = new RegExp(String.raw`(?<![\w.])tn\((?:[^,()]|\([^()]*\))+,\s*(${STRING})\s*,\s*(${STRING})`, 'g');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

const unquote = (literal: string) => literal.slice(1, -1).replace(/\\(.)/g, '$1');

function keys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of files('src')) {
    if (file.includes(`${join('src', 'i18n')}`) && !file.endsWith('keys.ts')) continue;
    const source = readFileSync(file, 'utf8');
    for (const [, text] of source.matchAll(CALL)) found.set(unquote(text), file);
    for (const [, one, other] of source.matchAll(COUNT)) {
      found.set(unquote(one), file);
      found.set(unquote(other), file);
      found.set(`${unquote(other)}#few`, file);
    }
  }
  return found;
}

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
