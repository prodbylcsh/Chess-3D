// Did the player do the lesson? (audit, November 2026). The app sends what happened in each
// step: the moves that stayed on the board (a wrong move is taken back and not sent) and the
// quiz answer. The server replays them on the lesson's own boards (the same rules as
// src/features/game/modes/learn.ts) before it records the lesson and pays a chapter's reward.
// Pure: the `puzzles` function, the demo back-end and the tests run it.
import { Chess, type Square } from 'chess.js';
import { hasKings, type Lesson } from './learn-lessons.ts';

/** What the player did in one step of a lesson. */
export interface StepRecord {
  /** the player's moves (UCI) that the step kept */
  moves: string[];
  /** the quiz option chosen (right) */
  answer?: number;
}

/** The player always plays White in a lesson. */
const ME = 'w';

const load = (fen: string) => new Chess(fen, { skipValidation: !hasKings(fen) });
const opponentPieces = (c: Chess) => c.board().flat().filter((p) => p && p.color !== ME).length;

/** Read what the app sent, tolerating nothing; null when it isn't a transcript at all. */
export function stepRecords(raw: unknown): StepRecord[] | null {
  if (!Array.isArray(raw) || raw.length > 64) return null;
  const out: StepRecord[] = [];
  for (const r of raw) {
    const moves = (r as StepRecord | null)?.moves;
    if (!Array.isArray(moves) || moves.length > 64 || !moves.every((m) => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))) return null;
    const answer = (r as StepRecord).answer;
    out.push(Number.isInteger(answer) ? { moves, answer } : { moves });
  }
  return out;
}

/**
 * Whether `steps` does every task and answers every quiz of the lesson, step by step, on the
 * lesson's boards. Returns null when it does, otherwise what is wrong (for the logs and tests).
 */
export function checkLesson(lesson: Lesson, steps: readonly StepRecord[]): string | null {
  if (steps.length !== lesson.steps.length) return 'not every step';
  let c: Chess | null = null;
  let free = false;
  const move = (uci: string) => {
    if (!c) throw new Error('no board');
    // a free board (no kings): the player moves again and again, as the board allows it
    if (free && c.turn() !== ME) c.setTurn(ME);
    if (c.get(uci.slice(0, 2) as Square)?.color !== ME) throw new Error(`not the player's piece: ${uci}`);
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  };
  for (const [i, step] of lesson.steps.entries()) {
    const where = `step ${i + 1}`;
    const rec = steps[i];
    if (step.fen) {
      free = !hasKings(step.fen);
      c = load(step.fen);
    }
    if (!c) return `${where}: no board`;
    const board: Chess = c;
    for (const uci of step.play ?? []) {
      if (free && board.get(uci.slice(0, 2) as Square)?.color !== board.turn()) board.setTurn(board.turn() === 'w' ? 'b' : 'w');
      board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }
    if (step.quiz) {
      if (rec.answer == null || !step.quiz.options[rec.answer]?.correct) return `${where}: the quiz`;
    }
    const task = step.task;
    if (!task) {
      if (rec.moves.length) return `${where}: moves without a task`;
      continue;
    }
    try {
      switch (task.kind) {
        case 'collect': {
          const stars = new Set(step.marks ?? []);
          for (const [n, m] of rec.moves.entries()) {
            if (!stars.size) return `${where}: moves after the last star`;
            stars.delete(move(m).to);
            if (!stars.size && n !== rec.moves.length - 1) return `${where}: moves after the last star`;
          }
          if (stars.size) return `${where}: stars left`;
          break;
        }
        case 'capture': {
          for (const [n, m] of rec.moves.entries()) {
            move(m);
            if (!opponentPieces(board) && n !== rec.moves.length - 1) return `${where}: moves after the last capture`;
          }
          if (opponentPieces(board)) return `${where}: pieces left`;
          break;
        }
        default: {
          if (rec.moves.length !== 1) return `${where}: one move`;
          const made = move(rec.moves[0]);
          if (task.kind === 'move' && !task.moves.includes(made.lan)) return `${where}: not the move`;
          if (task.kind === 'check' && !board.inCheck()) return `${where}: no check`;
          if (task.kind === 'mate' && !board.isCheckmate()) return `${where}: no mate`;
        }
      }
    } catch (err) {
      return `${where}: ${(err as Error).message}`;
    }
  }
  return null;
}
