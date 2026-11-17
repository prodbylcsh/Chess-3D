// The app's copy of the puzzles: everything but the solutions (audit, November 2026; `infoOf`
// in _shared/puzzles.ts). The server keeps the solutions and judges every move.
//
//   node scripts/puzzles/client-data.ts      # after any change to _shared/puzzle-data/*.json
//
// tests/puzzles-server.test.ts fails when the copy is out of date.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { MODULES, infoOf, type Puzzle } from '../../supabase/functions/_shared/puzzles.ts';

export const CLIENT_DATA = 'src/features/puzzles/data';

export function clientData(module: string): string {
  const puzzles: Puzzle[] = JSON.parse(readFileSync(`supabase/functions/_shared/puzzle-data/${module}.json`, 'utf8'));
  return `${JSON.stringify(puzzles.map(infoOf))}\n`;
}

if (import.meta.main ?? process.argv[1]?.endsWith('client-data.ts')) {
  mkdirSync(CLIENT_DATA, { recursive: true });
  for (const m of MODULES) writeFileSync(`${CLIENT_DATA}/${m.id}.json`, clientData(m.id));
  console.log(`wrote ${MODULES.length} modules to ${CLIENT_DATA}`);
}
