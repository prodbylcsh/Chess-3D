import { t, tk } from '../../../i18n';
import { Chess, type Color as Side, type Move, type Square } from 'chess.js';
import { Lightbulb, RotateCcw } from 'lucide-react';
import { PUZZLES_PER_MODULE, answerAt, mates, moduleOf, playerSide, replyAfter, rightMove, setupMove, type Puzzle, type PuzzleModule } from '#shared/puzzles.ts';
import { api, ApiError } from '../../../api';
import { modulePuzzles } from '../../../api/puzzleData';
import { toast } from '../../../ui/kit';
import type { GameState } from '../store';
import { dressGame, playerFromProfile, randomSeed, sleep, type EndAction, type Mode, type ModeAction, type ModeContext } from './types';

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');
const PIECE_NAMES: Record<string, string> = { p: tk('pawn'), n: tk('knight'), b: tk('bishop'), r: tk('rook'), q: tk('queen'), k: tk('king') };

/**
 * A puzzle (docs/PLATFORM.md §4.2): the opponent's move sets it up, the player finds the
 * solution move by move and the opponent's replies are played back. A wrong move is taken
 * back and counts as a mistake. The server checks the solution and pays the rewards.
 */
export class PuzzleMode implements Mode {
  private readonly module: PuzzleModule;
  private puzzle: Puzzle | null = null;
  private played: string[] = [];
  private mistakes = 0;
  private hints = 0;
  private token = 0;
  private disposed = false;
  private readonly seed = randomSeed();

  constructor(
    private readonly ctx: ModeContext,
    moduleId: string,
    private readonly index: number,
  ) {
    this.module = moduleOf(moduleId)!;
  }

  get label(): string {
    return `${t(this.module.name)} · ${t('Puzzle {n} of {total}', { n: this.index + 1, total: PUZZLES_PER_MODULE })}`;
  }

