// Engine analysis of the player's finished ranked and casual games, in the background:
// Stockfish scores every position, the app shows the player's accuracy and sends the
// report to the server, which adds the performance part once the opponent's report agrees
// (supabase/functions/_shared/analysis.ts). Jobs survive a reload for as long as the
// server takes reports; the player can leave the game screen meanwhile.
import { ANALYSIS, accuracies, positions, type AnalysisStatus } from '#shared/analysis.ts';
import { api, ApiError, type MatchResult, type Side } from '../api';
import { Stockfish, engineSupported } from './stockfish';

interface Job {
  gameId: string;
  /** UCI moves */
  moves: string[];
  color: Side;
  /** when the game ended (ms) */
  at: number;
}

export interface Analysis {
  /** analysing (with progress 0-1), then the server's answer */
  status: 'running' | AnalysisStatus | 'failed';
  progress: number;
  /** the player's accuracy as this device computed it */
  accuracy: number | null;
  /** the result with the performance part, once the server added it */
  result: MatchResult | null;
}

const KEY = 'wizard-chess.analysis';
/** after its report, ask the server this often (and this many times) whether the opponent's is in */
const POLL_MS = 10_000;
const POLLS = 12;

const states = new Map<string, Analysis>();
const listeners = new Set<(gameId: string, state: Analysis) => void>();
let queue: Job[] = load();
let running = false;

function load(): Job[] {
  try {
    const jobs = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Job[];
    return jobs.filter((j) => Date.now() - j.at < ANALYSIS.windowMs);
  } catch {
    return [];
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // private mode: the analysis just won't survive a reload
  }
}

function set(gameId: string, patch: Partial<Analysis>): void {
  const state = { ...(states.get(gameId) ?? { status: 'running', progress: 0, accuracy: null, result: null }), ...patch };
  states.set(gameId, state);
  listeners.forEach((l) => l(gameId, state));
}

/** Follow every game's analysis (returns the unsubscribe function). */
export function onAnalysis(listener: (gameId: string, state: Analysis) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const analysisOf = (gameId: string): Analysis | null => states.get(gameId) ?? null;

/** Analyse a finished game the player took part in (once). */
export function analyseGame(gameId: string, moves: string[], color: Side): void {
  if (!api.matchmaking.analysis || states.has(gameId) || queue.some((j) => j.gameId === gameId)) return;
  if (!engineSupported()) {
    set(gameId, { status: 'failed' });
    return;
  }
  queue.push({ gameId, moves, color, at: Date.now() });
  save();
  set(gameId, { status: 'running', progress: 0 });
  void run();
}

/** Finish the analyses a reload interrupted (call once the player is signed in). */
export function resumeAnalysis(): void {
  queue = load();
  if (queue.length && engineSupported()) void run();
}

async function run(): Promise<void> {
  if (running) return;
  running = true;
  let engine: Stockfish | null = null;
  try {
    while (queue.length) {
      const job = queue[0];
      try {
        engine ??= new Stockfish();
        await analyse(engine, job);
      } catch (err) {
        console.warn('analysis failed', err);
        engine?.dispose();
        engine = null;
        set(job.gameId, { status: 'failed' });
      }
      queue = queue.filter((j) => j.gameId !== job.gameId);
      save();
    }
  } finally {
    engine?.dispose();
    running = false;
  }
}

async function analyse(engine: Stockfish, job: Job): Promise<void> {
  const { fens, final } = positions(job.moves);
  const scores: number[] = [];
  for (let i = 0; i < fens.length; i++) {
    scores.push(i === fens.length - 1 && final !== null ? final : await engine.score(fens[i]));
    set(job.gameId, { status: 'running', progress: (i + 1) / fens.length });
  }
  set(job.gameId, { accuracy: accuracies(scores)[job.color] });
  await report(job.gameId, { engine: ANALYSIS.engine, scores });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send the report (a few tries when offline); then, while waiting, ask again now and then. */
async function report(gameId: string, body: { engine: string; scores: number[] }): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { status, result } = await api.matchmaking.analysis!(gameId, body);
      set(gameId, { status, ...(result ? { result } : {}) });
      if (status === 'waiting') void poll(gameId);
      return;
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'network') || attempt >= 3) throw err;
      await wait(5_000 * (attempt + 1));
    }
  }
}

async function poll(gameId: string): Promise<void> {
  for (let i = 0; i < POLLS; i++) {
    await wait(POLL_MS);
    const { status, result } = await api.matchmaking.analysis!(gameId).catch(() => ({ status: 'waiting' as const, result: null }));
    if (status === 'waiting') continue;
    set(gameId, { status, ...(result ? { result } : {}) });
    return;
  }
}
