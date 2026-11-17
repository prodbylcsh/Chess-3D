import { t, tk } from '../../../i18n';
import { Chess, type Color as Side, type Move, type PieceSymbol, type Square } from 'chess.js';
import { Eye, FastForward, Info, Lightbulb, RotateCcw } from 'lucide-react';
import { PUZZLES_PER_MODULE, guestMayPlay, hintPenalty, moduleOf, playerSide, streakTier, type PuzzleInfo, type PuzzleModule } from '#shared/puzzles.ts';
import type { Marks } from '#shared/puzzle-attempt.ts';
import type { NextGoal } from '#shared/puzzle-intent.ts';
import { briefOf, nextText, type Brief } from '../../puzzles/brief';
import { whyNot, type WhyNot } from '../../puzzles/whyNot';
import { reviewReady } from '../../puzzles/review';
import { stuckness } from '../../puzzles/stuck';
import { api, ApiError } from '../../../api';
import { modulePuzzles } from '../../../api/puzzleData';
import { engineSupported, Stockfish } from '../../../ai/stockfish';
import { FEEL, haptics, streakFeel } from '../../../audio/haptics';
import { confirmDialog, toast } from '../../../ui/kit';
import type { GameState, PuzzleView } from '../store';
import { dressGame, playerFromProfile, randomSeed, sleep, type EndAction, type Mode, type ModeAction, type ModeContext } from './types';

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');
const toMove = (m: string) => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
const PRAISE = [tk('Nice!'), tk('Exactly!'), tk('Sharp!'), tk('Great move!'), tk('Spot on!')];
/** A cheer for a right move that has no lesson, different each move. */
const praise = (n: number) => t(PRAISE[(n * 3 + Math.floor(Math.random() * 2)) % PRAISE.length]);
const PIECE_NAMES: Record<string, string> = { p: tk('pawn'), n: tk('knight'), b: tk('bishop'), r: tk('rook'), q: tk('queen'), k: tk('king') };
/** the engine's effort for "why not?": quick, a few tenths of a second */
const WHY_NODES = 80_000;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What the coach says about a wrong move (whyNot.ts). */
const WHY_TEXT: Record<Exclude<WhyNot['kind'], 'takes' | 'alternative'>, string> = {
  weaker: tk('Not bad, but weaker than the move this puzzle wants.'),
  missedMate: tk('Strong, but there is a checkmate here. Look for it!'),
  mate: tk('Watch: then your opponent mates you.'),
  check: tk('Watch: your opponent answers with a check and takes over.'),
  worse: tk('Watch how your opponent answers: they get the upper hand.'),
  slip: tk('Watch how your opponent answers: your advantage slips away.'),
};
const TAKES_TEXT: Record<PieceSymbol, string> = {
  p: tk('Watch: then your opponent takes your pawn.'),
  n: tk('Watch: then your opponent takes your knight.'),
  b: tk('Watch: then your opponent takes your bishop.'),
  r: tk('Watch: then your opponent takes your rook.'),
  q: tk('Watch: then your opponent takes your queen.'),
  k: tk('Watch: then your opponent mates you.'),
};

/** A short line about a move of the solution that has no lesson (the replay). */
function describeMove(m: Move, after: Chess): string {
  const piece = capital(t(PIECE_NAMES[m.piece]));
  if (after.isCheckmate()) return t('Checkmate!');
  if (m.promotion) return t('The pawn promotes!');
  if (m.captured && after.inCheck()) return t('{piece} takes, with check!', { piece });
  if (m.captured) return t('{piece} takes!', { piece });
  if (after.inCheck()) return t('{piece} gives check.', { piece });
  return t('A quiet move: {piece}.', { piece: t(PIECE_NAMES[m.piece]) });
}

export interface PuzzleOptions {
  /** opened from the review list: "next" goes to the next puzzle ready for review */
  review?: boolean;
}

/**
 * A puzzle (docs/PLATFORM.md §4.2): the opponent's move sets it up, the player finds the
 * solution move by move and the opponent's replies are played back. A wrong move is shown
 * refuted by the engine, taken back and counts as a mistake. The app never has the solution
 * (audit, November 2026): the server judges each move, sends the replies, the hints and what
 * the next move is for, counts the mistakes and hints and pays the rewards. The solution
 * comes only after a solve or a reveal, for the replay. `moduleId` 'daily' plays today's
 * daily puzzle.
 */
