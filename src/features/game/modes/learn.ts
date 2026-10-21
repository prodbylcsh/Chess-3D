import { t, tk } from '../../../i18n';
import { Chess, type Color as Side, type Move, type Square } from 'chess.js';
import { RotateCcw } from 'lucide-react';
import { lessonOf, lessonOpen, type LearnChapter } from '#shared/learn.ts';
import { api, ApiError } from '../../../api';
import { FEEL, haptics } from '../../../audio/haptics';
import { toast } from '../../../ui/kit';
import { LESSONS, hasKings, type Lesson, type Step } from '../../learn/lessons';
import type { GameState, LessonView } from '../store';
import { dressGame, playerFromProfile, randomSeed, sleep, type EndAction, type Mode, type ModeAction, type ModeContext } from './types';

const PRAISE = [tk('Well done!'), tk('Exactly!'), tk('Perfect!'), tk('That\'s it!')];
const praise = () => t(PRAISE[Math.floor(Math.random() * PRAISE.length)]);

/** The player always plays White in a lesson. */
const ME: Side = 'w';

const opponentPieces = (fen: string) => new Chess(fen, { skipValidation: true }).board().flat().filter((p) => p && p.color !== ME).length;

/**
 * A lesson of Learn (docs/PLATFORM.md §4.3): its steps one after another on the board. A step
 * explains (with stars, arrows or a piece's moves on the board), shows (the board plays
 * moves), asks for something on the board (a task) or asks a question (a quiz). A wrong move
 * is explained by the rule and taken back. The server records the finished lesson and pays
 * the chapter's reward once.
 */
export class LearnMode implements Mode {
  private readonly lesson: Lesson;
  private readonly chapter: LearnChapter;
  private readonly index: number;
  private stepIndex = 0;
  private token = 0;
  private disposed = false;
  private readonly seed = randomSeed();
  /** the board a step started from, to take a wrong move back or start the step again */
  private entry: { fen: string; history: string[]; free: boolean } | null = null;
  private free = false;
  /** stars still to collect */
  private stars = new Set<string>();

  constructor(
    private readonly ctx: ModeContext,
    lessonId: string,
  ) {
    const at = lessonOf(lessonId)!;
    this.lesson = LESSONS[lessonId];
    this.chapter = at.chapter;
    this.index = at.index;
  }

  get label(): string {
    return `${t(this.chapter.name)} · ${t('Lesson {n} of {total}', { n: this.index + 1, total: this.chapter.lessons.length })}`;
  }

  start(): void {
    this.disposed = false;
    const token = ++this.token;
    void this.open(token).catch((err) => {
      if (this.disposed || token !== this.token) return;
      toast(err instanceof ApiError ? err.message : t('Something went wrong. Please try again.'), { tone: 'danger' });
      this.exit();
    });
  }

  private async open(token: number): Promise<void> {
    const progress = await api.learn.progress();
    if (this.disposed || token !== this.token) return;
    if (!lessonOpen(this.lesson.id, progress.lessons, progress.unlocked)) {
      toast(this.chapter.free || progress.unlocked ? t('Finish the lessons before this one first.') : t('Unlock the chapter first.'), { tone: 'danger' });
      return this.exit();
    }
    const { store, wardrobe } = this.ctx.engine;
    store.reset({
      players: { w: playerFromProfile(this.ctx.profile), b: { name: t('Black'), iconId: 'black' } } as GameState['players'],
      bottom: ME,
      mySide: ME,
      lesson: {
        lesson: this.lesson.id,
        chapter: this.chapter.id,
        color: this.chapter.color,
        title: t(this.lesson.title),
        index: this.index,
        total: this.chapter.lessons.length,
        step: 0,
        steps: this.lesson.steps.length,
        say: '',
        task: false,
        taskDone: false,
        left: null,
        message: null,
        quiz: null,
        guest: !this.ctx.profile,
        done: null,
        saving: false,
        error: null,
      },
    });
    // checkmates and stalemates on the board are part of the lesson: no result card
    store.onGameOver = () => {};
    store.suppressEnd = true;
    dressGame(this.ctx.engine, { w: this.ctx.profile?.loadout ?? null }, this.seed);
    this.ctx.engine.game.labels(!!this.lesson.squares);
    wardrobe.setMood(this.chapter.color);
    await this.go(0, token);
  }

