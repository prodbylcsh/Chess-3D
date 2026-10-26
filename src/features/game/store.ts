import type { PlanId } from '#shared/subscription.ts';
import { t } from '../../i18n';
import { useSyncExternalStore } from 'react';
import type { Chess, Color as Side, PieceSymbol } from 'chess.js';
import type { GameEnd, GameUi } from '../../game/ui';
import type { DailySolve, LessonDone, MatchResult, PuzzleSolve, RankInfo, StreakView } from '../../api';
import type { Brief } from '../puzzles/brief';
import type { Analysis } from '../../ai/analysis';
import type { GameReview } from '../review/review';

export interface PlayerView {
  name: string;
  iconId: string;
  rank?: RankInfo | null;
  /** small label next to the name: "Bot", "Guest", "Demo" */
  tag?: string;
  you?: boolean;
  /** connected (online games); undefined when not applicable */
  present?: boolean;
  /** the player's Premium plan, for the badge on the card */
  premium?: PlanId | null;
}

/** What the puzzle coach says right now. */
export interface PuzzleMessage {
  tone: 'info' | 'good' | 'bad' | 'hint';
  text: string;
}

/** A puzzle being played (Puzzles): its module, mistakes and hints, and the server's answer. */
export interface PuzzleView {
  module: string;
  index: number;
  color: string;
  /** what the puzzle asks (features/puzzles/brief.ts) */
  brief: Brief;
  /** the briefing card is open (before the first move, or reopened) */
  briefing: boolean;
  /** right moves played so far, of brief.moves */
  step: number;
  message: PuzzleMessage | null;
  mistakes: number;
  hints: number;
  result: PuzzleSolve | null;
  saving: boolean;
  error: string | null;
  /** what the player's next move is for (puzzles/intent.ts), while it is their turn */
  next: string | null;
  /** the player seems stuck: the solution can be shown (modes/puzzle.ts, `stuckness`) */
  stuck: boolean;
  /** the solution is being played back on the board */
  replaying: boolean;
  /** the solution was shown instead of solved */
  revealed: boolean;
  /** a replay within the review wait: the stars can improve only from this time (ISO) */
  practiceUntil: string | null;
  /** the daily puzzle: the streak before today, and today's result */
  daily: { day: string; streak: StreakView; result: DailySolve | null } | null;
}

/** A lesson being taken (Learn, docs/PLATFORM.md §4.3). */
export interface LessonView {
  lesson: string;
  chapter: string;
  color: string;
  title: string;
  /** the lesson's place in its chapter (0-based) and the chapter's size */
  index: number;
  total: number;
  step: number;
  steps: number;
  /** what the coach says */
  say: string;
  /** the step asks for something on the board, and whether it is done */
  task: boolean;
  taskDone: boolean;
  /** stars or pieces left in a collect / capture task */
  left: number | null;
  message: PuzzleMessage | null;
  quiz: { options: string[]; chosen: number | null; right: boolean } | null;
  /** a guest (no account): what they finish waits for an account on this device */
  guest: boolean;
  /** the lesson is finished (the server's answer), or being saved */
  done: LessonDone | null;
  saving: boolean;
  error: string | null;
}

export interface ResultState {
  /** fetching MMR/coins from the server */
  loading: boolean;
  data: MatchResult | null;
  accuracy: number | null;
  error: string | null;
  /** ranked and casual online games: the engine analysis in this browser (performance part) */
  analysis?: { status: Analysis['status']; progress: number } | null;
}

/** Server clocks of a timed game. The running side's time is counted down on screen. */
export interface ClockView {
  w: number;
  b: number;
  /** side whose time runs, or null when the game is not running */
  running: Side | null;
  /** when the running side's time started (local ms; after the last move's animation) */
  since: number;
  /** the running side has not made its first move yet: `w`/`b` holds that window */
  firstMove: boolean;
}

/** Watching someone else's game (modes/watch.ts, docs/PLATFORM.md §4.1 "Spectating"). */
export interface SpectatorView {
  /** half-moves the board is behind the real game (ranked and coin games while they run) */
  delay: number;
  /** the players' shop items in this game, for "Seen in this game" */
  items: string[];
  /** the players started a rematch: its game id */
  rematch: string | null;
}

/** A finished game being reviewed (modes/review.ts, docs/PLATFORM.md §4.9). */
export interface ReviewView {
  /** checking the day's reviews, over the limit, the engine at work, or ready */
  status: 'checking' | 'locked' | 'analysing' | 'ready' | 'failed';
  progress: number;
  /** the player's side */
  color: Side;
  /** half-moves shown on the board */
  at: number;
  review: GameReview | null;
  /** today's reviews and the plan's limit (null: unlimited) */
  limit: { used: number; limit: number | null } | null;
}

