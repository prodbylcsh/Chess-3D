/// <reference lib="webworker" />
// Runs the AI off the main thread so animations never stutter while it thinks.
import { chooseMove, estimateAccuracy } from './search.ts';

export type AiRequest =
  | { id: number; type: 'move'; fen: string; level: number }
  | { id: number; type: 'accuracy'; moves: string[]; side: 'w' | 'b' };

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const req = e.data;
  try {
    const result = req.type === 'move' ? chooseMove(req.fen, req.level) : estimateAccuracy(req.moves, req.side);
    self.postMessage({ id: req.id, result });
  } catch (err) {
    self.postMessage({ id: req.id, error: String(err) });
  }
};