  dispose(): void {
    this.disposed = true;
    this.token++;
    const { game, store, wardrobe } = this.ctx.engine;
    store.suppressEnd = false;
    game.goals([]);
    game.showMoves(null);
    game.arrows([]);
    game.labels(false);
    wardrobe.setMood(null);
  }

  private setLesson(patch: Partial<LessonView>): void {
    const { store } = this.ctx.engine;
    const now = store.get().lesson;
    if (now) store.set({ lesson: { ...now, ...patch } });
  }

  private get view(): LessonView | null {
    return this.ctx.engine.store.get().lesson;
  }

  private get step(): Step {
    return this.lesson.steps[this.stepIndex];
  }

  private seat(token: number) {
    return { side: ME, active: false, send: (m: Move) => void this.onMove(m, token) };
  }

  /** Enter step `i`: its board (or the board as it is), its moves, marks and the task. `again`: start it over. */
  private async go(i: number, token: number, again = false): Promise<void> {
    const { game } = this.ctx.engine;
    this.stepIndex = i;
    const step = this.step;
    game.hold(true);
    game.goals([]);
    game.showMoves(null);
    game.arrows([]);
    this.setLesson({
      step: i,
      say: t(step.say),
      task: !!step.task,
      taskDone: false,
      left: null,
      message: null,
      quiz: step.quiz ? { options: step.quiz.options.map((o) => t(o.text)), chosen: null, right: false } : null,
    });

    if (step.fen) {
      this.free = !hasKings(step.fen);
      await game.begin(this.seat(token), [], step.fen, { free: this.free });
    } else if (again && this.entry) {
      await this.restore(token);
    }
    if (this.disposed || token !== this.token) return;
    if (step.fen || !again) {
      for (const uci of step.play ?? []) {
        await sleep(500);
        if (this.disposed || token !== this.token) return;
        await game.playOut(uci);
      }
    }
    await game.idle();
    if (this.disposed || token !== this.token) return;
    if (!again || step.fen) this.entry = { fen: game.fen, history: game.history, free: this.free };

    this.stars = new Set(step.marks ?? []);
    game.goals((step.marks ?? []) as Square[]);
    if (step.moves) game.showMoves(step.moves as Square);
    if (step.arrows) game.arrows(step.arrows.map(([from, to]) => ({ from: from as Square, to: to as Square, kind: 'hint' as const })));
    if (step.task) {
      const left = step.task.kind === 'collect' ? this.stars.size : step.task.kind === 'capture' ? opponentPieces(game.fen) : null;
      this.setLesson({ left });
      if (this.free) await game.keepTurn(ME);
      game.hold(false);
    }
  }

  /** Back to the board the step started from. */
  private async restore(token: number): Promise<void> {
    const { game } = this.ctx.engine;
    const entry = this.entry!;
    if (entry.free) await game.begin(this.seat(token), [], entry.fen, { free: true });
    else await game.sync(entry.history);
  }