export interface GameState {
  turn: Side;
  /** "Check!", "Checkmate!", "Draw" … */
  status: string;
  /** SAN moves */
  moves: string[];
  captured: Record<Side, PieceSymbol[]>;
  advantage: Record<Side, number>;
  busy: boolean;
  canUndo: boolean;
  players: Record<Side, PlayerView>;
  /** the side shown at the bottom (the player's own) */
  bottom: Side;
  /** the side the player controls; null for hotseat or spectators */
  mySide: Side | null;
  promotion: Side | null;
  end: GameEnd | null;
  /** the result card is open */
  showEnd: boolean;
  result: ResultState | null;
  /** waiting room: invite link while the opponent hasn't joined */
  invite: string | null;
  /** short line under the turn pill, e.g. "Opponent is thinking…" */
  note: string | null;
  drawOffered: boolean;
  clock: ClockView | null;
  puzzle: PuzzleView | null;
  lesson: LessonView | null;
  /** people watching this online game (players and spectators see it); null when not online */
  watchers: number | null;
  spectator: SpectatorView | null;
  review: ReviewView | null;
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };


export function initialState(): GameState {
  return {
    turn: 'w',
    status: '',
    moves: [],
    captured: { w: [], b: [] },
    advantage: { w: 0, b: 0 },
    busy: true,
    canUndo: false,
    players: { w: { name: t('White'), iconId: 'white' }, b: { name: t('Black'), iconId: 'black' } },
    bottom: 'w',
    mySide: null,
    promotion: null,
    end: null,
    showEnd: false,
    result: null,
    invite: null,
    note: null,
    drawOffered: false,
    clock: null,
    puzzle: null,
    lesson: null,
    watchers: null,
    spectator: null,
    review: null,
  };
}

/** Holds what the game screen shows; the engine writes to it through `GameUi`. */
export class GameStore implements GameUi {
  private state = initialState();
  private readonly listeners = new Set<() => void>();
  private promotionResolve: ((p: PieceSymbol) => void) | null = null;
  /** called once per finished game (modes hook in to record results) */
  onGameOver: (end: GameEnd) => void = () => {};

  get = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  set(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  reset(patch: Partial<GameState> = {}): void {
    this.promotionResolve = null;
    this.onGameOver = () => {};
    this.state = { ...initialState(), ...patch };
    for (const fn of this.listeners) fn();
  }

  // ---------------------------------------------------------------- GameUi

  update(chess: Chess, status = ''): void {
    const history = chess.history({ verbose: true });
    const captured: Record<Side, PieceSymbol[]> = { w: [], b: [] };
    for (const m of history) if (m.captured) captured[m.color].push(m.captured);
    for (const s of ['w', 'b'] as Side[]) captured[s].sort((a, b) => VALUE[b] - VALUE[a]);
    const score = (s: Side) => captured[s].reduce((sum, p) => sum + VALUE[p], 0);
    this.set({
      turn: chess.turn(),
      status,
      moves: history.map((m) => m.san),
      captured,
      advantage: { w: Math.max(0, score('w') - score('b')), b: Math.max(0, score('b') - score('w')) },
    });
  }

  setBusy(busy: boolean, canUndo: boolean): void {
    if (busy !== this.state.busy || canUndo !== this.state.canUndo) this.set({ busy, canUndo });
  }

  askPromotion(side: Side): Promise<PieceSymbol> {
    this.set({ promotion: side });
    return new Promise((resolve) => (this.promotionResolve = resolve));
  }

  choosePromotion(piece: PieceSymbol): void {
    const resolve = this.promotionResolve;
    this.promotionResolve = null;
    this.set({ promotion: null });
    resolve?.(piece);
  }

  /** a mode showing a line that ends the game (a puzzle's refutation): no result card */
  suppressEnd = false;

  gameOver(end: GameEnd): void {
    if (this.suppressEnd) return;
    this.set({ end, showEnd: true });
    this.onGameOver(end);
  }

  hideGameOver(): void {
    this.set({ end: null, showEnd: false, result: null });
  }

  sideName(side: Side): string {
    const p = this.state.players[side];
    if (this.state.mySide && p.you) return 'You';
    return p.name;
  }
}

export function useGameState(store: GameStore): GameState {
  return useSyncExternalStore(store.subscribe, store.get);
}
