// Which other moves are as good as the puzzle's own, for every move the player has to find
// (docs/PLATFORM.md §4.2 "A good move too"). The server judges a player's move with this list
// instead of trusting the browser's engine, so the solutions never have to leave the server.
//
//   node scripts/puzzles/alternatives.ts            # every module (about half an hour, 4 engines)
//   MODULES=openings node scripts/puzzles/alternatives.ts
//
// Each legal move is searched alone with the same engine (public/engine, Stockfish 19 lite)
// and the same node count the app used for its verdict (JUDGE_NODES), and `asGood` decides.
// A checkmate is always right and needs no entry. Writes
// supabase/functions/_shared/puzzle-data/alternatives.json: { [module]: { [puzzleId]: string[][] } },
// one list per player move (empty lists, and puzzles without any, are left out).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { JUDGE_NODES, MODULES, answerAt, asGood, replyAfter, setupMove, solution, type Puzzle } from '../../supabase/functions/_shared/puzzles.ts';

const DATA = 'supabase/functions/_shared/puzzle-data';
const OUT = `${DATA}/alternatives.json`;
const toMove = (m: string) => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });

/** One engine process (the browser build runs in Node as CommonJS next to its .wasm). */
class Engine {
  private readonly proc: ChildProcessWithoutNullStreams;
  private buffer = '';
  private waiting: { token: string; resolve: (line: string) => void; onLine?: (l: string) => void } | null = null;

  constructor(script: string) {
    this.proc = spawn(process.execPath, [script]);
    this.proc.stdout.on('data', (d) => {
      this.buffer += d;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop()!;
      for (const line of lines) {
        const w = this.waiting;
        if (!w) continue;
        w.onLine?.(line);
        if (line.startsWith(w.token)) {
          this.waiting = null;
          w.resolve(line);
        }
      }
    });
  }

  private until(token: string, commands: string[], onLine?: (l: string) => void): Promise<string> {
    return new Promise((resolve) => {
      this.waiting = { token, resolve, onLine };
      for (const c of commands) this.proc.stdin.write(`${c}\n`);
    });
  }

  async init(): Promise<void> {
    await this.until('uciok', ['uci']);
    await this.until('readyok', ['setoption name Hash value 16', 'isready']);
  }

  /** The score of `move` searched alone, for the side to move (a mate as ±(10,000 − n)). */
  async score(fen: string, move: string): Promise<number> {
    let score = 0;
    await this.until('bestmove', ['ucinewgame', `position fen ${fen}`, `go nodes ${JUDGE_NODES} searchmoves ${move}`], (l) => {
      const m = / score (cp|mate) (-?\d+)/.exec(l);
      if (m) score = m[1] === 'cp' ? Number(m[2]) : Number(m[2]) > 0 ? 10_000 - Number(m[2]) : -10_000 - Number(m[2]);
    });
    return score;
  }

  stop(): void {
    this.proc.kill();
  }
}

/** The positions where the player moves, with the puzzle's answer. */
function positions(p: Puzzle): { fen: string; answer: string }[] {
  const chess = new Chess(p.fen);
  const setup = setupMove(p);
  if (setup) chess.move(toMove(setup));
  const out: { fen: string; answer: string }[] = [];
  for (let n = 0; n < solution(p).length; n++) {
    const answer = answerAt(p, n)!;
    out.push({ fen: chess.fen(), answer });
    chess.move(toMove(answer));
    const reply = replyAfter(p, n + 1);
    if (reply) chess.move(toMove(reply));
  }
  return out;
}

async function judge(engine: Engine, fen: string, answer: string): Promise<string[]> {
  const right = await engine.score(fen, answer);
  const alts: string[] = [];
  for (const m of new Chess(fen).moves({ verbose: true })) {
    if (m.lan === answer) continue;
    const after = new Chess(fen);
    after.move(m.lan);
    if (after.isCheckmate()) continue; // a mate is always right
    if (asGood(right, await engine.score(fen, m.lan))) alts.push(m.lan);
  }
  return alts;
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'sf-'));
  copyFileSync('public/engine/stockfish-19-lite-single.js', join(dir, 'sf.cjs'));
  copyFileSync('public/engine/stockfish-19-lite-single.wasm', join(dir, 'sf.wasm'));
  const engines = await Promise.all(
    Array.from({ length: Math.max(1, Math.min(4, cpus().length)) }, async () => {
      const e = new Engine(join(dir, 'sf.cjs'));
      await e.init();
      return e;
    }),
  );

  const only = process.env.MODULES?.split(',');
  const out: Record<string, Record<string, string[][]>> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  for (const module of MODULES) {
    if (only && !only.includes(module.id)) continue;
    const puzzles: Puzzle[] = JSON.parse(readFileSync(`${DATA}/${module.id}.json`, 'utf8'));
    const jobs = puzzles.flatMap((p) => positions(p).map((pos, step) => ({ p, step, ...pos })));
    const found: Record<string, string[][]> = {};
    let next = 0;
    let done = 0;
    await Promise.all(
      engines.map(async (engine) => {
        while (next < jobs.length) {
          const job = jobs[next++];
          const alts = await judge(engine, job.fen, job.answer);
          if (alts.length) {
            const list = (found[job.p.id] ??= Array.from({ length: solution(job.p).length }, () => []));
            list[job.step] = alts.sort();
          }
          if (++done % 50 === 0) console.error(`${module.id}: ${done}/${jobs.length}`);
        }
      }),
    );
    // stable order: the puzzles' order in the module
    out[module.id] = Object.fromEntries(puzzles.filter((p) => found[p.id]).map((p) => [p.id, found[p.id]]));
    writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
    console.error(`${module.id}: ${Object.keys(found).length} puzzles with other good moves`);
  }
  for (const e of engines) e.stop();
}

await main();
