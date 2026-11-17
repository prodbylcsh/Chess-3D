// Playing a puzzle against the `puzzles` function the way the app does (e2e tests): open it,
// send each move (the server judges it), take hints, then solve. The solutions come from the
// server's data here, the way only a test can.
import { Chess } from 'chess.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { answerAt, dailyPuzzle, dayOf, setupMove, solution } from '../supabase/functions/_shared/puzzles.ts';
import { ALTERNATIVES, PUZZLES } from '../supabase/functions/_shared/server/puzzle-data.ts';

type Call = (client: SupabaseClient, body: Record<string, unknown>, fn?: string) => Promise<Record<string, unknown> & { code?: string }>;

export interface PlayOptions {
  /** the moves to send (default: the solution) */
  moves?: string[];
  /** wrong moves before the first right one */
  mistakes?: number;
  /** take every hint on every move */
  allHints?: boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A legal move that is neither the first answer, nor a mate, nor an approved alternative. */
export function wrongMove(module: string, index: number): string {
  const p = PUZZLES[module][index];
  const chess = new Chess(p.fen);
  const setup = setupMove(p);
  if (setup) chess.move(setup);
  const alts = ALTERNATIVES[module]?.[p.id]?.[0] ?? [];
  for (const m of chess.moves({ verbose: true })) {
    const after = new Chess(chess.fen());
    after.move(m.lan);
    if (m.lan !== answerAt(p, 0) && !after.isCheckmate() && !alts.includes(m.lan)) return m.lan;
  }
  throw new Error('no wrong move');
}

/**
 * Open a puzzle (`module: 'daily'`: today's), play it move by move, wait the minimum time and
 * solve. Returns the solve's answer (or its error).
 */
export async function playPuzzle(call: Call, client: SupabaseClient, module: string, index: number, o: PlayOptions = {}) {
  const daily = module === 'daily';
  const at = daily ? dailyPuzzle(dayOf()) : { module, index };
  const started = await call(client, daily ? { action: 'daily_start' } : { action: 'start', module, index }, 'puzzles');
  if (!started.ok) return started;
  const opened = Date.now();
  for (let i = 0; i < (o.mistakes ?? 0); i++) {
    const r = await call(client, { action: 'move', module, index, move: wrongMove(at.module, at.index) }, 'puzzles');
    if (r.kind !== 'wrong') throw new Error(`expected a mistake: ${JSON.stringify(r)}`);
  }
  for (const move of o.moves ?? solution(PUZZLES[at.module][at.index])) {
    if (o.allHints) while (((await call(client, { action: 'hint', module, index }, 'puzzles')) as { hint: unknown }).hint);
    const r = await call(client, { action: 'move', module, index, move }, 'puzzles');
    if (r.kind !== 'right' || r.done) break;
  }
  await wait(Math.max(0, 2100 - (Date.now() - opened)));
  return call(client, daily ? { action: 'daily_solve' } : { action: 'solve', module, index }, 'puzzles');
}
