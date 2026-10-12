// Wizard Chess engine server: Stockfish behind a small HTTPS API (Caddy in front), on the
// Oracle Cloud Always Free VM (engine/cloud-init.yaml). The game server (Supabase Edge
// Functions) sends it the positions of a finished game and gets an evaluation of each,
// from which it computes the players' accuracy (docs/PLATFORM.md §5.2, §8.2).
//
//   GET  /health                           → { ok, engine, workers }
//   POST /analyse { fens, depth? }         → { evals: [{ cp, mate, best }] }  (White's view)
//        Authorization: Bearer <ENGINE_SECRET>
//
// No dependencies: Node 18+ and the `stockfish` binary. Settings come from the environment:
// ENGINE_SECRET (required), PORT (8080), STOCKFISH (/usr/games/stockfish), WORKERS (CPU
// count), HASH_MB (64 per worker).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { availableParallelism } from 'node:os';
import { timingSafeEqual } from 'node:crypto';

const SECRET = process.env.ENGINE_SECRET ?? '';
const PORT = Number(process.env.PORT ?? 8080);
const BINARY = process.env.STOCKFISH ?? '/usr/games/stockfish';
const WORKERS = Number(process.env.WORKERS ?? availableParallelism());
const HASH_MB = Number(process.env.HASH_MB ?? 64);
const MAX_POSITIONS = 400; // a long game has ~200 plies
const MAX_DEPTH = 20;
const DEFAULT_DEPTH = 14;

if (SECRET.length < 24) {
  console.error('Set ENGINE_SECRET (at least 24 characters).');
  process.exit(1);
}

/** One Stockfish process, analysing one position at a time. */
class Engine {
  constructor() {
    this.proc = spawn(BINARY, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.buffer = '';
    this.listener = null;
    this.name = 'Stockfish';
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let nl;
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line.startsWith('id name ')) this.name = line.slice(8);
        this.listener?.(line);
      }
    });
    this.proc.on('exit', (code) => {
      console.error(`stockfish exited (${code}); restarting the server`);
      process.exit(1); // systemd starts it again
    });
    this.ready = this.until('uciok', 'uci').then(() => {
      this.send(`setoption name Threads value 1`);
      this.send(`setoption name Hash value ${HASH_MB}`);
      return this.until('readyok', 'isready');
    });
  }

  send(command) {
    this.proc.stdin.write(`${command}\n`);
  }

  /** Send `command` and resolve on the first line starting with `token` (collecting lines). */
  until(token, command, onLine) {
    return new Promise((resolve) => {
      this.listener = (line) => {
        onLine?.(line);
        if (line.startsWith(token)) {
          this.listener = null;
          resolve(line);
        }
      };
      this.send(command);
    });
  }

  /** Evaluation of a position from White's point of view, and the best move (UCI). */
  async evaluate(fen, depth) {
    await this.ready;
    let score = { cp: 0, mate: null };
    this.send('ucinewgame');
    this.send(`position fen ${fen}`);
    const last = await this.until('bestmove', `go depth ${depth}`, (line) => {
      if (!line.startsWith('info ') || !line.includes(' score ')) return;
      const m = / score (cp|mate) (-?\d+)/.exec(line);
      if (m) score = m[1] === 'cp' ? { cp: Number(m[2]), mate: null } : { cp: null, mate: Number(m[2]) };
    });
    const best = last.split(' ')[1];
    // Stockfish scores from the side to move
    const flip = fen.split(' ')[1] === 'b' ? -1 : 1;
    return {
      cp: score.cp === null ? null : score.cp * flip,
      mate: score.mate === null ? null : score.mate * flip,
      best: best === '(none)' ? null : best,
    };
  }
}

const engines = Array.from({ length: WORKERS }, () => new Engine());
const idle = [...engines];
const waiting = [];

function acquire() {
  const engine = idle.pop();
  if (engine) return Promise.resolve(engine);
  return new Promise((resolve) => waiting.push(resolve));
}

function release(engine) {
  const next = waiting.shift();
  if (next) next(engine);
  else idle.push(engine);
}

async function analyse(fens, depth) {
  return Promise.all(
    fens.map(async (fen) => {
      const engine = await acquire();
      try {
        return await engine.evaluate(fen, depth);
      } finally {
        release(engine);
      }
    }),
  );
}

const FEN = /^[pnbrqkPNBRQK1-8/]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/;

function authorized(req) {
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(SECRET);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      await engines[0].ready;
      return reply(res, 200, { ok: true, engine: engines[0].name, workers: engines.length, waiting: waiting.length });
    }
    if (req.method !== 'POST' || req.url !== '/analyse') return reply(res, 404, { error: 'not found' });
    if (!authorized(req)) return reply(res, 401, { error: 'unauthorized' });

    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 200_000) return reply(res, 413, { error: 'too large' });
    }
    const body = JSON.parse(raw || '{}');
    const fens = Array.isArray(body.fens) ? body.fens : [];
    const depth = Math.min(MAX_DEPTH, Math.max(1, Number(body.depth ?? DEFAULT_DEPTH) | 0));
    if (!fens.length || fens.length > MAX_POSITIONS || !fens.every((f) => typeof f === 'string' && FEN.test(f.trim()))) {
      return reply(res, 400, { error: `send 1–${MAX_POSITIONS} positions as FEN` });
    }
    const started = Date.now();
    const evals = await analyse(fens.map((f) => f.trim()), depth);
    console.log(`analysed ${fens.length} positions at depth ${depth} in ${Date.now() - started} ms`);
    return reply(res, 200, { evals });
  } catch (err) {
    console.error(err);
    return reply(res, 400, { error: 'bad request' });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`engine server on 127.0.0.1:${PORT} with ${WORKERS} workers`));