  private onMove(m: Move, token: number): void {
    if (this.disposed || token !== this.token) return;
    const task = this.step.task;
    const view = this.view;
    if (!task || !view || view.taskDone) return;
    const { game } = this.ctx.engine;
    const after = game.fen; // the move is applied; it plays out on the board now
    switch (task.kind) {
      case 'collect': {
        if (this.stars.delete(m.to)) game.goals([...this.stars] as Square[]);
        if (this.stars.size === 0) return this.done();
        this.setLesson({ left: this.stars.size });
        void game.keepTurn(ME);
        return;
      }
      case 'capture': {
        const left = opponentPieces(after);
        if (left === 0) return this.done();
        this.setLesson({ left });
        void game.keepTurn(ME);
        return;
      }
      case 'move':
        return task.moves.includes(m.lan) ? this.done() : void this.wrong(t(task.wrong), token);
      case 'check':
        return new Chess(after).inCheck() ? this.done() : void this.wrong(t('That is not check: attack the king with your move.'), token);
      case 'mate': {
        const c = new Chess(after);
        if (c.isCheckmate()) return this.done();
        return void this.wrong(
          c.isStalemate() ? t('Stalemate! The king is not in check but has no move, so it is a draw. Try another move.') : t('Not checkmate yet: the king can still get out.'),
          token,
        );
      }
      case 'escape':
        return this.done();
    }
  }

  private done(): void {
    this.ctx.engine.game.hold(true);
    this.setLesson({ taskDone: true, left: 0, message: { tone: 'good', text: praise() } });
    haptics.play(FEEL.solved);
  }

  /** A legal move that misses the task: say why, then take it back. */
  private async wrong(text: string, token: number): Promise<void> {
    const { game } = this.ctx.engine;
    game.hold(true);
    this.setLesson({ message: { tone: 'bad', text } });
    haptics.play(FEEL.wrong);
    await game.idle();
    await sleep(900);
    if (this.disposed || token !== this.token) return;
    await this.restore(token);
    if (this.disposed || token !== this.token) return;
    game.goals([...this.stars] as Square[]);
    if (this.free) await game.keepTurn(ME);
    game.hold(false);
  }

  private answer(i: number): void {
    const quiz = this.step.quiz;
    const view = this.view;
    if (!quiz || !view?.quiz || view.quiz.right) return;
    const right = !!quiz.options[i]?.correct;
    this.setLesson({
      quiz: { ...view.quiz, chosen: i, right },
      message: right ? { tone: 'good', text: t(quiz.why) } : { tone: 'bad', text: t('Not quite. Think again.') },
    });
    haptics.play(right ? FEEL.right : FEEL.wrong);
  }

  /** The last step done: the server records the lesson (and pays the chapter's reward once). */
  private async finish(): Promise<void> {
    this.setLesson({ saving: true, error: null });
    try {
      const done = await api.learn.done(this.lesson.id);
      this.setLesson({ saving: false, done });
      if (done.reward) {
        haptics.play(FEEL.solved);
        await this.ctx.refreshProfile().catch(() => {});
      }
    } catch (err) {
      this.setLesson({ saving: false, error: err instanceof ApiError ? err.message : t('Could not save the lesson.') });
    }
  }

  private exit(): void {
    this.ctx.navigate(`/learn/${this.chapter.id}`);
  }

  actions(s: GameState): ModeAction[] {
    const l = s.lesson;
    return [{ id: 'retry', label: t('Restart'), icon: RotateCcw, disabled: !l || !!l.done || l.saving }];
  }

  endActions(): EndAction[] {
    return [];
  }

  act(id: string): void {
    const token = this.token;
    if (id === 'next') {
      const view = this.view;
      if (!view || (view.task && !view.taskDone) || (view.quiz && !view.quiz.right) || view.saving) return;
      if (this.stepIndex + 1 < this.lesson.steps.length) void this.go(this.stepIndex + 1, token);
      else void this.finish();
    } else if (id === 'retry') {
      void this.go(this.stepIndex, token, true);
    } else if (id === 'save') {
      void this.finish();
    } else if (id === 'next-lesson') {
      const next = this.chapter.lessons[this.index + 1];
      this.ctx.navigate(next ? `/game/learn/${next}` : `/learn/${this.chapter.id}`);
    } else if (id.startsWith('answer:')) {
      this.answer(Number(id.slice(7)));
    } else if (id === 'exit') {
      this.exit();
    }
  }
}