export class PuzzleMode implements Mode {
  private module: PuzzleModule;
  private index: number;
  private readonly isDaily: boolean;
  private puzzle: PuzzleInfo | null = null;
  private brief: Brief | null = null;
  private played: string[] = [];
  private mistakes = 0;
  private hints = 0;
  /** what the board shows for the current move (from the server): the piece to move and the square it goes to */
  private shown = { piece: false, square: false };
  private marks: Marks = { from: null, to: null };
  /** what the next move is for (from the server) */
  private nextGoal: NextGoal | null = null;
  /** the whole line, once the server sent it (after a solve or a reveal) */
  private line: string | null = null;
  /** a move or hint is with the server */
  private asking = false;
  private setupDone = false;
  private token = 0;
  private disposed = false;
  private readonly seed = randomSeed();
  /** the engine for "why not?" (null: not available on this device) */
  private engine: Stockfish | null | undefined;
  private engineQueue: Promise<unknown> = Promise.resolve();
  /** time spent while the page is visible: in the puzzle, and on the current move */
  private puzzleMs = 0;
  private moveMs = 0;
  private clock: ReturnType<typeof setInterval> | null = null;
  private skip = false;

  constructor(
    private readonly ctx: ModeContext,
    moduleId: string,
    index: number,
    private readonly options: PuzzleOptions = {},
  ) {
    this.isDaily = moduleId === 'daily';
    this.module = moduleOf(this.isDaily ? 'openings' : moduleId)!;
    this.index = index;
  }

