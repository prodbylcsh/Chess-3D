// The puzzles of a module, loaded when needed (one small JSON file per module, shared with
// the server: supabase/functions/_shared/puzzle-data, built by scripts/puzzles/build.ts).
import type { Puzzle } from '#shared/puzzles.ts';

const FILES = import.meta.glob<Puzzle[]>('../../supabase/functions/_shared/puzzle-data/*.json', { import: 'default' });

export function modulePuzzles(id: string): Promise<Puzzle[]> {
  const load = FILES[`../../supabase/functions/_shared/puzzle-data/${id}.json`];
  return load ? load() : Promise.reject(new Error(`no puzzles for ${id}`));
}
