// Keeps src/i18n/cs.ts in step with the strings used in src/.
//
//   node .claude/skills/i18n/scripts/sync.ts                 # report missing / stale keys
//   node .claude/skills/i18n/scripts/sync.ts --template      # print missing keys as JSON to fill in
//   node .claude/skills/i18n/scripts/sync.ts new.json        # merge translations, drop stale, rewrite cs.ts
//
// Run from the repository root. The JSON file maps English text to Czech.
import { readFileSync, writeFileSync } from 'node:fs';
import { cs } from '../../../../src/i18n/cs.ts';
import { scanKeys } from '../../../../tests/i18n-scan.ts';

const CS_FILE = 'src/i18n/cs.ts';
const arg = process.argv[2];

const keys = scanKeys();
const missing = [...keys.keys()].filter((k) => !(k in cs));
const stale = Object.keys(cs).filter((k) => !keys.has(k));

if (!arg || arg === '--template') {
  if (arg === '--template') {
    console.log(JSON.stringify(Object.fromEntries(missing.map((k) => [k, ''])), null, 2));
  } else {
    console.log(`${keys.size} keys · ${missing.length} missing · ${stale.length} stale`);
    for (const k of missing) console.log(`  missing  ${keys.get(k)}: ${k}`);
    for (const k of stale) console.log(`  stale    ${k}`);
  }
  process.exit(missing.length ? 1 : 0);
}

const added = JSON.parse(readFileSync(arg, 'utf8')) as Record<string, string>;
const empty = Object.entries(added).filter(([, v]) => !v.trim());
if (empty.length) {
  console.error(`Empty translations for: ${empty.map(([k]) => k).join(' | ')}`);
  process.exit(1);
}
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const merged: Record<string, string> = { ...cs, ...added };
const broken = Object.entries(added).filter(([en, tr]) => vars(en.replace(/#few$/, '')) !== vars(tr));
if (broken.length) {
  console.error(`Placeholders differ for: ${broken.map(([k]) => k).join(' | ')}`);
  process.exit(1);
}

const quote = (s: string) => (s.includes("'") && !s.includes('"') ? JSON.stringify(s) : `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
const lines = [...keys.keys()].filter((k) => k in merged).map((k) => `  ${quote(k)}: ${quote(merged[k])},`);
writeFileSync(
  CS_FILE,
  [
    '// Czech interface strings, keyed by the English text in the code.',
    '// `<text>#few` entries are the 2–4 plural forms used by tn().',
    'export const cs: Record<string, string> = {',
    ...lines,
    '};',
    '',
  ].join('\n'),
);
const still = [...keys.keys()].filter((k) => !(k in merged));
console.log(`wrote ${lines.length} entries · removed ${stale.length} stale · ${still.length} still missing`);
for (const k of still) console.log(`  missing  ${keys.get(k)}: ${k}`);
process.exit(still.length ? 1 : 0);
