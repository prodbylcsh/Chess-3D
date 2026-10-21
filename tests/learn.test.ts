// Learn (docs/PLATFORM.md §4.3): the chapters and their rules, and every lesson's positions
// and tasks: the boards load, tasks can be done, quizzes have one right answer, and the
// texts speak of pieces, not squares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, validateFen, type Square } from 'chess.js';
import { CHAPTERS, chapterOf, lessonOf, lessonOpen, nextLesson } from '../supabase/functions/_shared/learn.ts';
import { LESSONS, hasKings, type Step } from '../src/features/learn/lessons.ts';

const load = (fen: string) => new Chess(fen, { skipValidation: !hasKings(fen) });

/** Positions reachable by the side to move moving again and again (free boards), as FEN boards. */
function reachable(fen: string, goal: (c: Chess, visited: Set<string>) => boolean, depth = 8): boolean {
  const side = fen.split(' ')[1] as 'w' | 'b';
  const start = load(fen);
  let frontier: { fen: string; visited: Set<string> }[] = [{ fen: start.fen(), visited: new Set() }];
  const seen = new Set<string>();
  for (let d = 0; d < depth; d++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      const c = load(node.fen);
      for (const m of c.moves({ verbose: true })) {
        const after = load(node.fen);
        after.move(m);
        const visited = new Set(node.visited).add(m.to);
        if (goal(after, visited)) return true;
        if (after.turn() !== side) after.setTurn(side);
        const key = `${after.fen().split(' ')[0]}|${[...visited].sort().join()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ fen: after.fen(), visited });
      }
    }
    frontier = next;
  }
  return false;
}

const opponentPieces = (c: Chess, side: 'w' | 'b') => c.board().flat().filter((p) => p && p.color !== side).length;

test('chapters: ids, lessons and the rules for opening them', () => {
  assert.equal(new Set(CHAPTERS.map((c) => c.id)).size, CHAPTERS.length);
  assert.deepEqual(CHAPTERS.filter((c) => c.free).map((c) => c.id), ['pieces', 'rules']);
  const all = CHAPTERS.flatMap((c) => c.lessons);
  assert.equal(new Set(all).size, all.length, 'lesson ids are unique');
  for (const id of all) assert.ok(LESSONS[id], `lesson ${id} is written`);
  assert.deepEqual(Object.keys(LESSONS).sort(), [...all].sort(), 'every written lesson is in a chapter');
  assert.equal(lessonOf('rook')?.chapter.id, 'pieces');
  assert.equal(lessonOf('rook')?.index, 1);
  assert.equal(lessonOf('nope'), null);
  const pieces = chapterOf('pieces')!;
  assert.equal(nextLesson(pieces, []), 0);
  assert.equal(nextLesson(pieces, ['board', 'rook']), 2);
  assert.ok(lessonOpen('board', [], false));
  assert.ok(!lessonOpen('rook', [], false), 'in order');
  assert.ok(lessonOpen('rook', ['board'], false));
  assert.ok(lessonOpen('board', ['board', 'rook'], false), 'a finished lesson can be replayed');
  assert.ok(!lessonOpen('stalemate', [], false), 'a paid chapter needs the unlock');
  assert.ok(lessonOpen('stalemate', [], true));
});

for (const lesson of Object.values(LESSONS)) {
  test(`lesson ${lesson.id}: boards, tasks and quizzes`, () => {
    let fen: string | null = null;
    lesson.steps.forEach((step: Step, i) => {
      const where = `${lesson.id} step ${i + 1}`;
      if (step.fen) {
        fen = step.fen;
        if (hasKings(fen)) assert.ok(validateFen(fen).ok, `${where}: a legal position (${validateFen(fen).error})`);
      }
      if (i === 0) assert.ok(step.fen || !step.task, `${where}: the first board`);
      assert.ok(!/\b[a-h][1-8]\b/.test(step.say), `${where}: no square names in "${step.say}"`);
      if (!fen) return;
      const c = load(fen);
      for (const uci of step.play ?? []) {
        if (!hasKings(fen) && c.get(uci.slice(0, 2) as Square)?.color !== c.turn()) c.setTurn(c.turn() === 'w' ? 'b' : 'w');
        assert.ok(c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }), `${where}: plays ${uci}`);
      }
      if (step.moves) assert.ok(c.get(step.moves as Square), `${where}: a piece to show`);
      for (const sq of step.marks ?? []) assert.match(sq, /^[a-h][1-8]$/);
      const now = c.fen();
      const side = c.turn();
      const task = step.task;
      if (task?.kind === 'collect') {
        assert.ok(step.marks?.length, `${where}: stars`);
        assert.ok(reachable(now, (_, visited) => step.marks!.every((m) => visited.has(m))), `${where}: every star can be collected`);
      } else if (task?.kind === 'capture') {
        assert.ok(opponentPieces(c, side) > 0);
        assert.ok(reachable(now, (after) => opponentPieces(after, side) === 0), `${where}: every piece can be taken`);
      } else if (task?.kind === 'move') {
        const legal = c.moves({ verbose: true }).map((m) => m.lan);
        for (const m of task.moves) assert.ok(legal.includes(m), `${where}: ${m} is legal`);
        assert.ok(legal.length > task.moves.length || task.moves.length === legal.length, where);
      } else if (task?.kind === 'check' || task?.kind === 'mate') {
        assert.ok(hasKings(now), `${where}: needs both kings`);
        const hits = c.moves({ verbose: true }).filter((m) => {
          const after = new Chess(now);
          after.move(m);
          return task.kind === 'check' ? after.inCheck() : after.isCheckmate();
        });
        assert.ok(hits.length > 0, `${where}: a ${task.kind} exists`);
      } else if (task?.kind === 'escape') {
        assert.ok(c.inCheck() && c.moves().length > 0, `${where}: in check, with a way out`);
      }
      if (step.quiz) {
        assert.equal(step.quiz.options.filter((o) => o.correct).length, 1, `${where}: one right answer`);
        assert.ok(!task, `${where}: a quiz or a task, not both`);
      }
      // a step's moves change the board for the steps after it only through the task; the
      // check of a later step without its own board starts from this one
      fen = now;
    });
  });
}

test('the stalemate lesson has a stalemate trap next to the mates', () => {
  const fen = LESSONS['avoid-stalemate'].steps[1].fen!;
  const c = new Chess(fen);
  const outcomes = c.moves({ verbose: true }).map((m) => {
    const after = new Chess(fen);
    after.move(m);
    return after.isCheckmate() ? 'mate' : after.isStalemate() ? 'stalemate' : 'other';
  });
  assert.ok(outcomes.includes('mate') && outcomes.includes('stalemate'));
});
