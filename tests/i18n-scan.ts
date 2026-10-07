// Finds the interface strings in src/: literals passed to t() and tk(), and
// tn(count, 'one', 'other') (which also needs an '<other>#few' entry for Czech).
// Used by tests/i18n.test.ts and .claude/skills/i18n/scripts/sync.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** Every key, in order of first appearance, with the file it was found in. */
export function scanKeys(root = 'src'): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of files(root)) {
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