  get label(): string {
    if (this.isDaily) return t('Daily puzzle');
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
    this.marks = { from: null, to: null };
    this.nextGoal = null;
    this.line = null;
    this.asking = false;
    this.setupDone = false;
    this.skip = false;
    this.puzzleMs = 0;
    this.moveMs = 0;
    this.startClock();
    void this.open(token, again).catch((err) => {
      if (this.disposed || token !== this.token) return;
      toast(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'), { tone: 'danger' });
      this.ctx.navigate(this.isDaily ? '/puzzles' : `/puzzles/${this.module.id}`);
    });
  }

  private async open(token: number, again: boolean): Promise<void> {
    const { store, game } = this.ctx.engine;
    let daily: PuzzleView['daily'] = null;
    if (this.isDaily) {
      const d = await api.puzzles.daily();
      this.module = moduleOf(d.module)!;
      this.index = d.index;
      daily = { day: d.day, streak: d.streak, result: null };
    }
    const [puzzles, progress, opened] = await Promise.all([
      modulePuzzles(this.module.id),
      this.isDaily ? null : api.puzzles.progress().then((all) => all.find((m) => m.id === this.module.id) ?? null),
      this.isDaily ? api.puzzles.dailyStart() : api.puzzles.start(this.module.id, this.index),
    ]);
    const puzzle = puzzles[this.index];
    if (!puzzle || this.disposed || token !== this.token) return;
    this.puzzle = puzzle;
    this.nextGoal = opened.next;
    const brief = (this.brief = briefOf(puzzle, this.module.select.themes));
    const side = playerSide(puzzle);
    const until = progress?.reviewFrom[this.index] ?? null;
    store.reset({
      players: {
        [side]: playerFromProfile(this.ctx.profile),
        [other(side)]: { name: this.isDaily ? t('Daily puzzle') : t(this.module.name), iconId: 'bot', tag: `★ ${puzzle.rating}` },
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
        next: null,
        stuck: false,
        replaying: false,
        revealed: false,
        practiceUntil: until && Date.parse(until) > Date.now() ? until : null,
        daily,
      },
    });
    store.onGameOver = () => {}; // a mating solution ends the game on the board; the solve is handled in onMove
    store.suppressEnd = false;
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

  private get view(): PuzzleView | null {
    return this.ctx.engine.store.get().puzzle;
  }

  // ---------------------------------------------------------------- the stuck clock

  private startClock(): void {
    this.stopClock();
    this.clock = setInterval(() => {
      const v = this.view;
      if (!v || v.briefing || v.replaying || v.result || v.revealed || this.ctx.engine.game.isOver || document.visibilityState !== 'visible') return;
      this.puzzleMs += 1000;
      this.moveMs += 1000;
      if (!v.stuck && !this.isDaily && stuckness(this.mistakes, this.hints, this.puzzleMs, this.moveMs)) this.setPuzzle({ stuck: true });
    }, 1000);
  }

  private stopClock(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
  }

  // ---------------------------------------------------------------- playing

  /** The briefing is closed: the opponent's setup move, then the player's turn. */
  private async go(token: number): Promise<void> {
    const puzzle = this.puzzle;
    if (!puzzle) return;
    this.setPuzzle({ briefing: false });
    if (this.setupDone) return;
    this.setupDone = true;
    this.warmEngine(); // loaded before the first wrong move needs it
    const setup = puzzle.setup;
    if (setup) {
      await sleep(350);
      if (this.disposed || token !== this.token) return;
      const { game } = this.ctx.engine;
      const moved = new Chess(game.fen).move(toMove(setup));
      await game.sync([setup]);
      if (this.disposed || token !== this.token) return;
      game.arrows([{ from: moved.from, to: moved.to, kind: 'line' }]);
      this.showNext();
      this.setPuzzle({
        message: {
          tone: 'info',
          text: moved.captured
            ? t('Your opponent took with a {piece}. Your turn!', { piece: t(PIECE_NAMES[moved.piece]) })
            : t('Your opponent moved a {piece}. Your turn!', { piece: t(PIECE_NAMES[moved.piece]) }),
        },
      });
    } else {
      this.showNext();
      this.setPuzzle({ message: { tone: 'info', text: this.brief?.side === 'w' ? t('White begins. Your move!') : t('Black begins. Your move!') } });
    }
  }

  /** The server's key for this puzzle's moves and hints. */
  private get key(): string {
    return this.isDaily ? 'daily' : this.module.id;
  }

  private async onMove(move: Move, token: number): Promise<void> {
    const puzzle = this.puzzle;
    const { game } = this.ctx.engine;
    if (!puzzle || token !== this.token) return;
    game.arrows([]);
    const before = game.history.slice(0, -1);
    const fenBefore = new Chess(puzzle.fen);
    for (const m of before) fenBefore.move(toMove(m));
    // the server judges the move (it alone knows the solution); meanwhile the board takes no moves
    game.hold(true);
    this.asking = true;
    // the engine's view of a wrong move, for the coach (started at once: the server may say so)
    let why: Promise<WhyNot | null> | null = null;
    let res;
    try {
      res = await api.puzzles.move(this.key, this.index, move.lan);
    } catch (err) {
      this.asking = false;
      if (token !== this.token || this.disposed) return;
      await game.idle();
      await game.sync(before);
      game.hold(false);
      this.setPuzzle({ message: { tone: 'bad', text: err instanceof ApiError ? err.message : t('Could not reach the server. Check your connection.') } });
      return;
    }
    this.asking = false;
    if (token !== this.token || this.disposed) return;
    this.mistakes = res.mistakes;
    this.hints = res.hints;

    if (res.kind === 'right') {
      this.played.push(move.lan);
      this.shown = { piece: false, square: false };
      this.marks = { from: null, to: null };
      this.moveMs = 0;
      game.guide(null, null);
      game.hold(false);
      const why = this.brief?.lesson?.why[this.played.length - 1];
      this.setPuzzle({ step: this.played.length, next: null, message: { tone: 'good', text: why ? t(why) : praise(this.played.length) } });
      if (res.done) return this.solved(token, res.mate);
      await game.idle();
      haptics.play(FEEL.right);
      await sleep(why ? 700 : 350);
      if (token !== this.token || this.disposed || !res.reply) return;
      await game.sync([...game.history, res.reply]);
      game.arrows([{ from: res.reply.slice(0, 2) as Square, to: res.reply.slice(2, 4) as Square, kind: 'line' }]);
      this.nextGoal = res.next;
      this.showNext();
      return;
    }
    // another move. As good as the puzzle's move (another way to the same goal, judged by the
    // engine ahead of time) it is no mistake, just taken back. Otherwise it is shown refuted,
    // taken back and counts as a mistake; the board shows where the right one ends (free),
    // and three in a row also show the piece to move, which counts as a hint
    // (docs/PLATFORM.md §4.2)
    this.marks = res.marks;
    this.shown = { piece: !!res.marks.from, square: !!res.marks.to };
    if (res.kind === 'alternative') {
      await game.idle();
      haptics.play(FEEL.right);
      this.setPuzzle({ message: { tone: 'good', text: t('A good move too! But this puzzle goes on with a different one: find it.') } });
      await sleep(1100);
      if (token !== this.token || this.disposed) return;
      await game.sync(before);
      game.hold(false);
      if (token !== this.token || this.disposed) return;
      this.showGuide();
      this.setPuzzle({ message: { tone: 'good', text: `${t('A good move too! But this puzzle goes on with a different one: find it.')} ${t('It ends on the marked square.')}` } });
      return;
    }
    why = this.whyNot(fenBefore.fen(), move.lan);
    await game.idle();
    // a phone takes well under a second; without an answer in time there is no explanation
    const verdict = await Promise.race([why, sleep(6000).then(() => null)]);
    if (token !== this.token || this.disposed || game.isOver) return;
    const auto = res.autoHint;
    const goal = this.puzzle?.goal;
    const missed = goal ? t('{goal}: not this move.', { goal: t(goal) }) : t('Not this move.');
    const guideText = this.shown.piece ? t('Move the glowing piece to the marked square.') : t('The right move ends on the marked square.');
    haptics.play(FEEL.wrong);
    const refute = verdict && 'reply' in verdict ? verdict.reply : null;
    const whyText = verdict ? (verdict.kind === 'takes' ? t(TAKES_TEXT[verdict.piece]) : verdict.kind === 'alternative' ? '' : t(WHY_TEXT[verdict.kind])) : '';
    this.setPuzzle({ mistakes: this.mistakes, hints: this.hints, message: { tone: 'bad', text: refute ? `${missed} ${whyText}` : missed } });
    if (refute) {
      // play the opponent's answer, then take both moves back
      const { store } = this.ctx.engine;
      await sleep(300);
      if (token !== this.token || this.disposed) return;
      store.suppressEnd = true; // a mating answer ends the game on the board, not the puzzle
      game.arrows([{ from: refute.slice(0, 2) as Square, to: refute.slice(2, 4) as Square, kind: 'threat' }]);
      await game.sync([...game.history, refute]);
      await game.idle();
      await sleep(1600);
      store.suppressEnd = false;
      if (token !== this.token || this.disposed) return;
    } else {
      await sleep(verdict ? 900 : 300);
      if (token !== this.token || this.disposed) return;
    }
    await game.sync(before);
    game.hold(false);
    if (token !== this.token || this.disposed) return;
    this.showGuide();
    this.setPuzzle({
      message: auto
        ? { tone: 'hint', text: `${t('Three misses in a row, so the piece to move glows now too. It counts as a hint.')} ${this.hintCost(puzzle)}` }
        : { tone: 'bad', text: [missed, refute ? '' : whyText, guideText].filter(Boolean).join(' ') },
    });
    if (auto) haptics.play(FEEL.hint);
  }

  private warmEngine(): Stockfish | null {
    if (this.engine === undefined) this.engine = engineSupported() ? new Stockfish() : null;
    return this.engine;
  }

  /**
   * The engine's explanation of a move the server called a mistake, or null where it can't
   * run. The app doesn't know the puzzle's move, so the engine's own best move is the yardstick.
   */
  private whyNot(fen: string, wrong: string): Promise<WhyNot | null> {
    const engine = this.warmEngine();
    if (!engine) return Promise.resolve(null);
    const run = this.engineQueue.then(async () => {
      const best = await engine.search(fen, WHY_NODES);
      const w = await engine.search(fen, WHY_NODES, [wrong.slice(0, 4) + (wrong[4] ?? '')]);
      return whyNot(fen, wrong, Math.max(best.score, w.score), w.score, w.pv[1]);
    });
    this.engineQueue = run.catch(() => null);
    return run.catch(() => null);
  }

  /** What the player's next move is for, on the coach card (puzzles/intent.ts). */
  private showNext(): void {
    this.setPuzzle({ next: this.nextGoal ? nextText(this.nextGoal) : null });
  }

  /** The marks for the current move (the server's): rings, or an arrow once both the piece and the square are known. */
  private showGuide(): void {
    const { from, to } = this.marks;
    const { game } = this.ctx.engine;
    const both = !!from && !!to;
    game.guide(from, both ? null : to);
    game.arrows(both ? [{ from, to, kind: 'hint' }] : []);
    if (from) game.suggest(from, to ?? undefined); // lift it, as a hint does
  }

  private hintCost(puzzle: PuzzleInfo): string {
    // with Premium hints cost nothing (docs/PLATFORM.md §4.9)
    if (this.ctx.profile?.premium) return t('Hints are free with your Premium plan.');
    return t('Hints so far: −{n} coins.', { n: hintPenalty(this.hints, puzzle.moves) });
  }

  private async solved(token: number, mate: boolean): Promise<void> {
    const { game, store } = this.ctx.engine;
    await game.idle();
    if (token !== this.token || this.disposed) return;
    this.setPuzzle({ saving: true, stuck: false });
    if (!mate) haptics.play(FEEL.solved); // a mate has its own
    // a mate has already ended the game on the board
    if (!game.isOver) await game.finish({ winner: store.get().mySide, reason: 'puzzle', title: t('Solved!'), text: t('Puzzle solved') });
    try {
      if (this.isDaily) {
        const result = await api.puzzles.dailySolve();
        if (token !== this.token || this.disposed) return;
        this.line = result.line;
        const d = this.view?.daily;
        if (d) this.setPuzzle({ saving: false, daily: { ...d, result } });
        await sleep(500);
        if (!result.already) haptics.play(streakFeel(Math.max(0, streakTier(result.streak.current))));
      } else {
        const result = await api.puzzles.solve(this.module.id, this.index);
        if (token !== this.token || this.disposed) return;
        this.line = result.line;
        this.setPuzzle({ saving: false, result });
      }
      await this.ctx.refreshProfile();
    } catch (err) {
      if (token === this.token && !this.disposed) this.setPuzzle({ saving: false, error: err instanceof ApiError ? err.message : t('Could not save the result.') });
    }
  }

  /** First the piece to move (lifted on the board), then the square it goes to; each is shown once (from the server). */
  private async hint(): Promise<void> {
    const puzzle = this.puzzle;
    const { game } = this.ctx.engine;
    if (!puzzle || game.isOver || !this.canHint() || this.asking) return;
    const token = this.token;
    const square = this.shown.piece; // the piece is known: the square comes next
    this.asking = true;
    let res;
    try {
      res = await api.puzzles.hint(this.key, this.index);
    } catch (err) {
      if (token === this.token) this.setPuzzle({ message: { tone: 'bad', text: err instanceof ApiError ? err.message : t('Could not reach the server. Check your connection.') } });
      return;
    } finally {
      this.asking = false;
    }
    if (!res || token !== this.token || this.disposed) return;
    this.hints = res.hints;
    this.marks = res.marks;
    this.shown = { piece: !!res.marks.from, square: !!res.marks.to };
    const piece = t(PIECE_NAMES[(res.marks.from && new Chess(game.fen).get(res.marks.from)?.type) || 'p']);
    this.showGuide();
    haptics.play(FEEL.hint);
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

  // ---------------------------------------------------------------- the solution

  /** Show the solution when stuck: the puzzle counts as seen (no coins or stars), then it plays. */
  private async reveal(): Promise<void> {
    const token = this.token;
    const ok = await confirmDialog({
      title: t('Show the solution?'),
      text: t('The puzzle will count as seen: no coins or stars now, and the next puzzle opens. You can solve it again for its stars and coins in a review, from tomorrow.'),
      confirmLabel: t('Show the solution'),
    });
    if (!ok || token !== this.token || this.disposed) return;
    try {
      this.line = (await api.puzzles.reveal(this.module.id, this.index)).line;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'), { tone: 'danger' });
      return;
    }
    if (token !== this.token || this.disposed) return;
    this.setPuzzle({ revealed: true, stuck: false });
    await this.replay(token);
  }

  /** Play the whole line back from the start, each of the player's moves explained. */
  private async replay(token = this.token): Promise<void> {
    const puzzle = this.puzzle;
    const { game, store } = this.ctx.engine;
    if (!puzzle || !this.line) return;
    this.skip = false;
    store.set({ showEnd: false });
    game.hold(true);
    game.guide(null, null);
    this.setPuzzle({ replaying: true, step: 0, next: null, message: { tone: 'info', text: t('Watch the solution, move by move.') } });
    const alive = () => token === this.token && !this.disposed;
    const line = this.line.split(' ');
    const first = puzzle.playerFirst ? 0 : 1;
    await game.sync([]);
    for (let i = 0; i < line.length && alive(); i++) {
      if (this.skip) {
        await game.sync(line);
        break;
      }
      const uci = line[i];
      const mine = i >= first && (i - first) % 2 === 0;
      const from = uci.slice(0, 2) as Square;
      const to = uci.slice(2, 4) as Square;
      game.arrows([{ from, to, kind: mine ? 'hint' : 'line' }]);
      await sleep(mine ? 800 : 450);
      if (!alive()) return;
      const chess = new Chess(game.fen);
      const made = chess.move(toMove(uci));
      await game.sync(line.slice(0, i + 1));
      await game.idle();
      game.arrows([]);
      if (mine) {
        const n = (i - first) / 2;
        const why = this.brief?.lesson?.why[n];
        this.setPuzzle({ step: n + 1, message: { tone: 'good', text: why ? t(why) : describeMove(made, chess) } });
        await sleep(why ? 1400 + Math.min(2600, why.length * 25) : 1200);
      } else if (i > 0) {
        await sleep(500);
      }
    }
    if (!alive()) return;
    game.hold(false);
    await game.idle();
    this.setPuzzle({ replaying: false });
    if (!game.isOver) await game.finish({ winner: store.get().mySide, reason: 'puzzle', title: t('Solved!'), text: t('Puzzle solved') });
    else store.set({ showEnd: true });
  }

  dispose(): void {
    this.disposed = true;
    this.token++;
    this.ctx.engine.store.suppressEnd = false;
    this.stopClock();
    this.engine?.dispose();
    this.engine = undefined;
    this.ctx.engine.wardrobe.setMood(null);
  }

  actions(s: GameState): ModeAction[] {
    const p = s.puzzle;
    if (p?.replaying) return [{ id: 'skip', label: t('Skip'), icon: FastForward }];
    return [
      { id: 'hint', label: t('Hint'), icon: Lightbulb, disabled: !!s.end || !this.puzzle || !!p?.briefing || !this.canHint() },
      ...(p?.stuck && !s.end ? [{ id: 'reveal', label: t('Solution'), icon: Eye }] : []),
      { id: 'brief', label: t('Task'), icon: Info, disabled: !this.puzzle },
      { id: 'retry', label: t('Restart'), icon: RotateCcw, disabled: !this.puzzle },
    ];
  }

  endActions(s: GameState): EndAction[] {
    const p = s.puzzle;
    const passed = !!p?.result || !!p?.revealed;
    if (this.isDaily) {
      return [
        { id: 'replay', label: t('Replay the solution') },
        { id: 'exit', label: t('Back to puzzles'), primary: true },
      ];
    }
    const next = passed && (this.options.review || this.index + 1 < PUZZLES_PER_MODULE);
    // a guest at the end of the levels they may try: the way in
    if (next && !this.ctx.profile && !this.options.review && !guestMayPlay(this.module.id, this.index + 1)) {
      return [
        { id: 'register', label: t('Create a free account'), primary: true },
        ...(passed ? [{ id: 'replay', label: t('Replay the solution') }] : []),
        { id: 'exit', label: t('Back to the map') },
      ];
    }
    return [
      ...(next ? [{ id: 'next', label: this.options.review ? t('Next review') : t('Next puzzle'), primary: true }] : []),
      ...(passed ? [{ id: 'replay', label: t('Replay the solution') }] : []),
      { id: 'retry', label: t('Try again') },
      { id: 'exit', label: t('Back to the map'), primary: !next },
    ];
  }

  endNote(): string | null {
    return this.ctx.profile ? null : t('You are playing as a guest. Create a free account on this device to keep your puzzles, streak and coins.');
  }

  endTitle(s: GameState): { title: string; text: string } {
    if (s.puzzle?.revealed && !s.puzzle.result) return { title: t('The solution'), text: this.brief?.title ?? t(this.module.name) };
    return { title: t('Solved!'), text: this.brief?.title ?? t(this.module.name) };
  }

  act(id: string): void {
    if (id === 'hint') void this.hint();
    else if (id === 'brief') this.setPuzzle({ briefing: true });
    else if (id === 'go') void this.go(this.token);
    else if (id === 'retry') this.start(true);
    else if (id === 'reveal') void this.reveal();
    else if (id === 'replay') void this.replay();
    else if (id === 'skip') this.skip = true;
    else if (id === 'next') void this.next();
    else if (id === 'register') this.ctx.navigate('/auth?signup');
    else if (id === 'exit') this.ctx.navigate(this.isDaily ? '/puzzles' : `/puzzles/${this.module.id}`);
  }

  /** The next puzzle on the map (the piece hops there first), or the next one ready for review. */
  private async next(): Promise<void> {
    if (!this.options.review) return this.ctx.navigate(`/puzzles/${this.module.id}?from=${this.index}`);
    const mine = (await api.puzzles.progress()).find((m) => m.id === this.module.id);
    const ready = mine ? reviewReady(mine).filter((i) => i !== this.index) : [];
    this.ctx.navigate(ready.length ? `/game/puzzle/${this.module.id}?n=${ready[0]}&review=1` : `/puzzles/${this.module.id}`);
  }
}

