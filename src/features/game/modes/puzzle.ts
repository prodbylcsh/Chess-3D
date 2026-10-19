import { t, tk } from '../../../i18n';
import { Chess, type Color as Side, type Move, type Square } from 'chess.js';
import { Info, Lightbulb, RotateCcw } from 'lucide-react';
import { PUZZLES_PER_MODULE, answerAt, hintPenalty, solution, mates, moduleOf, playerSide, replyAfter, rightMove, setupMove, type Puzzle, type PuzzleModule } from '#shared/puzzles.ts';
import { briefOf, type Brief } from '../../puzzles/brief';
import { api, ApiError } from '../../../api';
import { modulePuzzles } from '../../../api/puzzleData';
import { toast } from '../../../ui/kit';
import type { GameState, PuzzleView } from '../store';
import { dressGame, playerFromProfile, randomSeed, sleep, type EndAction, type Mode, type ModeAction, type ModeContext } from './types';

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');
const toMove = (m: string) => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
const PRAISE = [tk('Nice!'), tk('Exactly!'), tk('Sharp!'), tk('Great move!'), tk('Spot on!')];
/** A cheer for a right move that has no lesson, different each move. */
const praise = (n: number) => t(PRAISE[(n * 3 + Math.floor(Math.random() * 2)) % PRAISE.length]);
/** wrong moves in a row before the piece to move is shown (as a hint) */
const MISSES_FOR_HINT = 3;
const PIECE_NAMES: Record<string, string> = { p: tk('pawn'), n: tk('knight'), b: tk('bishop'), r: tk('rook'), q: tk('queen'), k: tk('king') };

/**
 * A puzzle (docs/PLATFORM.md §4.2): the opponent's move sets it up, the player finds the
 * solution move by move and the opponent's replies are played back. A wrong move is taken
 * back and counts as a mistake. The server checks the solution and pays the rewards.
 */
export class PuzzleMode implements Mode {
  private readonly module: PuzzleModule;
  private puzzle: Puzzle | null = null;
  private brief: Brief | null = null;
  private played: string[] = [];
  private mistakes = 0;
  private hints = 0;
  /** what the board shows for the current move: the piece to move and the square it goes to */
  private shown = { piece: false, square: false };
  /** wrong moves in a row on the current move */
  private misses = 0;
  private setupDone = false;
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

