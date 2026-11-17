// The puzzles of a module, loaded when needed (one small JSON file per module).
//
// The app gets them without their solutions (src/features/puzzles/data, built by
// scripts/puzzles/client-data.ts): the server judges every move (audit, November 2026).
// Only the in-browser demo back-end needs the solutions, and only builds without Supabase
// (or `VITE_ACCOUNTS=mock`) include them: the condition is fixed at build time, so the live
// site never ships them.
import type { Puzzle, PuzzleInfo } from '#shared/puzzles.ts';

const FILES = import.meta.glob<PuzzleInfo[]>('../features/puzzles/data/*.json', { import: 'default' });

export function modulePuzzles(id: string): Promise<PuzzleInfo[]> {
  const load = FILES[`../features/puzzles/data/${id}.json`];
  return load ? load() : Promise.reject(new Error(`no puzzles for ${id}`));
}

/** Whether this build carries the demo back-end's copy of the solutions. */
export const DEMO_SOLUTIONS = import.meta.env.VITE_ACCOUNTS === 'mock' || !import.meta.env.VITE_SUPABASE_URL;

const FULL: Record<string, () => Promise<Puzzle[]>> = DEMO_SOLUTIONS
  ? import.meta.glob<Puzzle[]>('../../supabase/functions/_shared/puzzle-data/[!a]*.json', { import: 'default' })
  : {};
const ALTERNATIVES: () => Promise<Record<string, Record<string, string[][]>>> = DEMO_SOLUTIONS
  ? () => import('../../supabase/functions/_shared/puzzle-data/alternatives.json').then((m) => m.default)
  : () => Promise.resolve({});

/** The demo back-end's puzzles with their solutions, and the other good moves per puzzle. */
export async function demoPuzzles(id: string): Promise<{ puzzles: Puzzle[]; alternatives: Record<string, string[][]> }> {
  const load = FULL[`../../supabase/functions/_shared/puzzle-data/${id}.json`];
  if (!load) throw new Error(`no puzzles for ${id}`);
  const [puzzles, all] = await Promise.all([load(), ALTERNATIVES()]);
  return { puzzles, alternatives: all[id] ?? {} };
}
