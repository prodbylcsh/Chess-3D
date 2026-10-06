import type { AiRequest } from './worker';

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function call<T>(req: WithoutId<AiRequest>): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result);
    };
  }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ ...req, id } as AiRequest);
  });
}

export const ai = {
  /** best move for the side to move, in UCI notation */
  move: (fen: string, level: number) => call<string | null>({ type: 'move', fen, level }),
  /** a player's accuracy (0-100) over a finished game */
  accuracy: (moves: string[], side: 'w' | 'b') => call<number | null>({ type: 'accuracy', moves, side }),
};

export { LEVELS } from './search.ts';
