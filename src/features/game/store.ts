import { useSyncExternalStore } from 'react';
import type { Chess, Color as Side, PieceSymbol } from 'chess.js';
import type { GameEnd, GameUi } from '../../game/ui';
import type { MatchResult, RankInfo } from '../../api';

export interface PlayerView {
  name: string;
  iconId: string;
  rank?: RankInfo | null;
  /** small label next to the name: "Bot", "Guest", "Demo" */
  tag?: string;
  you?: boolean;
  /** connected (online games); undefined when not applicable */
  present?: boolean;
}

export interface ResultState {
  /** fetching MMR/coins from the server */
  loading: boolean;
  data: MatchResult | null;
  accuracy: number | null;
  error: string | null;
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
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const DEFAULT_PLAYERS: Record<Side, PlayerView> = {
  w: { name: 'White', iconId: 'white' },
  b: { name: 'Black', iconId: 'black' },
};

export function initialState(): GameState {
  return {
    turn: 'w',
    status: '',
    moves: [],
    captured: { w: [], b: [] },
    advantage: { w: 0, b: 0 },
    busy: true,
    canUndo: false,
    players: DEFAULT_PLAYERS,
    bottom: 'w',
    mySide: null,
    promotion: null,
    end: null,
    showEnd: false,
    result: null,
    invite: null,
    note: null,
    drawOffered: false,
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

  gameOver(end: GameEnd): void {
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
