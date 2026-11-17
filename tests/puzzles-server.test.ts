// Puzzles judged by the server (audit, November 2026): the app's data has no solutions, and
// the attempt rules (_shared/puzzle-attempt.ts) count mistakes and hints the way the app used to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { MODULES, answerAt, infoOf, solution, solves, type Puzzle } from '../supabase/functions/_shared/puzzles.ts';
import { MISSES_FOR_HINT, freshAttempt, nextOf, playMove, takeHint } from '../supabase/functions/_shared/puzzle-attempt.ts';
import { ALTERNATIVES, PUZZLES } from '../supabase/functions/_shared/server/puzzle-data.ts';
import { CLIENT_DATA, clientData } from '../scripts/puzzles/client-data.ts';

test("the app's puzzle data is current and carries no solution", () => {
  for (const m of MODULES) {
    const file = readFileSync(`${CLIENT_DATA}/${m.id}.json`, 'utf8');
    assert.equal(file, clientData(m.id), `${m.id}: run node scripts/puzzles/client-data.ts`);
    const list = JSON.parse(file) as Record<string, unknown>[];
    for (const [i, p] of list.entries()) {
      assert.equal(typeof p.moves, 'number', `${m.id} ${p.id}`);
      // the only move it holds is the opponent's setup move, played before the player's turn
      const full = PUZZLES[m.id][i];
      for (const answer of solution(full)) assert.ok(!JSON.stringify(p).includes(answer) || p.setup === answer, `${m.id} ${p.id}: ${answer}`);
    }
  }
});

test('playing the solution move by move solves every puzzle, with the replies from the server', () => {
  for (const m of MODULES) {
    for (const p of PUZZLES[m.id]) {
      let state = freshAttempt();
      assert.ok(nextOf(p, [], m.id === 'openings'), `${p.id}: an aim for the first move`);
      for (const answer of solution(p)) {
        if (state.done) break; // a mate before the line's end
        const r = playMove(p, ALTERNATIVES[m.id]?.[p.id], state, answer, m.id === 'openings');
        assert.equal(r.outcome.kind, 'right', `${m.id} ${p.id} ${answer}`);
        state = r.state;
      }
      assert.ok(state.done, `${m.id} ${p.id}: done`);
      assert.ok(solves(p, state.played));
      assert.equal(state.mistakes + state.hints, 0);
    }
  }
});

/** A legal move of the player's that is neither the answer, nor a mate, nor a listed alternative. */
function wrongMove(p: Puzzle, alts: string[] = []): string | null {
  const chess = new Chess(p.fen);
  const setup = infoOf(p).setup;
  if (setup) chess.move(setup);
  const answer = answerAt(p, 0)!;
  for (const m of chess.moves({ verbose: true })) {
    const after = new Chess(chess.fen());
    after.move(m.lan);
    if (m.lan !== answer && !after.isCheckmate() && !alts.includes(m.lan)) return m.lan;
  }
  return null;
}

test('mistakes, the free ring, three misses show the piece (a hint), hints step by step', () => {
  const p = PUZZLES.forks[0];
  const answer = answerAt(p, 0)!;
  const wrong = wrongMove(p, ALTERNATIVES.forks?.[p.id]?.[0])!;
  let state = freshAttempt();
  let r = playMove(p, undefined, state, wrong);
  assert.equal(r.outcome.kind, 'wrong');
  assert.deepEqual(r.outcome.kind === 'wrong' && r.outcome.marks, { from: null, to: answer.slice(2, 4) });
  state = r.state;
  assert.equal(state.mistakes, 1);
  for (let i = 1; i < MISSES_FOR_HINT; i++) state = playMove(p, undefined, state, wrong).state;
  assert.equal(state.mistakes, MISSES_FOR_HINT);
  assert.equal(state.hints, 1, 'three misses in a row show the piece: one hint');
  assert.ok(state.piece && state.square);
  assert.equal(takeHint(p, state), null, 'nothing left to show');

  // hints: the piece, then the square
  let fresh = freshAttempt();
  const h1 = takeHint(p, fresh)!;
  assert.deepEqual(h1.marks, { from: answer.slice(0, 2), to: null });
  fresh = h1.state;
  const h2 = takeHint(p, fresh)!;
  assert.deepEqual(h2.marks, { from: answer.slice(0, 2), to: answer.slice(2, 4) });
  assert.equal(h2.state.hints, 2);

  // a right move clears the marks and the misses
  const right = playMove(p, undefined, state, answer);
  assert.equal(right.state.misses, 0);
  assert.equal(right.state.piece || right.state.square, false);

  // illegal moves are refused, not counted
  assert.throws(() => playMove(p, undefined, freshAttempt(), 'a1a1'));
});

test('an engine-approved alternative is no mistake: only the square is shown', () => {
  const p = PUZZLES.forks[0];
  const answer = answerAt(p, 0)!;
  const alt = wrongMove(p)!;
  const r = playMove(p, [[alt]], freshAttempt(), alt);
  assert.equal(r.outcome.kind, 'alternative');
  assert.equal(r.state.mistakes, 0);
  assert.deepEqual(r.outcome.kind === 'alternative' && r.outcome.marks, { from: null, to: answer.slice(2, 4) });
});

test('the alternatives are legal moves, never the answer', () => {
  for (const [module, byId] of Object.entries(ALTERNATIVES)) {
    for (const [id, steps] of Object.entries(byId)) {
      const p = PUZZLES[module].find((x) => x.id === id);
      assert.ok(p, `${module} ${id}`);
      steps.forEach((alts, n) => {
        let state = freshAttempt();
        for (const m of solution(p).slice(0, n)) state = playMove(p, undefined, state, m).state;
        for (const alt of alts) {
          assert.notEqual(alt, answerAt(p, n));
          assert.equal(playMove(p, steps, state, alt).outcome.kind, 'alternative', `${module} ${id} ${alt}`);
        }
      });
    }
  }
});