  start(): void {
    this.disposed = false;
    const token = ++this.token;
    this.played = [];
    this.mistakes = 0;
    this.hints = 0;
    void this.open(token).catch((err) => {
      if (this.disposed || token !== this.token) return;
      toast(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'), { tone: 'danger' });
      this.ctx.navigate(`/puzzles/${this.module.id}`);
    });
  }

  private async open(token: number): Promise<void> {
    const { store, game } = this.ctx.engine;
    const [puzzles] = await Promise.all([modulePuzzles(this.module.id), api.puzzles.start(this.module.id, this.index)]);
    const puzzle = puzzles[this.index];
    if (!puzzle || this.disposed || token !== this.token) return;
    this.puzzle = puzzle;
    const side = playerSide(puzzle);
    store.reset({
      players: {
        [side]: playerFromProfile(this.ctx.profile),
        [other(side)]: { name: t(this.module.name), iconId: 'bot', tag: `★ ${puzzle.rating}` },
      } as GameState['players'],
      bottom: side,
      mySide: side,
      puzzle: { module: this.module.id, index: this.index, color: this.module.color, mistakes: 0, hints: 0, result: null, saving: false, error: null },
    });
    store.onGameOver = () => {}; // a mating solution ends the game on the board; the solve is handled in onMove
    dressGame(this.ctx.engine, { [side]: this.ctx.profile?.loadout ?? null }, this.seed);
    this.ctx.engine.wardrobe.setMood(this.module.color);
    await game.begin({ side, active: true, send: (m) => void this.onMove(m, token) }, [], puzzle.fen);
    const setup = setupMove(puzzle);
    if (setup) {
      await sleep(450);
      if (this.disposed || token !== this.token) return;
      await game.sync([setup]);
    }
    store.set({ note: this.prompt(puzzle, side) });
  }

  /** What to do: the puzzle's goal (an opening, a trap) or find the best move. */
  private prompt(puzzle: Puzzle, side: Side): string {
    if (puzzle.goal) return side === 'w' ? t('{goal}: play it as White.', { goal: t(puzzle.goal) }) : t('{goal}: play it as Black.', { goal: t(puzzle.goal) });
    return side === 'w' ? t('White to move: find the best move.') : t('Black to move: find the best move.');
  }

  private async onMove(move: Move, token: number): Promise<void> {
    const puzzle = this.puzzle;
    const { game, store } = this.ctx.engine;
    if (!puzzle || token !== this.token) return;
    if (rightMove(puzzle, this.played, move.lan)) {
      const mate = mates(puzzle, this.played, move.lan);
      this.played.push(move.lan);
      const reply = replyAfter(puzzle, this.played.length);
      if (!reply || mate) return this.solved(token);
      store.set({ note: t('Correct! Keep going.') });
      await game.idle();
      await sleep(350);
      if (token === this.token && !this.disposed) await game.sync([...game.history, reply]);
      return;
    }
    this.mistakes++;
    store.set({ note: t('Not this move. Try again.'), puzzle: { ...store.get().puzzle!, mistakes: this.mistakes } });
    await game.idle();
    await sleep(600);
    if (token === this.token && !this.disposed && !game.isOver) await game.sync(game.history.slice(0, -1));
  }

  private async solved(token: number): Promise<void> {
    const { game, store } = this.ctx.engine;
    await game.idle();
    if (token !== this.token || this.disposed) return;
    store.set({ note: null, puzzle: { ...store.get().puzzle!, saving: true } });
    // a mate has already ended the game on the board
    if (!game.isOver) await game.finish({ winner: store.get().mySide, reason: 'puzzle', title: t('Solved!'), text: t('Puzzle solved') });
    try {
      const result = await api.puzzles.solve(this.module.id, this.index, this.played, this.mistakes, this.hints);
      if (token !== this.token || this.disposed) return;
      store.set({ puzzle: { ...store.get().puzzle!, saving: false, result } });
      await this.ctx.refreshProfile();
    } catch (err) {
      if (token === this.token && !this.disposed) {
        store.set({ puzzle: { ...store.get().puzzle!, saving: false, error: err instanceof ApiError ? err.message : t('Could not save the result.') } });
      }
    }
  }

  private hint(): void {
    const puzzle = this.puzzle;
    const { game, store } = this.ctx.engine;
    if (!puzzle || game.isOver) return;
    const answer = answerAt(puzzle, this.played.length);
    if (!answer) return;
    const piece = new Chess(game.fen).get(answer.slice(0, 2) as Square);
    this.hints++;
    store.set({
      note: t('Hint: move your {piece} on {square}.', { piece: t(PIECE_NAMES[piece?.type ?? 'p']), square: answer.slice(0, 2) }),
      puzzle: { ...store.get().puzzle!, hints: this.hints },
    });
  }

  dispose(): void {
    this.disposed = true;
    this.token++;
    this.ctx.engine.wardrobe.setMood(null);
  }

  actions(s: GameState): ModeAction[] {
    return [
      { id: 'hint', label: t('Hint'), icon: Lightbulb, disabled: !!s.end || !this.puzzle },
      { id: 'retry', label: t('Restart'), icon: RotateCcw, disabled: !this.puzzle },
    ];
  }

  endActions(s: GameState): EndAction[] {
    const solved = !!s.puzzle?.result;
    return [
      ...(solved && this.index + 1 < PUZZLES_PER_MODULE ? [{ id: 'next', label: t('Next puzzle'), primary: true }] : []),
      { id: 'retry', label: t('Try again') },
      { id: 'exit', label: t('Back to the map'), primary: !solved || this.index + 1 >= PUZZLES_PER_MODULE },
    ];
  }

  endTitle(): { title: string; text: string } {
    return { title: t('Solved!'), text: this.puzzle?.goal ? t(this.puzzle.goal) : t(this.module.name) };
  }

  act(id: string): void {
    if (id === 'hint') this.hint();
    else if (id === 'retry') this.start();
    else if (id === 'next') this.ctx.navigate(`/game/puzzle/${this.module.id}?n=${this.index + 1}`);
    else if (id === 'exit') this.ctx.navigate(`/puzzles/${this.module.id}`);
  }
}