  /** `again`: a restart, which skips the briefing */
  start(again = false): void {
    this.disposed = false;
    const token = ++this.token;
    this.played = [];
    this.mistakes = 0;
    this.hints = 0;
    this.shown = { piece: false, square: false };
    this.misses = 0;
    this.setupDone = false;
    void this.open(token, again).catch((err) => {
      if (this.disposed || token !== this.token) return;
      toast(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'), { tone: 'danger' });
      this.ctx.navigate(`/puzzles/${this.module.id}`);
    });
  }

  private async open(token: number, again: boolean): Promise<void> {
    const { store, game } = this.ctx.engine;
    const [puzzles] = await Promise.all([modulePuzzles(this.module.id), api.puzzles.start(this.module.id, this.index)]);
    const puzzle = puzzles[this.index];
    if (!puzzle || this.disposed || token !== this.token) return;
    this.puzzle = puzzle;
    const brief = (this.brief = briefOf(puzzle, this.module.select.themes));
    const side = playerSide(puzzle);
    store.reset({
      players: {
        [side]: playerFromProfile(this.ctx.profile),
        [other(side)]: { name: t(this.module.name), iconId: 'bot', tag: `★ ${puzzle.rating}` },
      } as GameState['players'],
      bottom: side,
      mySide: side,
      puzzle: {
        module: this.module.id,
        index: this.index,
        color: this.module.color,
        brief,
        briefing: !again,
        step: 0,
        message: null,
        mistakes: 0,
        hints: 0,
        result: null,
        saving: false,
        error: null,
      },
    });
    store.onGameOver = () => {}; // a mating solution ends the game on the board; the solve is handled in onMove
    dressGame(this.ctx.engine, { [side]: this.ctx.profile?.loadout ?? null }, this.seed);
    this.ctx.engine.wardrobe.setMood(this.module.color);
    await game.begin({ side, active: true, send: (m) => void this.onMove(m, token) }, [], puzzle.fen);
    if (again) await this.go(token);
  }

  private setPuzzle(patch: Partial<PuzzleView>): void {
    const { store } = this.ctx.engine;
    const now = store.get().puzzle;
    if (now) store.set({ puzzle: { ...now, ...patch } });
  }

  /** The briefing is closed: the opponent's setup move, then the player's turn. */
  private async go(token: number): Promise<void> {
    const puzzle = this.puzzle;
    if (!puzzle) return;
    this.setPuzzle({ briefing: false });
    if (this.setupDone) return;
    this.setupDone = true;
    const setup = setupMove(puzzle);
    if (setup) {
      await sleep(350);
      if (this.disposed || token !== this.token) return;
      const { game } = this.ctx.engine;
      const moved = new Chess(game.fen).move(toMove(setup));
      await game.sync([setup]);
      if (this.disposed || token !== this.token) return;
      this.setPuzzle({ message: { tone: 'info', text: moved.captured
              ? t('Your opponent took with a {piece}. Your turn!', { piece: t(PIECE_NAMES[moved.piece]) })
              : t('Your opponent moved a {piece}. Your turn!', { piece: t(PIECE_NAMES[moved.piece]) }) } });
    } else {
      this.setPuzzle({ message: { tone: 'info', text: this.brief?.side === 'w' ? t('White begins. Your move!') : t('Black begins. Your move!') } });
    }
  }

  private async onMove(move: Move, token: number): Promise<void> {
    const puzzle = this.puzzle;
    const { game } = this.ctx.engine;
    if (!puzzle || token !== this.token) return;
    if (rightMove(puzzle, this.played, move.lan)) {
      const mate = mates(puzzle, this.played, move.lan);
      this.played.push(move.lan);
      this.shown = { piece: false, square: false };
      this.misses = 0;
      game.guide(null, null);
      const why = this.brief?.lesson?.why[this.played.length - 1];
      this.setPuzzle({ step: this.played.length, message: { tone: 'good', text: why ? t(why) : praise(this.played.length) } });
      const reply = replyAfter(puzzle, this.played.length);
      if (!reply || mate) return this.solved(token);
      await game.idle();
      await sleep(why ? 700 : 350);
      if (token === this.token && !this.disposed) await game.sync([...game.history, reply]);
      return;
    }
    // a wrong move: taken back, and the board shows where the right one ends (free); three in
    // a row also show the piece to move, which counts as a hint (docs/PLATFORM.md §4.2)
    this.mistakes++;
    this.misses++;
    const auto = this.misses >= MISSES_FOR_HINT && !this.shown.piece;
    if (auto) this.hints++;
    this.shown = { piece: this.shown.piece || auto, square: true };
    const goal = this.puzzle?.goal;
    const missed = goal ? t('{goal}: not this move.', { goal: t(goal) }) : t('Not this move.');
    this.setPuzzle({
      mistakes: this.mistakes,
      hints: this.hints,
      message: auto
        ? { tone: 'hint', text: `${t('Three misses in a row, so the piece to move glows now too. It counts as a hint.')} ${this.hintCost(puzzle)}` }
        : { tone: 'bad', text: `${missed} ${this.shown.piece ? t('Move the glowing piece to the marked square.') : t('The right move ends on the marked square.')}` },
    });
    await game.idle();
    await sleep(600);
    if (token !== this.token || this.disposed || game.isOver) return;
    await game.sync(game.history.slice(0, -1));
    if (token === this.token && !this.disposed) this.showGuide();
  }

  /** The marks for the current move, after a takeback or a hint. */
  private showGuide(): void {
    const answer = this.puzzle && answerAt(this.puzzle, this.played.length);
    if (!answer) return;
    const from = answer.slice(0, 2) as Square;
    const to = answer.slice(2, 4) as Square;
    const { game } = this.ctx.engine;
    game.guide(this.shown.piece ? from : null, this.shown.square ? to : null);
    if (this.shown.piece) game.suggest(from, this.shown.square ? to : undefined); // lift it, as a hint does
  }

  private hintCost(puzzle: Puzzle): string {
    return t('Hints so far: −{n} coins.', { n: hintPenalty(this.hints, solution(puzzle).length) });
  }

  private async solved(token: number): Promise<void> {
    const { game, store } = this.ctx.engine;
    await game.idle();
    if (token !== this.token || this.disposed) return;
    this.setPuzzle({ saving: true });
    // a mate has already ended the game on the board
    if (!game.isOver) await game.finish({ winner: store.get().mySide, reason: 'puzzle', title: t('Solved!'), text: t('Puzzle solved') });
    try {
      const result = await api.puzzles.solve(this.module.id, this.index, this.played, this.mistakes, this.hints);
      if (token !== this.token || this.disposed) return;
      this.setPuzzle({ saving: false, result });
      await this.ctx.refreshProfile();
    } catch (err) {
      if (token === this.token && !this.disposed) this.setPuzzle({ saving: false, error: err instanceof ApiError ? err.message : t('Could not save the result.') });
    }
  }

  /** First the piece to move (lifted on the board), then the square it goes to; each is shown once. */
  private hint(): void {
    const puzzle = this.puzzle;
    const { game } = this.ctx.engine;
    if (!puzzle || game.isOver || !this.canHint()) return;
    const answer = answerAt(puzzle, this.played.length);
    if (!answer) return;
    const from = answer.slice(0, 2) as Square;
    const piece = t(PIECE_NAMES[new Chess(game.fen).get(from)?.type ?? 'p']);
    const square = this.shown.piece; // the piece is known: the square comes next
    this.hints++;
    this.shown = square ? { piece: true, square: true } : { ...this.shown, piece: true };
    this.showGuide();
    const text = this.shown.square
      ? square
        ? t('Hint: move it to the marked square.')
        : t('Hint: move your {piece}, the one glowing on the board, to the marked square.', { piece })
      : t('Hint: move your {piece}, the one glowing on the board.', { piece });
    this.setPuzzle({ hints: this.hints, message: { tone: 'hint', text: `${text} ${this.hintCost(puzzle)}` } });
  }

  /** Something left to show for the current move. */
  private canHint(): boolean {
    return !(this.shown.piece && this.shown.square);
  }

  dispose(): void {
    this.disposed = true;
    this.token++;
    this.ctx.engine.wardrobe.setMood(null);
  }

  actions(s: GameState): ModeAction[] {
    return [
      { id: 'hint', label: t('Hint'), icon: Lightbulb, disabled: !!s.end || !this.puzzle || !!s.puzzle?.briefing || !this.canHint() },
      { id: 'brief', label: t('Task'), icon: Info, disabled: !this.puzzle },
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
    return { title: t('Solved!'), text: this.brief?.title ?? t(this.module.name) };
  }

  act(id: string): void {
    if (id === 'hint') this.hint();
    else if (id === 'brief') this.setPuzzle({ briefing: true });
    else if (id === 'go') void this.go(this.token);
    else if (id === 'retry') this.start(true);
    else if (id === 'next') this.ctx.navigate(`/puzzles/${this.module.id}?from=${this.index}`); // the piece hops on the map first
    else if (id === 'exit') this.ctx.navigate(`/puzzles/${this.module.id}`);
  }
}
