// Adds the Lichess themes (fork, pin, mateIn2, …) to the puzzles already picked, without
// changing which puzzles a module has: the app turns them into the puzzle's goal ("Mate in
// 2", "Win material with a fork"). Reads the Lichess puzzle database from stdin, like build.ts:
//
//   curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | node scripts/puzzles/enrich.ts
import { createInterface } from 'node:readline';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Puzzle } from '../../supabase/functions/_shared/puzzles.ts';
import { keepTheme } from './build.ts';

const OUT = 'supabase/functions/_shared/puzzle-data';
const files = readdirSync(OUT).filter((f) => f.endsWith('.json'));
const data = new Map(files.map((f) => [f, JSON.parse(readFileSync(`${OUT}/${f}`, 'utf8')) as Puzzle[]]));
const wanted = new Map<string, Puzzle>();
for (const list of data.values()) for (const p of list) if (!p.goal && !p.themes) wanted.set(p.id, p);
console.log(`${wanted.size} puzzles without themes`);

let found = 0;
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
// read to the end even when everything is found: stopping early breaks the pipe (pipefail)
for await (const line of rl) {
  if (!wanted.size) continue;
  const comma = line.indexOf(',');
  const p = wanted.get(line.slice(0, comma));
  if (!p) continue;
  p.themes = line.split(',')[7].split(' ').filter(keepTheme);
  wanted.delete(p.id);
  found++;
}

for (const [f, list] of data) writeFileSync(`${OUT}/${f}`, JSON.stringify(list, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(`themes added to ${found}; not found: ${[...wanted.keys()].join(' ') || 'none'}`);
if (wanted.size) process.exit(1);
