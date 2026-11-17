// A way through every lesson of Learn, the way a player does it (tests only): the moves each
// task keeps and the right quiz answers, found by searching the lesson's boards.
import { Chess, type Square } from 'chess.js';
import { hasKings, type Lesson } from '../supabase/functions/_shared/learn-lessons.ts';
import type { StepRecord } from '../supabase/functions/_shared/learn-check.ts';

const load = (fen: string) => new Chess(fen, { skipValidation: !hasKings(fen) });
const ME = 'w';
const opponentPieces = (c: Chess) => c.board().flat().filter((p) => p && p.color !== ME).length;

/** Shortest list of the player's moves (moving again and again) that reaches `goal`. */
function search(fen: string, goal: (c: Chess, visited: Set<string>) => boolean, depth = 8): string[] | null {
  const free = !hasKings(fen);
  let frontier: { fen: string; visited: Set<string>; path: string[] }[] = [{ fen, visited: new Set(), path: [] }];
  const seen = new Set<string>();
  for (let d = 0; d < depth; d++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      const c = load(node.fen);
      if (free && c.turn() !== ME) c.setTurn(ME);
      for (const m of c.moves({ verbose: true })) {
        if (m.color !== ME) continue;
        const after = load(c.fen());
        after.move(m);
        const visited = new Set(node.visited).add(m.to);
        const path = [...node.path, m.lan];
        if (goal(after, visited)) return path;
        const key = `${after.fen().split(' ')[0]}|${[...visited].sort().join()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ fen: after.fen(), visited, path });
      }
    }
    frontier = next;
  }
  return null;
}

export function solveLesson(lesson: Lesson): StepRecord[] {
  const out: StepRecord[] = [];
  let c: Chess | null = null;
  let free = false;
  for (const step of lesson.steps) {
    if (step.fen) {
      free = !hasKings(step.fen);
      c = load(step.fen);
    }
    const board = c!;
    for (const uci of step.play ?? []) {
      if (free && board.get(uci.slice(0, 2) as Square)?.color !== board.turn()) board.setTurn(board.turn() === 'w' ? 'b' : 'w');
      board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }
    const rec: StepRecord = { moves: [] };
    if (step.quiz) rec.answer = step.quiz.options.findIndex((o) => o.correct);
    const task = step.task;
    if (task) {
      if (free && board.turn() !== ME) board.setTurn(ME);
      const now = board.fen();
      const stars = step.marks ?? [];
      const moves =
        task.kind === 'collect'
          ? search(now, (_, v) => stars.every((s) => v.has(s)))
          : task.kind === 'capture'
            ? search(now, (a) => opponentPieces(a) === 0)
            : task.kind === 'move'
              ? [task.moves[0]]
              : search(now, (a) => (task.kind === 'check' ? a.inCheck() : task.kind === 'mate' ? a.isCheckmate() : true), 1);
      if (!moves) throw new Error(`${lesson.id}: no way through`);
      rec.moves = moves;
      for (const m of moves) {
        if (free && board.turn() !== ME) board.setTurn(ME);
        board.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      }
    }
    out.push(rec);
  }
  return out;
}
