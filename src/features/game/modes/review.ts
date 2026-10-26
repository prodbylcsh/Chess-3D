import { t } from '../../../i18n';
import type { Color as Side, Square } from 'chess.js';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { positions } from '#shared/analysis.ts';
import { api, type Loadout } from '../../../api';
import { engineSupported, Stockfish } from '../../../ai/stockfish';
import { reviewGame, type EnginePosition, type GameReview } from '../../review/review';
import type { GameState, PlayerView, ReviewView } from '../store';
import type { EndAction, Mode, ModeAction, ModeContext } from './types';
import { dressGame } from './types';

/** A finished game to review (kept in the session while the review page is open). */
export interface ReviewGame {
  id: string;
  /** UCI from the start position */
  moves: string[];
  /** the player's side */
  color: Side;
  players: Record<Side, PlayerView>;
  loadouts: Partial<Record<Side, Loadout | null>>;
  /** the game's kind, for the chip ("Casual", "vs AI · Knight") */
  label: string;
}

const GAMES = 'wizard-chess.review';
const RESULTS = 'wizard-chess.review-result';
/** Search per position: the same as the accuracy analysis (docs/PLATFORM.md §5.2). */
const NODES = 30_000;

function read<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? '{}') as Record<string, T>;
  } catch {
    return {};
  }
}

function write<T>(key: string, id: string, value: T): void {
  try {
    // keep the last few only
    const all = Object.entries(read<T>(key)).slice(-4);
    sessionStorage.setItem(key, JSON.stringify(Object.fromEntries([...all, [id, value]])));
  } catch {
    // private mode: the review works, it just can't be reopened after a reload
  }
}

/** Remember a game for its review page, and return the page's path. */
export function reviewPath(game: ReviewGame): string {
  write(GAMES, game.id, game);
  return `/game/review/${encodeURIComponent(game.id)}`;
}

/**
 * Game Review (docs/PLATFORM.md §4.9): the game again on the 3D board, read-only, move by
 * move, with each move judged by Stockfish in this browser and the better move shown as an
 * arrow. How many games a day can be reviewed depends on the plan (the server counts).
 */
export class ReviewMode implements Mode {
  readonly label: string;
  private readonly game: ReviewGame | null;
  private review: GameReview | null = null;
  private at = 0;
  private disposed = false;
  private engine: Stockfish | null = null;

  constructor(
    private readonly ctx: ModeContext,
    id: string,
  ) {
    this.game = read<ReviewGame>(GAMES)[id] ?? null;
    this.label = this.game ? `${t('Game Review')} · ${this.game.label}` : t('Game Review');
  }

  start(): void {
    this.disposed = false;
    const { store, game } = this.ctx.engine;
    const g = this.game;
    if (!g) return this.ctx.navigate('/play');
    store.reset({ players: g.players, bottom: g.color, mySide: null, review: this.view({ status: 'checking' }) });
    store.suppressEnd = true; // stepping to the last move shows no result card
    dressGame(this.ctx.engine, g.loadouts, g.id);
    // the player's side at the bottom; read-only (`active: false` takes no moves)
    void game.begin({ side: g.color, active: false, send: () => {} }, []);
    void this.open();
  }

  dispose(): void {
    this.disposed = true;
    this.ctx.engine.store.suppressEnd = false;
    this.ctx.engine.game.arrows([]);
    this.engine?.dispose();
    this.engine = null;
  }

  private view(patch: Partial<ReviewView>): ReviewView {
    const prev = this.ctx.engine.store.get().review;
    return { status: 'checking', progress: 0, color: this.game!.color, at: this.at, review: this.review, limit: null, ...prev, ...patch };
  }

  private set(patch: Partial<ReviewView>): void {
    if (!this.disposed) this.ctx.engine.store.set({ review: this.view(patch) });
  }

  private async open(): Promise<void> {
    const g = this.game!;
    const cached = read<GameReview>(RESULTS)[g.id];
    try {
      const limit = await api.reviews.start(g.id);
      if (this.disposed) return;
      this.set({ limit });
      if (!limit.allowed) return this.set({ status: 'locked' });
    } catch {
      return this.set({ status: 'failed' });
    }
    if (cached) return this.ready(cached);
    if (!engineSupported()) return this.set({ status: 'failed' });
    this.set({ status: 'analysing', progress: 0 });
    try {
      this.engine = new Stockfish();
      const { fens, final } = positions(g.moves);
      const seen: EnginePosition[] = [];
      for (let i = 0; i < fens.length; i++) {
        if (this.disposed) return;
        if (i === fens.length - 1 && final !== null) seen.push({ best: '', score: final });
        else {
          const r = await this.engine.search(fens[i], NODES);
          // the search scores for the side to move; the review wants White's side
          seen.push({ best: r.best === '(none)' ? '' : r.best, score: fens[i].split(' ')[1] === 'w' ? r.score : -r.score });
        }
        this.set({ progress: (i + 1) / fens.length });
      }
      const review = reviewGame(g.moves, seen);
      write(RESULTS, g.id, review);
      this.ready(review);
    } catch (err) {
      console.warn('review failed', err);
      this.set({ status: 'failed' });
    } finally {
      this.engine?.dispose();
      this.engine = null;
    }
  }

  private ready(review: GameReview): void {
    this.review = review;
    this.set({ status: 'ready', review });
    // straight to the first key moment, else the start
    void this.go(review.keys.length ? review.keys[0] + 1 : 0);
  }

  /** Show the board after `at` half-moves, with the better move's arrow where there was one. */
  private async go(at: number): Promise<void> {
    const g = this.game!;
    this.at = Math.max(0, Math.min(g.moves.length, at));
    const { game } = this.ctx.engine;
    game.arrows([]);
    this.set({ at: this.at });
    await game.sync(g.moves.slice(0, this.at));
    if (this.disposed || this.at !== at) return;
    const move = this.review?.moves[this.at - 1];
    if (move?.better) {
      const u = move.better.uci;
      game.arrows([{ from: u.slice(0, 2) as Square, to: u.slice(2, 4) as Square, kind: 'hint' }]);
    }
  }

  actions(s: GameState): ModeAction[] {
    const r = s.review;
    const ready = r?.status === 'ready';
    const n = this.game?.moves.length ?? 0;
    return [
      { id: 'first', label: t('Start'), icon: ChevronFirst, disabled: !ready || r.at === 0 },
      { id: 'prev', label: t('Back'), icon: ChevronLeft, disabled: !ready || r.at === 0 },
      { id: 'next', label: t('Next'), icon: ChevronRight, disabled: !ready || r.at >= n },
      { id: 'last', label: t('End'), icon: ChevronLast, disabled: !ready || r.at >= n },
    ];
  }

  endActions(): EndAction[] {
    return [{ id: 'exit', label: t('Back to Play'), primary: true }];
  }

  act(id: string): void {
    const at = this.at;
    if (id === 'exit') return this.ctx.navigate('/play');
    if (id === 'premium') return this.ctx.navigate('/premium');
    if (this.ctx.engine.store.get().review?.status !== 'ready') return;
    if (id === 'first') void this.go(0);
    else if (id === 'prev') void this.go(at - 1);
    else if (id === 'next') void this.go(at + 1);
    else if (id === 'last') void this.go(this.game!.moves.length);
    else if (id.startsWith('ply:')) void this.go(Number(id.slice(4)) + 1);
  }
}
