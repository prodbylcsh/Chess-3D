// Stockfish in a Web Worker (public/engine/, GPL v3, see its README): scores positions for
// the analysis of finished games. Always the same build and the same fixed search, so every
// device gets the same scores (supabase/functions/_shared/analysis.ts).
import { ANALYSIS, encodeScore } from '#shared/analysis.ts';

const ENGINE_URL = new URL(`${import.meta.env.BASE_URL}engine/${ANALYSIS.engine}.js`, document.baseURI).href;

/** Can this browser run the engine (WebAssembly with SIMD)? */
export function engineSupported(): boolean {
  if (typeof WebAssembly !== 'object' || typeof Worker !== 'function') return false;
  // the smallest module using a SIMD instruction (v128.const)
  const simd = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 22, 1, 20, 0, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11]);
  return WebAssembly.validate(simd);
}

export class Stockfish {
  private readonly worker: Worker;
  private listener: ((line: string) => void) | null = null;
  private failed: ((err: Error) => void) | null = null;
  private readonly ready: Promise<void>;

  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e) => this.listener?.(String(e.data));
    this.worker.onerror = (e) => {
      e.preventDefault();
      this.failed?.(new Error(e.message || 'engine failed'));
    };
    this.ready = this.until('uciok', ['uci'])
      .then(() => this.until('readyok', [`setoption name Hash value ${ANALYSIS.hashMb}`, 'isready']))
      .then(() => undefined);
  }

  /** Send commands and resolve with the first line starting with `token`. */
  private until(token: string, commands: string[], onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      this.failed = reject;
      this.listener = (line) => {
        onLine?.(line);
        if (!line.startsWith(token)) return;
        this.listener = null;
        this.failed = null;
        resolve(line);
      };
      for (const c of commands) this.worker.postMessage(c);
    });
  }

  /** Score of a position (FEN) in the report's encoding: White's point of view, mates as ±(10,000 − n). */
  async score(fen: string): Promise<number> {
    await this.ready;
    let score = 0;
    const whiteToMove = fen.split(' ')[1] === 'w';
    await this.until('bestmove', ['ucinewgame', `position fen ${fen}`, `go nodes ${ANALYSIS.nodes}`], (line) => {
      const m = / score (cp|mate) (-?\d+)/.exec(line);
      if (m) score = encodeScore(m[1] as 'cp' | 'mate', Number(m[2]), whiteToMove);
    });
    return score;
  }

  /**
   * The engine's view of a position for the side to move (puzzles): its best move, the
   * score (centipawns; a mate as ±(10,000 − n)) and the line it expects. `only`: search just
   * these moves (UCI). Calls must not overlap.
   */
  async search(fen: string, nodes: number, only?: string[]): Promise<{ best: string; score: number; pv: string[] }> {
    await this.ready;
    let score = 0;
    let pv: string[] = [];
    const line = await this.until('bestmove', ['ucinewgame', `position fen ${fen}`, `go nodes ${nodes}${only?.length ? ` searchmoves ${only.join(' ')}` : ''}`], (l) => {
      const m = / score (cp|mate) (-?\d+)/.exec(l);
      if (m) score = m[1] === 'cp' ? Number(m[2]) : Number(m[2]) > 0 ? 10_000 - Number(m[2]) : -10_000 - Number(m[2]);
      const p = / pv (.+)$/.exec(l);
      if (p) pv = p[1].trim().split(/\s+/);
    });
    return { best: line.split(' ')[1] ?? '', score, pv };
  }

  dispose(): void {
    this.worker.terminate();
    this.failed?.(new Error('engine stopped'));
  }
}
